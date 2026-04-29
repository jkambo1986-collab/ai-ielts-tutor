from django.urls import path
from rest_framework.routers import DefaultRouter

from apps.practice.views.reading_ai import (
    EvaluateReadingAnswerView,
    GenerateReadingTestView,
    SubmitReadingSessionView,
)
from apps.practice.views.sessions import ReadingSessionViewSet

router = DefaultRouter()
router.register(r"sessions", ReadingSessionViewSet, basename="reading-session")

urlpatterns = [
    path("test", GenerateReadingTestView.as_view(), name="reading-test"),
    path("evaluate-answer", EvaluateReadingAnswerView.as_view(), name="reading-evaluate"),
    path("submit-session", SubmitReadingSessionView.as_view(), name="reading-submit"),
] + router.urls
