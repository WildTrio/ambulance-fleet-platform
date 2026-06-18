from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from django.contrib.auth import get_user_model
from authentication.models import Role, AuditLog

User = get_user_model()

class AuthenticationAPITests(APITestCase):

    def setUp(self):
        # Create roles
        self.admin_role = Role.objects.create(name='HOSPITAL_ADMINISTRATOR')
        self.dispatcher_role = Role.objects.create(name='DISPATCHER')
        
        # Create users
        self.admin_user = User.objects.create_user(
            email='admin@hospital.org',
            name='Admin User',
            password='Password123!',
            role=self.admin_role
        )
        self.dispatcher_user = User.objects.create_user(
            email='dispatcher@hospital.org',
            name='Jane Dispatcher',
            password='Password123!',
            role=self.dispatcher_role
        )

    def test_login_success(self):
        url = reverse('login')
        data = {'email': 'dispatcher@hospital.org', 'password': 'Password123!'}
        
        # Initial audit log count
        initial_logs = AuditLog.objects.filter(action='LOGIN_SUCCESS').count()

        response = self.client.post(url, data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('access', response.data)
        self.assertEqual(response.data['user']['email'], 'dispatcher@hospital.org')
        
        # Verify HttpOnly Cookie is set
        self.assertIn('refresh_token', response.cookies)
        self.assertTrue(response.cookies['refresh_token']['httponly'])
        
        # Verify success log was written to AuditLog
        self.assertEqual(AuditLog.objects.filter(action='LOGIN_SUCCESS').count(), initial_logs + 1)

    def test_login_failure(self):
        url = reverse('login')
        data = {'email': 'dispatcher@hospital.org', 'password': 'WrongPassword123!'}
        
        # Initial audit log count
        initial_logs = AuditLog.objects.filter(action='LOGIN_FAILURE').count()

        response = self.client.post(url, data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        
        # Verify failure log was written to AuditLog
        self.assertEqual(AuditLog.objects.filter(action='LOGIN_FAILURE').count(), initial_logs + 1)

    def test_me_endpoint_requires_auth(self):
        url = reverse('me')
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_me_endpoint_returns_user_data(self):
        url = reverse('me')
        self.client.force_authenticate(user=self.dispatcher_user)
        
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['email'], 'dispatcher@hospital.org')
        self.assertEqual(response.data['name'], 'Jane Dispatcher')
        self.assertEqual(response.data['role']['name'], 'DISPATCHER')

    def test_change_password_success(self):
        url = reverse('change_password')
        self.client.force_authenticate(user=self.dispatcher_user)
        
        data = {
            'old_password': 'Password123!',
            'new_password': 'NewSecurePassword123!'
        }
        
        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        # Verify password is changed in DB
        self.dispatcher_user.refresh_from_db()
        self.assertTrue(self.dispatcher_user.check_password('NewSecurePassword123!'))
        
        # Verify audit log entry
        self.assertTrue(AuditLog.objects.filter(user=self.dispatcher_user, action='PASSWORD_CHANGE').exists())

    def test_change_password_incorrect_old(self):
        url = reverse('change_password')
        self.client.force_authenticate(user=self.dispatcher_user)
        
        data = {
            'old_password': 'IncorrectOldPassword123!',
            'new_password': 'NewSecurePassword123!'
        }
        
        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('old_password', response.data)

    def test_role_list_access_control(self):
        url = reverse('roles')
        
        # Test dispatcher (unauthorized)
        self.client.force_authenticate(user=self.dispatcher_user)
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        
        # Test admin (authorized)
        self.client.force_authenticate(user=self.admin_user)
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 2)
