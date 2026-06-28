from django.contrib import admin
from .models import Hospital, Station, Ambulance, Driver, DriverAssignment, AmbulanceOperationalHistory, Equipment

@admin.register(Equipment)
class EquipmentAdmin(admin.ModelAdmin):
    list_display = ('name',)
    search_fields = ('name',)

@admin.register(Hospital)
class HospitalAdmin(admin.ModelAdmin):
    list_display = ('hospital_name', 'city', 'state', 'contact_number')
    search_fields = ('hospital_name', 'city')

@admin.register(Station)
class StationAdmin(admin.ModelAdmin):
    list_display = ('station_name', 'hospital', 'latitude', 'longitude')
    search_fields = ('station_name', 'hospital__hospital_name')

@admin.register(Ambulance)
class AmbulanceAdmin(admin.ModelAdmin):
    list_display = ('ambulance_number', 'hospital', 'station', 'type', 'status', 'display_equipment')
    list_filter = ('status', 'type', 'hospital')
    search_fields = ('ambulance_number',)
    filter_horizontal = ('equipment',)

    def display_equipment(self, obj):
        return ", ".join([eq.name for eq in obj.equipment.all()])
    display_equipment.short_description = 'Equipment'

@admin.register(Driver)
class DriverAdmin(admin.ModelAdmin):
    list_display = ('get_name', 'license_number', 'availability', 'contact')
    list_filter = ('availability',)
    search_fields = ('user__name', 'license_number')

    def get_name(self, obj):
        return obj.user.name
    get_name.short_description = 'Name'

@admin.register(DriverAssignment)
class DriverAssignmentAdmin(admin.ModelAdmin):
    list_display = ('driver', 'ambulance', 'start_time', 'end_time')
    list_filter = ('start_time', 'end_time')

@admin.register(AmbulanceOperationalHistory)
class AmbulanceOperationalHistoryAdmin(admin.ModelAdmin):
    list_display = ('ambulance', 'event_type', 'old_value', 'new_value', 'changed_by', 'changed_at')
    list_filter = ('event_type', 'changed_at')
