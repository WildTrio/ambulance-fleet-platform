from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    AmbulanceViewSet, HospitalViewSet, StationViewSet, DriverViewSet,
    ShiftViewSet, CertificationViewSet, EmergencyRequestViewSet,
    MissionViewSet, EquipmentViewSet, TripViewSet,
    DispatcherDashboardView, FleetDashboardView, AdministratorDashboardView
)

router = DefaultRouter()
router.register(r'ambulances', AmbulanceViewSet, basename='ambulance')
router.register(r'hospitals', HospitalViewSet, basename='hospital')
router.register(r'stations', StationViewSet, basename='station')
router.register(r'drivers', DriverViewSet, basename='driver')
router.register(r'shifts', ShiftViewSet, basename='shift')
router.register(r'certifications', CertificationViewSet, basename='certification')
router.register(r'emergency-requests', EmergencyRequestViewSet, basename='emergency-request')
router.register(r'missions', MissionViewSet, basename='mission')
router.register(r'equipment', EquipmentViewSet, basename='equipment')
router.register(r'trips', TripViewSet, basename='trip')

urlpatterns = [
    path('dashboards/dispatcher/', DispatcherDashboardView.as_view(), name='dispatcher-dashboard'),
    path('dashboards/fleet/', FleetDashboardView.as_view(), name='fleet-dashboard'),
    path('dashboards/admin/', AdministratorDashboardView.as_view(), name='admin-dashboard'),
    path('', include(router.urls)),
]
