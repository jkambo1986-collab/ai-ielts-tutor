from django.urls import path

from apps.practice.views.quiz_ai import GenerateQuizView, RephraseExplanationView

urlpatterns = [
    path("generate", GenerateQuizView.as_view(), name="quiz-generate"),
    path("rephrase-explanation", RephraseExplanationView.as_view(), name="quiz-rephrase"),
]
