from django.contrib import admin
from .models import Role, User, AuditLog

class CustomUserAdmin(admin.ModelAdmin):
    list_display = ('email', 'name', 'role', 'is_active', 'is_staff')
    list_filter = ('role', 'is_active', 'is_staff')
    search_fields = ('email', 'name')
    ordering = ('email',)
    fieldsets = (
        (None, {'fields': ('email', 'password')}),
        ('Personal Info', {'fields': ('name', 'role')}),
        ('Permissions', {'fields': ('is_active', 'is_staff', 'is_superuser')}),
    )

    def save_model(self, request, obj, form, change):
        if not change or 'password' in form.changed_data:
            obj.set_password(obj.password)
        super().save_model(request, obj, form, change)

class RoleAdmin(admin.ModelAdmin):
    list_display = ('name',)
    search_fields = ('name',)

class AuditLogAdmin(admin.ModelAdmin):
    list_display = ('user', 'action', 'timestamp')
    list_filter = ('action', 'timestamp')
    search_fields = ('user__email', 'action')
    readonly_fields = ('id', 'user', 'action', 'details', 'timestamp')

admin.site.register(User, CustomUserAdmin)
admin.site.register(Role, RoleAdmin)
admin.site.register(AuditLog, AuditLogAdmin)
