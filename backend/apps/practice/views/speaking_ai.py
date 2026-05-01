"""Speaking AI endpoints — start/end session, analyze, prompts, pronunciation practice."""

from datetime import timedelta

from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.ai import service as ai_service
from apps.ai.context import build_for_user
from apps.ai.quality_gate import QualityGateError, gate_speaking_transcript
from apps.billing import features
from apps.billing.features import PaymentRequired, requires_feature, user_has_feature
from apps.practice.models import CalibrationEntry, SpeakingSession, VocabularyObservation
from apps.practice.services.bands import speaking_quality_score
from apps.practice.services.error_cards import extract_from_speaking_analysis
from apps.practice.services.fluency import compute_fluency
from apps.practice.services.vocab import extract_lemmas, transcript_text


class _StartSessionInput(serializers.Serializer):
    mode = serializers.ChoiceField(
        choices=[
            SpeakingSession.MODE_STANDARD,
            SpeakingSession.MODE_ROLEPLAY,
            SpeakingSession.MODE_MOCK,
        ],
        default=SpeakingSession.MODE_STANDARD,
    )
    topic = serializers.CharField(required=False, allow_blank=True, max_length=500)
    prompt = serializers.JSONField(required=False, allow_null=True)
    # Per-part split (#14), confidence prediction (#25), re-attempt (#21).
    part = serializers.ChoiceField(
        choices=[
            SpeakingSession.PART_PART1, SpeakingSession.PART_PART2,
            SpeakingSession.PART_PART3, SpeakingSession.PART_MIXED,
        ],
        default=SpeakingSession.PART_MIXED,
    )
    predicted_band = serializers.FloatField(required=False, allow_null=True, min_value=1.0, max_value=9.0)
    parent_session_id = serializers.UUIDField(required=False, allow_null=True)
    # B5/E1: accent + persona for the live system instruction.
    accent = serializers.ChoiceField(
        choices=[c[0] for c in SpeakingSession.ACCENT_CHOICES],
        default=SpeakingSession.ACCENT_UK,
    )
    persona = serializers.ChoiceField(
        choices=[c[0] for c in SpeakingSession.PERSONA_CHOICES],
        default=SpeakingSession.PERSONA_NEUTRAL,
    )
    # B2: cue card snapshot — when starting a Part 2 / Mock session with a card.
    cue_card = serializers.JSONField(required=False, allow_null=True)


