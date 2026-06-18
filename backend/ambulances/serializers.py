from rest_framework import serializers
from .models import Hospital, Station, Ambulance, Driver, DriverAssignment, AmbulanceOperationalHistory

class HospitalSerializer(serializers.ModelSerializer):
    class Meta:
        model = Hospital
        fields = ['id', 'hospital_name', 'address', 'city', 'state', 'contact_number']

class StationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Station
        fields = ['id', 'hospital', 'station_name', 'latitude', 'longitude']

class DriverSerializer(serializers.ModelSerializer):
    name = serializers.CharField(source='user.name', read_only=True)
    email = serializers.EmailField(source='user.email', read_only=True)

    class Meta:
        model = Driver
        fields = ['id', 'user', 'name', 'email', 'contact', 'license_number', 'availability']

class AmbulanceOperationalHistorySerializer(serializers.ModelSerializer):
    changed_by = serializers.CharField(source='changed_by.email', read_only=True)

    class Meta:
        model = AmbulanceOperationalHistory
        fields = ['id', 'event_type', 'old_value', 'new_value', 'changed_by', 'changed_at', 'remarks']

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

    class Meta:
        model = Ambulance
        fields = [
            'id', 'ambulance_number', 'hospital_id', 'hospital',
            'station_id', 'station', 'type', 'status', 'active_driver'
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

    def validate_ambulance_number(self, value):
        # Unique check (case insensitive)
        queryset = Ambulance.objects.filter(ambulance_number__iexact=value)
        if self.instance:
            queryset = queryset.exclude(pk=self.instance.pk)
        if queryset.exists():
            raise serializers.ValidationError("An ambulance with this number already exists.")
        return value

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
