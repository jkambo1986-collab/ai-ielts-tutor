"""
Permission classes for admin endpoints.

We deliberately don't reuse DRF's IsAdminUser — that maps to Django's
is_staff flag, which we only set for super_admins (platform owners).
Institute admins are a separate role that should have access to their
institute's data only.
"""

from rest_framework.permissions import BasePermission

from apps.accounts.models import User

ADMIN_ROLES = {User.ROLE_INSTITUTE_ADMIN, User.ROLE_SUPER_ADMIN}


class IsInstituteAdmin(BasePermission):
    """Allows access only to institute_admin or super_admin users.

    super_admin can access cross-tenant data; institute_admin is scoped to
    their own institute (enforced inside the views, not here).
    """

    message = "Administrator access required."

    def has_permission(self, request, view):
        return (
            request.user
            and request.user.is_authenticated
            and request.user.role in ADMIN_ROLES
        )
