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

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    ambulance_number = models.CharField(max_length=50, unique=True)
    hospital = models.ForeignKey(Hospital, on_delete=models.PROTECT, related_name='ambulances')
    station = models.ForeignKey(Station, on_delete=models.SET_NULL, null=True, blank=True, related_name='ambulances')
    type = models.CharField(max_length=50, choices=AMBULANCE_TYPES, default='Basic Life Support')
    status = models.CharField(max_length=50, choices=STATUS_CHOICES, default='ACTIVE')

    def __str__(self):
        return f"{self.ambulance_number} ({self.status})"

class Driver(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='driver_profile')
    contact = models.CharField(max_length=20)
    license_number = models.CharField(max_length=50, unique=True)
    availability = models.BooleanField(default=True)

    def __str__(self):
        return f"{self.user.name} - {self.license_number}"

class DriverAssignment(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    driver = models.ForeignKey(Driver, on_delete=models.PROTECT, related_name='assignments')
    ambulance = models.ForeignKey(Ambulance, on_delete=models.PROTECT, related_name='assignments')
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
