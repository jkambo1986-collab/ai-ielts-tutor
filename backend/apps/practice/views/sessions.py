"""CRUD viewsets for the four session types — purely list/retrieve/delete.
Creation happens via the AI endpoints (Phase 6) which do the Gemini call,
then save the resulting session row."""

from rest_framework import mixins

from apps.practice.models import (
    ListeningSession,
    ReadingSession,
    SpeakingSession,
    WritingSession,
)
from apps.practice.serializers import (
    ListeningSessionSerializer,
    ReadingSessionSerializer,
    SpeakingSessionListSerializer,
    SpeakingSessionSerializer,
    WritingSessionListSerializer,
    WritingSessionSerializer,
)
from apps.practice.views._base import TenantScopedViewSet


class WritingSessionViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.DestroyModelMixin,
    TenantScopedViewSet,
):
    queryset = WritingSession.objects.all()
    serializer_class = WritingSessionSerializer
    list_serializer_class = WritingSessionListSerializer
    search_fields = ["prompt", "essay"]


class SpeakingSessionViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.DestroyModelMixin,
    TenantScopedViewSet,
):
    queryset = SpeakingSession.objects.all()
    serializer_class = SpeakingSessionSerializer
    list_serializer_class = SpeakingSessionListSerializer
    search_fields = ["topic"]


class ReadingSessionViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.DestroyModelMixin,
    TenantScopedViewSet,
):
    queryset = ReadingSession.objects.all()
    serializer_class = ReadingSessionSerializer
    search_fields = ["passage_title"]


class ListeningSessionViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.DestroyModelMixin,
    TenantScopedViewSet,
):
    queryset = ListeningSession.objects.all()
    serializer_class = ListeningSessionSerializer
    search_fields = ["title"]
