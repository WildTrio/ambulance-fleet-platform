from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.utils import timezone
from .models import Notification
from .serializers import NotificationSerializer

class NotificationViewSet(viewsets.ModelViewSet):
    serializer_class = NotificationSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        
        # Trigger escalations check for Dispatchers/Admins
        user_role = getattr(user.role, 'name', '') if user.role else ''
        if user_role in ['DISPATCHER', 'HOSPITAL_ADMINISTRATOR']:
            self.trigger_escalation_checks()

        queryset = Notification.objects.filter(user=user)
        unread = self.request.query_params.get('unread', None)
        if unread == 'true':
            queryset = queryset.filter(is_read=False)
        return queryset

    def perform_update(self, serializer):
        is_read = self.request.data.get('is_read')
        if is_read is not None:
            if is_read:
                serializer.save(read_at=timezone.now())
            else:
                serializer.save(read_at=None)
        else:
            serializer.save()

    def trigger_escalation_checks(self):
        from ambulances.models import EmergencyRequest
        from django.utils import timezone
        from datetime import timedelta
        
        # Find critical requests pending for over 3 minutes
        threshold_time = timezone.now() - timedelta(minutes=3)
        pending_requests = EmergencyRequest.objects.filter(
            status='PENDING',
            created_at__lte=threshold_time
        )

        for req in pending_requests:
            esc_msg = f"Request #{req.id} ({req.emergency_type}) at {req.pickup_location} has been pending for over 3 minutes without assignment!"
            # Avoid creating duplicates for the current user
            exists = Notification.objects.filter(
                user=self.request.user,
                notification_type='ESCALATION',
                message=esc_msg
            ).exists()

            if not exists:
                Notification.objects.create(
                    user=self.request.user,
                    title="⚠️ Emergency Request Escalated",
                    message=esc_msg,
                    notification_type='ESCALATION'
                )

    @action(detail=False, methods=['post'], url_path='mark-all-read')
    def mark_all_read(self, request):
        Notification.objects.filter(user=request.user, is_read=False).update(
            is_read=True,
            read_at=timezone.now()
        )
        return Response({'detail': 'All notifications marked as read.'}, status=status.HTTP_200_OK)
