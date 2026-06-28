from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from django.contrib.auth import get_user_model
from authentication.models import Role
from ambulances.models import EmergencyRequest

User = get_user_model()

class EmergencyRequestAPITests(APITestCase):

    def setUp(self):
        # Create roles
        self.admin_role = Role.objects.create(name='HOSPITAL_ADMINISTRATOR')
        self.dispatcher_role = Role.objects.create(name='DISPATCHER')
        self.requestor_role = Role.objects.create(name='EMERGENCY_REQUESTOR')
        self.fleet_role = Role.objects.create(name='FLEET_MANAGER')
        self.driver_role = Role.objects.create(name='DRIVER')

        # Create users
        self.admin_user = User.objects.create_user(email='admin@h.org', name='Admin User', password='Password123!', role=self.admin_role)
        self.dispatcher_user = User.objects.create_user(email='disp@h.org', name='Dispatcher User', password='Password123!', role=self.dispatcher_role)
        self.citizen_1 = User.objects.create_user(email='citizen1@gmail.com', name='Citizen One', password='Password123!', role=self.requestor_role)
        self.citizen_2 = User.objects.create_user(email='citizen2@gmail.com', name='Citizen Two', password='Password123!', role=self.requestor_role)
        self.fleet_user = User.objects.create_user(email='fleet@h.org', name='Fleet User', password='Password123!', role=self.fleet_role)
        self.driver_user = User.objects.create_user(email='driver@h.org', name='Driver User', password='Password123!', role=self.driver_role)

    def test_create_emergency_request_citizen(self):
        url = reverse('emergency-request-list')
        data = {
            "requester_name": "Citizen One",
            "contact_number": "555-0101",
            "emergency_type": "Stroke",
            "pickup_location": "456 Oak Rd",
            "latitude": 34.0522,
            "longitude": -118.2437,
            "priority": "CRITICAL"  # Citizen tries to set high priority
        }

        self.client.force_authenticate(user=self.citizen_1)
        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        # Verify priority is forced to MEDIUM for citizens
        req = EmergencyRequest.objects.get(id=response.data['id'])
        self.assertEqual(req.priority, "MEDIUM")
        self.assertEqual(req.status, "PENDING")
        self.assertEqual(req.created_by, self.citizen_1)

    def test_create_emergency_request_dispatcher(self):
        url = reverse('emergency-request-list')
        data = {
            "requester_name": "Jane Smith",
            "contact_number": "555-0102",
            "emergency_type": "Cardiac Arrest",
            "pickup_location": "123 Elm St",
            "latitude": 34.0522,
            "longitude": -118.2437,
            "priority": "CRITICAL"
        }

        self.client.force_authenticate(user=self.dispatcher_user)
        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        # Verify dispatcher can set custom priority
        req = EmergencyRequest.objects.get(id=response.data['id'])
        self.assertEqual(req.priority, "CRITICAL")
        self.assertEqual(req.status, "PENDING")
        self.assertEqual(req.created_by, self.dispatcher_user)

    def test_create_emergency_request_admin(self):
        url = reverse('emergency-request-list')
        data = {
            "requester_name": "John Admin-Logged",
            "contact_number": "555-0103",
            "emergency_type": "Trauma/Bleeding",
            "pickup_location": "789 Pine St",
            "latitude": 34.0522,
            "longitude": -118.2437,
            "priority": "HIGH"
        }

        self.client.force_authenticate(user=self.admin_user)
        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        # Verify admin can set custom priority
        req = EmergencyRequest.objects.get(id=response.data['id'])
        self.assertEqual(req.priority, "HIGH")
        self.assertEqual(req.status, "PENDING")
        self.assertEqual(req.created_by, self.admin_user)

    def test_create_validation_errors(self):
        url = reverse('emergency-request-list')
        # Missing fields
        data = {
            "requester_name": "",
            "contact_number": "",
            "latitude": 100.0,  # Invalid latitude
            "longitude": -200.0  # Invalid longitude
        }
        self.client.force_authenticate(user=self.citizen_1)
        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("requester_name", response.data)
        self.assertIn("contact_number", response.data)
        self.assertIn("latitude", response.data)
        self.assertIn("longitude", response.data)

    def test_list_emergency_requests_rbac(self):
        # Create some requests
        req1 = EmergencyRequest.objects.create(
            requester_name="Req 1", contact_number="1", emergency_type="A",
            pickup_location="Loc 1", latitude=0, longitude=0, created_by=self.citizen_1
        )
        req2 = EmergencyRequest.objects.create(
            requester_name="Req 2", contact_number="2", emergency_type="B",
            pickup_location="Loc 2", latitude=0, longitude=0, created_by=self.citizen_2
        )

        url = reverse('emergency-request-list')

        # Admin: sees all
        self.client.force_authenticate(user=self.admin_user)
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 2)

        # Dispatcher: sees all
        self.client.force_authenticate(user=self.dispatcher_user)
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 2)

        # Citizen 1: sees only own request
        self.client.force_authenticate(user=self.citizen_1)
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['id'], str(req1.id))

        # Fleet Manager: Denied
        self.client.force_authenticate(user=self.fleet_user)
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        # Driver: Denied
        self.client.force_authenticate(user=self.driver_user)
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_priority_and_date_sorting_for_queue(self):
        # Create multiple requests with different priorities and dates
        req_med = EmergencyRequest.objects.create(
            requester_name="Med", contact_number="1", emergency_type="A",
            pickup_location="Loc", latitude=0, longitude=0, priority="MEDIUM", created_by=self.citizen_1
        )
        req_crit_old = EmergencyRequest.objects.create(
            requester_name="Crit Old", contact_number="2", emergency_type="B",
            pickup_location="Loc", latitude=0, longitude=0, priority="CRITICAL", created_by=self.citizen_1
        )
        req_high = EmergencyRequest.objects.create(
            requester_name="High", contact_number="3", emergency_type="C",
            pickup_location="Loc", latitude=0, longitude=0, priority="HIGH", created_by=self.citizen_2
        )
        req_crit_new = EmergencyRequest.objects.create(
            requester_name="Crit New", contact_number="4", emergency_type="D",
            pickup_location="Loc", latitude=0, longitude=0, priority="CRITICAL", created_by=self.citizen_2
        )

        # Force sort order in DB by manually adjusting created_at if needed, but since they are created sequentially,
        # Crit Old is older than Crit New. Let's verify sorting:
        # Expected sorting order for queue: Critical Old > Critical New > High > Medium
        self.client.force_authenticate(user=self.dispatcher_user)
        url = reverse('emergency-request-list')
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        results = [r['id'] for r in response.data]
        expected = [str(req_crit_old.id), str(req_crit_new.id), str(req_high.id), str(req_med.id)]
        self.assertEqual(results, expected)

    def test_update_emergency_request_citizen_flow(self):
        req = EmergencyRequest.objects.create(
            requester_name="Citizen One", contact_number="123", emergency_type="Trauma",
            pickup_location="Original St", latitude=12.0, longitude=13.0, status="PENDING", created_by=self.citizen_1
        )

        url = reverse('emergency-request-detail', kwargs={'pk': req.pk})
        self.client.force_authenticate(user=self.citizen_1)

        # 1. Update details when status is PENDING: Allowed
        data = {"pickup_location": "Updated St"}
        response = self.client.patch(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        req.refresh_from_db()
        self.assertEqual(req.pickup_location, "Updated St")

        # 2. Cannot update priority
        data = {"priority": "HIGH"}
        response = self.client.patch(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

        # 3. Change status to CANCELLED when status is PENDING: Allowed
        data = {"status": "CANCELLED"}
        response = self.client.patch(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        req.refresh_from_db()
        self.assertEqual(req.status, "CANCELLED")

    def test_update_details_blocked_for_citizen_when_assigned(self):
        # Create assigned request
        req = EmergencyRequest.objects.create(
            requester_name="Citizen One", contact_number="123", emergency_type="Trauma",
            pickup_location="Original St", latitude=12.0, longitude=13.0, status="ASSIGNED", created_by=self.citizen_1
        )

        url = reverse('emergency-request-detail', kwargs={'pk': req.pk})
        self.client.force_authenticate(user=self.citizen_1)

        # Try updating details when ASSIGNED: Denied
        data = {"pickup_location": "New St"}
        response = self.client.patch(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

        # Try cancelling when ASSIGNED: Allowed
        data = {"status": "CANCELLED"}
        response = self.client.patch(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        req.refresh_from_db()
        self.assertEqual(req.status, "CANCELLED")

    def test_modification_disabled_after_completed_or_cancelled(self):
        req_comp = EmergencyRequest.objects.create(
            requester_name="Jane", contact_number="1", emergency_type="A",
            pickup_location="Loc", latitude=0, longitude=0, status="COMPLETED", created_by=self.citizen_1
        )
        url_comp = reverse('emergency-request-detail', kwargs={'pk': req_comp.pk})

        # Try to modify as Dispatcher: Rejected
        self.client.force_authenticate(user=self.dispatcher_user)
        data = {"status": "IN_PROGRESS"}
        response = self.client.patch(url_comp, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data['detail'], "Cannot modify an emergency request that is already COMPLETED or CANCELLED.")

    def test_delete_emergency_request_method_not_allowed(self):
        req = EmergencyRequest.objects.create(
            requester_name="Jane", contact_number="1", emergency_type="A",
            pickup_location="Loc", latitude=0, longitude=0, status="PENDING", created_by=self.citizen_1
        )
        url = reverse('emergency-request-detail', kwargs={'pk': req.pk})

        # Admin tries to delete: Method Not Allowed (405)
        self.client.force_authenticate(user=self.admin_user)
        response = self.client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)
