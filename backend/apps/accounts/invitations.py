"""Invitation endpoints — admin-only invite issuance + public accept flow."""

from django.contrib.auth import password_validation
from django.utils import timezone
from rest_framework import serializers
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.emails import send_invitation
from apps.accounts.models import User
from apps.accounts.serializers import UserSerializer
from apps.accounts.tokens import UserInvitation
from apps.adminpanel.permissions import IsInstituteAdmin
from apps.audit.models import AuditLogEntry
from apps.audit.services import record as audit_record


class _InviteCreateInput(serializers.Serializer):
    email = serializers.EmailField()
    name = serializers.CharField(required=False, allow_blank=True, max_length=200)
    role = serializers.ChoiceField(
        choices=[User.ROLE_STUDENT, User.ROLE_INSTRUCTOR, User.ROLE_INSTITUTE_ADMIN],
        default=User.ROLE_STUDENT,
    )


class _BulkInviteInput(serializers.Serializer):
    emails = serializers.ListField(child=serializers.EmailField(), min_length=1, max_length=500)
    role = serializers.ChoiceField(
        choices=[User.ROLE_STUDENT, User.ROLE_INSTRUCTOR],
        default=User.ROLE_STUDENT,
    )


def _serialize(inv: UserInvitation) -> dict:
    return {
        "id": str(inv.id),
        "email": inv.email,
        "name": inv.name,
        "role": inv.role,
        "expires_at": inv.expires_at,
        "used_at": inv.used_at,
        "created_at": inv.created_at,
        "accepted_user_id": str(inv.accepted_user_id) if inv.accepted_user_id else None,
        "invited_by_email": inv.invited_by.email if inv.invited_by else None,
    }


class InvitesListCreateView(APIView):
    """GET — list invites for this institute (admin-only).
    POST — create a single invite + send email.
    """

    permission_classes = [IsAuthenticated, IsInstituteAdmin]

    def get(self, request):
        qs = UserInvitation.objects.filter(institute=request.user.institute)
        only_open = request.query_params.get("status") == "open"
        if only_open:
            qs = qs.filter(used_at__isnull=True, expires_at__gt=timezone.now())
        invites = list(qs.order_by("-created_at")[:200])
        return Response({"invitations": [_serialize(i) for i in invites]})

    def post(self, request):
        s = _InviteCreateInput(data=request.data)
        s.is_valid(raise_exception=True)
        email = s.validated_data["email"].lower()

        # Don't issue if user already exists in this institute
        if User.objects.filter(email__iexact=email, institute=request.user.institute).exists():
            return Response({"detail": "User already exists in this institute."}, status=400)

        # Reuse outstanding invite if present
        existing = UserInvitation.objects.filter(
            institute=request.user.institute, email__iexact=email, used_at__isnull=True,
        ).first()
        if existing and existing.is_active:
            return Response({"invitation": _serialize(existing), "reused": True})

        inv = UserInvitation.issue(
            institute=request.user.institute,
            invited_by=request.user,
            email=email,
            name=s.validated_data.get("name", ""),
            role=s.validated_data["role"],
        )
        send_invitation(inv)
        audit_record(
            AuditLogEntry.ACTION_INVITE_SENT,
            actor=request.user, payload={"email": email, "role": inv.role},
            request=request,
        )
        return Response({"invitation": _serialize(inv), "reused": False}, status=201)


class BulkInviteView(APIView):
    """POST /admin/invites/bulk — issue many invites at once."""

    permission_classes = [IsAuthenticated, IsInstituteAdmin]

    def post(self, request):
        s = _BulkInviteInput(data=request.data)
        s.is_valid(raise_exception=True)
        role = s.validated_data["role"]
        results = []
        for email in s.validated_data["emails"]:
            email = email.lower()
            if User.objects.filter(email__iexact=email, institute=request.user.institute).exists():
                results.append({"email": email, "status": "user_exists"})
                continue
            existing = UserInvitation.objects.filter(
                institute=request.user.institute, email__iexact=email, used_at__isnull=True,
            ).first()
            if existing and existing.is_active:
                results.append({"email": email, "status": "already_pending"})
                continue
            inv = UserInvitation.issue(
                institute=request.user.institute, invited_by=request.user,
                email=email, role=role,
            )
            send_invitation(inv)
            audit_record(
                AuditLogEntry.ACTION_INVITE_SENT,
                actor=request.user, payload={"email": email, "role": role, "bulk": True},
                request=request,
            )
            results.append({"email": email, "status": "sent"})
        return Response(
            {
                "total": len(results),
                "sent": sum(1 for r in results if r["status"] == "sent"),
                "skipped": sum(1 for r in results if r["status"] != "sent"),
                "results": results,
            }
        )


