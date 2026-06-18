from rest_framework import status, permissions, generics
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.exceptions import TokenError
from .models import Role, User, AuditLog
from .serializers import (
    RoleSerializer,
    UserSerializer,
    LoginSerializer,
    PasswordChangeSerializer
)

def get_client_ip(request):
    x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
    if x_forwarded_for:
        return x_forwarded_for.split(',')[0].strip()
    return request.META.get('REMOTE_ADDR')

class LoginView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request, *args, **kwargs):
        serializer = LoginSerializer(data=request.data)
        ip_address = get_client_ip(request)
        user_agent = request.META.get('HTTP_USER_AGENT', '')

        if not serializer.is_valid():
            email = request.data.get('email', '')
            user = User.objects.filter(email=email).first()
            AuditLog.objects.create(
                user=user,
                action='LOGIN_FAILURE',
                details={
                    'email_attempted': email,
                    'errors': serializer.errors,
                    'ip_address': ip_address,
                    'user_agent': user_agent
                }
            )
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        user = serializer.validated_data['user']
        
        # Generate Tokens
        refresh = RefreshToken.for_user(user)
        access_token = str(refresh.access_token)
        refresh_token = str(refresh)

        # Log Success
        AuditLog.objects.create(
            user=user,
            action='LOGIN_SUCCESS',
            details={
                'ip_address': ip_address,
                'user_agent': user_agent
            }
        )

        response = Response({
            'access': access_token,
            'user': UserSerializer(user).data
        }, status=status.HTTP_200_OK)

        # Set secure HttpOnly cookie
        response.set_cookie(
            key='refresh_token',
            value=refresh_token,
            httponly=True,
            secure=False,  # Set to True in production (HTTPS)
            samesite='Lax',
            max_age=7 * 24 * 60 * 60  # 7 days
        )

        return response

class LogoutView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, *args, **kwargs):
        refresh_token = request.COOKIES.get('refresh_token') or request.data.get('refresh')
        
        ip_address = get_client_ip(request)
        user_agent = request.META.get('HTTP_USER_AGENT', '')

        if refresh_token:
            try:
                token = RefreshToken(refresh_token)
                token.blacklist()
            except TokenError:
                pass

        AuditLog.objects.create(
            user=request.user,
            action='LOGOUT',
            details={
                'ip_address': ip_address,
                'user_agent': user_agent
            }
        )

        response = Response({'detail': 'Successfully logged out.'}, status=status.HTTP_205_RESET_CONTENT)
        response.delete_cookie('refresh_token', samesite='Lax')
        return response

class TokenRefreshView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request, *args, **kwargs):
        refresh_token = request.COOKIES.get('refresh_token') or request.data.get('refresh')

        if not refresh_token:
            return Response({'detail': 'Refresh token cookie is missing.'}, status=status.HTTP_401_UNAUTHORIZED)

        try:
            refresh = RefreshToken(refresh_token)
            access_token = str(refresh.access_token)
        except TokenError:
            return Response({'detail': 'Token is invalid or expired'}, status=status.HTTP_401_UNAUTHORIZED)

        return Response({
            'access': access_token
        }, status=status.HTTP_200_OK)

class CurrentUserView(generics.RetrieveAPIView):
    serializer_class = UserSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self):
        return self.request.user

class ChangePasswordView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, *args, **kwargs):
        serializer = PasswordChangeSerializer(data=request.data, context={'request': request})
        
        ip_address = get_client_ip(request)
        user_agent = request.META.get('HTTP_USER_AGENT', '')

        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        user = request.user
        user.set_password(serializer.validated_data['new_password'])
        user.save()

        AuditLog.objects.create(
            user=user,
            action='PASSWORD_CHANGE',
            details={
                'ip_address': ip_address,
                'user_agent': user_agent
            }
        )

        return Response({'detail': 'Password has been updated successfully.'}, status=status.HTTP_200_OK)

class RoleListView(generics.ListAPIView):
    serializer_class = RoleSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if not user.role or user.role.name != 'HOSPITAL_ADMINISTRATOR':
            self.permission_denied(
                self.request,
                message="Only Hospital Administrators are allowed to view system roles."
            )
        return Role.objects.all()
