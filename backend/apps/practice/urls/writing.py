from django.urls import path
from rest_framework.routers import DefaultRouter

from apps.practice.views.sessions import WritingSessionViewSet
from apps.practice.views.ux import WritingDraftDetailView, WritingDraftListView
from apps.practice.views.writing_ai import (
    CohesionAnalysisView,
    ContextualWritingPromptsView,
    EssayPlanView,
    EvaluateWritingView,
)

router = DefaultRouter()
router.register(r"sessions", WritingSessionViewSet, basename="writing-session")

urlpatterns = [
    path("evaluate", EvaluateWritingView.as_view(), name="writing-evaluate"),
    path("essay-plan", EssayPlanView.as_view(), name="writing-essay-plan"),
    path("cohesion-analysis", CohesionAnalysisView.as_view(), name="writing-cohesion"),
    path("contextual-prompts", ContextualWritingPromptsView.as_view(), name="writing-contextual-prompts"),
    path("drafts", WritingDraftListView.as_view(), name="writing-drafts"),
    path("drafts/<str:prompt_hash>", WritingDraftDetailView.as_view(), name="writing-draft-detail"),
] + router.urls
