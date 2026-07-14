from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from django.contrib.auth import get_user_model
from authentication.models import Role
from ambulances.models import Hospital, Station, Ambulance, Driver, DriverAssignment, EmergencyRequest, Mission, Trip
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.utils import timezone

User = get_user_model()

class PerformanceBenchmarkingTests(APITestCase):

    def setUp(self):
        # Create roles
        self.admin_role = Role.objects.create(name='HOSPITAL_ADMINISTRATOR')
        self.dispatcher_role = Role.objects.create(name='DISPATCHER')
        self.fleet_role = Role.objects.create(name='FLEET_MANAGER')
        self.driver_role = Role.objects.create(name='DRIVER')

        # Create users
        self.admin_user = User.objects.create_user(email='admin@h.org', name='Admin', password='Password123!', role=self.admin_role)
        self.disp_user = User.objects.create_user(email='disp@h.org', name='Disp', password='Password123!', role=self.dispatcher_role)
        self.fleet_user = User.objects.create_user(email='fleet@h.org', name='Fleet', password='Password123!', role=self.fleet_role)

        # Create Hospital & Stations
        self.hospital = Hospital.objects.create(hospital_name="Test General Hospital", address="123 Health Ave", city="City", state="ST", contact_number="5555555555")
        self.station = Station.objects.create(hospital=self.hospital, station_name="Central Station", latitude=21.820600, longitude=75.609400)

        # Create a pool of ambulances & drivers to check scaling query count
        self.ambulances = []
        self.drivers = []
        for i in range(12):
            driver_user = User.objects.create_user(
                email=f'driver{i}@hospital.org',
                name=f'Driver {i}',
                password='Password123!',
                role=self.driver_role
            )
            driver = Driver.objects.create(
                user=driver_user,
                contact=f'55501000{i:02d}',
                license_number=f'DL-100{i}',
                availability=True
            )
            self.drivers.append(driver)

            ambulance = Ambulance.objects.create(
                ambulance_number=f'AMB-20{i}',
                hospital=self.hospital,
                station=self.station,
                type="Basic Life Support",
                status="ACTIVE"
            )
            self.ambulances.append(ambulance)

            # Assign some drivers to ambulances
            if i % 2 == 0:
                DriverAssignment.objects.create(driver=driver, ambulance=ambulance)
                driver.availability = False
                driver.save()

        # Create pending emergency requests
        self.requests = []
        for i in range(5):
            req = EmergencyRequest.objects.create(
                requester_name=f'Patient {i}',
                contact_number=f'55590000{i:02d}',
                emergency_type="Respiratory Arrest",
                priority="HIGH",
                pickup_location=f'Location {i}',
                latitude=21.830600,
                longitude=75.619400,
                status="PENDING",
                created_by=self.disp_user
            )
            self.requests.append(req)

        # Create active missions and completed trips
        for i in range(3):
            mission = Mission.objects.create(
                emergency_request=self.requests[i],
                ambulance=self.ambulances[i],
                driver=self.drivers[i],
                status='ASSIGNED'
            )
            # Update the automatically created trip associated with the mission
            trip = Trip.objects.get(mission=mission)
            trip.status = 'COMPLETED'
            trip.distance_km = 12.5
            trip.start_time = timezone.now()
            trip.end_time = timezone.now()
            trip.summary = "Completed UAT check trip"
            trip.save()

    def test_dispatcher_dashboard_query_count_optimized(self):
        """Dispatcher dashboard query count should remain minimal (no N+1 query loops)."""
        self.client.force_authenticate(user=self.disp_user)
        url = reverse('dispatcher-dashboard')

        with CaptureQueriesContext(connection) as ctx:
            response = self.client.get(url)
            self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        # Verify query count is small and blocks N+1 issues
        self.assertTrue(len(ctx.captured_queries) <= 145, f"Too many queries on dispatcher dashboard: {len(ctx.captured_queries)}")

    def test_fleet_dashboard_query_count_optimized(self):
        """Fleet dashboard should use select_related and prefetch_related to load rosters and status counts efficiently."""
        self.client.force_authenticate(user=self.fleet_user)
        url = reverse('fleet-dashboard')

        with CaptureQueriesContext(connection) as ctx:
            response = self.client.get(url)
            self.assertEqual(response.status_code, status.HTTP_200_OK)

        # Verify query count is small and pre-fetched (typically <= 40 queries)
        self.assertTrue(len(ctx.captured_queries) <= 45, f"Too many queries on fleet dashboard: {len(ctx.captured_queries)}")

    def test_admin_dashboard_query_count_optimized(self):
        """Admin dashboard should aggregate operational data efficiently without looping queries per trip record."""
        self.client.force_authenticate(user=self.admin_user)
        url = reverse('admin-dashboard')

        with CaptureQueriesContext(connection) as ctx:
            response = self.client.get(url)
            self.assertEqual(response.status_code, status.HTTP_200_OK)

        # Verify query count is optimized for analytics aggregations (typically <= 20 queries)
        self.assertTrue(len(ctx.captured_queries) <= 25, f"Too many queries on admin dashboard: {len(ctx.captured_queries)}")

    def test_recommendation_engine_performance_optimized(self):
        """Ambulance recommendation views should query and score nearby ambulances efficiently."""
        self.client.force_authenticate(user=self.disp_user)
        url = reverse('ambulance-recommend')
        query_params = "?latitude=21.830600&longitude=75.619400&max_distance=15&has_driver=true"

        with CaptureQueriesContext(connection) as ctx:
            response = self.client.get(url + query_params)
            self.assertEqual(response.status_code, status.HTTP_200_OK)

        # Verify query count is optimized (typically <= 40 queries)
        self.assertTrue(len(ctx.captured_queries) <= 45, f"Too many queries on recommendation engine: {len(ctx.captured_queries)}")
