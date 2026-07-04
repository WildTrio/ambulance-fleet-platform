from rest_framework import serializers
from .models import Hospital, Station, Ambulance, Driver, DriverAssignment, AmbulanceOperationalHistory, AmbulanceLifecycleLog, Shift, Certification, EmergencyRequest, Mission, Equipment
from authentication.serializers import UserSerializer

class HospitalSerializer(serializers.ModelSerializer):
    class Meta:
        model = Hospital
        fields = ['id', 'hospital_name', 'address', 'city', 'state', 'contact_number']

class StationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Station
        fields = ['id', 'hospital', 'station_name', 'latitude', 'longitude']

class DriverSerializer(serializers.ModelSerializer):
    name = serializers.CharField(source='user.name', required=True)
    email = serializers.EmailField(source='user.email', required=True)
    password = serializers.CharField(write_only=True, required=False, allow_blank=True)

    class Meta:
        model = Driver
        fields = ['id', 'user', 'name', 'email', 'password', 'contact', 'license_number', 'availability']
        read_only_fields = ['user']

    def validate_email(self, value):
        from django.contrib.auth import get_user_model
        User = get_user_model()
        queryset = User.objects.filter(email__iexact=value)
        if self.instance and self.instance.user:
            queryset = queryset.exclude(pk=self.instance.user.pk)
        if queryset.exists():
            raise serializers.ValidationError("A user with this email already exists.")
        return value

    def validate_license_number(self, value):
        queryset = Driver.objects.filter(license_number__iexact=value)
        if self.instance:
            queryset = queryset.exclude(pk=self.instance.pk)
        if queryset.exists():
            raise serializers.ValidationError("A driver with this license number already exists.")
        return value

    def validate_contact(self, value):
        queryset = Driver.objects.filter(contact__iexact=value)
        if self.instance:
            queryset = queryset.exclude(pk=self.instance.pk)
        if queryset.exists():
            raise serializers.ValidationError("A driver with this contact number already exists.")
        return value

    def validate(self, data):
        if self.instance and data.get('availability', self.instance.availability):
            from .models import Mission
            if Mission.objects.filter(driver=self.instance).exclude(status__in=['COMPLETED', 'CANCELLED']).exists():
                raise serializers.ValidationError(
                    {"availability": "Cannot mark driver as available while they are on an active mission."}
                )
        return data

    def create(self, validated_data):
        from django.contrib.auth import get_user_model
        from django.db import transaction
        from authentication.models import Role
        
        User = get_user_model()
        user_data = validated_data.pop('user', {})
        password = validated_data.pop('password', 'Password123')
        if not password:
            password = 'Password123'
            
        with transaction.atomic():
            try:
                driver_role = Role.objects.get(name='DRIVER')
            except Role.DoesNotExist:
                driver_role = Role.objects.create(name='DRIVER')
                
            user = User.objects.create_user(
                email=user_data.get('email'),
                name=user_data.get('name'),
                password=password,
                role=driver_role
            )
            driver = Driver.objects.create(user=user, **validated_data)
        return driver

    def update(self, instance, validated_data):
        user_data = validated_data.pop('user', {})
        password = validated_data.pop('password', None)
        
        from django.db import transaction
        with transaction.atomic():
            user = instance.user
            if 'email' in user_data:
                user.email = user_data['email']
            if 'name' in user_data:
                user.name = user_data['name']
            if password:
                user.set_password(password)
            user.save()
            
            old_availability = instance.availability
            for attr, value in validated_data.items():
                setattr(instance, attr, value)
            instance.save()
            
            new_availability = instance.availability
            if old_availability is False and new_availability is True:
                from django.utils import timezone
                from .models import DriverAssignment, AmbulanceOperationalHistory
                active_assignments = DriverAssignment.objects.filter(driver=instance, end_time__isnull=True)
                for aa in active_assignments:
                    aa.end_time = timezone.now()
                    aa.save()
                    
                    # Log the auto-unassignment
                    AmbulanceOperationalHistory.objects.create(
                        ambulance=aa.ambulance,
                        event_type='DRIVER_UNASSIGNMENT',
                        old_value=instance.user.name,
                        new_value=None,
                        remarks="Driver marked available manually."
                    )
        return instance

class ShiftSerializer(serializers.ModelSerializer):
    class Meta:
        model = Shift
        fields = ['id', 'driver', 'start_time', 'end_time']
        
    def validate(self, data):
        if data['start_time'] >= data['end_time']:
            raise serializers.ValidationError("End time must be after start time.")
        return data

class CertificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Certification
        fields = ['id', 'driver', 'name', 'certificate_number', 'issuing_authority', 'issue_date', 'expiry_date']
        
    def validate(self, data):
        if data['issue_date'] >= data['expiry_date']:
            raise serializers.ValidationError("Expiry date must be after issue date.")
        return data


class AmbulanceOperationalHistorySerializer(serializers.ModelSerializer):
    changed_by = serializers.CharField(source='changed_by.email', read_only=True)

    class Meta:
        model = AmbulanceOperationalHistory
        fields = ['id', 'event_type', 'old_value', 'new_value', 'changed_by', 'changed_at', 'remarks']

class AmbulanceLifecycleLogSerializer(serializers.ModelSerializer):
    changed_by = serializers.CharField(source='changed_by.email', read_only=True)

    class Meta:
        model = AmbulanceLifecycleLog
        fields = ['id', 'from_status', 'to_status', 'changed_by', 'changed_at', 'remarks']

class EquipmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Equipment
        fields = ['id', 'name']

class AmbulanceSerializer(serializers.ModelSerializer):
    hospital_id = serializers.PrimaryKeyRelatedField(
        queryset=Hospital.objects.all(), source='hospital', write_only=True
    )
    station_id = serializers.PrimaryKeyRelatedField(
        queryset=Station.objects.all(), source='station', write_only=True, required=False, allow_null=True
    )
    hospital = HospitalSerializer(read_only=True)
    station = StationSerializer(read_only=True)
    active_driver = serializers.SerializerMethodField()
    active_mission = serializers.SerializerMethodField()
    equipment = serializers.ListField(
        child=serializers.CharField(),
        required=False,
        write_only=True
    )

    class Meta:
        model = Ambulance
        fields = [
            'id', 'ambulance_number', 'hospital_id', 'hospital',
            'station_id', 'station', 'type', 'status', 'lifecycle_status', 'active_driver', 'active_mission',
            'equipment'
        ]

    def get_active_driver(self, obj):
        assignment = obj.assignments.filter(end_time__isnull=True).first()
        if assignment and assignment.driver:
            driver = assignment.driver
            return {
                'id': driver.id,
                'name': driver.user.name,
                'license_number': driver.license_number
            }
        return None

    def get_active_mission(self, obj):
        from .models import Mission
        mission = obj.missions.exclude(status__in=['COMPLETED', 'CANCELLED']).first()
        if mission:
            return {
                'id': mission.id,
                'status': mission.status,
                'emergency_type': mission.emergency_request.emergency_type,
                'requester_name': mission.emergency_request.requester_name,
                'pickup_location': mission.emergency_request.pickup_location,
                'priority': mission.emergency_request.priority
            }
        return None

    def validate_ambulance_number(self, value):
        # Unique check (case insensitive)
        queryset = Ambulance.objects.filter(ambulance_number__iexact=value)
        if self.instance:
            queryset = queryset.exclude(pk=self.instance.pk)
        if queryset.exists():
            raise serializers.ValidationError("An ambulance with this number already exists.")
        return value

    def create(self, validated_data):
        equipment_names = validated_data.pop('equipment', [])
        ambulance = Ambulance.objects.create(**validated_data)
        equipment_objs = []
        for name in equipment_names:
            eq, _ = Equipment.objects.get_or_create(name=name.strip())
            equipment_objs.append(eq)
        ambulance.equipment.set(equipment_objs)
        return ambulance

    def update(self, instance, validated_data):
        equipment_names = validated_data.pop('equipment', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        if equipment_names is not None:
            equipment_objs = []
            for name in equipment_names:
                eq, _ = Equipment.objects.get_or_create(name=name.strip())
                equipment_objs.append(eq)
            instance.equipment.set(equipment_objs)
        return instance

    def to_representation(self, instance):
        ret = super().to_representation(instance)
        ret['equipment'] = [eq.name for eq in instance.equipment.all()]
        return ret

class AssignDriverSerializer(serializers.Serializer):
    driver_id = serializers.UUIDField(allow_null=True, required=True)

    def validate_driver_id(self, value):
        if value is None:
            return None
        try:
            driver = Driver.objects.get(id=value)
        except Driver.DoesNotExist:
            raise serializers.ValidationError("Driver with this ID does not exist.")
        return driver

class TransferStationSerializer(serializers.Serializer):
    station_id = serializers.PrimaryKeyRelatedField(queryset=Station.objects.all())

class ChangeStatusSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=Ambulance.STATUS_CHOICES)
    remarks = serializers.CharField(required=False, allow_blank=True)


