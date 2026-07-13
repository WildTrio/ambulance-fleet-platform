import math
import json
import urllib.request
import urllib.parse
from concurrent.futures import ThreadPoolExecutor

from django.conf import settings
from django.db import transaction
from django.db.models import Case, When, Value, IntegerField
from django.utils import timezone

from rest_framework import viewsets, status, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from .models import Hospital, Station, Ambulance, Driver, DriverAssignment, AmbulanceOperationalHistory, AmbulanceLifecycleLog, Shift, Certification, EmergencyRequest, Mission, Equipment, Trip, GPSLog
from .serializers import (
    HospitalSerializer, StationSerializer, DriverSerializer,
    AmbulanceSerializer, AmbulanceOperationalHistorySerializer, AmbulanceLifecycleLogSerializer,
    AssignDriverSerializer, TransferStationSerializer, ChangeStatusSerializer,
    ShiftSerializer, CertificationSerializer, EmergencyRequestSerializer,
    MissionSerializer, EquipmentSerializer, TripSerializer, GPSLogSerializer
)

def get_user_hospital(user):
    """Return the user's hospital, falling back to the first hospital in the DB.
    When using the fallback, batch-assigns all users without a hospital so
    that subsequent queryset filters (user__hospital=hospital) match correctly."""
    if not user or not user.is_authenticated:
        return None
    if user.hospital:
        return user.hospital
    first_hospital = Hospital.objects.first()
    if first_hospital:
        from django.contrib.auth import get_user_model
        User = get_user_model()
        User.objects.filter(hospital__isnull=True).update(hospital=first_hospital)
        user.hospital = first_hospital
    return user.hospital

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

        # Actions allowed for DRIVER: transition_lifecycle, lifecycle_history, my_assignment, update_location
        if view.action in ['transition_lifecycle', 'lifecycle_history', 'my_assignment', 'update_location']:
            return user_role in ['HOSPITAL_ADMINISTRATOR', 'FLEET_MANAGER', 'DISPATCHER', 'DRIVER']

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

        ambulances = self.get_queryset()
        routing_results = self._get_ambulances_with_distances(lat, lon, ambulances)

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

    @action(detail=False, methods=['GET'], url_path='recommend')
    def recommend(self, request):
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

        max_distance = request.query_params.get('max_distance')
        max_dist_val = None
        if max_distance:
            try:
                max_dist_val = float(max_distance)
            except ValueError:
                return Response(
                    {"detail": "max_distance must be a valid float number."},
                    status=status.HTTP_400_BAD_REQUEST
                )

        type_filter = request.query_params.get('type')
        has_driver_filter = request.query_params.get('has_driver')
        has_driver_bool = None
        if has_driver_filter is not None:
            has_driver_bool = has_driver_filter.lower() in ['true', '1', 'yes']

        # Get all ACTIVE ambulances that are not currently occupied on an active mission
        user = request.user
        hospital = get_user_hospital(user)
        if user.is_superuser and not user.hospital:
            active_missions_amb_ids = Mission.objects.exclude(status__in=['COMPLETED', 'CANCELLED']).values_list('ambulance_id', flat=True)
            ambulances = Ambulance.objects.filter(status='ACTIVE').exclude(id__in=active_missions_amb_ids).prefetch_related('equipment')
        else:
            active_missions_amb_ids = Mission.objects.filter(ambulance__hospital=hospital).exclude(status__in=['COMPLETED', 'CANCELLED']).values_list('ambulance_id', flat=True)
            ambulances = self.get_queryset().filter(status='ACTIVE').exclude(id__in=active_missions_amb_ids).prefetch_related('equipment')

        if type_filter:
            ambulances = ambulances.filter(type=type_filter)

        required_equipment = request.query_params.get('required_equipment')
        req_equip_list = []
        if required_equipment:
            req_equip_list = [name.strip() for name in required_equipment.split(',') if name.strip()]
            for eq_name in req_equip_list:
                ambulances = ambulances.filter(equipment__name__iexact=eq_name)

        if not ambulances.exists():
            return Response([], status=status.HTTP_200_OK)

        routing_results = self._get_ambulances_with_distances(lat, lon, ambulances)

        results = []
        for i, amb in enumerate(ambulances):
            distance, eta = routing_results[i]

            # Filter by max_distance if provided
            if max_dist_val is not None and distance is not None:
                if distance > max_dist_val:
                    continue

            # Active driver
            active_driver_assignment = amb.assignments.filter(end_time__isnull=True).first()
            active_driver = None
            if active_driver_assignment and active_driver_assignment.driver:
                active_driver = {
                    "id": active_driver_assignment.driver.id,
                    "name": active_driver_assignment.driver.user.name,
                    "license_number": active_driver_assignment.driver.license_number
                }

            # Filter by has_driver if provided
            if has_driver_bool is not None:
                if has_driver_bool and not active_driver:
                    continue
                if not has_driver_bool and active_driver:
                    continue

            # Scoring logic
            # 1. Driver score (Max 30 points)
            base_driver_score = 30.0 if active_driver else 10.0

            # 2. Distance score (Max 50 points) using exponential decay: 50.0 * exp(-distance / 15.0)
            d_scale = 15.0
            if distance is not None:
                distance_score = 50.0 * math.exp(-distance / d_scale)
            else:
                distance_score = 0.0
            distance_penalty = 50.0 - distance_score

            # 3. Equipment score (Max 20 points)
            if req_equip_list:
                amb_equip_names = [e.name.lower() for e in amb.equipment.all()]
                matched_count = sum(1 for req in req_equip_list if req.lower() in amb_equip_names)
                total_req = len(req_equip_list)
                equipment_score = 20.0 * (matched_count / total_req) if total_req > 0 else 20.0
            else:
                equipment_score = 20.0

            # 4. Readiness score (placeholder, max 0)
            readiness_score = 0.0

            score = base_driver_score + distance_score + equipment_score + readiness_score
            recommendation_score = round(max(0.0, min(100.0, score)), 1)

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
                "distance": round(distance, 2) if distance is not None else None,
                "eta": int(eta) if eta is not None else None,
                "availability_status": "AVAILABLE",
                "readiness_info": "Ready" if active_driver else "No Driver",
                "active_driver": active_driver,
                "equipment": list(amb.equipment.values_list('name', flat=True)),
                "recommendation_score": recommendation_score,
                "score_breakdown": {
                    "base_driver_score": base_driver_score,
                    "distance_penalty": round(distance_penalty, 2),
                    "equipment_score": round(equipment_score, 2),
                    "readiness_score": readiness_score
                }
            })

        # Sort: recommendation_score descending
        results.sort(key=lambda x: x["recommendation_score"], reverse=True)

        return Response(results, status=status.HTTP_200_OK)

    def get_queryset(self):
        user = self.request.user
        if not user or not user.is_authenticated:
            return Ambulance.objects.none()
        if user.is_superuser and not user.hospital:
            queryset = Ambulance.objects.all().order_by('ambulance_number')
        else:
            hospital = get_user_hospital(user)
            queryset = Ambulance.objects.filter(hospital=hospital).order_by('ambulance_number')

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

    def perform_create(self, serializer):
        hospital = get_user_hospital(self.request.user)
        serializer.save(hospital=hospital)

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

    def _get_ambulances_with_distances(self, lat, lon, ambulances_queryset):
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
            return round((distance_km / 40.0) * 60.0)

        api_key = getattr(settings, 'GRAPHHOPPER_API_KEY', '')

        def fetch_routing_info(coords):
            if not coords:
                return None, None
            target_lat, target_lon = coords
            if target_lat is None or target_lon is None:
                return None, None
            if not api_key:
                dist = get_haversine_distance(lat, lon, target_lat, target_lon)
                return dist, get_haversine_eta(dist)
            try:
                url = f"https://graphhopper.com/api/1/route?point={lat},{lon}&point={target_lat},{target_lon}&profile=car&locale=en&key={api_key}"
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
            dist = get_haversine_distance(lat, lon, target_lat, target_lon)
            return dist, get_haversine_eta(dist)

        coords_list = []
        for amb in ambulances_queryset:
            if amb.current_latitude is not None and amb.current_longitude is not None:
                coords_list.append((amb.current_latitude, amb.current_longitude))
            elif amb.station:
                coords_list.append((amb.station.latitude, amb.station.longitude))
            else:
                coords_list.append(None)
        
        with ThreadPoolExecutor(max_workers=10) as executor:
            routing_results = list(executor.map(fetch_routing_info, coords_list))
            
        return routing_results

    def perform_update(self, serializer):
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

    @action(detail=True, methods=['POST'], url_path='transition-lifecycle')
    def transition_lifecycle(self, request, pk=None):
        from django.core.exceptions import ValidationError as DjangoValidationError
        ambulance = self.get_object()
        
        active_assignment = ambulance.assignments.filter(end_time__isnull=True).first()
        is_assigned_driver = active_assignment and active_assignment.driver and active_assignment.driver.user == request.user
        
        user_role = request.user.role.name if request.user.role else None
        
        if user_role not in ['HOSPITAL_ADMINISTRATOR', 'DISPATCHER'] and not is_assigned_driver:
            return Response(
                {"detail": "You do not have permission to transition this ambulance's lifecycle status."},
                status=status.HTTP_403_FORBIDDEN
            )
            
        new_status = request.data.get('status')
        remarks = request.data.get('remarks', '')
        
        if not new_status:
            return Response(
                {"detail": "status is a required field."},
                status=status.HTTP_400_BAD_REQUEST
            )
            
        if new_status == 'AVAILABLE' and ambulance.lifecycle_status != 'READY' and user_role == 'DRIVER':
            return Response(
                {"detail": "Drivers are not authorized to cancel or abort active missions. Please contact a Dispatcher."},
                status=status.HTTP_403_FORBIDDEN
            )
            
        from .models import Mission
        active_mission = ambulance.missions.exclude(status__in=['COMPLETED', 'CANCELLED']).first()
        
        with transaction.atomic():
            try:
                target_status = 'AVAILABLE' if new_status == 'READY' else new_status
                ambulance.transition_to(target_status, user=request.user, remarks=remarks, mission=active_mission)
            except DjangoValidationError as e:
                message = e.message if hasattr(e, 'message') else str(e)
                return Response({"detail": message}, status=status.HTTP_400_BAD_REQUEST)
            
            if active_mission:
                if new_status == 'READY':
                    active_mission.status = 'COMPLETED'
                    active_mission.save()
                    req = active_mission.emergency_request
                    req.status = 'COMPLETED'
                    req.save()
                elif new_status == 'AVAILABLE':
                    active_mission.status = 'CANCELLED'
                    active_mission.save()
                    req = active_mission.emergency_request
                    req.status = 'PENDING'
                    req.save()
                elif new_status in ['ASSIGNED', 'EN_ROUTE', 'AT_INCIDENT', 'PATIENT_ONBOARD', 'HOSPITAL_ARRIVAL', 'SANITIZATION']:
                    active_mission.status = new_status
                    active_mission.save()
                    req = active_mission.emergency_request
                    if new_status == 'ASSIGNED':
                        req.status = 'ASSIGNED'
                    else:
                        req.status = 'IN_PROGRESS'
                    req.save()
                    
        return Response({
            "detail": "Ambulance lifecycle status updated successfully.",
            "lifecycle_status": ambulance.lifecycle_status
        })

    @action(detail=True, methods=['GET'], url_path='lifecycle-history', serializer_class=AmbulanceLifecycleLogSerializer)
    def lifecycle_history(self, request, pk=None):
        ambulance = self.get_object()
        
        active_assignment = ambulance.assignments.filter(end_time__isnull=True).first()
        is_assigned_driver = active_assignment and active_assignment.driver and active_assignment.driver.user == request.user
        
        user_role = request.user.role.name if request.user.role else None
        
        if user_role not in ['HOSPITAL_ADMINISTRATOR', 'DISPATCHER', 'FLEET_MANAGER'] and not is_assigned_driver:
            return Response(
                {"detail": "You do not have permission to view this ambulance's lifecycle history."},
                status=status.HTTP_403_FORBIDDEN
            )
            
        logs = ambulance.lifecycle_logs.all().order_by('-changed_at')
        serializer = self.get_serializer(logs, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['GET'], url_path='my-assignment')
    def my_assignment(self, request):
        try:
            driver = Driver.objects.get(user=request.user)
        except Driver.DoesNotExist:
            return Response(
                {"detail": "You are not registered as a driver."},
                status=status.HTTP_404_NOT_FOUND
            )
            
        assignment = driver.assignments.filter(end_time__isnull=True).first()
        if not assignment:
            return Response(
                {"detail": "No active ambulance assignment found."},
                status=status.HTTP_404_NOT_FOUND
            )
            
        serializer = self.get_serializer(assignment.ambulance)
        return Response(serializer.data)

    @action(detail=True, methods=['POST'], url_path='update-location')
    def update_location(self, request, pk=None):
        ambulance = self.get_object()
        
        active_assignment = ambulance.assignments.filter(end_time__isnull=True).first()
        is_assigned_driver = active_assignment and active_assignment.driver and active_assignment.driver.user == request.user
        user_role = request.user.role.name if request.user.role else None
        
        if user_role not in ['HOSPITAL_ADMINISTRATOR', 'DISPATCHER'] and not is_assigned_driver:
            return Response(
                {"detail": "You do not have permission to update this ambulance's location."},
                status=status.HTTP_403_FORBIDDEN
            )
            
        latitude = request.data.get('latitude')
        longitude = request.data.get('longitude')
        
        if latitude is None or longitude is None:
            return Response(
                {"detail": "latitude and longitude are required fields."},
                status=status.HTTP_400_BAD_REQUEST
            )
            
        try:
            lat = float(latitude)
            lon = float(longitude)
        except ValueError:
            return Response(
                {"detail": "latitude and longitude must be valid numbers."},
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
            
        from django.db import transaction
        from .models import GPSLog
        
        active_mission = ambulance.missions.exclude(status__in=['COMPLETED', 'CANCELLED']).first()
        active_trip = None
        if active_mission:
            active_trip = getattr(active_mission, 'trip', None)
            
        with transaction.atomic():
            ambulance.current_latitude = lat
            ambulance.current_longitude = lon
            ambulance.save()
            
            GPSLog.objects.create(
                ambulance=ambulance,
                trip=active_trip,
                latitude=lat,
                longitude=lon
            )
            
        return Response({
            "detail": "Location updated successfully.",
            "current_latitude": float(ambulance.current_latitude),
            "current_longitude": float(ambulance.current_longitude),
            "trip_id": str(active_trip.id) if active_trip else None
        }, status=status.HTTP_200_OK)


class HospitalViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = HospitalSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        user = self.request.user
        if not user or not user.is_authenticated:
            return Hospital.objects.none()
        if user.is_superuser and not user.hospital:
            return Hospital.objects.all().order_by('hospital_name')
        hospital = get_user_hospital(user)
        return Hospital.objects.filter(id=hospital.id).order_by('hospital_name') if hospital else Hospital.objects.none()

    def get_permissions(self):
        if self.request.user.is_superuser:
            return [permissions.AllowAny()]
        return [AmbulancePermission()]


class StationViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = StationSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if not user or not user.is_authenticated:
            return Station.objects.none()
        if user.is_superuser and not user.hospital:
            return Station.objects.all().order_by('station_name')
        hospital = get_user_hospital(user)
        return Station.objects.filter(hospital=hospital).order_by('station_name')

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
    serializer_class = DriverSerializer
    permission_classes = [IsAuthenticated, DriverPermission]

    def get_queryset(self):
        user = self.request.user
        if not user or not user.is_authenticated:
            return Driver.objects.none()
        if user.is_superuser and not user.hospital:
            queryset = Driver.objects.all().order_by('user__name')
        else:
            hospital = get_user_hospital(user)
            queryset = Driver.objects.filter(user__hospital=hospital).order_by('user__name')
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
    serializer_class = ShiftSerializer
    permission_classes = [IsAuthenticated, DriverPermission]

    def get_queryset(self):
        user = self.request.user
        if not user or not user.is_authenticated:
            return Shift.objects.none()
        if user.is_superuser and not user.hospital:
            queryset = Shift.objects.all().order_by('-start_time')
        else:
            hospital = get_user_hospital(user)
            queryset = Shift.objects.filter(driver__user__hospital=hospital).order_by('-start_time')
        driver_id = self.request.query_params.get('driver_id')
        if driver_id:
            queryset = queryset.filter(driver_id=driver_id)
        return queryset

class CertificationViewSet(viewsets.ModelViewSet):
    serializer_class = CertificationSerializer
    permission_classes = [IsAuthenticated, DriverPermission]

    def get_queryset(self):
        user = self.request.user
        if not user or not user.is_authenticated:
            return Certification.objects.none()
        if user.is_superuser and not user.hospital:
            queryset = Certification.objects.all().order_by('expiry_date')
        else:
            hospital = get_user_hospital(user)
            queryset = Certification.objects.filter(driver__user__hospital=hospital).order_by('expiry_date')
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
            return user_role in ['HOSPITAL_ADMINISTRATOR', 'DISPATCHER', 'EMERGENCY_REQUESTOR']

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

        # Check hospital isolation
        hospital = get_user_hospital(request.user)
        if hospital and obj.hospital != hospital:
            return False

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
        if not user or not user.is_authenticated:
            return EmergencyRequest.objects.none()
        if user.is_superuser and not user.hospital:
            queryset = EmergencyRequest.objects.all()
        else:
            hospital = get_user_hospital(user)
            user_role = user.role.name if user.role else None
            if user_role in ['HOSPITAL_ADMINISTRATOR', 'DISPATCHER']:
                queryset = EmergencyRequest.objects.filter(hospital=hospital)
            elif user_role == 'EMERGENCY_REQUESTOR':
                queryset = EmergencyRequest.objects.filter(created_by=user, hospital=hospital)
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

        hospital = get_user_hospital(user)
        extra_kwargs = {'status': 'PENDING', 'created_by': user, 'hospital': hospital}
        if user_role == 'EMERGENCY_REQUESTOR':
            extra_kwargs['priority'] = 'MEDIUM'

        serializer.save(**extra_kwargs)

    def perform_update(self, serializer):
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

        # Check hospital isolation
        hospital = get_user_hospital(request.user)
        if hospital and obj.ambulance.hospital != hospital:
            return False
            
        user_role = request.user.role.name if request.user.role else None
        if user_role in ['HOSPITAL_ADMINISTRATOR', 'DISPATCHER']:
            return True
            
        if user_role == 'DRIVER':
            return obj.driver.user == request.user
            
        return False


class MissionViewSet(viewsets.ModelViewSet):
    serializer_class = MissionSerializer
    permission_classes = [IsAuthenticated, MissionPermission]

    def get_queryset(self):
        user = self.request.user
        if not user or not user.is_authenticated:
            return Mission.objects.none()
        if user.is_superuser and not user.hospital:
            queryset = Mission.objects.all()
        else:
            hospital = get_user_hospital(user)
            user_role = user.role.name if user.role else None
            if user_role in ['HOSPITAL_ADMINISTRATOR', 'DISPATCHER']:
                queryset = Mission.objects.filter(ambulance__hospital=hospital)
            elif user_role == 'DRIVER':
                queryset = Mission.objects.filter(driver__user=user, ambulance__hospital=hospital)
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

    @action(detail=True, methods=['GET'], url_path='route')
    def route(self, request, pk=None):
        mission = self.get_object()
        ambulance = mission.ambulance
        emergency_request = mission.emergency_request
        
        start_lat = ambulance.current_latitude
        start_lon = ambulance.current_longitude
        
        if start_lat is None or start_lon is None:
            if ambulance.station:
                start_lat = ambulance.station.latitude
                start_lon = ambulance.station.longitude
                
        if start_lat is None or start_lon is None:
            return Response(
                {"detail": "Ambulance does not have a current location or station."},
                status=status.HTTP_400_BAD_REQUEST
            )
            
        dest_name = "Incident Scene"
        dest_lat = None
        dest_lon = None
        
        if mission.status in ['ASSIGNED', 'EN_ROUTE', 'AT_INCIDENT']:
            dest_lat = emergency_request.latitude
            dest_lon = emergency_request.longitude
            dest_name = f"Incident Scene ({emergency_request.pickup_location})"
        else:
            dest_hospital = ambulance.hospital
            if dest_hospital:
                first_station = dest_hospital.stations.first()
                if first_station:
                    dest_lat = first_station.latitude
                    dest_lon = first_station.longitude
                    dest_name = f"Hospital Station ({first_station.station_name})"
                    
            if dest_lat is None or dest_lon is None:
                dest_lat = emergency_request.latitude
                dest_lon = emergency_request.longitude
                dest_name = f"Incident Scene ({emergency_request.pickup_location})"
                
        api_key = getattr(settings, 'GRAPHHOPPER_API_KEY', '')
        route_coords = []
        distance_km = 0.0
        eta_mins = 0
        
        fallback = True
        if api_key:
            try:
                url = f"https://graphhopper.com/api/1/route?point={start_lat},{start_lon}&point={dest_lat},{dest_lon}&profile=car&locale=en&points_encoded=false&key={api_key}"
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
                        distance_km = dist_m / 1000.0
                        eta_mins = round(time_ms / 60000.0)
                        
                        gh_coords = path.get('points', {}).get('coordinates', [])
                        route_coords = [[coord[1], coord[0]] for coord in gh_coords]
                        fallback = False
            except Exception:
                pass
                
        if fallback:
            def haversine(lat1, lon1, lat2, lon2):
                R = 6371.0
                lat1_r = math.radians(float(lat1))
                lon1_r = math.radians(float(lon1))
                lat2_r = math.radians(float(lat2))
                lon2_r = math.radians(float(lon2))
                dlat = lat2_r - lat1_r
                dlon = lon2_r - lon1_r
                a = math.sin(dlat / 2)**2 + math.cos(lat1_r) * math.cos(lat2_r) * math.sin(dlon / 2)**2
                c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
                return R * c
            
            distance_km = haversine(start_lat, start_lon, dest_lat, dest_lon)
            eta_mins = round((distance_km / 40.0) * 60.0)
            route_coords = [
                [float(start_lat), float(start_lon)],
                [float(dest_lat), float(dest_lon)]
            ]
            
        return Response({
            "route": route_coords,
            "distance_km": round(distance_km, 2),
            "eta_minutes": int(eta_mins),
            "destination": {
                "name": dest_name,
                "latitude": float(dest_lat),
                "longitude": float(dest_lon)
            }
        }, status=status.HTTP_200_OK)


class EquipmentViewSet(viewsets.ModelViewSet):
    queryset = Equipment.objects.all().order_by('name')
    serializer_class = EquipmentSerializer
    permission_classes = [IsAuthenticated]


class TripPermission(permissions.BasePermission):
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.user.is_superuser:
            return True
            
        user_role = request.user.role.name if request.user.role else None
        
        # Drivers can only access retrieve detail view, 'my-trips', or 'route_history' action
        if user_role == 'DRIVER':
            if view.action in ['retrieve', 'my_trips', 'route_history']:
                return True
            return False
            
        # Admin, Fleet Manager, and Dispatchers have full read access
        if user_role in ['HOSPITAL_ADMINISTRATOR', 'FLEET_MANAGER', 'DISPATCHER']:
            return True
            
        return False

    def has_object_permission(self, request, view, obj):
        if request.user.is_superuser:
            return True

        # Check hospital isolation
        hospital = get_user_hospital(request.user)
        if hospital and obj.ambulance.hospital != hospital:
            return False

        user_role = request.user.role.name if request.user.role else None
        if user_role in ['HOSPITAL_ADMINISTRATOR', 'FLEET_MANAGER', 'DISPATCHER']:
            return True
        if user_role == 'DRIVER' and obj.driver and obj.driver.user == request.user:
            return True
        return False


class TripViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = TripSerializer
    permission_classes = [IsAuthenticated, TripPermission]

    def get_queryset(self):
        user = self.request.user
        if not user or not user.is_authenticated:
            return Trip.objects.none()
        if user.is_superuser and not user.hospital:
            queryset = Trip.objects.all().order_by('-created_at')
        else:
            hospital = get_user_hospital(user)
            user_role = user.role.name if user.role else None
            if user_role in ['HOSPITAL_ADMINISTRATOR', 'FLEET_MANAGER', 'DISPATCHER']:
                queryset = Trip.objects.filter(ambulance__hospital=hospital).order_by('-created_at')
            elif user_role == 'DRIVER':
                if self.action in ['retrieve', 'route_history']:
                    queryset = Trip.objects.filter(ambulance__hospital=hospital).order_by('-created_at')
                else:
                    queryset = Trip.objects.filter(driver__user=user, ambulance__hospital=hospital).order_by('-created_at')
            else:
                return Trip.objects.none()

        # Filters
        driver_id = self.request.query_params.get('driver_id')
        ambulance_id = self.request.query_params.get('ambulance_id')
        status_param = self.request.query_params.get('status')
        start_date = self.request.query_params.get('start_date')
        end_date = self.request.query_params.get('end_date')

        if driver_id:
            queryset = queryset.filter(driver_id=driver_id)
        if ambulance_id:
            queryset = queryset.filter(ambulance_id=ambulance_id)
        if status_param:
            queryset = queryset.filter(status=status_param)
        if start_date:
            queryset = queryset.filter(start_time__date__gte=start_date)
        if end_date:
            queryset = queryset.filter(start_time__date__lte=end_date)

        return queryset

    @action(detail=False, methods=['GET'], url_path='my-trips')
    def my_trips(self, request):
        user = request.user
        user_role = user.role.name if user.role else None
        if user_role != 'DRIVER':
            return Response(
                {"detail": "Only drivers can view their personal trip logs."},
                status=status.HTTP_403_FORBIDDEN
            )
        hospital = get_user_hospital(user)
        trips = Trip.objects.filter(driver__user=user, ambulance__hospital=hospital).order_by('-created_at')
        
        status_param = request.query_params.get('status')
        start_date = request.query_params.get('start_date')
        end_date = request.query_params.get('end_date')
        if status_param:
            trips = trips.filter(status=status_param)
        if start_date:
            trips = trips.filter(start_time__date__gte=start_date)
        if end_date:
            trips = trips.filter(start_time__date__lte=end_date)

        serializer = self.get_serializer(trips, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['GET'], url_path='route-history')
    def route_history(self, request, pk=None):
        trip = self.get_object()
        logs = trip.gps_logs.all().order_by('recorded_at')
        serializer = GPSLogSerializer(logs, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)


from rest_framework.views import APIView
from django.db.models import Q

class DispatcherDashboardView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user_role = request.user.role.name if request.user.role else None
        if user_role not in ['HOSPITAL_ADMINISTRATOR', 'DISPATCHER'] and not request.user.is_superuser:
            return Response(
                {"detail": "You do not have permission to view the Dispatcher Dashboard."},
                status=status.HTTP_403_FORBIDDEN
            )

        # 1. Pending Requests
        user = request.user
        if user.is_superuser and not user.hospital:
            pending_requests = EmergencyRequest.objects.filter(status='PENDING').order_by('created_at')
            active_missions = Mission.objects.exclude(status__in=['COMPLETED', 'CANCELLED']).order_by('-created_at')
            available_ambulances = Ambulance.objects.filter(status='ACTIVE', lifecycle_status='AVAILABLE').order_by('ambulance_number')
        else:
            hospital = get_user_hospital(user)
            pending_requests = EmergencyRequest.objects.filter(status='PENDING', hospital=hospital).order_by('created_at')
            active_missions = Mission.objects.filter(ambulance__hospital=hospital).exclude(status__in=['COMPLETED', 'CANCELLED']).order_by('-created_at')
            available_ambulances = Ambulance.objects.filter(status='ACTIVE', lifecycle_status='AVAILABLE', hospital=hospital).order_by('ambulance_number')

        pending_requests_serialized = EmergencyRequestSerializer(pending_requests, many=True, context={'request': request}).data
        active_missions_serialized = MissionSerializer(active_missions, many=True, context={'request': request}).data
        available_ambulances_serialized = AmbulanceSerializer(available_ambulances, many=True, context={'request': request}).data

        return Response({
            "pending_requests_count": len(pending_requests_serialized),
            "pending_requests": pending_requests_serialized,
            "active_missions_count": len(active_missions_serialized),
            "active_missions": active_missions_serialized,
            "available_ambulances_count": len(available_ambulances_serialized),
            "available_ambulances": available_ambulances_serialized
        }, status=status.HTTP_200_OK)


class FleetDashboardView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user_role = request.user.role.name if request.user.role else None
        if user_role not in ['HOSPITAL_ADMINISTRATOR', 'FLEET_MANAGER'] and not request.user.is_superuser:
            return Response(
                {"detail": "You do not have permission to view the Fleet Dashboard."},
                status=status.HTTP_403_FORBIDDEN
            )

        # 1. Fleet summary
        user = request.user
        if user.is_superuser and not user.hospital:
            ambulances_qs = Ambulance.objects.all()
            drivers_qs = Driver.objects.all()
            shifts_qs = Shift.objects.all()
        else:
            hospital = get_user_hospital(user)
            ambulances_qs = Ambulance.objects.filter(hospital=hospital)
            drivers_qs = Driver.objects.filter(user__hospital=hospital)
            shifts_qs = Shift.objects.filter(driver__user__hospital=hospital)

        total_ambulances = ambulances_qs.count()
        
        active_count = ambulances_qs.filter(status='ACTIVE').count()
        maintenance_count = ambulances_qs.filter(status='MAINTENANCE').count()
        inactive_count = ambulances_qs.filter(status='INACTIVE').count()
        
        lifecycle_counts = {}
        for choice in Ambulance.LIFECYCLE_STATUS_CHOICES:
            lifecycle_counts[choice[0]] = ambulances_qs.filter(lifecycle_status=choice[0]).count()
            
        available_active_count = ambulances_qs.filter(status='ACTIVE', lifecycle_status='AVAILABLE').count()
        availability_rate = round((available_active_count / active_count * 100), 1) if active_count > 0 else 0.0

        fleet_summary = {
            "total_ambulances": total_ambulances,
            "by_status": {
                "ACTIVE": active_count,
                "MAINTENANCE": maintenance_count,
                "INACTIVE": inactive_count
            },
            "by_lifecycle": lifecycle_counts,
            "availability_rate": availability_rate
        }

        # 2. Maintenance Status (Ambulances in MAINTENANCE admin status or SANITIZATION lifecycle status)
        maintenance_ambulances = ambulances_qs.filter(
            Q(status='MAINTENANCE') | Q(lifecycle_status='SANITIZATION')
        ).distinct()

        maintenance_list = []
        for amb in maintenance_ambulances:
            entered_at = None
            remarks = ""
            if amb.lifecycle_status == 'SANITIZATION':
                log = AmbulanceLifecycleLog.objects.filter(ambulance=amb, to_status='SANITIZATION').order_by('-changed_at').first()
                if log:
                    entered_at = log.changed_at
                    remarks = log.remarks
            if not entered_at:
                hist = AmbulanceOperationalHistory.objects.filter(ambulance=amb, event_type='STATUS_CHANGE', new_value='MAINTENANCE').order_by('-changed_at').first()
                if hist:
                    entered_at = hist.changed_at
                    remarks = hist.remarks
            if not entered_at:
                entered_at = timezone.now()

            maintenance_list.append({
                "id": str(amb.id),
                "ambulance_number": amb.ambulance_number,
                "status": amb.status,
                "lifecycle_status": amb.lifecycle_status,
                "entered_at": entered_at.isoformat(),
                "remarks": remarks or "Under maintenance / sanitization."
            })

        # 3. Driver Availability
        total_drivers = drivers_qs.count()
        available_drivers_count = drivers_qs.filter(availability=True).count()
        
        now_time = timezone.now()
        on_duty_driver_ids = shifts_qs.filter(start_time__lte=now_time, end_time__gte=now_time).values_list('driver_id', flat=True).distinct()
        on_duty_count = len(on_duty_driver_ids)
        off_duty_count = max(0, total_drivers - on_duty_count)

        active_drivers_list = []
        drivers = drivers_qs.select_related('user')
        for d in drivers:
            active_assignment = d.assignments.filter(end_time__isnull=True).first()
            assigned_amb_number = active_assignment.ambulance.ambulance_number if active_assignment and active_assignment.ambulance else None
            
            active_drivers_list.append({
                "id": str(d.id),
                "name": d.user.name,
                "availability": d.availability,
                "on_duty": d.id in on_duty_driver_ids,
                "assigned_ambulance": assigned_amb_number
            })

        return Response({
            "fleet_summary": fleet_summary,
            "maintenance_list": maintenance_list,
            "driver_availability": {
                "total_drivers": total_drivers,
                "available_drivers_count": available_drivers_count,
                "on_duty_count": on_duty_count,
                "off_duty_count": off_duty_count,
                "active_drivers_list": active_drivers_list
            }
        }, status=status.HTTP_200_OK)


class AdministratorDashboardView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user_role = request.user.role.name if request.user.role else None
        if user_role != 'HOSPITAL_ADMINISTRATOR' and not request.user.is_superuser:
            return Response(
                {"detail": "You do not have permission to view the Administrator Dashboard."},
                status=status.HTTP_403_FORBIDDEN
            )

        # 1. Response Time Metrics
        user = request.user
        if user.is_superuser and not user.hospital:
            lifecycle_logs_qs = AmbulanceLifecycleLog.objects.all()
            missions_qs = Mission.objects.all()
            trips_qs = Trip.objects.all()
            ambulances_qs = Ambulance.objects.all()
        else:
            hospital = get_user_hospital(user)
            lifecycle_logs_qs = AmbulanceLifecycleLog.objects.filter(ambulance__hospital=hospital)
            missions_qs = Mission.objects.filter(ambulance__hospital=hospital)
            trips_qs = Trip.objects.filter(ambulance__hospital=hospital)
            ambulances_qs = Ambulance.objects.filter(hospital=hospital)

        logs = lifecycle_logs_qs.filter(to_status='AT_INCIDENT', mission__isnull=False).select_related('mission__emergency_request')
        durations = []
        by_priority_lists = {'LOW': [], 'MEDIUM': [], 'HIGH': [], 'CRITICAL': []}
        daily_trend_lists = {}
 
        for log in logs:
            req = log.mission.emergency_request
            if req and req.created_at:
                dur = (log.changed_at - req.created_at).total_seconds() / 60.0
                if dur >= 0:
                    durations.append(dur)
                    if req.priority in by_priority_lists:
                        by_priority_lists[req.priority].append(dur)
                    
                    date_str = req.created_at.date().isoformat()
                    if date_str not in daily_trend_lists:
                        daily_trend_lists[date_str] = []
                    daily_trend_lists[date_str].append(dur)
 
        avg_rt = round(sum(durations) / len(durations), 1) if durations else 0.0
        by_priority = {
            p: round(sum(vals) / len(vals), 1) if vals else 0.0
            for p, vals in by_priority_lists.items()
        }
 
        daily_trends = []
        for date_str in sorted(daily_trend_lists.keys())[-30:]:
            vals = daily_trend_lists[date_str]
            daily_trends.append({
                "date": date_str,
                "avg_response_time_minutes": round(sum(vals) / len(vals), 1)
            })
 
        response_time_metrics = {
            "average_response_time_minutes": avg_rt,
            "by_priority": by_priority,
            "daily_trends": daily_trends
        }
 
        # 2. Mission Statistics
        total_missions = missions_qs.count()
        completed_missions = missions_qs.filter(status='COMPLETED').count()
        cancelled_missions = missions_qs.filter(status='CANCELLED').count()
        terminal_missions = completed_missions + cancelled_missions
        success_rate = round((completed_missions / terminal_missions * 100), 1) if terminal_missions > 0 else 0.0
 
        trips = trips_qs.filter(status='COMPLETED', start_time__isnull=False, end_time__isnull=False)
        trip_durations = [(t.end_time - t.start_time).total_seconds() / 60.0 for t in trips]
        avg_duration = round(sum(trip_durations) / len(trip_durations), 1) if trip_durations else 0.0
 
        completed_trips = trips_qs.filter(status='COMPLETED')
        trip_distances = [t.distance_km for t in completed_trips]
        avg_distance = round(sum(trip_distances) / len(trip_distances), 1) if trip_distances else 0.0
 
        mission_statistics = {
            "total_missions": total_missions,
            "completed_missions": completed_missions,
            "cancelled_missions": cancelled_missions,
            "success_rate": success_rate,
            "average_trip_duration_minutes": avg_duration,
            "average_trip_distance_km": avg_distance
        }
 
        # 3. Fleet Utilization
        total_active_ambulances = ambulances_qs.filter(status='ACTIVE').count()
        active_deployed = ambulances_qs.filter(status='ACTIVE').exclude(lifecycle_status='AVAILABLE').count()
        active_utilization_rate = round((active_deployed / total_active_ambulances * 100), 1) if total_active_ambulances > 0 else 0.0
 
        total_seconds = 0
        now_time = timezone.now()
        for trip in trips_qs.all():
            start = trip.start_time
            end = trip.end_time or now_time
            if start:
                total_seconds += (end - start).total_seconds()
        total_trip_hours = round(total_seconds / 3600.0, 1)
 
        fleet_utilization = {
            "active_utilization_rate": active_utilization_rate,
            "total_trip_hours": total_trip_hours
        }
 
        # 4. Operational Performance
        # Key lifecycle phase durations
        from collections import defaultdict
        mission_logs = defaultdict(list)
        for log in lifecycle_logs_qs.filter(mission__isnull=False).order_by('changed_at'):
            mission_logs[log.mission_id].append(log)
 
        phase_durations = defaultdict(list)
        for m_id, m_logs in mission_logs.items():
            for i in range(len(m_logs) - 1):
                phase = m_logs[i].to_status
                start_t = m_logs[i].changed_at
                end_t = m_logs[i+1].changed_at
                if start_t and end_t:
                    dur = (end_t - start_t).total_seconds() / 60.0
                    if dur >= 0:
                        phase_durations[phase].append(dur)
 
        avg_phase_durations = {
            phase: round(sum(phase_durations[phase]) / len(phase_durations[phase]), 1) if phase_durations[phase] else 0.0
            for phase in ['EN_ROUTE', 'AT_INCIDENT', 'PATIENT_ONBOARD', 'HOSPITAL_ARRIVAL', 'SANITIZATION']
        }
 
        # Daily mission volume counts (last 30 days)
        daily_volume_counts = {}
        for m in missions_qs.all():
            date_str = m.created_at.date().isoformat()
            daily_volume_counts[date_str] = daily_volume_counts.get(date_str, 0) + 1
 
        daily_mission_volume = []
        for date_str in sorted(daily_volume_counts.keys())[-30:]:
            daily_mission_volume.append({
                "date": date_str,
                "missions_count": daily_volume_counts[date_str]
            })
 
        operational_performance = {
            "average_phase_durations_minutes": avg_phase_durations,
            "daily_mission_volume": daily_mission_volume
        }

        return Response({
            "response_time_metrics": response_time_metrics,
            "mission_statistics": mission_statistics,
            "fleet_utilization": fleet_utilization,
            "operational_performance": operational_performance
        }, status=status.HTTP_200_OK)