class InviteRevokeView(APIView):
    """DELETE /admin/invites/<id> — revoke a pending invite (admin-only)."""

    permission_classes = [IsAuthenticated, IsInstituteAdmin]

    def delete(self, request, invite_id):
        try:
            inv = UserInvitation.objects.get(
                id=invite_id, institute=request.user.institute,
            )
        except UserInvitation.DoesNotExist:
            return Response(status=404)
        if inv.used_at is None:
            inv.consume()  # marks used_at
            audit_record(
                AuditLogEntry.ACTION_INVITE_REVOKED,
                actor=request.user, payload={"email": inv.email}, request=request,
            )
        return Response(status=204)


# -- Public accept-invite flow -- #

class _AcceptInviteInput(serializers.Serializer):
    token = serializers.CharField()
    password = serializers.CharField(min_length=10, write_only=True)
    name = serializers.CharField(required=False, allow_blank=True, max_length=200)

    def validate_password(self, value):
        password_validation.validate_password(value)
        return value


class InviteLookupView(APIView):
    """GET /auth/invite/<token> — preview the invite (no auth)."""

    permission_classes = [AllowAny]

    def get(self, request, token):
        try:
            inv = UserInvitation.objects.select_related("institute", "invited_by").get(token=token)
        except UserInvitation.DoesNotExist:
            return Response({"detail": "Invitation not found."}, status=404)
        if not inv.is_active:
            return Response({"detail": "Invitation expired or already used."}, status=410)
        return Response(
            {
                "email": inv.email,
                "role": inv.role,
                "institute_name": inv.institute.name,
                "institute_slug": inv.institute.slug,
                "invited_by_email": inv.invited_by.email if inv.invited_by else None,
                "expires_at": inv.expires_at,
            }
        )


class InviteAcceptView(APIView):
    """POST /auth/invite/accept — consume invite, create user, return tokens."""

    permission_classes = [AllowAny]

    def post(self, request):
        s = _AcceptInviteInput(data=request.data)
        s.is_valid(raise_exception=True)
        try:
            inv = UserInvitation.objects.select_related("institute").get(
                token=s.validated_data["token"],
            )
        except UserInvitation.DoesNotExist:
            return Response({"detail": "Invitation not found."}, status=404)
        if not inv.is_active:
            return Response({"detail": "Invitation expired or already used."}, status=410)

        # Block double-accept by email
        if User.objects.filter(email__iexact=inv.email).exists():
            return Response({"detail": "An account already exists for this email."}, status=400)

        user = User.objects.create_user(
            email=inv.email,
            password=s.validated_data["password"],
            name=s.validated_data.get("name") or inv.name,
            institute=inv.institute,
            role=inv.role,
        )
        # Email is implicitly verified — they clicked a link sent to that address
        user.email_verified_at = timezone.now()
        user.save(update_fields=["email_verified_at"])

        inv.accepted_user = user
        inv.consume()
        audit_record(
            AuditLogEntry.ACTION_INVITE_ACCEPTED,
            actor=user, target_user=user, institute=inv.institute,
            payload={"invited_by": inv.invited_by.email if inv.invited_by else None},
            request=request,
        )
        # Issue tokens immediately so the FE can drop the user into the app
        from apps.accounts.serializers import TokenObtainSerializer
        refresh = TokenObtainSerializer.get_token(user)
        return Response(
            {
                "user": UserSerializer(user).data,
                "access": str(refresh.access_token),
                "refresh": str(refresh),
            },
            status=201,
        )
