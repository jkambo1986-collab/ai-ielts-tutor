"""
Study-partner matching service (Hard 5).

Anonymized matching:
  1. Both users must have PartnerOptIn(is_active=True) rows.
  2. Same institute (or both with cross_institute_ok=True).
  3. target_score within ±0.5 of each other.
  4. Lexical similarity score: Jaccard on each user's last 200 unique
     vocabulary lemmas. Higher means they've practised similar topics.
  5. Excludes pairs already suggested in the last 30 days.

The week's suggestion is the BEST candidate (highest score). We mirror
the row to both users so the partnering is symmetric.
"""

from __future__ import annotations

from datetime import timedelta

from django.utils import timezone


def _user_lemmas(user, limit: int = 200) -> set[str]:
    from apps.practice.models import VocabularyObservation
    return set(
        VocabularyObservation.objects.filter(user=user, deleted_at__isnull=True)
        .order_by("-last_seen_at")
        .values_list("lemma", flat=True)[:limit]
    )


def _jaccard(a: set[str], b: set[str]) -> float:
    if not a or not b:
        return 0.0
    inter = len(a & b)
    union = len(a | b)
    return round(inter / union, 4) if union else 0.0


def _suggested_task(user_target: float, partner_target: float) -> str:
    avg = (user_target + partner_target) / 2
    if avg >= 7.5:
        return "Both write 200 words on this Task 2 by Friday, then exchange feedback."
    if avg >= 6.5:
        return "Both record a 90-second speaking response to this Part 2 cue card and listen to each other."
    return "Each share one writing or speaking session this week and trade one piece of feedback."


def evaluate_for_user(user) -> "PartnerSuggestion | None":
    """Pick this week's best partner for `user`. Returns None if no
    eligible candidate."""
    from apps.practice.models import PartnerOptIn, PartnerSuggestion

    me_opt = PartnerOptIn.objects.filter(user=user, is_active=True).first()
    if not me_opt:
        return None

    # Skip if the user already has an unanswered suggestion < 7 days old.
    cutoff = timezone.now() - timedelta(days=7)
    if PartnerSuggestion.objects.filter(
        user=user, created_at__gte=cutoff,
        accepted_at__isnull=True, dismissed_at__isnull=True,
    ).exists():
        return None

    me_lemmas = _user_lemmas(user)
    me_target = float(getattr(user, "target_score", None) or 7.0)

    candidates_qs = PartnerOptIn.objects.filter(is_active=True).exclude(user=user)
    if not me_opt.cross_institute_ok:
        candidates_qs = candidates_qs.filter(institute=user.institute)

    best = None
    best_score = -1.0
    recent_partner_ids = set(
        PartnerSuggestion.objects.filter(
            user=user, created_at__gte=timezone.now() - timedelta(days=30),
        ).values_list("partner_id", flat=True)
    )
    for cand in candidates_qs.select_related("user")[:200]:
        partner = cand.user
        if partner.id in recent_partner_ids:
            continue
        # Cross-institute matching requires consent on BOTH sides.
        if cand.institute_id != user.institute_id and not cand.cross_institute_ok:
            continue
        partner_target = float(getattr(partner, "target_score", None) or 7.0)
        if abs(partner_target - me_target) > 0.5:
            continue
        partner_lemmas = _user_lemmas(partner)
        score = _jaccard(me_lemmas, partner_lemmas)
        if score > best_score:
            best_score = score
            best = (cand, partner, partner_target, score)

    if not best:
        return None
    cand, partner, partner_target, score = best
    task = _suggested_task(me_target, partner_target)

    # Create mirrored rows so each side sees the suggestion.
    sugg = PartnerSuggestion.objects.create(
        user=user, institute=user.institute, partner=partner,
        similarity_score=score, target_band_delta=abs(me_target - partner_target),
        suggested_task=task,
    )
    PartnerSuggestion.objects.create(
        user=partner, institute=partner.institute, partner=user,
        similarity_score=score, target_band_delta=abs(me_target - partner_target),
        suggested_task=task,
    )
    return sugg
