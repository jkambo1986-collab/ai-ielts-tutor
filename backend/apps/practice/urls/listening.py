"""URL routes for /api/v1/listening/* — generate test, evaluate answer, submit session + session viewset."""

from django.urls import path
from rest_framework.routers import DefaultRouter

from apps.practice.views.listening_ai import (
    EvaluateListeningAnswerView,
    GenerateListeningTestView,
    SubmitListeningSessionView,
)
from apps.practice.views.sessions import ListeningSessionViewSet

router = DefaultRouter()
router.register(r"sessions", ListeningSessionViewSet, basename="listening-session")

urlpatterns = [
    path("test", GenerateListeningTestView.as_view(), name="listening-test"),
    path("evaluate-answer", EvaluateListeningAnswerView.as_view(), name="listening-evaluate"),
    path("submit-session", SubmitListeningSessionView.as_view(), name="listening-submit"),
] + router.urls
