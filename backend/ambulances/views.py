from rest_framework import viewsets, status, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from .models import Hospital, Station, Ambulance, Driver, DriverAssignment, AmbulanceOperationalHistory, Shift, Certification, EmergencyRequest, Mission
from .serializers import (
    HospitalSerializer, StationSerializer, DriverSerializer,
    AmbulanceSerializer, AmbulanceOperationalHistorySerializer,
    AssignDriverSerializer, TransferStationSerializer, ChangeStatusSerializer,
    ShiftSerializer, CertificationSerializer, EmergencyRequestSerializer,
    MissionSerializer
)

class AmbulancePermission(permissions.BasePermission):
    """
    RBAC permission guard for ambulances:
    - Safe actions (list, retrieve) and history read-only: Admin, Fleet Manager, Dispatcher.
    - Write/modify actions (create, update, delete, assign driver, transfer, status change): Admin, Fleet Manager.
    """
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.user.is_superuser:
            return True
        
        user_role = request.user.role.name if request.user.role else None

        # Read actions (Safe methods + history action + assign_driver action)
        if request.method in permissions.SAFE_METHODS or view.action in ['history', 'assign_driver']:
            return user_role in ['HOSPITAL_ADMINISTRATOR', 'FLEET_MANAGER', 'DISPATCHER']
        
        # Write actions
        return user_role in ['HOSPITAL_ADMINISTRATOR', 'FLEET_MANAGER']

