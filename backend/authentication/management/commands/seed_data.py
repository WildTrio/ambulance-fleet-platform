from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from authentication.models import Role
from ambulances.models import Hospital, Station, Ambulance, Driver, Equipment

User = get_user_model()

class Command(BaseCommand):
    help = 'Preseeds the roles, mock users, hospitals, stations, drivers, and ambulances in the database.'

    def handle(self, *args, **options):
        self.stdout.write('Seeding roles...')
        
        roles_data = [
            {'name': 'HOSPITAL_ADMINISTRATOR'},
            {'name': 'DISPATCHER'},
            {'name': 'FLEET_MANAGER'},
            {'name': 'DRIVER'},
            {'name': 'EMERGENCY_REQUESTOR'},
        ]

        roles = {}
        for role_info in roles_data:
            role, created = Role.objects.get_or_create(
                name=role_info['name']
            )
            roles[role_info['name']] = role
            if created:
                self.stdout.write(f"Created role: {role.name}")
            else:
                self.stdout.write(f"Role already exists: {role.name}")

        # ── Hospitals ──────────────────────────────────────────────────
        self.stdout.write('Seeding hospitals...')
        hospitals_data = [
            {
                'hospital_name': 'Metro General Hospital',
                'address': '123 Health Ave',
                'city': 'Metropolis',
                'state': 'NY',
                'contact_number': '555-0199'
            },
            {
                'hospital_name': 'Khargone District Hospital',
                'address': 'Khandwa Road',
                'city': 'Khargone',
                'state': 'MP',
                'contact_number': '555-0200'
            },
        ]

        hospitals = {}
        for h_info in hospitals_data:
            hospital, created = Hospital.objects.get_or_create(
                hospital_name=h_info['hospital_name'],
                defaults=h_info
            )
            hospitals[h_info['hospital_name']] = hospital
            if created:
                self.stdout.write(f"Created hospital: {hospital.hospital_name}")

        metro = hospitals['Metro General Hospital']
        khargone = hospitals['Khargone District Hospital']

        # ── Users ──────────────────────────────────────────────────────
        self.stdout.write('Seeding mock users...')

        default_password = 'Password123'

        users_data = [
            # ── Metro General Hospital users ──
            {
                'email': 'admin@metro.org',
                'name': 'Metro Admin',
                'role': roles['HOSPITAL_ADMINISTRATOR'],
                'is_staff': True,
                'hospital': metro,
            },
            {
                'email': 'dispatcher@metro.org',
                'name': 'Metro Dispatcher',
                'role': roles['DISPATCHER'],
                'is_staff': False,
                'hospital': metro,
            },
            {
                'email': 'fleet@metro.org',
                'name': 'Metro Fleet Manager',
                'role': roles['FLEET_MANAGER'],
                'is_staff': False,
                'hospital': metro,
            },
            {
                'email': 'driver1@metro.org',
                'name': 'Rahul Sharma',
                'role': roles['DRIVER'],
                'is_staff': False,
                'hospital': metro,
            },
            {
                'email': 'driver2@metro.org',
                'name': 'Amit Patel',
                'role': roles['DRIVER'],
                'is_staff': False,
                'hospital': metro,
            },
            {
                'email': 'driver3@metro.org',
                'name': 'Vijay Singh',
                'role': roles['DRIVER'],
                'is_staff': False,
                'hospital': metro,
            },
            {
                'email': 'citizen1@gmail.com',
                'name': 'Priya Citizen',
                'role': roles['EMERGENCY_REQUESTOR'],
                'is_staff': False,
                'hospital': metro,
            },

            # ── Khargone District Hospital users ──
            {
                'email': 'admin@khargone.org',
                'name': 'Khargone Admin',
                'role': roles['HOSPITAL_ADMINISTRATOR'],
                'is_staff': True,
                'hospital': khargone,
            },
            {
                'email': 'dispatcher@khargone.org',
                'name': 'Khargone Dispatcher',
                'role': roles['DISPATCHER'],
                'is_staff': False,
                'hospital': khargone,
            },
            {
                'email': 'fleet@khargone.org',
                'name': 'Khargone Fleet Manager',
                'role': roles['FLEET_MANAGER'],
                'is_staff': False,
                'hospital': khargone,
            },
            {
                'email': 'driver1@khargone.org',
                'name': 'Suresh Kumar',
                'role': roles['DRIVER'],
                'is_staff': False,
                'hospital': khargone,
            },
            {
                'email': 'driver2@khargone.org',
                'name': 'Ramesh Yadav',
                'role': roles['DRIVER'],
                'is_staff': False,
                'hospital': khargone,
            },
            {
                'email': 'citizen2@gmail.com',
                'name': 'Anil Citizen',
                'role': roles['EMERGENCY_REQUESTOR'],
                'is_staff': False,
                'hospital': khargone,
            },
        ]

        for user_info in users_data:
            user, created = User.objects.get_or_create(
                email=user_info['email'],
                defaults={
                    'name': user_info['name'],
                    'role': user_info['role'],
                    'is_staff': user_info['is_staff'],
                    'hospital': user_info['hospital'],
                }
            )
            if not created and user.hospital != user_info['hospital']:
                user.hospital = user_info['hospital']
                user.save()
            if created:
                user.set_password(default_password)
                user.save()
                self.stdout.write(f"Created user: {user.email} (Password: {default_password})")
            else:
                self.stdout.write(f"User already exists: {user.email}")

        # Create a Django superuser (no hospital — can see everything)
        superuser_email = 'superuser@hospital.org'
        if not User.objects.filter(email=superuser_email).exists():
            superuser = User.objects.create_superuser(
                email=superuser_email,
                name='Super User',
                password=default_password,
                role=roles['HOSPITAL_ADMINISTRATOR'],
            )
            self.stdout.write(f"Created superuser: {superuser.email} (Password: {default_password})")
        else:
            self.stdout.write("Superuser already exists.")

        # ── Stations ───────────────────────────────────────────────────
        self.stdout.write('Seeding stations...')
        stations_data = [
            # Metro General Hospital stations
            {
                'hospital': metro,
                'station_name': 'Metro Downtown Station',
                'latitude': 40.7128,
                'longitude': -74.0060
            },
            {
                'hospital': metro,
                'station_name': 'Metro Uptown Station',
                'latitude': 40.7589,
                'longitude': -73.9851
            },
            {
                'hospital': metro,
                'station_name': 'Metro East Side Station',
                'latitude': 40.7484,
                'longitude': -73.9857
            },
            # Khargone District Hospital stations
            {
                'hospital': khargone,
                'station_name': 'Khargone Central Station',
                'latitude': 21.820600,
                'longitude': 75.609400
            },
            {
                'hospital': khargone,
                'station_name': 'Khargone Highway Station',
                'latitude': 21.835000,
                'longitude': 75.620000
            },
        ]

        stations = {}
        for s_info in stations_data:
            station, created = Station.objects.get_or_create(
                station_name=s_info['station_name'],
                defaults=s_info
            )
            stations[s_info['station_name']] = station
            if created:
                self.stdout.write(f"Created station: {station.station_name}")

        # ── Drivers ────────────────────────────────────────────────────
        self.stdout.write('Seeding drivers...')
        driver_users = [
            # Metro drivers
            {'email': 'driver1@metro.org', 'license_no': 'DL-MET-001', 'contact': '9876543210'},
            {'email': 'driver2@metro.org', 'license_no': 'DL-MET-002', 'contact': '9876543211'},
            {'email': 'driver3@metro.org', 'license_no': 'DL-MET-003', 'contact': '9876543212'},
            # Khargone drivers
            {'email': 'driver1@khargone.org', 'license_no': 'DL-KHG-001', 'contact': '9123456780'},
            {'email': 'driver2@khargone.org', 'license_no': 'DL-KHG-002', 'contact': '9123456781'},
        ]
        for info in driver_users:
            user = User.objects.get(email=info['email'])
            driver, created = Driver.objects.get_or_create(
                user=user,
                defaults={
                    'contact': info['contact'],
                    'license_number': info['license_no'],
                    'availability': True
                }
            )
            if created:
                self.stdout.write(f"Created driver profile for user: {user.email}")

        # ── Ambulances ─────────────────────────────────────────────────
        self.stdout.write('Seeding ambulances...')
        ambulances_data = [
            # Metro General Hospital ambulances
            {
                'ambulance_number': 'MET-AMB-001',
                'hospital': metro,
                'station': stations['Metro Downtown Station'],
                'type': 'Advanced Life Support',
                'status': 'ACTIVE'
            },
            {
                'ambulance_number': 'MET-AMB-002',
                'hospital': metro,
                'station': stations['Metro Uptown Station'],
                'type': 'Basic Life Support',
                'status': 'ACTIVE'
            },
            {
                'ambulance_number': 'MET-AMB-003',
                'hospital': metro,
                'station': stations['Metro East Side Station'],
                'type': 'Patient Transport',
                'status': 'ACTIVE'
            },
            {
                'ambulance_number': 'MET-AMB-004',
                'hospital': metro,
                'station': stations['Metro Downtown Station'],
                'type': 'Advanced Life Support',
                'status': 'MAINTENANCE'
            },
            # Khargone District Hospital ambulances
            {
                'ambulance_number': 'KHG-AMB-001',
                'hospital': khargone,
                'station': stations['Khargone Central Station'],
                'type': 'Advanced Life Support',
                'status': 'ACTIVE'
            },
            {
                'ambulance_number': 'KHG-AMB-002',
                'hospital': khargone,
                'station': stations['Khargone Highway Station'],
                'type': 'Basic Life Support',
                'status': 'ACTIVE'
            },
            {
                'ambulance_number': 'KHG-AMB-003',
                'hospital': khargone,
                'station': stations['Khargone Central Station'],
                'type': 'Patient Transport',
                'status': 'MAINTENANCE'
            },
        ]

        for amb_info in ambulances_data:
            ambulance, created = Ambulance.objects.get_or_create(
                ambulance_number=amb_info['ambulance_number'],
                defaults=amb_info
            )
            if created:
                self.stdout.write(f"Created ambulance: {ambulance.ambulance_number}")

        # ── Equipment ──────────────────────────────────────────────────
        self.stdout.write('Seeding equipment...')
        equipment_names = ['Defibrillator', 'Ventilator', 'Oxygen Tank', 'First Aid Kit', 'Trauma Kit']
        equipments = {}
        for name in equipment_names:
            eq, created = Equipment.objects.get_or_create(name=name)
            equipments[name] = eq
            if created:
                self.stdout.write(f"Created equipment: {name}")

        # Link equipment to ambulances
        equipment_map = {
            'MET-AMB-001': ['Defibrillator', 'Ventilator', 'Oxygen Tank', 'First Aid Kit'],
            'MET-AMB-002': ['Oxygen Tank', 'First Aid Kit', 'Trauma Kit'],
            'MET-AMB-003': ['First Aid Kit'],
            'MET-AMB-004': ['Defibrillator', 'Oxygen Tank', 'First Aid Kit'],
            'KHG-AMB-001': ['Defibrillator', 'Ventilator', 'Oxygen Tank', 'First Aid Kit'],
            'KHG-AMB-002': ['Oxygen Tank', 'First Aid Kit'],
            'KHG-AMB-003': ['First Aid Kit', 'Trauma Kit'],
        }
        for amb_num, eq_names in equipment_map.items():
            amb = Ambulance.objects.filter(ambulance_number=amb_num).first()
            if amb:
                amb.equipment.add(*[equipments[n] for n in eq_names])
                self.stdout.write(f"Assigned equipment to {amb_num}")

        # ── Emergency Requests ─────────────────────────────────────────
        self.stdout.write('Seeding emergency requests...')
        from ambulances.models import EmergencyRequest

        emergency_requests_data = [
            # Metro hospital emergency requests
            {
                'requester_name': 'Ankit Verma',
                'contact_number': '9988776655',
                'emergency_type': 'Cardiac Arrest',
                'priority': 'CRITICAL',
                'pickup_location': '42 Broadway, Metropolis',
                'latitude': 40.7127,
                'longitude': -74.0059,
                'status': 'PENDING',
                'hospital': metro,
                'created_by': User.objects.get(email='citizen1@gmail.com'),
            },
            {
                'requester_name': 'Sneha Gupta',
                'contact_number': '9977665544',
                'emergency_type': 'Road Accident',
                'priority': 'HIGH',
                'pickup_location': '15 Park Ave, Metropolis',
                'latitude': 40.7500,
                'longitude': -73.9800,
                'status': 'PENDING',
                'hospital': metro,
                'created_by': User.objects.get(email='citizen1@gmail.com'),
            },
            {
                'requester_name': 'Ravi Kumar',
                'contact_number': '9966554433',
                'emergency_type': 'Stroke',
                'priority': 'CRITICAL',
                'pickup_location': '88 5th Ave, Metropolis',
                'latitude': 40.7400,
                'longitude': -73.9900,
                'status': 'PENDING',
                'hospital': metro,
                'created_by': User.objects.get(email='dispatcher@metro.org'),
            },
            # Khargone hospital emergency requests
            {
                'requester_name': 'Mohan Patel',
                'contact_number': '9111222333',
                'emergency_type': 'Snakebite',
                'priority': 'HIGH',
                'pickup_location': 'Village Bhanpur, Khargone',
                'latitude': 21.8200,
                'longitude': 75.6100,
                'status': 'PENDING',
                'hospital': khargone,
                'created_by': User.objects.get(email='citizen2@gmail.com'),
            },
            {
                'requester_name': 'Sunita Devi',
                'contact_number': '9222333444',
                'emergency_type': 'Fall Injury',
                'priority': 'MEDIUM',
                'pickup_location': 'Main Bazaar, Khargone',
                'latitude': 21.8250,
                'longitude': 75.6150,
                'status': 'PENDING',
                'hospital': khargone,
                'created_by': User.objects.get(email='dispatcher@khargone.org'),
            },
        ]

        for er_info in emergency_requests_data:
            er, created = EmergencyRequest.objects.get_or_create(
                requester_name=er_info['requester_name'],
                contact_number=er_info['contact_number'],
                defaults=er_info
            )
            if created:
                self.stdout.write(f"Created emergency request: {er.requester_name} ({er.emergency_type})")

        # ── Active Shifts ──────────────────────────────────────────────
        self.stdout.write('Seeding active shifts for drivers...')
        from django.utils import timezone
        from datetime import timedelta
        from ambulances.models import Shift
        
        now = timezone.now()
        drivers = Driver.objects.all()
        for d in drivers:
            Shift.objects.get_or_create(
                driver=d,
                defaults={
                    'start_time': now - timedelta(hours=4),
                    'end_time': now + timedelta(hours=8)
                }
            )
            self.stdout.write(f"Created active shift for driver: {d.user.email}")

        # ── Summary ───────────────────────────────────────────────────
        self.stdout.write('')
        self.stdout.write(self.style.SUCCESS('═' * 60))
        self.stdout.write(self.style.SUCCESS('  DATABASE SEEDING COMPLETED SUCCESSFULLY'))
        self.stdout.write(self.style.SUCCESS('═' * 60))
        self.stdout.write('')
        self.stdout.write(self.style.WARNING('  TEST ACCOUNTS (Password for all: Password123)'))
        self.stdout.write(self.style.WARNING('─' * 60))
        self.stdout.write('')
        self.stdout.write(self.style.SUCCESS('  ▸ METRO GENERAL HOSPITAL'))
        self.stdout.write('    Admin:       admin@metro.org')
        self.stdout.write('    Dispatcher:  dispatcher@metro.org')
        self.stdout.write('    Fleet Mgr:   fleet@metro.org')
        self.stdout.write('    Drivers:     driver1@metro.org, driver2@metro.org, driver3@metro.org')
        self.stdout.write('    Citizen:     citizen1@gmail.com')
        self.stdout.write('')
        self.stdout.write(self.style.SUCCESS('  ▸ KHARGONE DISTRICT HOSPITAL'))
        self.stdout.write('    Admin:       admin@khargone.org')
        self.stdout.write('    Dispatcher:  dispatcher@khargone.org')
        self.stdout.write('    Fleet Mgr:   fleet@khargone.org')
        self.stdout.write('    Drivers:     driver1@khargone.org, driver2@khargone.org')
        self.stdout.write('    Citizen:     citizen2@gmail.com')
        self.stdout.write('')
        self.stdout.write(self.style.WARNING('  ▸ SUPERUSER (sees ALL hospitals)'))
        self.stdout.write('    Email:       superuser@hospital.org')
        self.stdout.write('')
