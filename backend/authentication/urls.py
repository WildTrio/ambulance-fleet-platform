from django.urls import path
from .views import (
    LoginView,
    LogoutView,
    TokenRefreshView,
    CurrentUserView,
    ChangePasswordView,
    RoleListView
)

urlpatterns = [
    path('login/', LoginView.as_view(), name='login'),
    path('logout/', LogoutView.as_view(), name='logout'),
    path('refresh/', TokenRefreshView.as_view(), name='refresh'),
    path('me/', CurrentUserView.as_view(), name='me'),
    path('change-password/', ChangePasswordView.as_view(), name='change_password'),
    path('roles/', RoleListView.as_view(), name='roles'),
]
