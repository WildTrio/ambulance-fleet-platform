from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from authentication.models import Role, User
from ambulances.models import Hospital, Station, Ambulance, Driver, DriverAssignment, EmergencyRequest, Mission
from notifications.models import Notification
from django.utils import timezone
from datetime import timedelta

class NotificationTests(APITestCase):
    def setUp(self):
        # Setup Roles
        self.admin_role, _ = Role.objects.get_or_create(name='HOSPITAL_ADMINISTRATOR')
        self.disp_role, _ = Role.objects.get_or_create(name='DISPATCHER')
        self.fm_role, _ = Role.objects.get_or_create(name='FLEET_MANAGER')
        self.driver_role, _ = Role.objects.get_or_create(name='DRIVER')

        # Setup Users
        self.admin_user = User.objects.create_user(email='admin_notif@h.org', name='Admin User', password='Password123!', role=self.admin_role)
        self.disp_user = User.objects.create_user(email='disp_notif@h.org', name='Disp User', password='Password123!', role=self.disp_role)
        self.fm_user = User.objects.create_user(email='fm_notif@h.org', name='FM User', password='Password123!', role=self.fm_role)
        self.driver_user = User.objects.create_user(email='driver_notif@h.org', name='Driver User', password='Password123!', role=self.driver_role)
        self.driver_user2 = User.objects.create_user(email='driver2_notif@h.org', name='Driver User 2', password='Password123!', role=self.driver_role)

        # Setup Models
        self.hosp = Hospital.objects.create(hospital_name="Notification Hospital", address="456 Ave", city="City", state="ST", contact_number="5550200000")
        
        # Associate users with the hospital
        self.admin_user.hospital = self.hosp
        self.admin_user.save()
        self.disp_user.hospital = self.hosp
        self.disp_user.save()
        self.fm_user.hospital = self.hosp
        self.fm_user.save()
        self.driver_user.hospital = self.hosp
        self.driver_user.save()
        self.driver_user2.hospital = self.hosp
        self.driver_user2.save()

        self.station = Station.objects.create(hospital=self.hosp, station_name="Base Station", latitude=40.7128, longitude=-74.0060)
        self.amb = Ambulance.objects.create(ambulance_number="AMB-900", hospital=self.hosp, station=self.station, type='Basic Life Support', status='ACTIVE')
        
        self.driver = Driver.objects.create(user=self.driver_user, license_number="DL-900", contact="1113335555", availability=True)
        self.driver2 = Driver.objects.create(user=self.driver_user2, license_number="DL-901", contact="1113336666", availability=True)

        DriverAssignment.objects.create(driver=self.driver, ambulance=self.amb)

    def test_new_emergency_request_creates_notifications(self):
        # 1. Dispatcher logs new emergency request
        self.client.force_authenticate(user=self.disp_user)
        req = EmergencyRequest.objects.create(
            requester_name="Jane Doe", contact_number="5550300300", emergency_type="Stroke",
            priority="CRITICAL", pickup_location="Central Park", latitude=40.7850, longitude=-73.9680,
            status='PENDING', created_by=self.disp_user
        )

        # 2. Check that notifications are created for dispatchers/admins
        notifs = Notification.objects.filter(notification_type='NEW_REQUEST')
        self.assertTrue(notifs.exists())
        # Both admin_user and disp_user should have a notification
        admin_notif = notifs.filter(user=self.admin_user).first()
        self.assertIsNotNone(admin_notif)
        self.assertIn("🚨 New Emergency Request", admin_notif.title)

    def test_dispatch_mission_creates_notifications(self):
        # Setup emergency request
        req = EmergencyRequest.objects.create(
            requester_name="Jane Doe", contact_number="5550300300", emergency_type="Stroke",
            priority="CRITICAL", pickup_location="Central Park", latitude=40.7850, longitude=-73.9680,
            status='PENDING', created_by=self.disp_user
        )

        # Dispatch mission
        self.client.force_authenticate(user=self.disp_user)
        response = self.client.post(reverse('mission-list'), {
            "emergency_request_id": str(req.id),
            "ambulance_id": str(self.amb.id),
            "driver_id": str(self.driver.id)
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        # Ambulance Assigned notification to Fleet Manager & Admin
        fm_notifs = Notification.objects.filter(user=self.fm_user, notification_type='AMBULANCE_ASSIGNED')
        self.assertTrue(fm_notifs.exists())

        # Driver Assigned notification to assigned driver
        driver_notifs = Notification.objects.filter(user=self.driver_user, notification_type='DRIVER_ASSIGNED')
        self.assertTrue(driver_notifs.exists())

        # Other driver has no assignment notification
        driver2_notifs = Notification.objects.filter(user=self.driver_user2, notification_type='DRIVER_ASSIGNED')
        self.assertFalse(driver2_notifs.exists())

    def test_mission_started_notifies_dispatcher_and_requester(self):
        # Create mission
        req = EmergencyRequest.objects.create(
            requester_name="Jane Doe", contact_number="5550300300", emergency_type="Stroke",
            priority="CRITICAL", pickup_location="Central Park", latitude=40.7850, longitude=-73.9680,
            status='PENDING', created_by=self.disp_user
        )
        mission = Mission.objects.create(
            emergency_request=req, ambulance=self.amb, driver=self.driver, status='ASSIGNED'
        )

        # Transition status to EN_ROUTE
        mission.status = 'EN_ROUTE'
        mission.save()

        # Check Mission Started Notifications
        disp_notifs = Notification.objects.filter(user=self.disp_user, notification_type='MISSION_STARTED')
        self.assertTrue(disp_notifs.exists())

    def test_escalation_logic_creates_alerts(self):
        # Create request created 5 minutes ago (lte 3 minutes ago)
        old_time = timezone.now() - timedelta(minutes=5)
        req = EmergencyRequest.objects.create(
            requester_name="Jane Doe", contact_number="5550300300", emergency_type="Stroke",
            priority="CRITICAL", pickup_location="Central Park", latitude=40.7850, longitude=-73.9680,
            status='PENDING', created_by=self.disp_user
        )
        # Update created_at using filter update (since auto_now_add blocks direct save assignment)
        EmergencyRequest.objects.filter(id=req.id).update(created_at=old_time)

        # Dispatcher calls notifications API
        self.client.force_authenticate(user=self.disp_user)
        response = self.client.get(reverse('notification-list'))
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        # Check if an ESCALATION notification was created
        esc_notifs = Notification.objects.filter(user=self.disp_user, notification_type='ESCALATION')
        self.assertTrue(esc_notifs.exists())

    def test_mark_all_read(self):
        # Create notifications
        Notification.objects.create(user=self.disp_user, title="Title 1", message="Msg 1", notification_type='NEW_REQUEST')
        Notification.objects.create(user=self.disp_user, title="Title 2", message="Msg 2", notification_type='NEW_REQUEST')

        self.client.force_authenticate(user=self.disp_user)
        response = self.client.post(reverse('notification-mark-all-read'))
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        # Verify all notifications for user are marked read
        self.assertEqual(Notification.objects.filter(user=self.disp_user, is_read=False).count(), 0)
