from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from django.contrib.auth import get_user_model
from authentication.models import Role
from ambulances.models import Hospital, Station, Ambulance, Driver

User = get_user_model()

class SecurityValidationTests(APITestCase):

    def setUp(self):
        # Create roles
        self.admin_role = Role.objects.create(name='HOSPITAL_ADMINISTRATOR')
        self.dispatcher_role = Role.objects.create(name='DISPATCHER')
        self.fleet_role = Role.objects.create(name='FLEET_MANAGER')
        self.driver_role = Role.objects.create(name='DRIVER')
        self.citizen_role = Role.objects.create(name='EMERGENCY_REQUESTOR')

        # Create users
        self.admin_user = User.objects.create_user(email='admin@h.org', name='Admin', password='Password123!', role=self.admin_role)
        self.disp_user = User.objects.create_user(email='disp@h.org', name='Disp', password='Password123!', role=self.dispatcher_role)
        self.fleet_user = User.objects.create_user(email='fleet@h.org', name='Fleet', password='Password123!', role=self.fleet_role)
        self.driver_user = User.objects.create_user(email='driver@h.org', name='Driver', password='Password123!', role=self.driver_role)
        self.citizen_user = User.objects.create_user(email='citizen@g.com', name='Citizen', password='Password123!', role=self.citizen_role)

        # Create supporting objects for database integrity
        self.hospital = Hospital.objects.create(hospital_name="City Hospital", address="123 St", city="City", state="ST", contact_number="123")
        self.station = Station.objects.create(hospital=self.hospital, station_name="Station A", latitude=40.7, longitude=-74.0)
        self.ambulance = Ambulance.objects.create(ambulance_number="AMB-SEC", hospital=self.hospital, station=self.station, status="ACTIVE")

    def test_anonymous_access_blocked(self):
        """Unauthenticated requests must be securely blocked with 401 Unauthorized."""
        urls = [
            reverse('dispatcher-dashboard'),
            reverse('fleet-dashboard'),
            reverse('admin-dashboard'),
            reverse('driver-list'),
            reverse('ambulance-list'),
            reverse('mission-list'),
        ]
        # Force anonymous client
        self.client.logout()

        for url in urls:
            response = self.client.get(url)
            self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED, f"URL {url} allowed unauthenticated access!")

    def test_role_based_access_control_boundaries(self):
        """Strict RBAC verification: lower-privilege users must be blocked with 403 Forbidden."""
        
        # 1. Driver role checks
        self.client.force_authenticate(user=self.driver_user)
        self.assertEqual(self.client.get(reverse('dispatcher-dashboard')).status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(self.client.get(reverse('fleet-dashboard')).status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(self.client.get(reverse('admin-dashboard')).status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(self.client.get(reverse('driver-list')).status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(self.client.get(reverse('ambulance-list')).status_code, status.HTTP_403_FORBIDDEN)

        # 2. Citizen/Requestor role checks
        self.client.force_authenticate(user=self.citizen_user)
        self.assertEqual(self.client.get(reverse('dispatcher-dashboard')).status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(self.client.get(reverse('fleet-dashboard')).status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(self.client.get(reverse('admin-dashboard')).status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(self.client.get(reverse('driver-list')).status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(self.client.get(reverse('ambulance-list')).status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(self.client.post(reverse('mission-list'), {}).status_code, status.HTTP_403_FORBIDDEN)

        # 3. Dispatcher role checks
        self.client.force_authenticate(user=self.disp_user)
        self.assertEqual(self.client.get(reverse('admin-dashboard')).status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(self.client.get(reverse('fleet-dashboard')).status_code, status.HTTP_403_FORBIDDEN)

        # 4. Fleet Manager role checks
        self.client.force_authenticate(user=self.fleet_user)
        self.assertEqual(self.client.get(reverse('admin-dashboard')).status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(self.client.get(reverse('dispatcher-dashboard')).status_code, status.HTTP_403_FORBIDDEN)

    def test_input_boundary_validation_coordinates(self):
        """Emergency request creation must validate coordinate bounds and reject overflow coordinates or script injections."""
        self.client.force_authenticate(user=self.citizen_user)
        url = reverse('emergency-request-list')

        # 1. Test out-of-range coordinates
        bad_data_1 = {
            "requester_name": "Test Patient",
            "contact_number": "555",
            "emergency_type": "Injury",
            "pickup_location": "Out of Bounds",
            "latitude": 95.0,  # Max valid latitude is 90
            "longitude": -120.0
        }
        response = self.client.post(url, bad_data_1, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("latitude", response.data)

        bad_data_2 = {
            "requester_name": "Test Patient",
            "contact_number": "555",
            "emergency_type": "Injury",
            "pickup_location": "Out of Bounds",
            "latitude": 37.0,
            "longitude": 185.0  # Max valid longitude is 180
        }
        response = self.client.post(url, bad_data_2, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("longitude", response.data)

        # 2. Test script tags / script injection payload (XSS)
        script_payload = {
            "requester_name": "<script>alert('xss')</script>",
            "contact_number": "555-1234",
            "emergency_type": "Trauma",
            "pickup_location": "Downtown Base",
            "latitude": 37.77,
            "longitude": -122.41
        }
        # DRF or Django serializer validation should handle input parsing or safely save parameters without crashing
        response = self.client.post(url, script_payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['requester_name'], "<script>alert('xss')</script>")

    def test_sql_injection_defense(self):
        """ORM parameterization protects against SQL injection patterns, matching them as literal strings without server failure."""
        self.client.force_authenticate(user=self.citizen_user)
        url = reverse('emergency-request-list')
        
        sqli_data = {
            "requester_name": "John' OR '1'='1' --",
            "contact_number": "555",
            "emergency_type": "Heart Issues",
            "pickup_location": "Loc",
            "latitude": 20.0,
            "longitude": 30.0
        }
        response = self.client.post(url, sqli_data, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        # Ensure it was treated as a literal requester name, not executed as SQL query
        self.assertEqual(response.data['requester_name'], "John' OR '1'='1' --")

    def test_cors_preflight_origins(self):
        """Verify that CORS response headers restrict origins correctly."""
        url = reverse('dispatcher-dashboard')
        self.client.force_authenticate(user=self.disp_user)

        # Send request with custom origin
        response = self.client.get(url, HTTP_ORIGIN='http://unauthorized-domain.com')
        # DRF Simple JWT / CORS middleware should not reflect unauthorized origin header
        self.assertNotEqual(response.get('Access-Control-Allow-Origin'), 'http://unauthorized-domain.com')
