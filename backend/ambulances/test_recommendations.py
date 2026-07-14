from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from django.contrib.auth import get_user_model
from authentication.models import Role
from ambulances.models import Hospital, Station, Ambulance, Driver, DriverAssignment, EmergencyRequest, Mission, Equipment
import math

User = get_user_model()

class AmbulanceRecommendationAPITests(APITestCase):

    def setUp(self):
        # Create roles
        self.admin_role, _ = Role.objects.get_or_create(name='HOSPITAL_ADMINISTRATOR')
        self.dispatcher_role, _ = Role.objects.get_or_create(name='DISPATCHER')
        self.fleet_role, _ = Role.objects.get_or_create(name='FLEET_MANAGER')
        self.driver_role, _ = Role.objects.get_or_create(name='DRIVER')
        self.requestor_role, _ = Role.objects.get_or_create(name='EMERGENCY_REQUESTOR')

        # Create users
        self.admin_user = User.objects.create_user(email='admin_rec@h.org', name='Admin User', password='Password123!', role=self.admin_role)
        self.dispatcher_user = User.objects.create_user(email='disp_rec@h.org', name='Dispatcher User', password='Password123!', role=self.dispatcher_role)
        self.fleet_user = User.objects.create_user(email='fleet_rec@h.org', name='Fleet User', password='Password123!', role=self.fleet_role)
        self.driver_user = User.objects.create_user(email='drv_rec@h.org', name='Driver User', password='Password123!', role=self.driver_role)
        self.citizen_user = User.objects.create_user(email='cit_rec@gmail.com', name='Citizen User', password='Password123!', role=self.requestor_role)

        # Base Entities
        self.hospital = Hospital.objects.create(hospital_name="Recommendation Central Hospital", address="123 Hospital Lane", city="City", state="ST", contact_number="1234567890")
        
        # Stations at different locations
        # Base Coordinate is (40.7128, -74.0060) - NYC City Hall
        # Station A: 1 km away (~0.009 deg lat/lon)
        self.station_a = Station.objects.create(hospital=self.hospital, station_name="Station Close", latitude=40.7128, longitude=-73.9960)
        # Station B: 10 km away
        self.station_b = Station.objects.create(hospital=self.hospital, station_name="Station Medium", latitude=40.7128, longitude=-73.8860)
        # Station C: 100 km away
        self.station_c = Station.objects.create(hospital=self.hospital, station_name="Station Far", latitude=40.7128, longitude=-72.8060)

        # Drivers
        self.driver1_user = User.objects.create_user(email='drv1@h.org', name='Driver One', password='Password123!', role=self.driver_role)
        self.driver1 = Driver.objects.create(user=self.driver1_user, contact="1112223333", license_number="LIC-1", availability=False)
        self.driver2_user = User.objects.create_user(email='drv2@h.org', name='Driver Two', password='Password123!', role=self.driver_role)
        self.driver2 = Driver.objects.create(user=self.driver2_user, contact="3334445555", license_number="LIC-2", availability=False)

        # Equipment
        self.defib = Equipment.objects.create(name="Defibrillator")
        self.vent = Equipment.objects.create(name="Ventilator")

        # Ambulances
        # 1. Close, with driver, BLS (Expected highest score)
        self.amb_close_ready = Ambulance.objects.create(ambulance_number="AMB-CLOSE-RDY", hospital=self.hospital, station=self.station_a, type="Basic Life Support", status="ACTIVE")
        DriverAssignment.objects.create(driver=self.driver1, ambulance=self.amb_close_ready)
        self.amb_close_ready.equipment.add(self.defib, self.vent)

        # 2. Close, no driver, ALS (Expected medium score)
        self.amb_close_no_drv = Ambulance.objects.create(ambulance_number="AMB-CLOSE-NDRV", hospital=self.hospital, station=self.station_a, type="Advanced Life Support", status="ACTIVE")
        self.amb_close_no_drv.equipment.add(self.defib)

        # 3. Medium, with driver, BLS (Expected lower score due to distance)
        self.amb_med_ready = Ambulance.objects.create(ambulance_number="AMB-MED-RDY", hospital=self.hospital, station=self.station_b, type="Basic Life Support", status="ACTIVE")
        DriverAssignment.objects.create(driver=self.driver2, ambulance=self.amb_med_ready)

        # 4. Far, no driver (Expected lowest score or filtered out)
        self.amb_far_no_drv = Ambulance.objects.create(ambulance_number="AMB-FAR-NDRV", hospital=self.hospital, station=self.station_c, type="Basic Life Support", status="ACTIVE")

        # 5. Close but under maintenance (Should be excluded)
        self.amb_maint = Ambulance.objects.create(ambulance_number="AMB-MAINT", hospital=self.hospital, station=self.station_a, type="Basic Life Support", status="MAINTENANCE")

        # 6. Close but busy on a mission (Should be excluded)
        self.amb_busy = Ambulance.objects.create(ambulance_number="AMB-BUSY", hospital=self.hospital, station=self.station_a, type="Basic Life Support", status="ACTIVE")
        
        # Driver for busy ambulance
        self.driver_busy_user = User.objects.create_user(email='drvbusy@h.org', name='Driver Busy', password='Password123!', role=self.driver_role)
        self.driver_busy = Driver.objects.create(user=self.driver_busy_user, contact="5556667777", license_number="LIC-BUSY", availability=False)
        DriverAssignment.objects.create(driver=self.driver_busy, ambulance=self.amb_busy)

        self.req_busy = EmergencyRequest.objects.create(
            requester_name="John Busy", contact_number="5555555555", emergency_type="General",
            priority="MEDIUM", pickup_location="Close", latitude=40.7128, longitude=-73.9960,
            status="ASSIGNED", created_by=self.dispatcher_user
        )
        Mission.objects.create(
            emergency_request=self.req_busy,
            ambulance=self.amb_busy,
            driver=self.driver_busy,
            status='ASSIGNED'
        )

    def test_recommendation_requires_authentication(self):
        url = reverse('ambulance-recommend')
        response = self.client.get(url, {'latitude': 40.7128, 'longitude': -74.0060})
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_recommendation_requires_authorized_role(self):
        url = reverse('ambulance-recommend')
        self.client.force_authenticate(user=self.citizen_user)
        response = self.client.get(url, {'latitude': 40.7128, 'longitude': -74.0060})
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_recommendation_missing_params(self):
        url = reverse('ambulance-recommend')
        self.client.force_authenticate(user=self.dispatcher_user)
        
        response = self.client.get(url, {'latitude': 40.7128})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("latitude and longitude are required query parameters.", response.data['detail'])

    def test_recommendation_invalid_params(self):
        url = reverse('ambulance-recommend')
        self.client.force_authenticate(user=self.dispatcher_user)
        
        response = self.client.get(url, {'latitude': 'abc', 'longitude': -74.0060})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("latitude and longitude must be valid decimal numbers.", response.data['detail'])

    def test_recommendation_out_of_bounds_coordinates(self):
        url = reverse('ambulance-recommend')
        self.client.force_authenticate(user=self.dispatcher_user)
        
        response = self.client.get(url, {'latitude': 95.0, 'longitude': -74.0060})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Latitude must be between -90 and 90.", response.data['detail'])

    def test_intelligent_scoring_and_ranking(self):
        url = reverse('ambulance-recommend')
        self.client.force_authenticate(user=self.dispatcher_user)
        
        response = self.client.get(url, {'latitude': 40.7128, 'longitude': -74.0060})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        # Verify that maintenance and busy ambulances are excluded
        returned_ids = [item['id'] for item in response.data]
        self.assertNotIn(self.amb_maint.id, returned_ids)
        self.assertNotIn(self.amb_busy.id, returned_ids)

        # Verify ranking order: highest recommendation score first
        scores = [item['recommendation_score'] for item in response.data]
        self.assertEqual(scores, sorted(scores, reverse=True))

        # Check detail of the highest recommendation (AMB-CLOSE-RDY)
        highest = response.data[0]
        self.assertEqual(highest['ambulance_number'], 'AMB-CLOSE-RDY')
        expected_score = round(30.0 + 20.0 + 50.0 * math.exp(-highest['distance'] / 15.0), 1)
        self.assertEqual(highest['recommendation_score'], expected_score)
        self.assertEqual(highest['score_breakdown']['base_driver_score'], 30.0)

    def test_filter_by_type(self):
        url = reverse('ambulance-recommend')
        self.client.force_authenticate(user=self.dispatcher_user)
        
        response = self.client.get(url, {
            'latitude': 40.7128,
            'longitude': -74.0060,
            'type': 'Advanced Life Support'
        })
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        for item in response.data:
            self.assertEqual(item['type'], 'Advanced Life Support')

    def test_filter_by_max_distance(self):
        url = reverse('ambulance-recommend')
        self.client.force_authenticate(user=self.dispatcher_user)
        
        # Max distance 5 km should exclude the medium (~10 km) and far (~100 km) ones
        response = self.client.get(url, {
            'latitude': 40.7128,
            'longitude': -74.0060,
            'max_distance': 5.0
        })
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        for item in response.data:
            self.assertLessEqual(item['distance'], 5.0)

    def test_filter_by_has_driver(self):
        url = reverse('ambulance-recommend')
        self.client.force_authenticate(user=self.dispatcher_user)
        
        # only ones with drivers
        response = self.client.get(url, {
            'latitude': 40.7128,
            'longitude': -74.0060,
            'has_driver': 'true'
        })
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        for item in response.data:
            self.assertIsNotNone(item['active_driver'])

        # only ones without drivers
        response = self.client.get(url, {
            'latitude': 40.7128,
            'longitude': -74.0060,
            'has_driver': 'false'
        })
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        for item in response.data:
            self.assertIsNone(item['active_driver'])

    def test_filter_by_equipment(self):
        url = reverse('ambulance-recommend')
        self.client.force_authenticate(user=self.dispatcher_user)

        # 1. Require Ventilator (only AMB-CLOSE-RDY has it)
        response = self.client.get(url, {
            'latitude': 40.7128,
            'longitude': -74.0060,
            'required_equipment': 'Ventilator'
        })
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        returned_ids = [item['id'] for item in response.data]
        self.assertIn(self.amb_close_ready.id, returned_ids)
        self.assertNotIn(self.amb_close_no_drv.id, returned_ids)

        # Verify that equipment list is returned in payload
        self.assertIn('Ventilator', response.data[0]['equipment'])
        self.assertIn('Defibrillator', response.data[0]['equipment'])

        # 2. Require Defibrillator (both AMB-CLOSE-RDY and AMB-CLOSE-NDRV have it)
        response = self.client.get(url, {
            'latitude': 40.7128,
            'longitude': -74.0060,
            'required_equipment': 'Defibrillator'
        })
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        returned_ids = [item['id'] for item in response.data]
        self.assertIn(self.amb_close_ready.id, returned_ids)
        self.assertIn(self.amb_close_no_drv.id, returned_ids)

        # 3. Require Ventilator and Defibrillator
        response = self.client.get(url, {
            'latitude': 40.7128,
            'longitude': -74.0060,
            'required_equipment': 'Defibrillator, Ventilator'
        })
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        returned_ids = [item['id'] for item in response.data]
        self.assertIn(self.amb_close_ready.id, returned_ids)
        self.assertNotIn(self.amb_close_no_drv.id, returned_ids)

    def test_write_equipment(self):
        """Verify that equipment list can be created and updated via API requests."""
        self.client.force_authenticate(user=self.admin_user)
        url = reverse('ambulance-list')
        
        # 1. Test POST creation with equipment list
        post_data = {
            'ambulance_number': 'AMB-NEW-EQ',
            'hospital_id': str(self.hospital.id),
            'type': 'Basic Life Support',
            'status': 'ACTIVE',
            'equipment': ['Ventilator', 'CustomEq-123']
        }
        response = self.client.post(url, post_data, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn('CustomEq-123', response.data['equipment'])
        
        new_amb_id = response.data['id']
        
        # 2. Test PATCH update of equipment list
        detail_url = reverse('ambulance-detail', kwargs={'pk': new_amb_id})
        patch_data = {
            'equipment': ['Oxygen Tank']
        }
        response = self.client.patch(detail_url, patch_data, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['equipment'], ['Oxygen Tank'])
        
        # 3. Clean up
        Ambulance.objects.filter(id=new_amb_id).delete()
        Equipment.objects.filter(name='CustomEq-123').delete()
