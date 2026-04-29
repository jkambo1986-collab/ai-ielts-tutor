from django.urls import path

from apps.practice.views.integrated_ai import (
    EvaluateSummaryView,
    EvaluateSynthesisView,
    GenerateIntegratedTaskView,
)

urlpatterns = [
    path("task", GenerateIntegratedTaskView.as_view(), name="integrated-task"),
    path("evaluate-summary", EvaluateSummaryView.as_view(), name="integrated-evaluate-summary"),
    path("evaluate-synthesis", EvaluateSynthesisView.as_view(), name="integrated-evaluate-synthesis"),
]
