from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from django.contrib.auth import get_user_model
from authentication.models import Role
from ambulances.models import Hospital, Station, Ambulance, Driver, DriverAssignment, AmbulanceOperationalHistory, Shift, Certification, EmergencyRequest, Mission, Trip

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

    def test_edit_ambulance_status_auto_unassigns_driver(self):
        # Assign driver_1 to ambulance_active
        DriverAssignment.objects.create(driver=self.driver_1, ambulance=self.ambulance_active)
        self.driver_1.availability = False
        self.driver_1.save()

        # Update status to MAINTENANCE via PATCH
        url = reverse('ambulance-detail', kwargs={'pk': self.ambulance_active.pk})
        data = {"status": "MAINTENANCE"}

        self.client.force_authenticate(user=self.fleet_user)
        response = self.client.patch(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.ambulance_active.refresh_from_db()
        self.assertEqual(self.ambulance_active.status, "MAINTENANCE")

        # Verify driver assignment is closed and driver is available again
        self.driver_1.refresh_from_db()
        self.assertTrue(self.driver_1.availability)
        assignment = DriverAssignment.objects.get(driver=self.driver_1, ambulance=self.ambulance_active)
        self.assertIsNotNone(assignment.end_time)

        # Verify operational history logs
        status_log = AmbulanceOperationalHistory.objects.filter(
            ambulance=self.ambulance_active,
            event_type='STATUS_CHANGE',
            old_value="ACTIVE",
            new_value="MAINTENANCE"
        ).exists()
        self.assertTrue(status_log)

        unassign_log = AmbulanceOperationalHistory.objects.filter(
            ambulance=self.ambulance_active,
            event_type='DRIVER_UNASSIGNMENT',
            old_value=self.driver_1.user.name
        ).exists()
        self.assertTrue(unassign_log)

    def test_availability_guard_blocks_unassigned_unavailable_driver(self):
        # Mark driver_1 unavailable and ensure they are not assigned to any ambulance
        self.driver_1.availability = False
        self.driver_1.save()
        
        # Verify no active assignment exists
        self.assertFalse(DriverAssignment.objects.filter(driver=self.driver_1, end_time__isnull=True).exists())

        url = reverse('ambulance-assign-driver', kwargs={'pk': self.ambulance_active.pk})
        data = {"driver_id": str(self.driver_1.id)}

        self.client.force_authenticate(user=self.fleet_user)
        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("non_field_errors", response.data)
        self.assertEqual(response.data["non_field_errors"][0], "Drivers marked unavailable cannot receive assignments.")

    def test_availability_guard_allows_reassigning_active_driver(self):
        # Assign driver_1 to ambulance_active (which sets availability to False)
        DriverAssignment.objects.create(driver=self.driver_1, ambulance=self.ambulance_active)
        self.driver_1.availability = False
        self.driver_1.save()
        
        # Create another active ambulance
        ambulance_active_2 = Ambulance.objects.create(ambulance_number="AMB-333", hospital=self.hospital, station=self.station_a, status="ACTIVE")

        # Attempt to assign driver_1 to ambulance_active_2
        url = reverse('ambulance-assign-driver', kwargs={'pk': ambulance_active_2.pk})
        data = {"driver_id": str(self.driver_1.id)}

        self.client.force_authenticate(user=self.fleet_user)
        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_delete_ambulance_validation(self):
        # 1. Try to delete active ambulance
        url_active = reverse('ambulance-detail', kwargs={'pk': self.ambulance_active.pk})
        self.client.force_authenticate(user=self.admin_user)
        response = self.client.delete(url_active)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data['detail'], "Only inactive ambulances can be deleted.")

        # 2. Try to delete inactive ambulance (which has NO assignments)
        ambulance_inactive = Ambulance.objects.create(
            ambulance_number="AMB-INACT",
            hospital=self.hospital,
            station=self.station_a,
            status="INACTIVE"
        )
        url_inactive = reverse('ambulance-detail', kwargs={'pk': ambulance_inactive.pk})
        response = self.client.delete(url_inactive)
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Ambulance.objects.filter(pk=ambulance_inactive.pk).exists())

        # 3. Try to delete inactive ambulance that HAS assignments
        ambulance_inactive_assigned = Ambulance.objects.create(
            ambulance_number="AMB-INACT-ASSIGN",
            hospital=self.hospital,
            station=self.station_a,
            status="INACTIVE"
        )
        DriverAssignment.objects.create(driver=self.driver_1, ambulance=ambulance_inactive_assigned)
        
        url_assigned = reverse('ambulance-detail', kwargs={'pk': ambulance_inactive_assigned.pk})
        response = self.client.delete(url_assigned)
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Ambulance.objects.filter(pk=ambulance_inactive_assigned.pk).exists())