class StartSessionView(APIView):
    """POST /api/speaking/start-session — issues a Gemini Live session token + creates a session row."""

    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "ai_generate"

    def post(self, request):
        s = _StartSessionInput(data=request.data)
        s.is_valid(raise_exception=True)
        # Gate RolePlay mode behind Pro
        if (
            s.validated_data["mode"] == SpeakingSession.MODE_ROLEPLAY
            and not user_has_feature(request.user, features.FEATURE_ROLEPLAY_MODE)
        ):
            raise PaymentRequired(detail="Role-Play mode requires a Pro subscription.")
        parent = None
        parent_id = s.validated_data.get("parent_session_id")
        if parent_id:
            parent = SpeakingSession.objects.filter(
                id=parent_id, user=request.user, institute=request.user.institute,
            ).first()
        mode = s.validated_data["mode"]
        # B1 mock test: initialise mock_state with the part timer schedule.
        mock_state = None
        if mode == SpeakingSession.MODE_MOCK:
            from django.utils import timezone as _tz
            mock_state = {
                "current_part": "part1",
                "part1": {"started_at": _tz.now().isoformat(), "duration_target": 5 * 60},
                "part2": {"prep_seconds": 60, "talk_seconds": 120},
                "part3": {"duration_target": 5 * 60},
                "repeats": {},
                "whisper_hints_used": 0,
            }

        session = SpeakingSession.objects.create(
            institute=request.user.institute,
            user=request.user,
            mode=mode,
            topic=s.validated_data.get("topic", ""),
            prompt=s.validated_data.get("prompt"),
            part=s.validated_data.get("part", SpeakingSession.PART_MIXED),
            predicted_band=s.validated_data.get("predicted_band"),
            parent_session=parent,
            accent=s.validated_data.get("accent", SpeakingSession.ACCENT_UK),
            persona=s.validated_data.get("persona", SpeakingSession.PERSONA_NEUTRAL),
            mock_state=mock_state,
            cue_card=s.validated_data.get("cue_card"),
        )

        # F8: stamp cue-card consumption when an `id` is supplied with the
        # cue card payload. Best-effort; missing id (institute-curated FE
        # passing free-form bullets) is fine.
        cue_card_payload = s.validated_data.get("cue_card") or {}
        cue_card_id = cue_card_payload.get("id") if isinstance(cue_card_payload, dict) else None
        if cue_card_id:
            try:
                from uuid import UUID
                from apps.practice.models import CueCard, CueCardConsumption
                cc = CueCard.objects.filter(id=UUID(str(cue_card_id))).first()
                if cc:
                    CueCardConsumption.objects.create(
                        user=request.user, cue_card=cc, speaking_session=session,
                    )
            except (TypeError, ValueError):
                pass
        live_credentials = ai_service.mint_live_session_token(str(request.user.id))
        # F1: stamp the expected expiry so the FE knows when to re-mint.
        ttl = int(live_credentials.get("expires_in_seconds") or 0)
        if ttl > 0:
            session.live_token_expires_at = timezone.now() + timedelta(seconds=ttl)
            session.save(update_fields=["live_token_expires_at"])
        # D1: build the system instruction server-side so we can inject L1 +
        # proficiency without trusting the FE. The FE merges this with its
        # transport-level instructions.
        system_instruction = ai_service.build_speaking_system_instruction(
            mode=session.mode,
            persona=session.persona,
            accent=session.accent,
            target_band=float(request.user.target_score or 7.0),
            native_language=request.user.native_language or None,
            proficiency=request.user.english_proficiency_level or None,
            prompt=session.prompt,
            cue_card=session.cue_card,
            ctx=build_for_user(request.user),
        )
        return Response(
            {
                "session_id": str(session.id),
                "live": live_credentials,
                "system_instruction": system_instruction,
                "mock_state": session.mock_state,
            },
            status=status.HTTP_201_CREATED,
        )


class _EndSessionInput(serializers.Serializer):
    session_id = serializers.UUIDField()
    transcript = serializers.ListField(child=serializers.DictField(), allow_empty=True)
    duration_seconds = serializers.IntegerField(min_value=0)
    skip_analysis = serializers.BooleanField(default=False)


