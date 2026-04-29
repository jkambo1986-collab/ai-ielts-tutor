from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.tenants.serializers import InstituteSerializer


class CurrentInstituteView(APIView):
    """Public endpoint — returns the institute resolved for this request.
    Lets the FE branding load before the user logs in (e.g. logo, name)."""

    permission_classes = [AllowAny]

    def get(self, request):
        institute = getattr(request, "institute", None)
        if not institute:
            return Response({"detail": "No institute resolved."}, status=404)
        return Response(InstituteSerializer(institute).data)