class AmbulanceViewSet(viewsets.ModelViewSet):
    queryset = Ambulance.objects.all().order_by('ambulance_number')
    serializer_class = AmbulanceSerializer
    permission_classes = [IsAuthenticated, AmbulancePermission]

    @action(detail=False, methods=['GET'], url_path='nearby')
    def nearby(self, request):
        latitude = request.query_params.get('latitude')
        longitude = request.query_params.get('longitude')
        
        if not latitude or not longitude:
            return Response(
                {"detail": "latitude and longitude are required query parameters."},
                status=status.HTTP_400_BAD_REQUEST
            )
            
        try:
            lat = float(latitude)
            lon = float(longitude)
        except ValueError:
            return Response(
                {"detail": "latitude and longitude must be valid decimal numbers."},
                status=status.HTTP_400_BAD_REQUEST
            )
            
        if lat < -90 or lat > 90:
            return Response(
                {"detail": "Latitude must be between -90 and 90."},
                status=status.HTTP_400_BAD_REQUEST
            )
            
        if lon < -180 or lon > 180:
            return Response(
                {"detail": "Longitude must be between -180 and 180."},
                status=status.HTTP_400_BAD_REQUEST
            )

        import math
        from django.conf import settings
        import urllib.request
        import urllib.parse
        import json
        from concurrent.futures import ThreadPoolExecutor

        def get_haversine_distance(lat1, lon1, lat2, lon2):
            R = 6371.0 # Earth radius in km
            lat1_r = math.radians(float(lat1))
            lon1_r = math.radians(float(lon1))
            lat2_r = math.radians(float(lat2))
            lon2_r = math.radians(float(lon2))
            dlat = lat2_r - lat1_r
            dlon = lon2_r - lon1_r
            a = math.sin(dlat / 2)**2 + math.cos(lat1_r) * math.cos(lat2_r) * math.sin(dlon / 2)**2
            c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
            return R * c

        def get_haversine_eta(distance_km):
            # Speed estimate: 40 km/h
            return round((distance_km / 40.0) * 60.0) # in minutes

        api_key = getattr(settings, 'GRAPHHOPPER_API_KEY', '')

        # Function to fetch road routing info for a single station from GraphHopper
        def fetch_routing_info(station):
            if not station:
                return None, None
            # If no API key, return straight-line
            if not api_key:
                dist = get_haversine_distance(lat, lon, station.latitude, station.longitude)
                return dist, get_haversine_eta(dist)
                
            try:
                # GraphHopper Route API endpoint
                url = f"https://graphhopper.com/api/1/route?point={lat},{lon}&point={station.latitude},{station.longitude}&profile=car&locale=en&key={api_key}"
                req = urllib.request.Request(
                    url, 
                    headers={'User-Agent': 'Lifeline-Dispatch/1.0'}
                )
                with urllib.request.urlopen(req, timeout=5) as response:
                    data = json.loads(response.read().decode())
                    if 'paths' in data and len(data['paths']) > 0:
                        path = data['paths'][0]
                        dist_m = path.get('distance', 0)
                        time_ms = path.get('time', 0)
                        dist_km = dist_m / 1000.0
                        eta_mins = round(time_ms / 60000.0)
                        return dist_km, eta_mins
            except Exception:
                pass
                
            # Fallback
            dist = get_haversine_distance(lat, lon, station.latitude, station.longitude)
            return dist, get_haversine_eta(dist)

        ambulances = Ambulance.objects.all()
        stations = [amb.station for amb in ambulances]
        
        with ThreadPoolExecutor(max_workers=10) as executor:
            routing_results = list(executor.map(fetch_routing_info, stations))

        results = []
        for i, amb in enumerate(ambulances):
            distance, eta = routing_results[i]
            
            # Active driver
            active_driver_assignment = amb.assignments.filter(end_time__isnull=True).first()
            active_driver = None
            if active_driver_assignment and active_driver_assignment.driver:
                active_driver = {
                    "id": active_driver_assignment.driver.id,
                    "name": active_driver_assignment.driver.user.name,
                    "license_number": active_driver_assignment.driver.license_number
                }
            
            # Mission check (availability status)
            has_active_mission = Mission.objects.filter(ambulance=amb).exclude(status__in=['COMPLETED', 'CANCELLED']).exists()
            
            # Calculate availability status and readiness info
            if amb.status == 'MAINTENANCE':
                availability_status = 'MAINTENANCE'
                readiness_info = 'Under Maintenance'
            elif amb.status == 'INACTIVE':
                availability_status = 'INACTIVE'
                readiness_info = 'Inactive'
            elif has_active_mission:
                availability_status = 'ON_MISSION'
                readiness_info = 'On Mission'
            else:
                availability_status = 'AVAILABLE'
                if active_driver:
                    readiness_info = 'Ready'
                else:
                    readiness_info = 'No Driver'

            dist_val = round(distance, 2) if distance is not None else None
            eta_val = int(eta) if eta is not None else None

            results.append({
                "id": amb.id,
                "ambulance_number": amb.ambulance_number,
                "type": amb.type,
                "status": amb.status,
                "hospital": {
                    "id": amb.hospital.id,
                    "hospital_name": amb.hospital.hospital_name
                } if amb.hospital else None,
                "station": {
                    "id": amb.station.id,
                    "station_name": amb.station.station_name,
                    "latitude": float(amb.station.latitude),
                    "longitude": float(amb.station.longitude)
                } if amb.station else None,
                "distance": dist_val,
                "eta": eta_val,
                "availability_status": availability_status,
                "readiness_info": readiness_info,
                "active_driver": active_driver
            })

        # Sort: first those with distance (ascending), then those without distance
        results.sort(key=lambda x: (x["distance"] is None, x["distance"] or 0))

        return Response(results, status=status.HTTP_200_OK)

    def get_queryset(self):
        queryset = super().get_queryset()
        status_filter = self.request.query_params.get('status')
        type_filter = self.request.query_params.get('type')
        station_filter = self.request.query_params.get('station_id')

        if status_filter:
            queryset = queryset.filter(status=status_filter)
        if type_filter:
            queryset = queryset.filter(type=type_filter)
        if station_filter:
            queryset = queryset.filter(station_id=station_filter)
        return queryset

    def update(self, request, *args, **kwargs):
        instance = self.get_object()
        if Mission.objects.filter(ambulance=instance).exclude(status__in=['COMPLETED', 'CANCELLED']).exists():
            return Response(
                {"non_field_errors": ["Cannot modify ambulance details while it is on an active mission."]},
                status=status.HTTP_400_BAD_REQUEST
            )
        return super().update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if Mission.objects.filter(ambulance=instance).exclude(status__in=['COMPLETED', 'CANCELLED']).exists():
            return Response(
                {"non_field_errors": ["Cannot delete ambulance while it is on an active mission."]},
                status=status.HTTP_400_BAD_REQUEST
            )
        if instance.status != 'INACTIVE':
            return Response(
                {"detail": "Only inactive ambulances can be deleted."},
                status=status.HTTP_400_BAD_REQUEST
            )
        return super().destroy(request, *args, **kwargs)

    def perform_update(self, serializer):
        from django.db import transaction
        from django.utils import timezone
        
        ambulance_old = self.get_object()
        old_status = ambulance_old.status
        old_station = ambulance_old.station
        old_station_name = old_station.station_name if old_station else "No Station"
        
        with transaction.atomic():
            ambulance = serializer.save()
            new_status = ambulance.status
            new_station = ambulance.station
            
            # Status change logic
            if old_status != new_status:
                # Log status change operational history
                AmbulanceOperationalHistory.objects.create(
                    ambulance=ambulance,
                    event_type='STATUS_CHANGE',
                    old_value=old_status,
                    new_value=new_status,
                    changed_by=self.request.user,
                    remarks="Ambulance status updated via edit."
                )
                
                # Rule: When status changes to MAINTENANCE or INACTIVE, auto unassign active driver
                if new_status in ['MAINTENANCE', 'INACTIVE']:
                    current_assignment = ambulance.assignments.filter(end_time__isnull=True).first()
                    if current_assignment:
                        current_assignment.end_time = timezone.now()
                        current_assignment.save()
                        
                        d = current_assignment.driver
                        d.availability = True
                        d.save()
                        
                        AmbulanceOperationalHistory.objects.create(
                            ambulance=ambulance,
                            event_type='DRIVER_UNASSIGNMENT',
                            old_value=d.user.name,
                            new_value=None,
                            changed_by=self.request.user,
                            remarks=f"Driver unassigned automatically because ambulance status changed to {new_status}."
                        )
            
            # Station transfer logic
            if old_station != new_station:
                # Align hospital_id with station's hospital_id if different
                if new_station and new_station.hospital != ambulance.hospital:
                    ambulance.hospital = new_station.hospital
                    ambulance.save()
                    
                new_station_name = new_station.station_name if new_station else "No Station"
                AmbulanceOperationalHistory.objects.create(
                    ambulance=ambulance,
                    event_type='STATION_TRANSFER',
                    old_value=old_station_name,
                    new_value=new_station_name,
                    changed_by=self.request.user,
                    remarks="Ambulance station transferred via edit."
                )

    @action(detail=True, methods=['POST'], serializer_class=AssignDriverSerializer, url_path='assign-driver')
    def assign_driver(self, request, pk=None):
        ambulance = self.get_object()
        if Mission.objects.filter(ambulance=ambulance).exclude(status__in=['COMPLETED', 'CANCELLED']).exists():
            return Response(
                {"non_field_errors": ["Cannot change driver assignment while the ambulance is on an active mission."]},
                status=status.HTTP_400_BAD_REQUEST
            )
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        driver = serializer.validated_data['driver_id']
        from django.db import transaction
        from django.utils import timezone
        
        with transaction.atomic():
            if driver is None:
                # Unassign current driver
                current_assignment = ambulance.assignments.filter(end_time__isnull=True).first()
                if current_assignment:
                    current_assignment.end_time = timezone.now()
                    current_assignment.save()
                    
                    d = current_assignment.driver
                    d.availability = True
                    d.save()
                    
                    # Log unassignment operational history
                    AmbulanceOperationalHistory.objects.create(
                        ambulance=ambulance,
                        event_type='DRIVER_UNASSIGNMENT',
                        old_value=d.user.name,
                        new_value=None,
                        changed_by=request.user
                    )
                    return Response({"detail": "Driver unassigned successfully.", "ambulance_id": ambulance.id, "active_driver": None})
                else:
                    return Response({"detail": "No active driver assigned to this ambulance."}, status=status.HTTP_400_BAD_REQUEST)
            
            # If assigning a driver, verify ambulance is ACTIVE and not under maintenance
            if ambulance.status != 'ACTIVE':
                if ambulance.status == 'MAINTENANCE':
                    return Response({"non_field_errors": ["Ambulance under maintenance cannot receive assignments."]}, status=status.HTTP_400_BAD_REQUEST)
                else:
                    return Response({"non_field_errors": ["Only active ambulances can be assigned."]}, status=status.HTTP_400_BAD_REQUEST)
            
            # Availability rule: Drivers marked unavailable cannot receive assignments.
            is_assigned = DriverAssignment.objects.filter(driver=driver, end_time__isnull=True).exists()
            if not driver.availability and not is_assigned:
                return Response({"non_field_errors": ["Drivers marked unavailable cannot receive assignments."]}, status=status.HTTP_400_BAD_REQUEST)
            
            # Reassignment rule:
            # 1. Close driver's active assignments on other ambulances
            other_assignments = DriverAssignment.objects.filter(driver=driver, end_time__isnull=True).exclude(ambulance=ambulance)
            for oa in other_assignments:
                oa.end_time = timezone.now()
                oa.save()
                # Log history for other ambulance
                AmbulanceOperationalHistory.objects.create(
                    ambulance=oa.ambulance,
                    event_type='DRIVER_UNASSIGNMENT',
                    old_value=driver.user.name,
                    new_value=None,
                    changed_by=request.user,
                    remarks="Driver reassigned to another ambulance."
                )
            
            # 2. Close current active driver assignment on THIS ambulance if it is a different driver
            current_assignment = ambulance.assignments.filter(end_time__isnull=True).first()
            if current_assignment:
                if current_assignment.driver == driver:
                    # Already assigned here, do nothing
                    pass
                else:
                    current_assignment.end_time = timezone.now()
                    current_assignment.save()
                    
                    d = current_assignment.driver
                    d.availability = True
                    d.save()
                    
                    AmbulanceOperationalHistory.objects.create(
                        ambulance=ambulance,
                        event_type='DRIVER_UNASSIGNMENT',
                        old_value=d.user.name,
                        new_value=None,
                        changed_by=request.user,
                        remarks="Replaced by another driver."
                    )
            
            # 3. Create the new assignment and set driver availability to False
            DriverAssignment.objects.create(driver=driver, ambulance=ambulance)
            driver.availability = False
            driver.save()
            
            # Log the assignment
            AmbulanceOperationalHistory.objects.create(
                ambulance=ambulance,
                event_type='DRIVER_ASSIGNMENT',
                old_value=None,
                new_value=driver.user.name,
                changed_by=request.user
            )
        
        return Response({
            "detail": "Driver assigned successfully.",
            "ambulance_id": ambulance.id,
            "active_driver": {
                "id": driver.id,
                "name": driver.user.name
            }
        })

    @action(detail=True, methods=['POST'], serializer_class=TransferStationSerializer)
    def transfer(self, request, pk=None):
        ambulance = self.get_object()
        if Mission.objects.filter(ambulance=ambulance).exclude(status__in=['COMPLETED', 'CANCELLED']).exists():
            return Response(
                {"non_field_errors": ["Cannot transfer station while the ambulance is on an active mission."]},
                status=status.HTTP_400_BAD_REQUEST
            )
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        station = serializer.validated_data['station_id']
        old_station_name = ambulance.station.station_name if ambulance.station else "No Station"
        
        from django.db import transaction
        with transaction.atomic():
            ambulance.station = station
            # Align hospital_id with station's hospital_id if different
            if station.hospital != ambulance.hospital:
                ambulance.hospital = station.hospital
            ambulance.save()
            
            # Log operational history
            AmbulanceOperationalHistory.objects.create(
                ambulance=ambulance,
                event_type='STATION_TRANSFER',
                old_value=old_station_name,
                new_value=station.station_name,
                changed_by=request.user
            )
        
        return Response({
            "detail": "Ambulance station transferred successfully.",
            "old_station": old_station_name,
            "new_station": station.station_name
        })

    @action(detail=True, methods=['POST'], serializer_class=ChangeStatusSerializer, url_path='change-status')
    def change_status(self, request, pk=None):
        ambulance = self.get_object()
        if Mission.objects.filter(ambulance=ambulance).exclude(status__in=['COMPLETED', 'CANCELLED']).exists():
            return Response(
                {"non_field_errors": ["Cannot change status while the ambulance is on an active mission."]},
                status=status.HTTP_400_BAD_REQUEST
            )
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        new_status = serializer.validated_data['status']
        remarks = serializer.validated_data.get('remarks', '')
        old_status = ambulance.status
        
        if old_status == new_status:
            return Response({"detail": "Ambulance is already in this status."}, status=status.HTTP_400_BAD_REQUEST)
            
        from django.db import transaction
        from django.utils import timezone
        
        with transaction.atomic():
            ambulance.status = new_status
            ambulance.save()
            
            # Log status change operational history
            AmbulanceOperationalHistory.objects.create(
                ambulance=ambulance,
                event_type='STATUS_CHANGE',
                old_value=old_status,
                new_value=new_status,
                changed_by=request.user,
                remarks=remarks
            )
            
            # Rule: When status changes to MAINTENANCE or INACTIVE, auto unassign active driver
            if new_status in ['MAINTENANCE', 'INACTIVE']:
                current_assignment = ambulance.assignments.filter(end_time__isnull=True).first()
                if current_assignment:
                    current_assignment.end_time = timezone.now()
                    current_assignment.save()
                    
                    d = current_assignment.driver
                    d.availability = True
                    d.save()
                    
                    AmbulanceOperationalHistory.objects.create(
                        ambulance=ambulance,
                        event_type='DRIVER_UNASSIGNMENT',
                        old_value=d.user.name,
                        new_value=None,
                        changed_by=request.user,
                        remarks=f"Driver unassigned automatically because ambulance status changed to {new_status}."
                    )
                    
        return Response({
            "detail": "Ambulance status updated successfully.",
            "old_status": old_status,
            "new_status": new_status
        })

    @action(detail=True, methods=['GET'], serializer_class=AmbulanceOperationalHistorySerializer)
    def history(self, request, pk=None):
        ambulance = self.get_object()
        history = ambulance.operational_history.all().order_by('-changed_at')
        serializer = self.get_serializer(history, many=True)
        return Response(serializer.data)

class HospitalViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Hospital.objects.all().order_by('hospital_name')
    serializer_class = HospitalSerializer
    permission_classes = [IsAuthenticated]
    
    def get_permissions(self):
        if self.request.user.is_superuser:
            return [permissions.AllowAny()]
        return [AmbulancePermission()]

class StationViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Station.objects.all().order_by('station_name')
    serializer_class = StationSerializer
    permission_classes = [IsAuthenticated]

    def get_permissions(self):
        if self.request.user.is_superuser:
            return [permissions.AllowAny()]
        return [AmbulancePermission()]

class DriverPermission(permissions.BasePermission):
    """
    RBAC permission guard for drivers, shifts, and certifications:
    - Safe actions (list, retrieve): Admin, Fleet Manager, Dispatcher.
    - Write/modify actions (create, update, delete): Admin, Fleet Manager.
    """
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.user.is_superuser:
            return True
        
        user_role = request.user.role.name if request.user.role else None

        if request.method in permissions.SAFE_METHODS:
            return user_role in ['HOSPITAL_ADMINISTRATOR', 'FLEET_MANAGER', 'DISPATCHER']
        
        return user_role in ['HOSPITAL_ADMINISTRATOR', 'FLEET_MANAGER']

class DriverViewSet(viewsets.ModelViewSet):
    queryset = Driver.objects.all().order_by('user__name')
    serializer_class = DriverSerializer
    permission_classes = [IsAuthenticated, DriverPermission]

    def get_queryset(self):
        queryset = super().get_queryset()
        available = self.request.query_params.get('available')
        if available == 'true':
            queryset = queryset.filter(availability=True)
        return queryset

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        is_assigned = DriverAssignment.objects.filter(driver=instance, end_time__isnull=True).exists()
        if is_assigned:
            return Response(
                {"detail": "Active drivers cannot be deleted. Unassign the driver from their ambulance first."},
                status=status.HTTP_400_BAD_REQUEST
            )
        user = instance.user
        user.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

