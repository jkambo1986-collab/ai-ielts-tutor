"""
Prompt library endpoints.

Read access (GET /content/prompts) is open to authenticated users in the
institute — students need it to populate the prompt selection modals.
Write access is admin-only.
"""

from rest_framework import serializers, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.adminpanel.permissions import IsInstituteAdmin
from apps.audit.models import AuditLogEntry
from apps.audit.services import record as audit_record
from apps.content.models import Prompt


class _PromptSerializer(serializers.ModelSerializer):
    class Meta:
        model = Prompt
        fields = ("id", "skill", "part", "text", "is_active", "created_at", "updated_at")
        read_only_fields = ("id", "created_at", "updated_at")


class PromptsListView(APIView):
    """GET /content/prompts — list active prompts for this institute.
    POST /content/prompts — create a prompt (admin only)."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        skill = request.query_params.get("skill")
        qs = Prompt.objects.filter(
            institute=request.user.institute, is_active=True,
        )
        if skill in (Prompt.SKILL_WRITING, Prompt.SKILL_SPEAKING):
            qs = qs.filter(skill=skill)
        return Response({"prompts": _PromptSerializer(qs, many=True).data})

    def post(self, request):
        if not IsInstituteAdmin().has_permission(request, self):
            return Response({"detail": "Admin access required."}, status=403)
        s = _PromptSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        prompt = s.save(institute=request.user.institute, created_by=request.user)
        audit_record(
            AuditLogEntry.ACTION_PROMPT_CREATED,
            actor=request.user, payload={"id": str(prompt.id), "skill": prompt.skill},
            request=request,
        )
        return Response(_PromptSerializer(prompt).data, status=status.HTTP_201_CREATED)


class PromptDetailView(APIView):
    """GET / PATCH / DELETE for a single prompt — admin only for writes."""

    permission_classes = [IsAuthenticated]

    def _get(self, request, prompt_id) -> Prompt | None:
        return Prompt.objects.filter(
            id=prompt_id, institute=request.user.institute,
        ).first()

    def get(self, request, prompt_id):
        prompt = self._get(request, prompt_id)
        if not prompt:
            return Response(status=404)
        return Response(_PromptSerializer(prompt).data)

    def patch(self, request, prompt_id):
        if not IsInstituteAdmin().has_permission(request, self):
            return Response({"detail": "Admin access required."}, status=403)
        prompt = self._get(request, prompt_id)
        if not prompt:
            return Response(status=404)
        s = _PromptSerializer(prompt, data=request.data, partial=True)
        s.is_valid(raise_exception=True)
        s.save()
        audit_record(
            AuditLogEntry.ACTION_PROMPT_UPDATED,
            actor=request.user, payload={"id": str(prompt.id)},
            request=request,
        )
        return Response(_PromptSerializer(prompt).data)

    def delete(self, request, prompt_id):
        if not IsInstituteAdmin().has_permission(request, self):
            return Response({"detail": "Admin access required."}, status=403)
        prompt = self._get(request, prompt_id)
        if not prompt:
            return Response(status=404)
        prompt.is_active = False  # soft delete
        prompt.save(update_fields=["is_active"])
        audit_record(
            AuditLogEntry.ACTION_PROMPT_DELETED,
            actor=request.user, payload={"id": str(prompt.id)},
            request=request,
        )
        return Response(status=204)