class DriverManagementAPITests(APITestCase):

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
        self.driver_user = User.objects.create_user(email='driver@h.org', name='Driver', password='Password123!', role=self.driver_role)

        # Create driver
        self.driver = Driver.objects.create(user=self.driver_user, contact="555-0100", license_number="DL-1111", availability=True)

    def test_list_drivers_rbac(self):
        # Dispatcher, Fleet, Admin allowed
        for u in [self.admin_user, self.fleet_user, self.dispatcher_user]:
            self.client.force_authenticate(user=u)
            response = self.client.get(reverse('driver-list'))
            self.assertEqual(response.status_code, status.HTTP_200_OK)

        # Driver denied
        self.client.force_authenticate(user=self.driver_user)
        response = self.client.get(reverse('driver-list'))
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_create_driver(self):
        url = reverse('driver-list')
        data = {
            "name": "New Driver",
            "email": "newdriver@h.org",
            "password": "Password123!",
            "contact": "555-9999",
            "license_number": "DL-2222",
            "availability": True
        }
        self.client.force_authenticate(user=self.fleet_user)
        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        
        # Verify db records
        self.assertEqual(Driver.objects.filter(license_number="DL-2222").count(), 1)
        new_drv = Driver.objects.get(license_number="DL-2222")
        self.assertEqual(new_drv.user.name, "New Driver")
        self.assertEqual(new_drv.user.email, "newdriver@h.org")
        self.assertEqual(new_drv.user.role.name, "DRIVER")

    def test_create_driver_validation(self):
        # Duplicate email
        url = reverse('driver-list')
        data = {
            "name": "Another Driver",
            "email": "driver@h.org", # Duplicate email
            "contact": "123-4567",
            "license_number": "DL-UNIQUE",
            "availability": True
        }
        self.client.force_authenticate(user=self.fleet_user)
        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("email", response.data)

        # Duplicate license_number
        data = {
            "name": "Another Driver",
            "email": "another@h.org",
            "contact": "123-4567",
            "license_number": "DL-1111", # Duplicate license
            "availability": True
        }
        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("license_number", response.data)

        # Duplicate contact
        data = {
            "name": "Another Driver",
            "email": "another2@h.org",
            "contact": "555-0100", # Duplicate contact (from self.driver in setUp)
            "license_number": "DL-UNIQUE",
            "availability": True
        }
        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("contact", response.data)

    def test_update_driver(self):
        url = reverse('driver-detail', kwargs={'pk': self.driver.pk})
        data = {
            "name": "Updated Name",
            "email": "driver@h.org",
            "contact": "999-9999",
            "license_number": "DL-1111-UPDATED",
            "availability": False
        }
        self.client.force_authenticate(user=self.admin_user)
        response = self.client.patch(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        self.driver.refresh_from_db()
        self.assertEqual(self.driver.user.name, "Updated Name")
        self.assertEqual(self.driver.license_number, "DL-1111-UPDATED")
        self.assertFalse(self.driver.availability)

    def test_update_driver_availability_closes_assignment(self):
        # 1. Create hospital, station, ambulance
        hospital = Hospital.objects.create(hospital_name="City Hospital", address="123 Road", city="City", state="ST", contact_number="123")
        station = Station.objects.create(hospital=hospital, station_name="Station A", latitude=40.7, longitude=-74.0)
        ambulance = Ambulance.objects.create(ambulance_number="AMB-D1", hospital=hospital, station=station, status="ACTIVE")
        
        # 2. Assign driver to ambulance (sets availability to False)
        DriverAssignment.objects.create(driver=self.driver, ambulance=ambulance)
        self.driver.availability = False
        self.driver.save()
        
        # 3. Perform manual driver PATCH update to set availability = True
        url = reverse('driver-detail', kwargs={'pk': self.driver.pk})
        data = {
            "name": self.driver.user.name,
            "email": self.driver.user.email,
            "contact": self.driver.contact,
            "license_number": self.driver.license_number,
            "availability": True  # manually change availability to True
        }
        self.client.force_authenticate(user=self.admin_user)
        response = self.client.patch(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        # 4. Verify driver availability is True
        self.driver.refresh_from_db()
        self.assertTrue(self.driver.availability)

        # 5. Verify the assignment is closed
        assignment = DriverAssignment.objects.get(driver=self.driver, ambulance=ambulance)
        self.assertIsNotNone(assignment.end_time)

        # 6. Verify operational history contains DRIVER_UNASSIGNMENT
        unassign_log = AmbulanceOperationalHistory.objects.filter(
            ambulance=ambulance,
            event_type='DRIVER_UNASSIGNMENT',
            old_value=self.driver.user.name
        ).exists()
        self.assertTrue(unassign_log)

    def test_cannot_make_driver_available_while_on_mission(self):
        # 1. Create hospital, station, ambulance
        hospital = Hospital.objects.create(hospital_name="City Hospital", address="123 Road", city="City", state="ST", contact_number="123")
        station = Station.objects.create(hospital=hospital, station_name="Station A", latitude=40.7, longitude=-74.0)
        ambulance = Ambulance.objects.create(ambulance_number="AMB-D1", hospital=hospital, station=station, status="ACTIVE")
        
        # 2. Assign driver to ambulance (sets availability to False)
        DriverAssignment.objects.create(driver=self.driver, ambulance=ambulance)
        self.driver.availability = False
        self.driver.save()

        # 3. Create active mission for driver and ambulance
        citizen_role = Role.objects.get_or_create(name='EMERGENCY_REQUESTOR')[0]
        citizen_user = User.objects.create_user(email='citizen_test@g.com', name='Citizen', password='Password123!', role=citizen_role)
        req = EmergencyRequest.objects.create(
            requester_name="Patient A", contact_number="555-999-9999", emergency_type="Stroke",
            priority="CRITICAL", pickup_location="789 Market St", latitude=40.7, longitude=-74.0,
            status="ASSIGNED", created_by=citizen_user
        )
        Mission.objects.create(
            emergency_request=req,
            ambulance=ambulance,
            driver=self.driver,
            status='ASSIGNED'
        )

        # 4. Attempt manual driver PATCH update to set availability = True
        url = reverse('driver-detail', kwargs={'pk': self.driver.pk})
        data = {
            "name": self.driver.user.name,
            "email": self.driver.user.email,
            "contact": self.driver.contact,
            "license_number": self.driver.license_number,
            "availability": True
        }
        self.client.force_authenticate(user=self.admin_user)
        response = self.client.patch(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("availability", response.data)
        self.assertEqual(response.data["availability"][0], "Cannot mark driver as available while they are on an active mission.")

    def test_delete_driver_cascade(self):
        from django.utils import timezone
        
        # 1. Create a dummy ambulance for testing active assignments
        hospital = Hospital.objects.create(hospital_name="City Hospital", address="123 Road", city="City", state="ST", contact_number="123")
        station = Station.objects.create(hospital=hospital, station_name="Station A", latitude=40.7, longitude=-74.0)
        ambulance = Ambulance.objects.create(ambulance_number="AMB-DEL-D", hospital=hospital, station=station, status="ACTIVE")

        # 2. Make driver active (assign them)
        DriverAssignment.objects.create(driver=self.driver, ambulance=ambulance)
        
        # 3. Attempt to delete active driver
        url = reverse('driver-detail', kwargs={'pk': self.driver.pk})
        self.client.force_authenticate(user=self.admin_user)
        response = self.client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data['detail'], "Active drivers cannot be deleted. Unassign the driver from their ambulance first.")

        # 4. Unassign driver (close assignment)
        active_assignment = DriverAssignment.objects.get(driver=self.driver, ambulance=ambulance, end_time__isnull=True)
        active_assignment.end_time = timezone.now()
        active_assignment.save()

        # 5. Delete non-active driver
        response = self.client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)

        # 6. Verify Driver, User, and Assignments are deleted/cascade deleted
        self.assertFalse(Driver.objects.filter(pk=self.driver.pk).exists())
        self.assertFalse(User.objects.filter(pk=self.driver_user.pk).exists())
        self.assertFalse(DriverAssignment.objects.filter(driver=self.driver).exists())



class ShiftCertificationAPITests(APITestCase):

    def setUp(self):
        self.admin_role = Role.objects.create(name='HOSPITAL_ADMINISTRATOR')
        self.fleet_role = Role.objects.create(name='FLEET_MANAGER')
        self.dispatcher_role = Role.objects.create(name='DISPATCHER')
        self.driver_role = Role.objects.create(name='DRIVER')

        self.admin_user = User.objects.create_user(email='admin@h.org', name='Admin', password='Password123!', role=self.admin_role)
        self.fleet_user = User.objects.create_user(email='fleet@h.org', name='Fleet', password='Password123!', role=self.fleet_role)
        self.dispatcher_user = User.objects.create_user(email='disp@h.org', name='Disp', password='Password123!', role=self.dispatcher_role)
        self.driver_user = User.objects.create_user(email='driver@h.org', name='Driver', password='Password123!', role=self.driver_role)

        self.driver = Driver.objects.create(user=self.driver_user, contact="555-0100", license_number="DL-1111", availability=True)

    def test_shift_crud(self):
        # Create Shift
        url = reverse('shift-list')
        data = {
            "driver": str(self.driver.id),
            "start_time": "2026-06-20T08:00:00Z",
            "end_time": "2026-06-20T16:00:00Z"
        }
        self.client.force_authenticate(user=self.fleet_user)
        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        shift_id = response.data['id']

        # List shifts
        response = self.client.get(f"{url}?driver_id={self.driver.id}")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)

        # Update shift (invalid timing validation check)
        detail_url = reverse('shift-detail', kwargs={'pk': shift_id})
        invalid_data = {
            "driver": str(self.driver.id),
            "start_time": "2026-06-20T16:00:00Z",
            "end_time": "2026-06-20T08:00:00Z" # end before start
        }
        response = self.client.patch(detail_url, invalid_data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

        # Delete shift
        response = self.client.delete(detail_url)
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(Shift.objects.count(), 0)

    def test_certification_crud(self):
        # Create Certification
        url = reverse('certification-list')
        data = {
            "driver": str(self.driver.id),
            "name": "ALS Certification",
            "certificate_number": "CERT-8878",
            "issuing_authority": "Red Cross",
            "issue_date": "2026-01-01",
            "expiry_date": "2027-01-01"
        }
        self.client.force_authenticate(user=self.fleet_user)
        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        cert_id = response.data['id']

        # List certifications
        response = self.client.get(f"{url}?driver_id={self.driver.id}")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)

        # Update certification (invalid date validation check)
        detail_url = reverse('certification-detail', kwargs={'pk': cert_id})
        invalid_data = {
            "driver": str(self.driver.id),
            "name": "ALS Certification",
            "certificate_number": "CERT-8878",
            "issuing_authority": "Red Cross",
            "issue_date": "2027-01-01",
            "expiry_date": "2026-01-01" # expiry before issue
        }
        response = self.client.patch(detail_url, invalid_data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

        # Delete certification
        response = self.client.delete(detail_url)
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(Certification.objects.count(), 0)


class DispatchConsoleMissionTests(APITestCase):

    def setUp(self):
        # Roles
        self.admin_role = Role.objects.create(name='HOSPITAL_ADMINISTRATOR')
        self.dispatcher_role = Role.objects.create(name='DISPATCHER')
        self.fleet_role = Role.objects.create(name='FLEET_MANAGER')
        self.driver_role = Role.objects.create(name='DRIVER')
        self.citizen_role = Role.objects.create(name='EMERGENCY_REQUESTOR')

        # Users
        self.admin_user = User.objects.create_user(email='admin@h.org', name='Admin', password='Password123!', role=self.admin_role)
        self.disp_user = User.objects.create_user(email='disp@h.org', name='Dispatcher', password='Password123!', role=self.dispatcher_role)
        self.fleet_user = User.objects.create_user(email='fleet@h.org', name='Fleet', password='Password123!', role=self.fleet_role)
        self.driver_user = User.objects.create_user(email='driver@h.org', name='Driver', password='Password123!', role=self.driver_role)
        self.citizen_user = User.objects.create_user(email='citizen@g.com', name='Citizen', password='Password123!', role=self.citizen_role)

        # Drivers
        self.driver1 = Driver.objects.create(user=self.driver_user, contact="555-0101", license_number="DL-101", availability=True)
        
        # Hospital & Stations
        self.hospital = Hospital.objects.create(hospital_name="City Hospital", address="123 Hospital St", city="City", state="State", contact_number="1234567")
        self.station1 = Station.objects.create(hospital=self.hospital, station_name="Station A", latitude=37.774900, longitude=-122.419400)
        self.station2 = Station.objects.create(hospital=self.hospital, station_name="Station B", latitude=37.784900, longitude=-122.429400)

        # Ambulances
        self.amb1 = Ambulance.objects.create(ambulance_number="AMB-101", hospital=self.hospital, station=self.station1, type="Basic Life Support", status="ACTIVE")
        self.amb2 = Ambulance.objects.create(ambulance_number="AMB-102", hospital=self.hospital, station=self.station2, type="Advanced Life Support", status="ACTIVE")
        self.amb_maint = Ambulance.objects.create(ambulance_number="AMB-999", hospital=self.hospital, station=self.station1, type="Patient Transport", status="MAINTENANCE")

        # Assign driver1 to amb1
        DriverAssignment.objects.create(driver=self.driver1, ambulance=self.amb1)
        self.driver1.availability = False
        self.driver1.save()

        # Emergency Requests
        self.req1 = EmergencyRequest.objects.create(
            requester_name="Patient A", contact_number="555-999-9999", emergency_type="Stroke",
            priority="CRITICAL", pickup_location="789 Market St", latitude=37.774900, longitude=-122.419400,
            status="PENDING", created_by=self.citizen_user
        )
        self.req2 = EmergencyRequest.objects.create(
            requester_name="Patient B", contact_number="555-888-8888", emergency_type="Trauma",
            priority="HIGH", pickup_location="456 Mission St", latitude=37.778000, longitude=-122.422000,
            status="PENDING", created_by=self.citizen_user
        )

    def test_nearby_ambulances_endpoint(self):
        url = reverse('ambulance-nearby')
        self.client.force_authenticate(user=self.disp_user)
        
        # Test validation error
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

        # Test valid request (uses fallback or routing)
        response = self.client.get(f"{url}?latitude=37.7749&longitude=-122.4194")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(len(response.data) >= 2)
        
        # Verify distance is computed and first ambulance is nearest (amb1 is at station1 which is at 37.7749, -122.4194)
        self.assertEqual(response.data[0]['ambulance_number'], "AMB-101")
        self.assertAlmostEqual(response.data[0]['distance'], 0.0, places=1)
        self.assertEqual(response.data[0]['readiness_info'], "Ready")

    def test_mission_creation_and_lifecycle(self):
        self.client.force_authenticate(user=self.disp_user)
        
        # Create Mission
        url = reverse('mission-list')
        data = {
            "emergency_request_id": str(self.req1.id),
            "ambulance_id": str(self.amb1.id)
        }
        
        # Success creation
        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        mission_id = response.data['id']
        
        # Verify emergency request status updated to ASSIGNED
        self.req1.refresh_from_db()
        self.assertEqual(self.req1.status, "ASSIGNED")
        
        # Verify ambulance is now busy (ON_MISSION in nearby endpoint)
        nearby_url = reverse('ambulance-nearby')
        response_nearby = self.client.get(f"{nearby_url}?latitude=37.7749&longitude=-122.4194")
        self.assertEqual(response_nearby.data[0]['availability_status'], "ON_MISSION")

        # Verify duplicate dispatch fails
        response_dup = self.client.post(url, data, format='json')
        self.assertEqual(response_dup.status_code, status.HTTP_400_BAD_REQUEST)

        # Update mission status to EN_ROUTE
        detail_url = reverse('mission-detail', kwargs={'pk': mission_id})
        response = self.client.patch(detail_url, {"status": "EN_ROUTE"}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.req1.refresh_from_db()
        self.assertEqual(self.req1.status, "IN_PROGRESS")

        # Update mission status to COMPLETED
        response = self.client.patch(detail_url, {"status": "COMPLETED"}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.req1.refresh_from_db()
        self.assertEqual(self.req1.status, "COMPLETED")

    def test_mission_cancellation(self):
        self.client.force_authenticate(user=self.disp_user)
        
        # Create mission
        url = reverse('mission-list')
        data = {
            "emergency_request_id": str(self.req2.id),
            "ambulance_id": str(self.amb1.id)
        }
        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        mission_id = response.data['id']

        # Cancel mission
        detail_url = reverse('mission-detail', kwargs={'pk': mission_id})
        response = self.client.patch(detail_url, {"status": "CANCELLED"}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        # Verify emergency request reverted to PENDING
        self.req2.refresh_from_db()
        self.assertEqual(self.req2.status, "PENDING")

    def test_role_restrictions(self):
        # Citizen try to create mission
        url = reverse('mission-list')
        self.client.force_authenticate(user=self.citizen_user)
        data = {
            "emergency_request_id": str(self.req1.id),
            "ambulance_id": str(self.amb1.id)
        }
        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_mission_creation_with_driver_assignment_on_fly(self):
        self.client.force_authenticate(user=self.disp_user)
        
        # Create a second driver who is available
        driver2_user = User.objects.create_user(email='driver2_test@h.org', name='Driver 2', password='Password123!', role=self.driver_role)
        driver2 = Driver.objects.create(user=driver2_user, contact="555-0102", license_number="DL-102", availability=True)
        
        # Create Mission with driver_id specified
        url = reverse('mission-list')
        data = {
            "emergency_request_id": str(self.req2.id),
            "ambulance_id": str(self.amb2.id),
            "driver_id": str(driver2.id)
        }
        
        # Success creation
        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        
        # Verify driver is assigned to ambulance
        driver2.refresh_from_db()
        self.assertEqual(driver2.availability, False)
        
        # Verify assignment was created
        assignment_exists = DriverAssignment.objects.filter(driver=driver2, ambulance=self.amb2, end_time__isnull=True).exists()
        self.assertTrue(assignment_exists)
        
        # Verify emergency request status updated to ASSIGNED
        self.req2.refresh_from_db()
        self.assertEqual(self.req2.status, "ASSIGNED")

    def test_dispatcher_can_assign_driver(self):
        self.client.force_authenticate(user=self.disp_user)
        
        # Create a new available driver
        driver3_user = User.objects.create_user(email='driver3_test@h.org', name='Driver 3', password='Password123!', role=self.driver_role)
        driver3 = Driver.objects.create(user=driver3_user, contact="555-0103", license_number="DL-103", availability=True)
        
        url = reverse('ambulance-assign-driver', kwargs={'pk': str(self.amb2.id)})
        data = {
            "driver_id": str(driver3.id)
        }
        
        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        # Verify assignment was created
        assignment_exists = DriverAssignment.objects.filter(driver=driver3, ambulance=self.amb2, end_time__isnull=True).exists()
        self.assertTrue(assignment_exists)

    def test_request_status_to_pending_cancels_mission(self):
        self.client.force_authenticate(user=self.disp_user)
        url = reverse('mission-list')
        data = {
            "emergency_request_id": str(self.req2.id),
            "ambulance_id": str(self.amb1.id)
        }
        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        mission_id = response.data['id']
        
        # Verify request status became ASSIGNED
        self.req2.refresh_from_db()
        self.assertEqual(self.req2.status, "ASSIGNED")
        
        # Now dispatcher updates request status directly to PENDING
        req_url = reverse('emergency-request-detail', kwargs={'pk': str(self.req2.id)})
        req_data = {
            "status": "PENDING"
        }
        response = self.client.patch(req_url, req_data, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        # Verify the mission is now CANCELLED
        mission = Mission.objects.get(id=mission_id)
        self.assertEqual(mission.status, "CANCELLED")

    def test_request_status_to_completed_completes_mission(self):
        self.client.force_authenticate(user=self.disp_user)
        # Create a mission
        url = reverse('mission-list')
        data = {
            "emergency_request_id": str(self.req2.id),
            "ambulance_id": str(self.amb1.id)
        }
        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        mission_id = response.data['id']
        
        # Now dispatcher updates request status directly to COMPLETED
        req_url = reverse('emergency-request-detail', kwargs={'pk': str(self.req2.id)})
        req_data = {
            "status": "COMPLETED"
        }
        response = self.client.patch(req_url, req_data, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        # Verify the mission is now COMPLETED
        mission = Mission.objects.get(id=mission_id)
        self.assertEqual(mission.status, "COMPLETED")

    def test_cannot_transition_status_to_assigned_directly(self):
        self.client.force_authenticate(user=self.disp_user)
        req_url = reverse('emergency-request-detail', kwargs={'pk': str(self.req2.id)})
        req_data = {
            "status": "ASSIGNED"
        }
        response = self.client.patch(req_url, req_data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Direct status transition to ASSIGNED or IN_PROGRESS is not allowed", response.data['detail'])

    def test_cannot_transition_status_to_in_progress_directly(self):
        self.client.force_authenticate(user=self.disp_user)
        req_url = reverse('emergency-request-detail', kwargs={'pk': str(self.req2.id)})
        req_data = {
            "status": "IN_PROGRESS"
        }
        response = self.client.patch(req_url, req_data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Direct status transition to ASSIGNED or IN_PROGRESS is not allowed", response.data['detail'])

    def test_cannot_assign_driver_while_on_mission(self):
        Mission.objects.create(
            emergency_request=self.req1,
            ambulance=self.amb1,
            driver=self.driver1,
            status='ASSIGNED'
        )
        self.client.force_authenticate(user=self.fleet_user)
        url = reverse('ambulance-assign-driver', kwargs={'pk': str(self.amb1.id)})
        response = self.client.post(url, {"driver_id": None}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Cannot change driver assignment while the ambulance is on an active mission.", response.data['non_field_errors'][0])

    def test_cannot_transfer_station_while_on_mission(self):
        Mission.objects.create(
            emergency_request=self.req1,
            ambulance=self.amb1,
            driver=self.driver1,
            status='ASSIGNED'
        )
        self.client.force_authenticate(user=self.fleet_user)
        url = reverse('ambulance-transfer', kwargs={'pk': str(self.amb1.id)})
        response = self.client.post(url, {"station_id": self.station2.id}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Cannot transfer station while the ambulance is on an active mission.", response.data['non_field_errors'][0])

    def test_cannot_change_status_while_on_mission(self):
        Mission.objects.create(
            emergency_request=self.req1,
            ambulance=self.amb1,
            driver=self.driver1,
            status='ASSIGNED'
        )
        self.client.force_authenticate(user=self.fleet_user)
        url = reverse('ambulance-change-status', kwargs={'pk': str(self.amb1.id)})
        response = self.client.post(url, {"status": "MAINTENANCE"}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Cannot change status while the ambulance is on an active mission.", response.data['non_field_errors'][0])

    def test_cannot_edit_ambulance_details_while_on_mission(self):
        Mission.objects.create(
            emergency_request=self.req1,
            ambulance=self.amb1,
            driver=self.driver1,
            status='ASSIGNED'
        )
        self.client.force_authenticate(user=self.fleet_user)
        url = reverse('ambulance-detail', kwargs={'pk': str(self.amb1.id)})
        response = self.client.patch(url, {"ambulance_number": "NEW-NUM"}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Cannot modify ambulance details while it is on an active mission.", response.data['non_field_errors'][0])

    def test_cannot_delete_ambulance_while_on_mission(self):
        Mission.objects.create(
            emergency_request=self.req1,
            ambulance=self.amb1,
            driver=self.driver1,
            status='ASSIGNED'
        )
        self.client.force_authenticate(user=self.fleet_user)
        url = reverse('ambulance-detail', kwargs={'pk': str(self.amb1.id)})
        response = self.client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Cannot delete ambulance while it is on an active mission.", response.data['non_field_errors'][0])

    def test_ambulance_lifecycle_transitions_and_sync(self):
        # 1. Dispatch creates mission, ambulance transitions to ASSIGNED
        self.client.force_authenticate(user=self.disp_user)
        url = reverse('mission-list')
        data = {
            "emergency_request_id": str(self.req1.id),
            "ambulance_id": str(self.amb1.id)
        }
        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        mission_id = response.data['id']
        
        self.amb1.refresh_from_db()
        self.assertEqual(self.amb1.lifecycle_status, 'ASSIGNED')

        # 2. Check transition-lifecycle endpoint (Driver transitions to EN_ROUTE)
        transition_url = reverse('ambulance-transition-lifecycle', kwargs={'pk': str(self.amb1.id)})
        self.client.force_authenticate(user=self.driver_user)
        
        # Valid transition
        response = self.client.post(transition_url, {"status": "EN_ROUTE", "remarks": "Driving to scene"}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.amb1.refresh_from_db()
        self.assertEqual(self.amb1.lifecycle_status, 'EN_ROUTE')
        
        # Sync: Mission status should be EN_ROUTE, Request status should be IN_PROGRESS
        mission = Mission.objects.get(id=mission_id)
        self.assertEqual(mission.status, 'EN_ROUTE')
        self.req1.refresh_from_db()
        self.assertEqual(self.req1.status, 'IN_PROGRESS')

        # 3. Invalid transition: cannot transition directly from EN_ROUTE to PATIENT_ONBOARD
        response = self.client.post(transition_url, {"status": "PATIENT_ONBOARD"}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        
        # 4. Sequential transitions
        # EN_ROUTE -> AT_INCIDENT
        response = self.client.post(transition_url, {"status": "AT_INCIDENT"}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # AT_INCIDENT -> PATIENT_ONBOARD
        response = self.client.post(transition_url, {"status": "PATIENT_ONBOARD"}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # PATIENT_ONBOARD -> HOSPITAL_ARRIVAL
        response = self.client.post(transition_url, {"status": "HOSPITAL_ARRIVAL"}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # HOSPITAL_ARRIVAL -> SANITIZATION
        response = self.client.post(transition_url, {"status": "SANITIZATION"}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # SANITIZATION -> READY (automatically transitions to AVAILABLE and completes mission)
        response = self.client.post(transition_url, {"status": "READY"}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        self.amb1.refresh_from_db()
        self.assertEqual(self.amb1.lifecycle_status, 'AVAILABLE')
        mission.refresh_from_db()
        self.assertEqual(mission.status, 'COMPLETED')
        self.req1.refresh_from_db()
        self.assertEqual(self.req1.status, 'COMPLETED')

        # 6. Verify timeline history log was populated
        history_url = reverse('ambulance-lifecycle-history', kwargs={'pk': str(self.amb1.id)})
        response = self.client.get(history_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(len(response.data) > 0)
        # Sort history: logs are sorted newest first, so last transition (to AVAILABLE) is first
        self.assertEqual(response.data[0]['to_status'], 'AVAILABLE')

    def test_lifecycle_transition_rbac(self):
        # Create mission
        Mission.objects.create(
            emergency_request=self.req1,
            ambulance=self.amb1,
            driver=self.driver1,
            status='ASSIGNED'
        )
        self.amb1.lifecycle_status = 'ASSIGNED'
        self.amb1.save()
        
        transition_url = reverse('ambulance-transition-lifecycle', kwargs={'pk': str(self.amb1.id)})
        
        # Fleet manager has no access to transition (only dispatcher, admin, assigned driver)
        self.client.force_authenticate(user=self.fleet_user)
        response = self.client.post(transition_url, {"status": "EN_ROUTE"}, format='json')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        
        # Unassigned driver has no access to transition
        other_driver_user = User.objects.create_user(email='driver2@h.org', name='Driver 2', password='Password123!', role=self.driver_role)
        self.client.force_authenticate(user=other_driver_user)
        response = self.client.post(transition_url, {"status": "EN_ROUTE"}, format='json')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        
        # Dispatcher has access
        self.client.force_authenticate(user=self.disp_user)
        response = self.client.post(transition_url, {"status": "EN_ROUTE"}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)


class DigitalTripManagementTests(APITestCase):
    def setUp(self):
        # Create roles
        self.admin_role = Role.objects.create(name='HOSPITAL_ADMINISTRATOR')
        self.disp_role = Role.objects.create(name='DISPATCHER')
        self.driver_role = Role.objects.create(name='DRIVER')

        # Create users
        self.admin_user = User.objects.create_user(email='admin@h.org', name='Admin', password='Password123!', role=self.admin_role)
        self.disp_user = User.objects.create_user(email='disp@h.org', name='Dispatcher', password='Password123!', role=self.disp_role)
        self.driver_user = User.objects.create_user(email='driver@h.org', name='Rahul Driver', password='Password123!', role=self.driver_role)
        self.driver_user2 = User.objects.create_user(email='driver2@h.org', name='Bob Driver', password='Password123!', role=self.driver_role)

        # Create Hospital
        self.hosp = Hospital.objects.create(
            hospital_name="City Hospital",
            address="123 Main St",
            city="Metropolis",
            state="NY",
            contact_number="555-0199"
        )
        
        # Create Stations
        self.station1 = Station.objects.create(
            hospital=self.hosp,
            station_name="North Station",
            latitude=40.7128,
            longitude=-74.0060
        )
        self.station2 = Station.objects.create(
            hospital=self.hosp,
            station_name="East Station",
            latitude=40.7200,
            longitude=-73.9900
        )

        # Create Ambulance
        self.amb = Ambulance.objects.create(
            ambulance_number="AMB-100",
            hospital=self.hosp,
            station=self.station1,
            type='ALS',
            status='ACTIVE',
            lifecycle_status='AVAILABLE'
        )

        # Create Drivers
        self.driver1 = Driver.objects.create(
            user=self.driver_user,
            license_number="DL-100",
            contact="111-222-3333",
            availability=True
        )
        self.driver2 = Driver.objects.create(
            user=self.driver_user2,
            license_number="DL-200",
            contact="111-222-4444",
            availability=True
        )

        # Assign driver1 to ambulance
        DriverAssignment.objects.create(driver=self.driver1, ambulance=self.amb)
        self.driver1.availability = False
        self.driver1.save()

        # Create EmergencyRequest (incident location: 40.7300, -73.9800)
        self.req = EmergencyRequest.objects.create(
            requester_name="John Requestor",
            contact_number="555-010-0100",
            emergency_type="Cardiac Arrest",
            priority="CRITICAL",
            pickup_location="Times Square",
            latitude=40.7300,
            longitude=-73.9800,
            status='PENDING',
            created_by=self.disp_user
        )

    def test_trip_lifecycle_and_distance_calculation(self):
        # 1. Dispatch/Create Mission -> Trip should be auto-created in ACTIVE status
        self.client.force_authenticate(user=self.disp_user)
        dispatch_url = reverse('mission-list')
        response = self.client.post(dispatch_url, {
            "emergency_request_id": str(self.req.id),
            "ambulance_id": str(self.amb.id),
            "driver_id": str(self.driver1.id)
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        mission_id = response.data['id']
        
        # Verify trip creation
        trip = Trip.objects.filter(mission_id=mission_id).first()
        self.assertIsNotNone(trip)
        self.assertEqual(trip.status, 'ACTIVE')
        self.assertIsNone(trip.start_time)
        self.assertIsNone(trip.end_time)
        self.assertEqual(trip.distance_km, 0.0)

        # 2. Driver departs (transition to EN_ROUTE) -> start_time should be set
        self.client.force_authenticate(user=self.driver_user)
        transition_url = reverse('ambulance-transition-lifecycle', kwargs={'pk': str(self.amb.id)})
        response = self.client.post(transition_url, {"status": "EN_ROUTE"}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        trip.refresh_from_db()
        self.assertIsNotNone(trip.start_time)
        self.assertEqual(trip.status, 'ACTIVE')

        # 3. Subsequent transitions
        response = self.client.post(transition_url, {"status": "AT_INCIDENT"}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        response = self.client.post(transition_url, {"status": "PATIENT_ONBOARD"}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        response = self.client.post(transition_url, {"status": "HOSPITAL_ARRIVAL"}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        response = self.client.post(transition_url, {"status": "SANITIZATION"}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        # Transition to READY completes mission and should finalize trip
        response = self.client.post(transition_url, {"status": "READY"}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        trip.refresh_from_db()
        self.assertEqual(trip.status, 'COMPLETED')
        self.assertIsNotNone(trip.end_time)
        self.assertTrue(trip.distance_km > 0.0)
        self.assertIn("Trip completed successfully", trip.summary)
        self.assertIn("Rahul Driver", trip.summary)
        self.assertIn("AMB-100", trip.summary)

    def test_mid_mission_cancellation(self):
        # Dispatch
        self.client.force_authenticate(user=self.disp_user)
        dispatch_url = reverse('mission-list')
        response = self.client.post(dispatch_url, {
            "emergency_request_id": str(self.req.id),
            "ambulance_id": str(self.amb.id),
            "driver_id": str(self.driver1.id)
        }, format='json')
        mission_id = response.data['id']
        
        # Transition to EN_ROUTE
        self.client.force_authenticate(user=self.driver_user)
        transition_url = reverse('ambulance-transition-lifecycle', kwargs={'pk': str(self.amb.id)})
        self.client.post(transition_url, {"status": "EN_ROUTE"}, format='json')

        # Cancel/abort from Dispatcher (transition to AVAILABLE)
        self.client.force_authenticate(user=self.disp_user)
        response = self.client.post(transition_url, {"status": "AVAILABLE", "remarks": "False alarm"}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        trip = Trip.objects.get(mission_id=mission_id)
        self.assertEqual(trip.status, 'CANCELLED')
        self.assertIn("Trip cancelled midway", trip.summary)
        self.assertIn("Phase reached: En Route", trip.summary)
        self.assertTrue(trip.distance_km > 0.0)

    def test_trip_api_rbac_and_filters(self):
        # Setup finished Trip
        mission = Mission.objects.create(
            emergency_request=self.req,
            ambulance=self.amb,
            driver=self.driver1,
            status='COMPLETED'
        )
        trip = Trip.objects.get(mission=mission)
        trip.status = 'COMPLETED'
        trip.save()

        # Test list endpoint /api/trips/
        # 1. Driver should be forbidden
        self.client.force_authenticate(user=self.driver_user)
        response = self.client.get(reverse('trip-list'))
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        # 2. Dispatcher should be allowed
        self.client.force_authenticate(user=self.disp_user)
        response = self.client.get(reverse('trip-list'))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)

        # Test /api/trips/my-trips/
        # 1. Driver should see their own trips
        self.client.force_authenticate(user=self.driver_user)
        response = self.client.get(reverse('trip-my-trips'))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)

        # 2. Other driver should not see driver1's trips in my-trips
        self.client.force_authenticate(user=self.driver_user2)
        response = self.client.get(reverse('trip-my-trips'))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 0)

        # Test detail view
        detail_url = reverse('trip-detail', kwargs={'pk': str(trip.id)})
        # 1. Driver 1 (assigned driver) allowed
        self.client.force_authenticate(user=self.driver_user)
        response = self.client.get(detail_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        # 2. Driver 2 (unrelated driver) forbidden
        self.client.force_authenticate(user=self.driver_user2)
        response = self.client.get(detail_url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


class GPSTrackingTests(APITestCase):
    def setUp(self):
        # Setup roles
        self.admin_role, _ = Role.objects.get_or_create(name='HOSPITAL_ADMINISTRATOR')
        self.disp_role, _ = Role.objects.get_or_create(name='DISPATCHER')
        self.driver_role, _ = Role.objects.get_or_create(name='DRIVER')

        # Setup users
        self.admin_user = User.objects.create_user(email='admin_gps@h.org', name='Admin', password='Password123!', role=self.admin_role)
        self.disp_user = User.objects.create_user(email='disp_gps@h.org', name='Dispatcher', password='Password123!', role=self.disp_role)
        self.driver_user = User.objects.create_user(email='driver_gps@h.org', name='Rahul Driver', password='Password123!', role=self.driver_role)
        self.driver_user2 = User.objects.create_user(email='driver2_gps@h.org', name='Bob Driver', password='Password123!', role=self.driver_role)

        self.hosp = Hospital.objects.create(hospital_name="City Hospital", address="123 Main St", city="City", state="ST", contact_number="555-0199")
        self.station = Station.objects.create(hospital=self.hosp, station_name="North Station", latitude=40.7128, longitude=-74.0060)
        self.amb = Ambulance.objects.create(ambulance_number="AMB-500", hospital=self.hosp, station=self.station, type='Basic Life Support', status='ACTIVE')
        
        self.driver1 = Driver.objects.create(user=self.driver_user, license_number="DL-100-GPS", contact="111-222-3333", availability=True)
        self.driver2 = Driver.objects.create(user=self.driver_user2, license_number="DL-200-GPS", contact="111-222-4444", availability=True)

        # Assign driver1 to ambulance
        DriverAssignment.objects.create(driver=self.driver1, ambulance=self.amb)
        self.driver1.availability = False
        self.driver1.save()

        # Emergency Request
        self.req = EmergencyRequest.objects.create(
            requester_name="John Requestor", contact_number="555-010-0100", emergency_type="Cardiac Arrest",
            priority="CRITICAL", pickup_location="Times Square", latitude=40.7300, longitude=-73.9800,
            status='PENDING', created_by=self.disp_user
        )

    def test_update_location_assigned_driver(self):
        # 1. Dispatch driver -> Creates active mission & active trip
        self.client.force_authenticate(user=self.disp_user)
        response = self.client.post(reverse('mission-list'), {
            "emergency_request_id": str(self.req.id),
            "ambulance_id": str(self.amb.id),
            "driver_id": str(self.driver1.id)
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        mission_id = response.data['id']
        trip = Trip.objects.get(mission_id=mission_id)

        # 2. Driver posts location update
        self.client.force_authenticate(user=self.driver_user)
        url = reverse('ambulance-update-location', kwargs={'pk': str(self.amb.id)})
        data = {
            "latitude": 40.7150,
            "longitude": -74.0010
        }
        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['current_latitude'], 40.7150)
        self.assertEqual(response.data['current_longitude'], -74.0010)
        self.assertEqual(response.data['trip_id'], str(trip.id))

        # Check model fields
        self.amb.refresh_from_db()
        self.assertEqual(float(self.amb.current_latitude), 40.7150)
        self.assertEqual(float(self.amb.current_longitude), -74.0010)

        # Check GPSLog creation
        gps_logs = self.amb.gps_logs.all()
        self.assertEqual(gps_logs.count(), 1)
        self.assertEqual(gps_logs.first().trip, trip)
        self.assertEqual(float(gps_logs.first().latitude), 40.7150)

    def test_update_location_permissions(self):
        # Unassigned driver tries to update
        self.client.force_authenticate(user=self.driver_user2)
        url = reverse('ambulance-update-location', kwargs={'pk': str(self.amb.id)})
        data = {"latitude": 40.7150, "longitude": -74.0010}
        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        # Dispatcher tries to update -> allowed
        self.client.force_authenticate(user=self.disp_user)
        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_mission_route_endpoint(self):
        self.client.force_authenticate(user=self.disp_user)
        response = self.client.post(reverse('mission-list'), {
            "emergency_request_id": str(self.req.id),
            "ambulance_id": str(self.amb.id),
            "driver_id": str(self.driver1.id)
        }, format='json')
        mission_id = response.data['id']

        # Get route
        self.client.force_authenticate(user=self.driver_user)
        route_url = reverse('mission-route', kwargs={'pk': mission_id})
        response = self.client.get(route_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("route", response.data)
        self.assertIn("distance_km", response.data)
        self.assertIn("eta_minutes", response.data)
        self.assertIn("destination", response.data)

    def test_trip_route_history(self):
        self.client.force_authenticate(user=self.disp_user)
        response = self.client.post(reverse('mission-list'), {
            "emergency_request_id": str(self.req.id),
            "ambulance_id": str(self.amb.id),
            "driver_id": str(self.driver1.id)
        }, format='json')
        mission_id = response.data['id']
        trip = Trip.objects.get(mission_id=mission_id)

        # Update location to add log
        self.client.force_authenticate(user=self.driver_user)
        url = reverse('ambulance-update-location', kwargs={'pk': str(self.amb.id)})
        self.client.post(url, {"latitude": 40.7150, "longitude": -74.0010}, format='json')

        # Get route history
        history_url = reverse('trip-route-history', kwargs={'pk': str(trip.id)})
        response = self.client.get(history_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(float(response.data[0]['latitude']), 40.7150)