class EndSessionView(APIView):
    """POST /api/speaking/end-session — saves transcript, optionally analyzes."""

    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "ai_analyze"

    def post(self, request):
        s = _EndSessionInput(data=request.data)
        s.is_valid(raise_exception=True)
        try:
            session = SpeakingSession.objects.get(
                id=s.validated_data["session_id"],
                user=request.user,
                institute=request.user.institute,
            )
        except SpeakingSession.DoesNotExist:
            return Response({"detail": "Session not found."}, status=404)

        session.transcript = s.validated_data["transcript"]
        session.duration_seconds = s.validated_data["duration_seconds"]

        analysis = None
        if not s.validated_data["skip_analysis"] and session.transcript:
            user_text = "\n".join(
                t.get("text", "") for t in session.transcript if t.get("speaker") == "user"
            )
            if len(user_text) > 30:
                analysis = ai_service.analyze_speaking_performance(
                    user_text, session.mode, ctx=build_for_user(request.user),
                    whisper_hints_used=int(getattr(session, "whisper_hints_used", 0) or 0),
                )
                session.analysis = analysis

        # Fluency metrics (#26)
        try:
            session.fluency_metrics = compute_fluency(
                session.transcript or [], session.duration_seconds or 0,
            )
        except Exception:
            pass

        # Quality score (#18)
        try:
            session.quality_score = speaking_quality_score(
                duration_seconds=session.duration_seconds or 0,
                has_analysis=bool(analysis),
                transcript_turns=len(session.transcript or []),
            )
        except Exception:
            pass

        # B1.8: targeted update_fields prevents end-session from clobbering
        # in-flight transcript writes from a still-open client (e.g. the FE
        # checkpoint racing the end call). Without update_fields, .save()
        # rewrites every column including `transcript`, which can drop turns
        # the client appended after we read the row.
        session.save(update_fields=[
            "transcript", "duration_seconds", "analysis",
            "fluency_metrics", "quality_score",
        ])

        # Auto-extract SRS error cards from analysis — best-effort.
        new_cards = []
        if analysis:
            new_cards = extract_from_speaking_analysis(
                user=request.user,
                institute=request.user.institute,
                session_id=session.id,
                analysis=analysis,
            )

        # Calibration entry (#25) — only on first analysis with prediction.
        if (
            session.predicted_band is not None
            and analysis
            and analysis.get("overallBandScore") is not None
        ):
            try:
                actual = float(analysis["overallBandScore"])
                predicted = float(session.predicted_band)
                CalibrationEntry.objects.get_or_create(
                    user=request.user, institute=request.user.institute,
                    session_type="speaking", session_id=session.id,
                    defaults={
                        "predicted_band": predicted,
                        "actual_band": actual,
                        "delta": predicted - actual,
                    },
                )
            except Exception:
                pass

        # Vocabulary ingestion (#19) — best-effort.
        try:
            text = transcript_text(session.transcript or [])
            if text:
                lemmas = extract_lemmas(text)
                for item in lemmas:
                    obs, created = VocabularyObservation.objects.get_or_create(
                        user=request.user, lemma=item["lemma"],
                        defaults={
                            "institute": request.user.institute,
                            "cefr_level": item["cefr_level"],
                            "is_awl": item["is_awl"],
                            "last_session_type": "speaking",
                            "last_session_id": session.id,
                        },
                    )
                    if not created:
                        obs.frequency += 1
                        obs.last_session_type = "speaking"
                        obs.last_session_id = session.id
                        if item["cefr_level"] and not obs.cefr_level:
                            obs.cefr_level = item["cefr_level"]
                        if item["is_awl"] and not obs.is_awl:
                            obs.is_awl = True
                        obs.save(update_fields=[
                            "frequency", "cefr_level", "is_awl",
                            "last_session_type", "last_session_id", "last_seen_at",
                        ])
        except Exception:
            pass

        return Response(
            {
                "session_id": str(session.id),
                "analysis": analysis,
                "duration_seconds": session.duration_seconds,
                "fluency_metrics": session.fluency_metrics,
                "quality_score": session.quality_score,
                "cards_added": len(new_cards),
            }
        )


class _ExplainSpeakingBandInput(serializers.Serializer):
    transcript = serializers.JSONField()
    band = serializers.FloatField(min_value=1.0, max_value=9.0)


class ExplainSpeakingBandView(APIView):
    """F3 — descriptor-anchored band explanation for speaking."""
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "ai_analyze"

    def post(self, request):
        s = _ExplainSpeakingBandInput(data=request.data)
        s.is_valid(raise_exception=True)
        transcript = s.validated_data["transcript"]
        if not isinstance(transcript, list):
            return Response({"detail": "transcript must be an array of turns"}, status=400)
        from apps.ai import service as ai_service
        result = ai_service.explain_speaking_band(
            transcript=transcript,
            band=s.validated_data["band"],
        )
        return Response({"explanation": result})


class _AnalyzeInput(serializers.Serializer):
    transcript = serializers.CharField(min_length=30, max_length=20000)
    mode = serializers.ChoiceField(
        choices=[SpeakingSession.MODE_STANDARD, SpeakingSession.MODE_ROLEPLAY],
        default=SpeakingSession.MODE_STANDARD,
    )
    # Optional — when provided, the resulting analysis is persisted onto the session row.
    session_id = serializers.UUIDField(required=False)
    # One Skill Retake — appends the OSR diagnostic to the analysis.
    osr = serializers.BooleanField(required=False, default=False)


