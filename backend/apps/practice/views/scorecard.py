"""
Examiner-style scorecard (#24) and re-attempt diff (#21).

Both flatten the existing feedback / analysis JSON into a clean
4-criterion scorecard format the UI can render uniformly.
"""

from __future__ import annotations

from django.shortcuts import get_object_or_404
from rest_framework import serializers
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.practice.models import SpeakingSession, WritingSession


WRITING_CRITERIA = [
    ("taskAchievement", "Task Achievement"),
    ("coherenceAndCohesion", "Coherence & Cohesion"),
    ("lexicalResource", "Lexical Resource"),
    ("grammaticalRangeAndAccuracy", "Grammatical Range & Accuracy"),
]

SPEAKING_CRITERIA = [
    ("fluencyAndCoherence", "Fluency & Coherence"),
    ("lexicalResource", "Lexical Resource"),
    ("grammaticalRangeAndAccuracy", "Grammatical Range & Accuracy"),
    ("pronunciation", "Pronunciation"),
]


def _writing_scorecard(s: WritingSession) -> dict:
    feedback = (s.feedback or {}).get("feedback", {})
    rows = []
    for key, label in WRITING_CRITERIA:
        crit = feedback.get(key, {}) or {}
        rows.append({
            "key": key,
            "label": label,
            "score": crit.get("score"),
            "comment": crit.get("text", "")[:280],
        })
    return {
        "session_id": str(s.id),
        "kind": "writing",
        "task_type": s.task_type,
        "overall_band": float(s.band_score) if s.band_score is not None else None,
        "criteria": rows,
        "created_at": s.created_at.isoformat(),
    }


def _speaking_scorecard(s: SpeakingSession) -> dict:
    analysis = s.analysis or {}
    rows = []
    for key, label in SPEAKING_CRITERIA:
        crit = analysis.get(key, {}) or {}
        rows.append({
            "key": key,
            "label": label,
            "score": crit.get("score") if isinstance(crit, dict) else None,
            "comment": (crit.get("feedback") if isinstance(crit, dict) else "")[:280] if isinstance(crit, dict) else "",
        })
    return {
        "session_id": str(s.id),
        "kind": "speaking",
        "part": s.part,
        "overall_band": analysis.get("overallBandScore"),
        "criteria": rows,
        "created_at": s.created_at.isoformat(),
    }


class ScorecardView(APIView):
    """GET /api/v1/analytics/scorecard?kind=writing|speaking[&id=<uuid>]
    Latest if no id is given."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        kind = request.query_params.get("kind", "writing")
        sid = request.query_params.get("id")

        if kind == "writing":
            qs = WritingSession.objects.filter(
                user=request.user, institute=request.user.institute, deleted_at__isnull=True,
            )
            if sid:
                s = get_object_or_404(qs, id=sid)
            else:
                s = qs.order_by("-created_at").first()
            if not s:
                return Response({"scorecard": None})
            return Response({"scorecard": _writing_scorecard(s)})

        if kind == "speaking":
            qs = SpeakingSession.objects.filter(
                user=request.user, institute=request.user.institute,
                deleted_at__isnull=True, analysis__isnull=False,
            )
            if sid:
                s = get_object_or_404(qs, id=sid)
            else:
                s = qs.order_by("-created_at").first()
            if not s:
                return Response({"scorecard": None})
            return Response({"scorecard": _speaking_scorecard(s)})

        return Response({"detail": "kind must be writing or speaking."}, status=400)


class _ReattemptDiffInput(serializers.Serializer):
    kind = serializers.ChoiceField(choices=["writing", "speaking"])
    original_id = serializers.UUIDField()
    reattempt_id = serializers.UUIDField()


class ReattemptDiffView(APIView):
    """POST /api/v1/analytics/reattempt-diff — diff two scorecards criterion-by-criterion."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        s = _ReattemptDiffInput(data=request.data)
        s.is_valid(raise_exception=True)
        kind = s.validated_data["kind"]
        original_id = s.validated_data["original_id"]
        reattempt_id = s.validated_data["reattempt_id"]

        if kind == "writing":
            qs = WritingSession.objects.filter(
                user=request.user, institute=request.user.institute, deleted_at__isnull=True,
            )
            original = get_object_or_404(qs, id=original_id)
            reattempt = get_object_or_404(qs, id=reattempt_id)
            a = _writing_scorecard(original)
            b = _writing_scorecard(reattempt)
            criteria = WRITING_CRITERIA
        else:
            qs = SpeakingSession.objects.filter(
                user=request.user, institute=request.user.institute,
                deleted_at__isnull=True, analysis__isnull=False,
            )
            original = get_object_or_404(qs, id=original_id)
            reattempt = get_object_or_404(qs, id=reattempt_id)
            a = _speaking_scorecard(original)
            b = _speaking_scorecard(reattempt)
            criteria = SPEAKING_CRITERIA

        # Mark the reattempt's parent_session for future reference.
        if reattempt.parent_session_id != original.id:
            reattempt.parent_session = original
            reattempt.save(update_fields=["parent_session"])

        diffs = []
        a_crit = {c["key"]: c for c in a["criteria"]}
        b_crit = {c["key"]: c for c in b["criteria"]}
        for key, label in criteria:
            ax = a_crit.get(key, {})
            bx = b_crit.get(key, {})
            score_a = ax.get("score")
            score_b = bx.get("score")
            delta = None
            if isinstance(score_a, (int, float)) and isinstance(score_b, (int, float)):
                delta = round(score_b - score_a, 2)
            diffs.append({
                "key": key, "label": label,
                "before": score_a, "after": score_b, "delta": delta,
                "before_comment": ax.get("comment", ""),
                "after_comment": bx.get("comment", ""),
            })

        overall_a = a.get("overall_band")
        overall_b = b.get("overall_band")
        overall_delta = None
        if isinstance(overall_a, (int, float)) and isinstance(overall_b, (int, float)):
            overall_delta = round(overall_b - overall_a, 2)

        return Response({
            "kind": kind,
            "original": {"id": str(original.id), "created_at": original.created_at.isoformat(), "overall_band": overall_a},
            "reattempt": {"id": str(reattempt.id), "created_at": reattempt.created_at.isoformat(), "overall_band": overall_b},
            "overall_delta": overall_delta,
            "criteria": diffs,
        })
