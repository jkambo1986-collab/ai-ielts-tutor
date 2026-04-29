"""URL routes for /api/v1/content/* — per-institute prompt library."""

from django.urls import path

from apps.content.views import PromptDetailView, PromptsListView

urlpatterns = [
    path("prompts", PromptsListView.as_view(), name="content-prompts"),
    path("prompts/<uuid:prompt_id>", PromptDetailView.as_view(), name="content-prompt-detail"),
]
