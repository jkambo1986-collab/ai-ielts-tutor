"""Billing endpoints.

Note on upgrade flow: this platform is sold to institutions, not individual
students. Self-serve upgrade is therefore disabled — Pro access is granted by
institute admins via /api/billing/grant-pro. The legacy /api/billing/upgrade
endpoint is gated to admins for backwards-compat.
"""

from datetime import timedelta

from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import User
from apps.accounts.serializers import UserSerializer
from apps.audit.models import AuditLogEntry
from apps.audit.services import record as audit_record
from apps.billing.features import PLAN_FEATURES, user_has_feature
from apps.billing.models import Subscription


def _is_institute_admin(user) -> bool:
    return user.role in (User.ROLE_INSTITUTE_ADMIN, User.ROLE_SUPER_ADMIN)


class FeaturesView(APIView):
    """GET /api/billing/features — features the current user has access to."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        all_features = sorted({f for s in PLAN_FEATURES.values() for f in s})
        return Response(
            {
                "plan": "pro" if request.user.is_pro else "free",
                "features": {f: user_has_feature(request.user, f) for f in all_features},
            }
        )


class CurrentSubscriptionView(APIView):
    """GET /api/billing/current — what plan is this user on?"""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        request.user.downgrade_if_expired()
        return Response(
            {
                "plan": request.user.subscription_plan,
                "is_pro": request.user.is_pro,
                "subscription_end_date": request.user.subscription_end_date,
                "managed_by_institute": True,
            }
        )


class _GrantProInput(serializers.Serializer):
    user_id = serializers.UUIDField(required=False)
    user_email = serializers.EmailField(required=False)
    days = serializers.IntegerField(required=False, min_value=1, max_value=3650, default=30)


class GrantProView(APIView):
    """POST /api/billing/grant-pro — institute admin grants Pro to a student.

    Body: { user_id?, user_email?, days?: int }
    Either user_id or user_email is required. Days defaults to 30."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        if not _is_institute_admin(request.user):
            return Response(
                {"detail": "Only institute admins can grant Pro access."},
                status=status.HTTP_403_FORBIDDEN,
            )
        s = _GrantProInput(data=request.data)
        s.is_valid(raise_exception=True)

        target = None
        if s.validated_data.get("user_id"):
            target = get_object_or_404(
                User,
                id=s.validated_data["user_id"],
                institute=request.user.institute,
            )
        elif s.validated_data.get("user_email"):
            target = get_object_or_404(
                User,
                email__iexact=s.validated_data["user_email"],
                institute=request.user.institute,
            )
        else:
            return Response(
                {"detail": "Provide user_id or user_email."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        days = s.validated_data["days"]
        target.subscription_plan = User.PLAN_PRO
        target.subscription_end_date = timezone.now() + timedelta(days=days)
        target.save(update_fields=["subscription_plan", "subscription_end_date"])

        Subscription.objects.create(
            user=target,
            institute=request.user.institute,
            plan=Subscription.PLAN_PRO,
            status=Subscription.STATUS_ACTIVE,
            current_period_end=target.subscription_end_date,
        )
        audit_record(
            AuditLogEntry.ACTION_PRO_GRANTED,
            actor=request.user, target_user=target,
            payload={"days": days, "ends_at": target.subscription_end_date.isoformat()},
            request=request,
        )
        return Response({"user": UserSerializer(target).data})


class _BulkGrantInput(serializers.Serializer):
    user_emails = serializers.ListField(
        child=serializers.EmailField(), min_length=1, max_length=500,
    )
    days = serializers.IntegerField(required=False, min_value=1, max_value=3650, default=30)


class BulkGrantProView(APIView):
    """POST /api/v1/billing/bulk-grant-pro — grant Pro to many users at once.

    Body: { user_emails: [...], days?: 30 }
    Returns counts + per-email outcome (granted | extended | not_found).
    Emails not in the admin's institute return as not_found (anti-enumeration).
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        if not _is_institute_admin(request.user):
            return Response({"detail": "Only institute admins can grant Pro access."}, status=403)
        s = _BulkGrantInput(data=request.data)
        s.is_valid(raise_exception=True)
        days = s.validated_data["days"]
        end = timezone.now() + timedelta(days=days)

        results: list[dict] = []
        for email in s.validated_data["user_emails"]:
            target = User.objects.filter(
                email__iexact=email, institute=request.user.institute,
            ).first()
            if not target:
                results.append({"email": email, "status": "not_found"})
                continue
            was_pro = target.subscription_plan == User.PLAN_PRO
            target.subscription_plan = User.PLAN_PRO
            target.subscription_end_date = end
            target.save(update_fields=["subscription_plan", "subscription_end_date"])
            Subscription.objects.create(
                user=target, institute=request.user.institute,
                plan=Subscription.PLAN_PRO, status=Subscription.STATUS_ACTIVE,
                current_period_end=end,
            )
            audit_record(
                AuditLogEntry.ACTION_PRO_GRANTED,
                actor=request.user, target_user=target,
                payload={"days": days, "ends_at": end.isoformat(), "bulk": True},
                request=request,
            )
            results.append({
                "email": email,
                "status": "extended" if was_pro else "granted",
            })

        return Response(
            {
                "total": len(results),
                "granted": sum(1 for r in results if r["status"] == "granted"),
                "extended": sum(1 for r in results if r["status"] == "extended"),
                "not_found": sum(1 for r in results if r["status"] == "not_found"),
                "results": results,
            }
        )


class RevokeProView(APIView):
    """POST /api/billing/revoke-pro — institute admin demotes a student to Free."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        if not _is_institute_admin(request.user):
            return Response(
                {"detail": "Only institute admins can revoke Pro access."},
                status=status.HTTP_403_FORBIDDEN,
            )
        user_id = request.data.get("user_id")
        user_email = request.data.get("user_email")
        if not user_id and not user_email:
            return Response({"detail": "Provide user_id or user_email."}, status=400)
        target = get_object_or_404(
            User,
            **({"id": user_id} if user_id else {"email__iexact": user_email}),
            institute=request.user.institute,
        )
        target.subscription_plan = User.PLAN_FREE
        target.subscription_end_date = None
        target.save(update_fields=["subscription_plan", "subscription_end_date"])
        Subscription.objects.filter(user=target, status=Subscription.STATUS_ACTIVE).update(
            status=Subscription.STATUS_CANCELED, canceled_at=timezone.now(),
        )
        audit_record(
            AuditLogEntry.ACTION_PRO_REVOKED,
            actor=request.user, target_user=target,
            request=request,
        )
        return Response({"user": UserSerializer(target).data})
