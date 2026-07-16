import uuid
from django.db import models
from django.conf import settings
from django.core.validators import RegexValidator

class Hospital(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    hospital_name = models.CharField(max_length=255)
    address = models.CharField(max_length=255)
    city = models.CharField(max_length=100)
    state = models.CharField(max_length=100)
    contact_number = models.CharField(
        max_length=20,
        validators=[
            RegexValidator(
                regex=r'^\d{10}$',
                message="Contact number must be exactly 10 digits."
            )
        ]
    )

    class Meta:
        constraints = [
            models.CheckConstraint(
                check=models.Q(contact_number__regex=r'^[0-9]{10}$'),
                name='hospital_contact_number_must_be_10_digits'
            )
        ]

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
    current_latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    current_longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)

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
    contact = models.CharField(
        max_length=20,
        unique=True,
        validators=[
            RegexValidator(
                regex=r'^\d{10}$',
                message="Contact number must be exactly 10 digits."
            )
        ]
    )
    license_number = models.CharField(max_length=50, unique=True)
    availability = models.BooleanField(default=True)

    class Meta:
        constraints = [
            models.CheckConstraint(
                check=models.Q(contact__regex=r'^[0-9]{10}$'),
                name='driver_contact_must_be_10_digits'
            )
        ]

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
    contact_number = models.CharField(
        max_length=20,
        validators=[
            RegexValidator(
                regex=r'^\d{10}$',
                message="Contact number must be exactly 10 digits."
            )
        ]
    )
    emergency_type = models.CharField(max_length=100)
    priority = models.CharField(max_length=20, choices=PRIORITY_CHOICES, default='MEDIUM')
    pickup_location = models.CharField(max_length=255)
    latitude = models.DecimalField(max_digits=9, decimal_places=6)
    longitude = models.DecimalField(max_digits=9, decimal_places=6)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='PENDING')
    hospital = models.ForeignKey(
        Hospital,
        on_delete=models.PROTECT,
        related_name='emergency_requests',
        null=True,
        blank=True
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='emergency_requests'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.CheckConstraint(
                check=models.Q(contact_number__regex=r'^[0-9]{10}$'),
                name='emergency_request_contact_number_must_be_10_digits'
            )
        ]

    def __str__(self):
        return f"{self.requester_name} - {self.emergency_type} ({self.status})"


    def save(self, *args, **kwargs):
        if not self.hospital:
            if self.created_by and self.created_by.hospital:
                self.hospital = self.created_by.hospital
            else:
                try:
                    first_hospital = Hospital.objects.first()
                    if first_hospital:
                        self.hospital = first_hospital
                except Exception:
                    pass
        super().save(*args, **kwargs)


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

    def save(self, *args, **kwargs):
        is_new = self.pk is None
        old_status = None
        if not is_new:
            try:
                old_status = Mission.objects.get(pk=self.pk).status
            except Mission.DoesNotExist:
                pass

        super().save(*args, **kwargs)

        # Handle Trip creation/updates
        from django.utils import timezone
        from .models import Trip
        
        if is_new:
            # Create active trip
            Trip.objects.get_or_create(
                mission=self,
                defaults={
                    'ambulance': self.ambulance,
                    'driver': self.driver,
                    'status': 'ACTIVE'
                }
            )
        else:
            # Update trip based on mission status transition
            trip = getattr(self, 'trip', None)
            if not trip:
                # Fallback if trip wasn't created
                trip, _ = Trip.objects.get_or_create(
                    mission=self,
                    defaults={
                        'ambulance': self.ambulance,
                        'driver': self.driver,
                        'status': 'ACTIVE'
                    }
                )

            if trip.status == 'ACTIVE':
                # Transition to EN_ROUTE starts the trip
                if self.status == 'EN_ROUTE' and not trip.start_time:
                    trip.start_time = timezone.now()
                    trip.save()
                
                # Completion or Cancellation ends the trip
                elif self.status in ['COMPLETED', 'CANCELLED']:
                    trip.end_time = timezone.now()
                    
                    if not trip.start_time:
                        # Cancelled/Completed before departing
                        trip.start_time = trip.end_time
                        trip.distance_km = 0.0
                    else:
                        # Calculate distance using Haversine
                        trip.distance_km = self.calculate_trip_distance(old_status or 'ASSIGNED')
                    
                    # Generate natural language summary
                    trip.summary = self.generate_trip_summary(trip, old_status)
                    trip.status = 'COMPLETED' if self.status == 'COMPLETED' else 'CANCELLED'
                    trip.save()

    def calculate_trip_distance(self, last_status):
        import math
        import urllib.request
        import json
        from django.conf import settings
        from django.utils import timezone

        def haversine(lat1, lon1, lat2, lon2):
            if lat1 is None or lon1 is None or lat2 is None or lon2 is None:
                return 0.0
            try:
                R = 6371.0  # Earth radius in km
                lat1_r = math.radians(float(lat1))
                lon1_r = math.radians(float(lon1))
                lat2_r = math.radians(float(lat2))
                lon2_r = math.radians(float(lon2))
                dlat = lat2_r - lat1_r
                dlon = lon2_r - lon1_r
                a = math.sin(dlat / 2)**2 + math.cos(lat1_r) * math.cos(lat2_r) * math.sin(dlon / 2)**2
                c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
                return R * c
            except Exception:
                return 0.0

        # 1. Telemetry GPS Logs Integration: If there are logged GPS coordinates for this trip,
        # sum the actual distance recorded from coordinate to coordinate.
        trip = getattr(self, 'trip', None)
        if trip:
            logs = list(trip.gps_logs.all().order_by('recorded_at'))
            if len(logs) >= 2:
                actual_gps_dist = 0.0
                for i in range(len(logs) - 1):
                    actual_gps_dist += haversine(
                        logs[i].latitude, logs[i].longitude,
                        logs[i+1].latitude, logs[i+1].longitude
                    )
                return round(actual_gps_dist, 2)

        # 2. GraphHopper Routing API Integration
        station_lat = self.ambulance.station.latitude if (self.ambulance and self.ambulance.station) else None
        station_lon = self.ambulance.station.longitude if (self.ambulance and self.ambulance.station) else None
        incident_lat = self.emergency_request.latitude if self.emergency_request else None
        incident_lon = self.emergency_request.longitude if self.emergency_request else None

        dest_hospital = self.ambulance.hospital if self.ambulance else None
        dest_lat = None
        dest_lon = None
        if dest_hospital:
            first_station = dest_hospital.stations.first()
            if first_station:
                dest_lat = first_station.latitude
                dest_lon = first_station.longitude

        if dest_lat is None or dest_lon is None:
            dest_lat = station_lat
            dest_lon = station_lon

        # Build path coordinates based on when/where the mission ends or cancels
        points = []
        if self.status == 'CANCELLED':
            if last_status == 'ASSIGNED':
                return 0.0
            elif last_status in ['EN_ROUTE', 'AT_INCIDENT']:
                if station_lat and incident_lat:
                    points = [(station_lat, station_lon), (incident_lat, incident_lon)]
            else:  # PATIENT_ONBOARD, HOSPITAL_ARRIVAL, SANITIZATION
                if station_lat and incident_lat and dest_lat:
                    points = [(station_lat, station_lon), (incident_lat, incident_lon), (dest_lat, dest_lon)]
        else:  # COMPLETED
            if station_lat and incident_lat and dest_lat:
                points = [(station_lat, station_lon), (incident_lat, incident_lon), (dest_lat, dest_lon)]

        # Call GraphHopper API to get road routing distance if key is configured
        api_key = getattr(settings, 'GRAPHHOPPER_API_KEY', '')
        if api_key and len(points) >= 2:
            try:
                points_query = "&".join([f"point={pt[0]},{pt[1]}" for pt in points])
                url = f"https://graphhopper.com/api/1/route?{points_query}&profile=car&locale=en&points_encoded=false&key={api_key}"
                req = urllib.request.Request(
                    url,
                    headers={'User-Agent': 'Lifeline-Dispatch/1.0'}
                )
                with urllib.request.urlopen(req, timeout=5) as response:
                    data = json.loads(response.read().decode())
                    if 'paths' in data and len(data['paths']) > 0:
                        dist_meters = data['paths'][0].get('distance', 0.0)
                        return round(dist_meters / 1000.0, 2)
            except Exception:
                pass

        # 3. Fallback to straight-line Haversine sum if API fails or is not configured
        fallback_dist = 0.0
        for i in range(len(points) - 1):
            fallback_dist += haversine(
                points[i][0], points[i][1],
                points[i+1][0], points[i+1][1]
            )
        return round(fallback_dist, 2)

    def generate_trip_summary(self, trip, last_phase=None):
        duration_mins = 0
        if trip.end_time and trip.start_time:
            diff = trip.end_time - trip.start_time
            duration_mins = max(0, int(diff.total_seconds() / 60))

        driver_name = self.driver.user.name if (self.driver and self.driver.user) else "Unknown Driver"
        ambulance_no = self.ambulance.ambulance_number if self.ambulance else "Unknown"
        patient_name = self.emergency_request.requester_name if self.emergency_request else "Unknown"
        incident_type = self.emergency_request.emergency_type if self.emergency_request else "Emergency"
        
        dest_hospital = self.ambulance.hospital if self.ambulance else None
        hospital_name = dest_hospital.hospital_name if dest_hospital else "Unknown Hospital"

        if self.status == 'COMPLETED':
            return (
                f"Trip completed successfully. Total duration: {duration_mins} mins. "
                f"Total distance: {trip.distance_km} km. Driver: {driver_name}. "
                f"Vehicle: {ambulance_no}. Patient: {patient_name} ({incident_type}). "
                f"Destination: {hospital_name}."
            )
        else:
            phase = last_phase or self.status
            last_phase_display = phase.replace('_', ' ').title()
            
            return (
                f"Trip cancelled midway. Phase reached: {last_phase_display}. "
                f"Total duration: {duration_mins} mins. Total distance: {trip.distance_km} km. "
                f"Driver: {driver_name}. Vehicle: {ambulance_no}."
            )