class ShiftViewSet(viewsets.ModelViewSet):
    queryset = Shift.objects.all().order_by('-start_time')
    serializer_class = ShiftSerializer
    permission_classes = [IsAuthenticated, DriverPermission]

    def get_queryset(self):
        queryset = super().get_queryset()
        driver_id = self.request.query_params.get('driver_id')
        if driver_id:
            queryset = queryset.filter(driver_id=driver_id)
        return queryset

class CertificationViewSet(viewsets.ModelViewSet):
    queryset = Certification.objects.all().order_by('expiry_date')
    serializer_class = CertificationSerializer
    permission_classes = [IsAuthenticated, DriverPermission]

    def get_queryset(self):
        queryset = super().get_queryset()
        driver_id = self.request.query_params.get('driver_id')
        if driver_id:
            queryset = queryset.filter(driver_id=driver_id)
        return queryset


class EmergencyRequestPermission(permissions.BasePermission):
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.user.is_superuser:
            return True

        user_role = request.user.role.name if request.user.role else None

        # Read operations (list, retrieve)
        if request.method in permissions.SAFE_METHODS:
            return user_role in ['HOSPITAL_ADMINISTRATOR', 'DISPATCHER', 'EMERGENCY_REQUESTOR']

        # Create operation
        if request.method == 'POST':
            return user_role in ['DISPATCHER', 'EMERGENCY_REQUESTOR']

        # Update operation (PUT/PATCH)
        if request.method in ['PUT', 'PATCH']:
            return user_role in ['HOSPITAL_ADMINISTRATOR', 'DISPATCHER', 'EMERGENCY_REQUESTOR']

        # Delete operation
        if request.method == 'DELETE':
            return True

        return False

    def has_object_permission(self, request, view, obj):
        if request.user.is_superuser:
            return True

        user_role = request.user.role.name if request.user.role else None

        if request.method == 'DELETE':
            return True

        if user_role in ['HOSPITAL_ADMINISTRATOR', 'DISPATCHER']:
            return True

        if user_role == 'EMERGENCY_REQUESTOR':
            return obj.created_by == request.user

        return False