class EmergencyRequestSerializer(serializers.ModelSerializer):
    created_by = UserSerializer(read_only=True)

    class Meta:
        model = EmergencyRequest
        fields = [
            'id', 'requester_name', 'contact_number', 'emergency_type',
            'priority', 'pickup_location', 'latitude', 'longitude',
            'status', 'created_by', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_by', 'created_at', 'updated_at']

    def validate_latitude(self, value):
        if value < -90 or value > 90:
            raise serializers.ValidationError("Latitude must be between -90 and 90.")
        return value

    def validate_longitude(self, value):
        if value < -180 or value > 180:
            raise serializers.ValidationError("Longitude must be between -180 and 180.")
        return value


class MissionSerializer(serializers.ModelSerializer):
    emergency_request_id = serializers.UUIDField(write_only=True, required=False)
    ambulance_id = serializers.UUIDField(write_only=True, required=False)
    driver_id = serializers.UUIDField(write_only=True, required=False, allow_null=True)
    
    emergency_request = EmergencyRequestSerializer(read_only=True)
    ambulance = AmbulanceSerializer(read_only=True)
    driver = DriverSerializer(read_only=True)

    class Meta:
        model = Mission
        fields = [
            'id', 'emergency_request_id', 'emergency_request',
            'ambulance_id', 'ambulance', 'driver_id', 'driver',
            'status', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def validate_status(self, value):
        if self.instance and self.instance.status in ['COMPLETED', 'CANCELLED']:
            raise serializers.ValidationError("Cannot update a completed or cancelled mission.")
        valid_statuses = [choice[0] for choice in Mission.MISSION_STATUS_CHOICES]
        if value not in valid_statuses:
            raise serializers.ValidationError(f"Invalid status. Must be one of {valid_statuses}")
        return value

    def validate(self, data):
        if not self.instance:
            # POST request - creation
            if 'emergency_request_id' not in data:
                raise serializers.ValidationError({"emergency_request_id": "This field is required."})
            if 'ambulance_id' not in data:
                raise serializers.ValidationError({"ambulance_id": "This field is required."})

            # Validate emergency request
            req_id = data.get('emergency_request_id')
            try:
                req = EmergencyRequest.objects.get(id=req_id)
            except EmergencyRequest.DoesNotExist:
                raise serializers.ValidationError({"emergency_request_id": "Emergency request not found."})
            
            if req.status != 'PENDING':
                raise serializers.ValidationError({"emergency_request_id": "Only pending emergency requests can be dispatched."})
                
            # Validate ambulance
            amb_id = data.get('ambulance_id')
            try:
                amb = Ambulance.objects.get(id=amb_id)
            except Ambulance.DoesNotExist:
                raise serializers.ValidationError({"ambulance_id": "Ambulance not found."})
                
            if amb.status != 'ACTIVE':
                raise serializers.ValidationError({"ambulance_id": "Only active ambulances can be dispatched."})
                
            # Check if ambulance is already on an active mission
            if Mission.objects.filter(ambulance=amb).exclude(status__in=['COMPLETED', 'CANCELLED']).exists():
                raise serializers.ValidationError({"ambulance_id": "This ambulance is already assigned to an active mission."})
                
            # Driver assignment check
            driver_id = data.get('driver_id')
            active_driver = amb.assignments.filter(end_time__isnull=True).first()
            
            if driver_id:
                # We are assigning a driver to this ambulance on the fly
                try:
                    drv = Driver.objects.get(id=driver_id)
                except Driver.DoesNotExist:
                    raise serializers.ValidationError({"driver_id": "Driver not found."})
                    
                if not drv.availability and (not active_driver or active_driver.driver != drv):
                    raise serializers.ValidationError({"driver_id": "Driver is not available."})
                data['driver_instance'] = drv
            else:
                # Ambulance must already have an active driver
                if not active_driver:
                    raise serializers.ValidationError({"ambulance_id": "Ambulance does not have a driver assigned."})
                data['driver_instance'] = active_driver.driver
                
            # Store models for saving
            data['req_instance'] = req
            data['amb_instance'] = amb
        else:
            # PATCH request - update
            if 'status' not in data:
                raise serializers.ValidationError({"status": "Status field is required for updates."})
        return data

    def create(self, validated_data):
        from django.db import transaction
        from django.utils import timezone
        
        req = validated_data['req_instance']
        amb = validated_data['amb_instance']
        driver = validated_data['driver_instance']
        driver_id = validated_data.get('driver_id')
        
        with transaction.atomic():
            # If driver_id was provided, perform driver assignment to ambulance
            if driver_id:
                # 1. Close driver's active assignments elsewhere
                DriverAssignment.objects.filter(driver=driver, end_time__isnull=True).exclude(ambulance=amb).update(end_time=timezone.now())
                
                # 2. Close current active driver assignment on this ambulance
                current_assignment = amb.assignments.filter(end_time__isnull=True).first()
                if current_assignment and current_assignment.driver != driver:
                    current_assignment.end_time = timezone.now()
                    current_assignment.save()
                    current_assignment.driver.availability = True
                    current_assignment.driver.save()
                    
                    AmbulanceOperationalHistory.objects.create(
                        ambulance=amb,
                        event_type='DRIVER_UNASSIGNMENT',
                        old_value=current_assignment.driver.user.name,
                        new_value=None,
                        remarks="Replaced on dispatch."
                    )
                
                # 3. Create driver assignment
                if not current_assignment or current_assignment.driver != driver:
                    DriverAssignment.objects.create(driver=driver, ambulance=amb)
                    driver.availability = False
                    driver.save()
                    
                    AmbulanceOperationalHistory.objects.create(
                        ambulance=amb,
                        event_type='DRIVER_ASSIGNMENT',
                        old_value=None,
                        new_value=driver.user.name,
                        remarks="Assigned on dispatch."
                    )
            
            # Create Mission
            mission = Mission.objects.create(
                emergency_request=req,
                ambulance=amb,
                driver=driver,
                status='ASSIGNED'
            )
            
            # Transition ambulance lifecycle status
            user = self.context['request'].user if 'request' in self.context else None
            amb.transition_to('ASSIGNED', user=user, remarks="Assigned on dispatch.", mission=mission)
            
            # Update EmergencyRequest status to ASSIGNED
            req.status = 'ASSIGNED'
            req.save()
            
            return mission

    def update(self, instance, validated_data):
        from django.db import transaction
        from django.core.exceptions import ValidationError as DjangoValidationError
        from rest_framework.exceptions import ValidationError as DRFValidationError
        
        new_status = validated_data.get('status', instance.status)
        old_status = instance.status
        
        if old_status == new_status:
            return instance
            
        with transaction.atomic():
            req = instance.emergency_request
            amb = instance.ambulance
            user = self.context['request'].user if 'request' in self.context else None
            remarks = validated_data.get('remarks', f"Mission transitioned from {old_status} to {new_status}.")
            
            if new_status == 'COMPLETED':
                amb_target_status = 'AVAILABLE'
            elif new_status == 'CANCELLED':
                if amb.lifecycle_status in ['PATIENT_ONBOARD', 'HOSPITAL_ARRIVAL']:
                    amb_target_status = 'SANITIZATION'
                else:
                    amb_target_status = 'AVAILABLE'
            else:
                status_mapping = {
                    'ON_SITE': 'AT_INCIDENT',
                    'TRANSPORTING': 'PATIENT_ONBOARD',
                    'ARRIVED_HOSPITAL': 'HOSPITAL_ARRIVAL'
                }
                amb_target_status = status_mapping.get(new_status, new_status)
                
            try:
                amb.transition_to(amb_target_status, user=user, remarks=remarks, mission=instance)
            except DjangoValidationError as e:
                # Format to a nice validation error message
                message = e.message if hasattr(e, 'message') else str(e)
                raise DRFValidationError(detail={"status": message})
            
            normalized_mission_status = new_status
            if new_status == 'ON_SITE':
                normalized_mission_status = 'AT_INCIDENT'
            elif new_status == 'TRANSPORTING':
                normalized_mission_status = 'PATIENT_ONBOARD'
            elif new_status == 'ARRIVED_HOSPITAL':
                normalized_mission_status = 'HOSPITAL_ARRIVAL'
                
            instance.status = normalized_mission_status
            instance.save()
            
            # Align EmergencyRequest status
            if normalized_mission_status == 'COMPLETED':
                req.status = 'COMPLETED'
                req.save()
            elif normalized_mission_status == 'CANCELLED':
                req.status = 'PENDING'
                req.save()
            else:
                if normalized_mission_status == 'ASSIGNED':
                    req.status = 'ASSIGNED'
                else:
                    req.status = 'IN_PROGRESS'
                req.save()
                
        return instance


