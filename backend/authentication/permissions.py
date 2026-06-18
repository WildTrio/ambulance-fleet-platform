from rest_framework import permissions

class IsRolePermission(permissions.BasePermission):
    """
    Base permission class for checking user roles.
    """
    allowed_roles = []

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        
        # Superusers bypass RBAC checks
        if request.user.is_superuser:
            return True

        if not request.user.role:
            return False

        return request.user.role.name in self.allowed_roles

class IsHospitalAdministrator(IsRolePermission):
    allowed_roles = ['HOSPITAL_ADMINISTRATOR']

class IsDispatcher(IsRolePermission):
    allowed_roles = ['DISPATCHER']

class IsFleetManager(IsRolePermission):
    allowed_roles = ['FLEET_MANAGER']

class IsDriver(IsRolePermission):
    allowed_roles = ['DRIVER']

class IsEmergencyRequestor(IsRolePermission):
    allowed_roles = ['EMERGENCY_REQUESTOR']

def role_required(roles):
    """
    Dynamically generates a permission class containing the specified allowed roles.
    """
    class DynamicRolePermission(IsRolePermission):
        allowed_roles = roles
    return DynamicRolePermission
