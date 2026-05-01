"""GET /api/v1/analytics/coach-brief — directive 3-line daily plan."""

from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.practice.services.coach import compose


class CoachBriefView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(compose(request.user))