class AnalyzeTranscriptView(APIView):
    """POST /api/speaking/analyze-transcript — analyze a transcript.

    If `session_id` is provided, the analysis is also written back to that
    session row (so the dashboard's "estimated speaking skill" picks it up).
    Without `session_id` the analysis is returned without being persisted —
    useful for one-off analysis of arbitrary transcripts.
    """

    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "ai_analyze"

    def post(self, request):
        s = _AnalyzeInput(data=request.data)
        s.is_valid(raise_exception=True)
        # Pre-flight quality gate (Hard 6).
        try:
            gate_speaking_transcript(s.validated_data["transcript"])
        except QualityGateError as qe:
            return Response(
                {"code": qe.code, "detail": qe.advice, **qe.payload},
                status=status.HTTP_422_UNPROCESSABLE_ENTITY,
            )
        # Hint count: prefer the persisted value on the session row when one
        # is provided; otherwise treat as 0 (ad-hoc analyze of raw text).
        sid_for_hint = s.validated_data.get("session_id")
        hint_count = 0
        if sid_for_hint:
            row = SpeakingSession.objects.filter(
                id=sid_for_hint, user=request.user, institute=request.user.institute,
            ).first()
            if row:
                hint_count = int(getattr(row, "whisper_hints_used", 0) or 0)
        analysis = ai_service.analyze_speaking_performance(
            transcript=s.validated_data["transcript"], mode=s.validated_data["mode"],
            ctx=build_for_user(request.user),
            osr=s.validated_data.get("osr", False),
            whisper_hints_used=hint_count,
        )

        sid = s.validated_data.get("session_id")
        if sid:
            try:
                session = SpeakingSession.objects.get(
                    id=sid, user=request.user, institute=request.user.institute,
                )
            except SpeakingSession.DoesNotExist:
                return Response({"detail": "Session not found."}, status=404)
            session.analysis = analysis
            session.save(update_fields=["analysis"])
            # Auto-extract SRS error cards — best-effort, only when we have a session.
            new_cards = extract_from_speaking_analysis(
                user=request.user,
                institute=request.user.institute,
                session_id=session.id,
                analysis=analysis,
            )
            cards_added = len(new_cards)
        else:
            cards_added = 0

        return Response({
            "analysis": analysis,
            "session_id": str(sid) if sid else None,
            "cards_added": cards_added,
        })


class ContextualSpeakingPromptsView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "ai_generate"

    @requires_feature(features.FEATURE_CONTEXTUAL_PROMPTS)
    def get(self, request):
        from apps.practice.models import ListeningSession, ReadingSession

        reading = list(
            ReadingSession.objects.filter(user=request.user, institute=request.user.institute)
            .order_by("-created_at")
            .values("passage_title")[:5]
        )
        listening = list(
            ListeningSession.objects.filter(user=request.user, institute=request.user.institute)
            .order_by("-created_at")
            .values("title")[:5]
        )
        prompts = ai_service.generate_contextual_speaking_prompts(
            reading, listening, ctx=build_for_user(request.user),
        )
        return Response({"prompts": prompts})


class _PronunciationInput(serializers.Serializer):
    targetPhoneme = serializers.CharField(max_length=200)
    problemWords = serializers.ListField(child=serializers.CharField(max_length=100))
    explanation = serializers.CharField(max_length=2000)


class PronunciationPracticeView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "ai_generate"

    @requires_feature(features.FEATURE_PRONUNCIATION_STUDIO)
    def post(self, request):
        s = _PronunciationInput(data=request.data)
        s.is_valid(raise_exception=True)
        practice = ai_service.generate_pronunciation_practice(
            s.validated_data, ctx=build_for_user(request.user),
        )
        return Response({"practice": practice})