class EmergencyRequestViewSet(viewsets.ModelViewSet):
    queryset = EmergencyRequest.objects.all()
    serializer_class = EmergencyRequestSerializer
    permission_classes = [IsAuthenticated, EmergencyRequestPermission]

    def get_queryset(self):
        user = self.request.user
        if user.is_superuser:
            queryset = EmergencyRequest.objects.all()
        else:
            user_role = user.role.name if user.role else None
            if user_role in ['HOSPITAL_ADMINISTRATOR', 'DISPATCHER']:
                queryset = EmergencyRequest.objects.all()
            elif user_role == 'EMERGENCY_REQUESTOR':
                queryset = EmergencyRequest.objects.filter(created_by=user)
            else:
                return EmergencyRequest.objects.none()

        # Apply filtering
        status_filter = self.request.query_params.get('status')
        priority_filter = self.request.query_params.get('priority')
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        if priority_filter:
            queryset = queryset.filter(priority=priority_filter)

        # Apply sorting
        from django.db.models import Case, When, Value, IntegerField
        user_role = user.role.name if (not user.is_superuser and user.role) else None
        if user.is_superuser or user_role in ['HOSPITAL_ADMINISTRATOR', 'DISPATCHER']:
            queryset = queryset.annotate(
                priority_order=Case(
                    When(priority='CRITICAL', then=Value(1)),
                    When(priority='HIGH', then=Value(2)),
                    When(priority='MEDIUM', then=Value(3)),
                    When(priority='LOW', then=Value(4)),
                    default=Value(5),
                    output_field=IntegerField()
                )
            ).order_by('priority_order', 'created_at')
        else:
            queryset = queryset.order_by('-created_at')

        return queryset

    def perform_create(self, serializer):
        user = self.request.user
        user_role = user.role.name if (not user.is_superuser and user.role) else None

        extra_kwargs = {'status': 'PENDING', 'created_by': user}
        if user_role == 'EMERGENCY_REQUESTOR':
            extra_kwargs['priority'] = 'MEDIUM'

        serializer.save(**extra_kwargs)

    def perform_update(self, serializer):
        from django.db import transaction
        with transaction.atomic():
            instance = serializer.save()
            if instance.status in ['CANCELLED', 'PENDING']:
                active_missions = instance.missions.exclude(status__in=['COMPLETED', 'CANCELLED'])
                for m in active_missions:
                    m.status = 'CANCELLED'
                    m.save()
            elif instance.status == 'COMPLETED':
                active_missions = instance.missions.exclude(status__in=['COMPLETED', 'CANCELLED'])
                for m in active_missions:
                    m.status = 'COMPLETED'
                    m.save()

    def update(self, request, *args, **kwargs):
        instance = self.get_object()
        user = request.user
        user_role = user.role.name if (not user.is_superuser and user.role) else None

        # Rule 1: once COMPLETED or CANCELLED, reject everything
        if instance.status in ['COMPLETED', 'CANCELLED']:
            return Response(
                {"detail": "Cannot modify an emergency request that is already COMPLETED or CANCELLED."},
                status=status.HTTP_400_BAD_REQUEST
            )
            
        # Block manual status transition to ASSIGNED or IN_PROGRESS
        new_status = request.data.get('status')
        if new_status in ['ASSIGNED', 'IN_PROGRESS'] and new_status != instance.status:
            return Response(
                {"detail": "Direct status transition to ASSIGNED or IN_PROGRESS is not allowed. Please dispatch via the Dispatch Console."},
                status=status.HTTP_400_BAD_REQUEST
            )

        if user_role == 'EMERGENCY_REQUESTOR':
            # Check if priority is in request data and is different
            if 'priority' in request.data and request.data['priority'] != instance.priority:
                return Response(
                    {"detail": "Emergency Requestors cannot change the priority of requests."},
                    status=status.HTTP_400_BAD_REQUEST
                )

            # Check if they are trying to set a status other than CANCELLED
            new_status = request.data.get('status')
            if new_status and new_status != 'CANCELLED':
                return Response(
                    {"detail": "Emergency Requestors can only transition status to CANCELLED."},
                    status=status.HTTP_400_BAD_REQUEST
                )

            # Check status transition to CANCELLED
            if new_status == 'CANCELLED':
                if instance.status not in ['PENDING', 'ASSIGNED']:
                    return Response(
                        {"detail": "Requests can only be cancelled from PENDING or ASSIGNED status."},
                        status=status.HTTP_400_BAD_REQUEST
                    )

            # Check detail edits (any field other than status)
            # If the status is not PENDING, they cannot modify any details.
            has_detail_changes = any(
                k in request.data and request.data[k] != getattr(instance, k)
                for k in ['requester_name', 'contact_number', 'pickup_location', 'latitude', 'longitude', 'emergency_type']
            )
            if has_detail_changes and instance.status != 'PENDING':
                return Response(
                    {"detail": "Details can only be modified when the request is PENDING."},
                    status=status.HTTP_400_BAD_REQUEST
                )

        return super().update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        return Response(
            {"detail": "Method not allowed. Use cancellation instead."},
            status=status.HTTP_405_METHOD_NOT_ALLOWED
        )


