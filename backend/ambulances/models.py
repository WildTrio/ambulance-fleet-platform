import uuid
from django.db import models
from django.conf import settings

class Hospital(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    hospital_name = models.CharField(max_length=255)
    address = models.CharField(max_length=255)
    city = models.CharField(max_length=100)
    state = models.CharField(max_length=100)
    contact_number = models.CharField(max_length=20)

    def __str__(self):
        return self.hospital_name

class Station(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    hospital = models.ForeignKey(Hospital, on_delete=models.CASCADE, related_name='stations')
    station_name = models.CharField(max_length=255)
    latitude = models.DecimalField(max_digits=9, decimal_places=6)
    longitude = models.DecimalField(max_digits=9, decimal_places=6)

    def __str__(self):
        return self.station_name

class Equipment(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=100, unique=True)

    def __str__(self):
        return self.name

class Ambulance(models.Model):
    AMBULANCE_TYPES = [
        ('Basic Life Support', 'Basic Life Support'),
        ('Advanced Life Support', 'Advanced Life Support'),
        ('Patient Transport', 'Patient Transport'),
    ]

    STATUS_CHOICES = [
        ('ACTIVE', 'Active'),
        ('MAINTENANCE', 'Maintenance'),
        ('INACTIVE', 'Inactive'),
    ]

    LIFECYCLE_STATUS_CHOICES = [
        ('AVAILABLE', 'Available'),
        ('ASSIGNED', 'Assigned'),
        ('EN_ROUTE', 'En Route'),
        ('AT_INCIDENT', 'At Incident'),
        ('PATIENT_ONBOARD', 'Patient Onboard'),
        ('HOSPITAL_ARRIVAL', 'Hospital Arrival'),
        ('SANITIZATION', 'Sanitization'),
        ('READY', 'Ready'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    ambulance_number = models.CharField(max_length=50, unique=True)
    hospital = models.ForeignKey(Hospital, on_delete=models.PROTECT, related_name='ambulances')
    station = models.ForeignKey(Station, on_delete=models.SET_NULL, null=True, blank=True, related_name='ambulances')
    type = models.CharField(max_length=50, choices=AMBULANCE_TYPES, default='Basic Life Support')
    status = models.CharField(max_length=50, choices=STATUS_CHOICES, default='ACTIVE')
    lifecycle_status = models.CharField(max_length=50, choices=LIFECYCLE_STATUS_CHOICES, default='AVAILABLE')
    equipment = models.ManyToManyField(Equipment, blank=True, related_name='ambulances')

    def __str__(self):
        return f"{self.ambulance_number} ({self.status}) [{self.lifecycle_status}]"

    def transition_to(self, new_status, user=None, remarks=None, mission=None):
        from django.core.exceptions import ValidationError
        from .models import AmbulanceLifecycleLog
        old_status = self.lifecycle_status
        if old_status == new_status:
            return self

        # Allow transition if the vehicle was in SANITIZATION (which sets self.status to MAINTENANCE)
        if self.status in ['MAINTENANCE', 'INACTIVE'] and old_status != 'SANITIZATION':
            raise ValidationError(f"Cannot transition status of an ambulance that is {self.status}.")

        transitions = {
            'AVAILABLE': ['ASSIGNED'],
            'ASSIGNED': ['EN_ROUTE', 'AVAILABLE'],
            'EN_ROUTE': ['AT_INCIDENT', 'AVAILABLE'],
            'AT_INCIDENT': ['PATIENT_ONBOARD', 'AVAILABLE'],
            'PATIENT_ONBOARD': ['HOSPITAL_ARRIVAL', 'SANITIZATION', 'AVAILABLE'],
            'HOSPITAL_ARRIVAL': ['SANITIZATION', 'AVAILABLE'],
            'SANITIZATION': ['READY', 'AVAILABLE'],
            'READY': ['AVAILABLE'],
        }

        if new_status not in transitions.get(old_status, []):
            raise ValidationError(f"Cannot transition operational status from {old_status} to {new_status}.")

        # If entering sanitization, update administrative status to MAINTENANCE
        if new_status == 'SANITIZATION':
            self.status = 'MAINTENANCE'
        # If exiting sanitization (moving to READY or AVAILABLE), restore status to ACTIVE
        elif old_status == 'SANITIZATION':
            self.status = 'ACTIVE'

        self.lifecycle_status = new_status
        self.save()

        AmbulanceLifecycleLog.objects.create(
            ambulance=self,
            mission=mission,
            from_status=old_status,
            to_status=new_status,
            changed_by=user,
            remarks=remarks
        )
        return self

class Driver(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='driver_profile')
    contact = models.CharField(max_length=20, unique=True)
    license_number = models.CharField(max_length=50, unique=True)
    availability = models.BooleanField(default=True)

    def __str__(self):
        return f"{self.user.name} - {self.license_number}"

class DriverAssignment(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    driver = models.ForeignKey(Driver, on_delete=models.CASCADE, related_name='assignments')
    ambulance = models.ForeignKey(Ambulance, on_delete=models.CASCADE, related_name='assignments')
    start_time = models.DateTimeField(auto_now_add=True)
    end_time = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        status = "Active" if not self.end_time else f"Ended at {self.end_time}"
        return f"{self.driver} on {self.ambulance} ({status})"

class AmbulanceOperationalHistory(models.Model):
    EVENT_TYPES = [
        ('STATUS_CHANGE', 'Status Change'),
        ('STATION_TRANSFER', 'Station Transfer'),
        ('DRIVER_ASSIGNMENT', 'Driver Assignment'),
        ('DRIVER_UNASSIGNMENT', 'Driver Unassignment'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    ambulance = models.ForeignKey(Ambulance, on_delete=models.CASCADE, related_name='operational_history')
    event_type = models.CharField(max_length=50, choices=EVENT_TYPES)
    old_value = models.CharField(max_length=255, null=True, blank=True)
    new_value = models.CharField(max_length=255, null=True, blank=True)
    changed_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name='ambulance_actions')
    changed_at = models.DateTimeField(auto_now_add=True)
    remarks = models.TextField(null=True, blank=True)

    def __str__(self):
        return f"{self.ambulance.ambulance_number} - {self.event_type} @ {self.changed_at}"

class AmbulanceLifecycleLog(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    ambulance = models.ForeignKey(Ambulance, on_delete=models.CASCADE, related_name='lifecycle_logs')
    mission = models.ForeignKey('Mission', on_delete=models.SET_NULL, null=True, blank=True, related_name='lifecycle_logs')
    from_status = models.CharField(max_length=50, null=True, blank=True)
    to_status = models.CharField(max_length=50)
    changed_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name='lifecycle_actions')
    changed_at = models.DateTimeField(auto_now_add=True)
    remarks = models.TextField(null=True, blank=True)

    def __str__(self):
        return f"{self.ambulance.ambulance_number}: {self.from_status} -> {self.to_status} @ {self.changed_at}"

class Shift(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    driver = models.ForeignKey(Driver, on_delete=models.CASCADE, related_name='shifts')
    start_time = models.DateTimeField()
    end_time = models.DateTimeField()

    def __str__(self):
        return f"{self.driver.user.name}: {self.start_time} to {self.end_time}"

class Certification(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    driver = models.ForeignKey(Driver, on_delete=models.CASCADE, related_name='certifications')
    name = models.CharField(max_length=100)
    certificate_number = models.CharField(max_length=100)
    issuing_authority = models.CharField(max_length=100)
    issue_date = models.DateField()
    expiry_date = models.DateField()

    def __str__(self):
        return f"{self.driver.user.name} - {self.name} ({self.certificate_number})"


class EmergencyRequest(models.Model):
    PRIORITY_CHOICES = [
        ('LOW', 'Low'),
        ('MEDIUM', 'Medium'),
        ('HIGH', 'High'),
        ('CRITICAL', 'Critical'),
    ]

    STATUS_CHOICES = [
        ('PENDING', 'Pending'),
        ('ASSIGNED', 'Assigned'),
        ('IN_PROGRESS', 'In Progress'),
        ('COMPLETED', 'Completed'),
        ('CANCELLED', 'Cancelled'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    requester_name = models.CharField(max_length=255)
    contact_number = models.CharField(max_length=20)
    emergency_type = models.CharField(max_length=100)
    priority = models.CharField(max_length=20, choices=PRIORITY_CHOICES, default='MEDIUM')
    pickup_location = models.CharField(max_length=255)
    latitude = models.DecimalField(max_digits=9, decimal_places=6)
    longitude = models.DecimalField(max_digits=9, decimal_places=6)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='PENDING')
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='emergency_requests'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.requester_name} - {self.emergency_type} ({self.status})"


class Mission(models.Model):
    MISSION_STATUS_CHOICES = [
        ('ASSIGNED', 'Assigned'),
        ('EN_ROUTE', 'En Route'),
        ('AT_INCIDENT', 'At Incident'),
        ('PATIENT_ONBOARD', 'Patient Onboard'),
        ('HOSPITAL_ARRIVAL', 'Hospital Arrival'),
        ('SANITIZATION', 'Sanitization'),
        ('READY', 'Ready'),
        ('COMPLETED', 'Completed'),
        ('CANCELLED', 'Cancelled'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    emergency_request = models.ForeignKey(
        EmergencyRequest, 
        on_delete=models.PROTECT, 
        related_name='missions'
    )
    ambulance = models.ForeignKey(
        Ambulance, 
        on_delete=models.PROTECT, 
        related_name='missions'
    )
    driver = models.ForeignKey(
        Driver, 
        on_delete=models.PROTECT, 
        related_name='missions'
    )
    status = models.CharField(
        max_length=50, 
        choices=MISSION_STATUS_CHOICES, 
        default='ASSIGNED'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Mission {self.id} - Request: {self.emergency_request.requester_name} - Ambulance: {self.ambulance.ambulance_number} ({self.status})"



