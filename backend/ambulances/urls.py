from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import AmbulanceViewSet, HospitalViewSet, StationViewSet, DriverViewSet

router = DefaultRouter()
router.register(r'ambulances', AmbulanceViewSet, basename='ambulance')
router.register(r'hospitals', HospitalViewSet, basename='hospital')
router.register(r'stations', StationViewSet, basename='station')
router.register(r'drivers', DriverViewSet, basename='driver')

urlpatterns = [
    path('', include(router.urls)),
]