class Trip(models.Model):
    TRIP_STATUS_CHOICES = [
        ('ACTIVE', 'Active'),
        ('COMPLETED', 'Completed'),
        ('CANCELLED', 'Cancelled'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    mission = models.OneToOneField(
        'Mission',
        on_delete=models.CASCADE,
        related_name='trip'
    )
    ambulance = models.ForeignKey(
        'Ambulance',
        on_delete=models.PROTECT,
        related_name='trips'
    )
    driver = models.ForeignKey(
        'Driver',
        on_delete=models.PROTECT,
        related_name='trips'
    )
    status = models.CharField(
        max_length=20,
        choices=TRIP_STATUS_CHOICES,
        default='ACTIVE'
    )
    start_time = models.DateTimeField(null=True, blank=True)
    end_time = models.DateTimeField(null=True, blank=True)
    distance_km = models.FloatField(default=0.0)
    summary = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Trip {self.id} - Amb: {self.ambulance.ambulance_number} ({self.status})"


class GPSLog(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    ambulance = models.ForeignKey(Ambulance, on_delete=models.CASCADE, related_name='gps_logs')
    trip = models.ForeignKey(Trip, on_delete=models.SET_NULL, null=True, blank=True, related_name='gps_logs')
    latitude = models.DecimalField(max_digits=9, decimal_places=6)
    longitude = models.DecimalField(max_digits=9, decimal_places=6)
    recorded_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.ambulance.ambulance_number} @ {self.recorded_at} ({self.latitude}, {self.longitude})"



