from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import AmbulanceViewSet, HospitalViewSet, StationViewSet, DriverViewSet, ShiftViewSet, CertificationViewSet

router = DefaultRouter()
router.register(r'ambulances', AmbulanceViewSet, basename='ambulance')
router.register(r'hospitals', HospitalViewSet, basename='hospital')
router.register(r'stations', StationViewSet, basename='station')
router.register(r'drivers', DriverViewSet, basename='driver')
router.register(r'shifts', ShiftViewSet, basename='shift')
router.register(r'certifications', CertificationViewSet, basename='certification')

urlpatterns = [
    path('', include(router.urls)),
]
