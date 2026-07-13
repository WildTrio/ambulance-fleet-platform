from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from django.contrib.auth import get_user_model
from django.utils import timezone
from datetime import timedelta
from authentication.models import Role
from ambulances.models import (
    Hospital, Station, Ambulance, Driver, DriverAssignment,
    Shift, EmergencyRequest, Mission, Trip, AmbulanceLifecycleLog
)

User = get_user_model()

class AmbulanceDashboardAPITests(APITestCase):

    def setUp(self):
        # Create roles
        self.admin_role, _ = Role.objects.get_or_create(name='HOSPITAL_ADMINISTRATOR')
        self.dispatcher_role, _ = Role.objects.get_or_create(name='DISPATCHER')
        self.fleet_role, _ = Role.objects.get_or_create(name='FLEET_MANAGER')
        self.driver_role, _ = Role.objects.get_or_create(name='DRIVER')
        self.requestor_role, _ = Role.objects.get_or_create(name='EMERGENCY_REQUESTOR')

        # Create users
        self.admin_user = User.objects.create_user(email='admin_db@h.org', name='Admin User', password='Password123!', role=self.admin_role)
        self.dispatcher_user = User.objects.create_user(email='disp_db@h.org', name='Dispatcher User', password='Password123!', role=self.dispatcher_role)
        self.fleet_user = User.objects.create_user(email='fleet_db@h.org', name='Fleet User', password='Password123!', role=self.fleet_role)
        self.driver_user = User.objects.create_user(email='drv_db@h.org', name='Driver User', password='Password123!', role=self.driver_role)
        self.citizen_user = User.objects.create_user(email='cit_db@gmail.com', name='Citizen User', password='Password123!', role=self.requestor_role)

        # Base Entities
        self.hospital = Hospital.objects.create(
            hospital_name="Dashboard Central Hospital",
            address="123 Hospital Lane",
            city="City",
            state="ST",
            contact_number="123-456"
        )
        self.station = Station.objects.create(
            hospital=self.hospital,
            station_name="Base Station",
            latitude=21.820600,
            longitude=75.609400
        )

    def test_dashboard_authentication_required(self):
        urls = [
            reverse('dispatcher-dashboard'),
            reverse('fleet-dashboard'),
            reverse('admin-dashboard')
        ]
        for url in urls:
            response = self.client.get(url)
            self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_dispatcher_dashboard_role_access(self):
        url = reverse('dispatcher-dashboard')
        
        # Dispatcher and Admin succeed
        for user in [self.dispatcher_user, self.admin_user]:
            self.client.force_authenticate(user=user)
            response = self.client.get(url)
            self.assertEqual(response.status_code, status.HTTP_200_OK)
            self.client.logout()

        # Others fail
        for user in [self.fleet_user, self.driver_user, self.citizen_user]:
            self.client.force_authenticate(user=user)
            response = self.client.get(url)
            self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
            self.client.logout()

    def test_fleet_dashboard_role_access(self):
        url = reverse('fleet-dashboard')
        
        # Fleet Manager and Admin succeed
        for user in [self.fleet_user, self.admin_user]:
            self.client.force_authenticate(user=user)
            response = self.client.get(url)
            self.assertEqual(response.status_code, status.HTTP_200_OK)
            self.client.logout()

        # Others fail
        for user in [self.dispatcher_user, self.driver_user, self.citizen_user]:
            self.client.force_authenticate(user=user)
            response = self.client.get(url)
            self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
            self.client.logout()

    def test_admin_dashboard_role_access(self):
        url = reverse('admin-dashboard')
        
        # Admin succeeds
        self.client.force_authenticate(user=self.admin_user)
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.client.logout()

        # Others fail
        for user in [self.dispatcher_user, self.fleet_user, self.driver_user, self.citizen_user]:
            self.client.force_authenticate(user=user)
            response = self.client.get(url)
            self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
            self.client.logout()

    def test_dashboards_empty_state(self):
        # Assert endpoints handle empty database without crashing or division by zero errors
        self.client.force_authenticate(user=self.admin_user)

        # 1. Dispatcher
        response = self.client.get(reverse('dispatcher-dashboard'))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['pending_requests_count'], 0)
        self.assertEqual(response.data['active_missions_count'], 0)
        self.assertEqual(response.data['available_ambulances_count'], 0)

        # 2. Fleet
        response = self.client.get(reverse('fleet-dashboard'))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['fleet_summary']['total_ambulances'], 0)
        self.assertEqual(response.data['fleet_summary']['availability_rate'], 0.0)
        self.assertEqual(len(response.data['maintenance_list']), 0)
        self.assertEqual(response.data['driver_availability']['total_drivers'], 0)

        # 3. Admin
        response = self.client.get(reverse('admin-dashboard'))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['response_time_metrics']['average_response_time_minutes'], 0.0)
        self.assertEqual(response.data['mission_statistics']['total_missions'], 0)
        self.assertEqual(response.data['fleet_utilization']['active_utilization_rate'], 0.0)

    def test_dispatcher_dashboard_populated(self):
        # Create some data
        req = EmergencyRequest.objects.create(
            requester_name="John Doe", contact_number="12345", emergency_type="Heart",
            priority="CRITICAL", pickup_location="Location A", latitude=21.8206, longitude=75.6094,
            status="PENDING", created_by=self.dispatcher_user
        )
        amb = Ambulance.objects.create(
            ambulance_number="AMB-D1", hospital=self.hospital, station=self.station,
            type="Basic Life Support", status="ACTIVE", lifecycle_status="AVAILABLE"
        )
        drv = Driver.objects.create(user=self.driver_user, contact="999", license_number="LIC999")
        DriverAssignment.objects.create(driver=drv, ambulance=amb)

        req_assigned = EmergencyRequest.objects.create(
            requester_name="Jane Smith", contact_number="54321", emergency_type="Injury",
            priority="HIGH", pickup_location="Location B", latitude=21.8206, longitude=75.6094,
            status="ASSIGNED", created_by=self.dispatcher_user
        )
        amb_busy = Ambulance.objects.create(
            ambulance_number="AMB-D2", hospital=self.hospital, station=self.station,
            type="Advanced Life Support", status="ACTIVE", lifecycle_status="ASSIGNED"
        )
        mission = Mission.objects.create(
            emergency_request=req_assigned, ambulance=amb_busy, driver=drv, status="ASSIGNED"
        )

        self.client.force_authenticate(user=self.dispatcher_user)
        response = self.client.get(reverse('dispatcher-dashboard'))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        self.assertEqual(response.data['pending_requests_count'], 1)
        self.assertEqual(response.data['pending_requests'][0]['requester_name'], "John Doe")
        
        self.assertEqual(response.data['active_missions_count'], 1)
        self.assertEqual(response.data['active_missions'][0]['id'], str(mission.id))
        
        self.assertEqual(response.data['available_ambulances_count'], 1)
        self.assertEqual(response.data['available_ambulances'][0]['ambulance_number'], "AMB-D1")

    def test_fleet_dashboard_populated(self):
        amb = Ambulance.objects.create(
            ambulance_number="AMB-F1", hospital=self.hospital, station=self.station,
            type="Basic Life Support", status="ACTIVE", lifecycle_status="AVAILABLE"
        )
        amb_maint = Ambulance.objects.create(
            ambulance_number="AMB-F2", hospital=self.hospital, station=self.station,
            type="Basic Life Support", status="MAINTENANCE", lifecycle_status="AVAILABLE"
        )
        amb_sani = Ambulance.objects.create(
            ambulance_number="AMB-F3", hospital=self.hospital, station=self.station,
            type="Basic Life Support", status="ACTIVE", lifecycle_status="SANITIZATION"
        )

        drv = Driver.objects.create(user=self.driver_user, contact="123", license_number="L123", availability=True)
        # Shift
        now = timezone.now()
        Shift.objects.create(driver=drv, start_time=now - timedelta(hours=1), end_time=now + timedelta(hours=3))

        self.client.force_authenticate(user=self.fleet_user)
        response = self.client.get(reverse('fleet-dashboard'))
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.assertEqual(response.data['fleet_summary']['total_ambulances'], 3)
        self.assertEqual(response.data['fleet_summary']['by_status']['ACTIVE'], 2)
        self.assertEqual(response.data['fleet_summary']['by_status']['MAINTENANCE'], 1)
        
        # Availability rate: (available & active) / total active * 100
        # Total active is 2 (AMB-F1, AMB-F3). Available & active is 1 (AMB-F1). AMB-F3 is SANITIZATION.
        # Rate: 1 / 2 * 100 = 50.0%
        self.assertEqual(response.data['fleet_summary']['availability_rate'], 50.0)

        # Maintenance list should include AMB-F2 (MAINTENANCE status) and AMB-F3 (SANITIZATION lifecycle status)
        maint_ids = [item['id'] for item in response.data['maintenance_list']]
        self.assertIn(str(amb_maint.id), maint_ids)
        self.assertIn(str(amb_sani.id), maint_ids)

        # Driver availability
        self.assertEqual(response.data['driver_availability']['total_drivers'], 1)
        self.assertEqual(response.data['driver_availability']['available_drivers_count'], 1)
        self.assertEqual(response.data['driver_availability']['on_duty_count'], 1)
        self.assertEqual(response.data['driver_availability']['off_duty_count'], 0)

    def test_admin_dashboard_populated(self):
        # Create emergency request, mission and logs
        req = EmergencyRequest.objects.create(
            requester_name="Alex", contact_number="123", emergency_type="Accident",
            priority="CRITICAL", pickup_location="Loc", latitude=21.8206, longitude=75.6094,
            status="IN_PROGRESS"
        )
        amb = Ambulance.objects.create(
            ambulance_number="AMB-A1", hospital=self.hospital, station=self.station,
            type="Advanced Life Support", status="ACTIVE", lifecycle_status="AT_INCIDENT"
        )
        drv = Driver.objects.create(user=self.driver_user, contact="777", license_number="L777")
        DriverAssignment.objects.create(driver=drv, ambulance=amb)
        
        mission = Mission.objects.create(
            emergency_request=req, ambulance=amb, driver=drv, status="AT_INCIDENT"
        )

        # Create logs for response time
        # req.created_at is the start time.
        # Transition to AT_INCIDENT log:
        transition_time = req.created_at + timedelta(minutes=10)
        log = AmbulanceLifecycleLog.objects.create(
            ambulance=amb, mission=mission, from_status="EN_ROUTE", to_status="AT_INCIDENT",
            changed_by=self.admin_user
        )
        AmbulanceLifecycleLog.objects.filter(id=log.id).update(changed_at=transition_time)

        mission.status = 'COMPLETED'
        mission.save()

        # Let's create a completed trip with custom duration and distance
        Trip.objects.filter(mission=mission).update(
            status='COMPLETED',
            start_time=timezone.now() - timedelta(minutes=45),
            end_time=timezone.now() - timedelta(minutes=15),
            distance_km=8.5
        )

        # Let's check utilization rate: 1 active vehicle, 0 deployed (it's completed now and AVAILABLE)
        # So we should authenticate as Admin and request
        self.client.force_authenticate(user=self.admin_user)
        response = self.client.get(reverse('admin-dashboard'))
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        # Average Response Time should be 10.0 minutes
        self.assertEqual(response.data['response_time_metrics']['average_response_time_minutes'], 10.0)
        self.assertEqual(response.data['response_time_metrics']['by_priority']['CRITICAL'], 10.0)

        # Mission stats
        self.assertEqual(response.data['mission_statistics']['total_missions'], 1)
        self.assertEqual(response.data['mission_statistics']['completed_missions'], 1)
        self.assertEqual(response.data['mission_statistics']['success_rate'], 100.0)
        self.assertEqual(response.data['mission_statistics']['average_trip_duration_minutes'], 30.0)
        self.assertEqual(response.data['mission_statistics']['average_trip_distance_km'], 8.5)
