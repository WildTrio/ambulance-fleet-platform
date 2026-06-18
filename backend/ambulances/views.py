from rest_framework import viewsets, status, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from .models import Hospital, Station, Ambulance, Driver, DriverAssignment, AmbulanceOperationalHistory
from .serializers import (
    HospitalSerializer, StationSerializer, DriverSerializer,
    AmbulanceSerializer, AmbulanceOperationalHistorySerializer,
    AssignDriverSerializer, TransferStationSerializer, ChangeStatusSerializer
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

        # Read actions (Safe methods + history action)
        if request.method in permissions.SAFE_METHODS or view.action == 'history':
            return user_role in ['HOSPITAL_ADMINISTRATOR', 'FLEET_MANAGER', 'DISPATCHER']
        
        # Write actions
        return user_role in ['HOSPITAL_ADMINISTRATOR', 'FLEET_MANAGER']

class AmbulanceViewSet(viewsets.ModelViewSet):
    queryset = Ambulance.objects.all().order_by('ambulance_number')
    serializer_class = AmbulanceSerializer
    permission_classes = [IsAuthenticated, AmbulancePermission]

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

    @action(detail=True, methods=['POST'], serializer_class=AssignDriverSerializer, url_path='assign-driver')
    def assign_driver(self, request, pk=None):
        ambulance = self.get_object()
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

class DriverViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Driver.objects.all().order_by('user__name')
    serializer_class = DriverSerializer
    permission_classes = [IsAuthenticated]

    def get_permissions(self):
        class DriverListPermission(permissions.BasePermission):
            def has_permission(self, request, view):
                if not request.user or not request.user.is_authenticated:
                    return False
                if request.user.is_superuser:
                    return True
                user_role = request.user.role.name if request.user.role else None
                return user_role in ['HOSPITAL_ADMINISTRATOR', 'FLEET_MANAGER', 'DISPATCHER']
        return [DriverListPermission()]

    def get_queryset(self):
        queryset = super().get_queryset()
        available = self.request.query_params.get('available')
        if available == 'true':
            queryset = queryset.filter(availability=True)
        return queryset