class MissionPermission(permissions.BasePermission):
    """
    RBAC permission guard for missions:
    - View, Create, Update: Admin, Dispatcher.
    - Driver can update the mission status if they are the assigned driver.
    """
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.user.is_superuser:
            return True
        
        user_role = request.user.role.name if request.user.role else None
        
        # Dispatchers and admins can perform any action
        if user_role in ['HOSPITAL_ADMINISTRATOR', 'DISPATCHER']:
            return True
            
        # Drivers can only retrieve or update status
        if user_role == 'DRIVER' and request.method in ['GET', 'PATCH']:
            return True
            
        return False

    def has_object_permission(self, request, view, obj):
        if request.user.is_superuser:
            return True
            
        user_role = request.user.role.name if request.user.role else None
        if user_role in ['HOSPITAL_ADMINISTRATOR', 'DISPATCHER']:
            return True
            
        if user_role == 'DRIVER':
            return obj.driver.user == request.user
            
        return False


class MissionViewSet(viewsets.ModelViewSet):
    queryset = Mission.objects.all().order_by('-created_at')
    serializer_class = MissionSerializer
    permission_classes = [IsAuthenticated, MissionPermission]

    def get_queryset(self):
        user = self.request.user
        if user.is_superuser:
            queryset = Mission.objects.all()
        else:
            user_role = user.role.name if user.role else None
            if user_role in ['HOSPITAL_ADMINISTRATOR', 'DISPATCHER']:
                queryset = Mission.objects.all()
            elif user_role == 'DRIVER':
                queryset = Mission.objects.filter(driver__user=user)
            else:
                return Mission.objects.none()

        active = self.request.query_params.get('active')
        if active == 'true':
            queryset = queryset.exclude(status__in=['COMPLETED', 'CANCELLED'])
        return queryset

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        headers = self.get_success_headers(serializer.data)
        return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)

    def perform_create(self, serializer):
        serializer.save()


