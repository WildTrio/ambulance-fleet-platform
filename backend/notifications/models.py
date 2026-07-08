import uuid
from django.db import models
from django.conf import settings

class Notification(models.Model):
    NOTIFICATION_TYPES = [
        ('NEW_REQUEST', 'New Emergency Request'),
        ('AMBULANCE_ASSIGNED', 'Ambulance Assigned'),
        ('DRIVER_ASSIGNED', 'Driver Assigned'),
        ('MISSION_STARTED', 'Mission Started'),
        ('MISSION_COMPLETED', 'Mission Completed'),
        ('ESCALATION', 'Emergency Escalation'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='notifications'
    )
    title = models.CharField(max_length=255)
    message = models.TextField()
    notification_type = models.CharField(max_length=50, choices=NOTIFICATION_TYPES)
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    read_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.user.email} - {self.title} ({self.get_notification_type_display()})"
