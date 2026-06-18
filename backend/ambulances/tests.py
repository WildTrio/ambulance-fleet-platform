from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from django.contrib.auth import get_user_model
from authentication.models import Role
from ambulances.models import Hospital, Station, Ambulance, Driver, DriverAssignment, AmbulanceOperationalHistory

User = get_user_model()

class AmbulanceAPITests(APITestCase):

    def setUp(self):
        # Create roles
        self.admin_role = Role.objects.create(name='HOSPITAL_ADMINISTRATOR')
        self.fleet_role = Role.objects.create(name='FLEET_MANAGER')
        self.dispatcher_role = Role.objects.create(name='DISPATCHER')
        self.driver_role = Role.objects.create(name='DRIVER')

        # Create users
        self.admin_user = User.objects.create_user(email='admin@h.org', name='Admin', password='Password123!', role=self.admin_role)
        self.fleet_user = User.objects.create_user(email='fleet@h.org', name='Fleet', password='Password123!', role=self.fleet_role)
        self.dispatcher_user = User.objects.create_user(email='disp@h.org', name='Disp', password='Password123!', role=self.dispatcher_role)
        self.driver_user_1 = User.objects.create_user(email='driver1@h.org', name='Driver1', password='Password123!', role=self.driver_role)
        self.driver_user_2 = User.objects.create_user(email='driver2@h.org', name='Driver2', password='Password123!', role=self.driver_role)

        # Create supporting objects
        self.hospital = Hospital.objects.create(hospital_name="City Hospital", address="123 Road", city="City", state="ST", contact_number="123")
        self.station_a = Station.objects.create(hospital=self.hospital, station_name="Station A", latitude=40.7, longitude=-74.0)
        self.station_b = Station.objects.create(hospital=self.hospital, station_name="Station B", latitude=40.8, longitude=-74.1)

        # Create driver profiles
        self.driver_1 = Driver.objects.create(user=self.driver_user_1, contact="123", license_number="LIC1", availability=True)
        self.driver_2 = Driver.objects.create(user=self.driver_user_2, contact="456", license_number="LIC2", availability=True)

        # Create ambulances
        self.ambulance_active = Ambulance.objects.create(ambulance_number="AMB-001", hospital=self.hospital, station=self.station_a, type="Basic Life Support", status="ACTIVE")
        self.ambulance_maint = Ambulance.objects.create(ambulance_number="AMB-002", hospital=self.hospital, station=self.station_a, type="Advanced Life Support", status="MAINTENANCE")

    def test_list_ambulances_rbac(self):
        # Authenticated Admin: Allowed
        self.client.force_authenticate(user=self.admin_user)
        response = self.client.get(reverse('ambulance-list'))
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        # Authenticated Fleet Manager: Allowed
        self.client.force_authenticate(user=self.fleet_user)
        response = self.client.get(reverse('ambulance-list'))
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        # Authenticated Dispatcher: Allowed
        self.client.force_authenticate(user=self.dispatcher_user)
        response = self.client.get(reverse('ambulance-list'))
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        # Authenticated Driver: Denied
        self.client.force_authenticate(user=self.driver_user_1)
        response = self.client.get(reverse('ambulance-list'))
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_create_ambulance_rbac(self):
        url = reverse('ambulance-list')
        data = {
            "ambulance_number": "AMB-NEW",
            "hospital_id": str(self.hospital.id),
            "station_id": str(self.station_a.id),
            "type": "Basic Life Support",
            "status": "ACTIVE"
        }

        # Dispatcher: Denied
        self.client.force_authenticate(user=self.dispatcher_user)
        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        # Fleet Manager: Allowed
        self.client.force_authenticate(user=self.fleet_user)
        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Ambulance.objects.filter(ambulance_number="AMB-NEW").count(), 1)

    def test_ambulance_number_uniqueness(self):
        url = reverse('ambulance-list')
        data = {
            "ambulance_number": "amb-001",  # Duplicate case-insensitive
            "hospital_id": str(self.hospital.id),
            "station_id": str(self.station_a.id),
            "type": "Basic Life Support",
            "status": "ACTIVE"
        }
        self.client.force_authenticate(user=self.admin_user)
        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("ambulance_number", response.data)

    def test_assign_driver_only_to_active(self):
        url = reverse('ambulance-assign-driver', kwargs={'pk': self.ambulance_maint.pk})
        data = {"driver_id": str(self.driver_1.id)}

        self.client.force_authenticate(user=self.fleet_user)
        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("non_field_errors", response.data)
        self.assertEqual(response.data["non_field_errors"][0], "Ambulance under maintenance cannot receive assignments.")

    def test_assign_driver_success_and_history(self):
        url = reverse('ambulance-assign-driver', kwargs={'pk': self.ambulance_active.pk})
        data = {"driver_id": str(self.driver_1.id)}

        self.client.force_authenticate(user=self.fleet_user)
        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        # Verify assignment in DB
        self.driver_1.refresh_from_db()
        self.assertFalse(self.driver_1.availability)
        self.assertEqual(self.ambulance_active.assignments.filter(end_time__isnull=True).first().driver, self.driver_1)

        # Verify Operational History log
        history_exists = AmbulanceOperationalHistory.objects.filter(
            ambulance=self.ambulance_active,
            event_type='DRIVER_ASSIGNMENT',
            new_value=self.driver_1.user.name
        ).exists()
        self.assertTrue(history_exists)

    def test_driver_reassignment_closes_previous(self):
        # Assign driver_1 to ambulance_active
        DriverAssignment.objects.create(driver=self.driver_1, ambulance=self.ambulance_active)
        self.driver_1.availability = False
        self.driver_1.save()

        # Create another active ambulance
        ambulance_active_2 = Ambulance.objects.create(ambulance_number="AMB-999", hospital=self.hospital, station=self.station_a, status="ACTIVE")

        # Assign driver_1 to ambulance_active_2
        url = reverse('ambulance-assign-driver', kwargs={'pk': ambulance_active_2.pk})
        data = {"driver_id": str(self.driver_1.id)}

        self.client.force_authenticate(user=self.fleet_user)
        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        # Verify old assignment is closed
        old_assignment = DriverAssignment.objects.get(driver=self.driver_1, ambulance=self.ambulance_active)
        self.assertIsNotNone(old_assignment.end_time)

        # Verify new assignment is active
        new_assignment = DriverAssignment.objects.get(driver=self.driver_1, ambulance=ambulance_active_2)
        self.assertIsNone(new_assignment.end_time)

    def test_transfer_station_and_history(self):
        url = reverse('ambulance-transfer', kwargs={'pk': self.ambulance_active.pk})
        data = {"station_id": str(self.station_b.id)}

        self.client.force_authenticate(user=self.fleet_user)
        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.ambulance_active.refresh_from_db()
        self.assertEqual(self.ambulance_active.station, self.station_b)

        # Verify transfer log
        history_exists = AmbulanceOperationalHistory.objects.filter(
            ambulance=self.ambulance_active,
            event_type='STATION_TRANSFER',
            old_value="Station A",
            new_value="Station B"
        ).exists()
        self.assertTrue(history_exists)

    def test_change_status_auto_unassigns_driver(self):
        # Assign driver_1 to ambulance_active
        DriverAssignment.objects.create(driver=self.driver_1, ambulance=self.ambulance_active)
        self.driver_1.availability = False
        self.driver_1.save()

        # Change status to MAINTENANCE
        url = reverse('ambulance-change-status', kwargs={'pk': self.ambulance_active.pk})
        data = {"status": "MAINTENANCE", "remarks": "Need checkup"}

        self.client.force_authenticate(user=self.fleet_user)
        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.ambulance_active.refresh_from_db()
        self.assertEqual(self.ambulance_active.status, "MAINTENANCE")

        # Verify driver assignment is closed and driver is available again
        self.driver_1.refresh_from_db()
        self.assertTrue(self.driver_1.availability)
        assignment = DriverAssignment.objects.get(driver=self.driver_1, ambulance=self.ambulance_active)
        self.assertIsNotNone(assignment.end_time)

        # Verify status change log and automatic unassignment log
        status_log = AmbulanceOperationalHistory.objects.filter(
            ambulance=self.ambulance_active,
            event_type='STATUS_CHANGE',
            old_value="ACTIVE",
            new_value="MAINTENANCE",
            remarks="Need checkup"
        ).exists()
        self.assertTrue(status_log)

        unassign_log = AmbulanceOperationalHistory.objects.filter(
            ambulance=self.ambulance_active,
            event_type='DRIVER_UNASSIGNMENT',
            old_value=self.driver_1.user.name
        ).exists()
        self.assertTrue(unassign_log)
