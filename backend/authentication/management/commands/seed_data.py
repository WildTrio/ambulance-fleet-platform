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

        self.stdout.write('Seeding mock users...')

        users_data = [
            {
                'email': 'admin@hospital.org',
                'name': 'Admin User',
                'role': roles['HOSPITAL_ADMINISTRATOR'],
                'is_staff': True,
            },
            {
                'email': 'dispatcher@hospital.org',
                'name': 'Jane Dispatcher',
                'role': roles['DISPATCHER'],
                'is_staff': False,
            },
            {
                'email': 'fleet@hospital.org',
                'name': 'Bob Fleet',
                'role': roles['FLEET_MANAGER'],
                'is_staff': False,
            },
            {
                'email': 'driver@hospital.org',
                'name': 'David Driver',
                'role': roles['DRIVER'],
                'is_staff': False,
            },
            {
                'email': 'driver2@hospital.org',
                'name': 'Bob Driver',
                'role': roles['DRIVER'],
                'is_staff': False,
            },
            {
                'email': 'driver3@hospital.org',
                'name': 'Rahul Driver',
                'role': roles['DRIVER'],
                'is_staff': False,
            },
            {
                'email': 'citizen@gmail.com',
                'name': 'John Requestor',
                'role': roles['EMERGENCY_REQUESTOR'],
                'is_staff': False,
            },
        ]

        default_password = 'Password123'

        for user_info in users_data:
            user, created = User.objects.get_or_create(
                email=user_info['email'],
                defaults={
                    'name': user_info['name'],
                    'role': user_info['role'],
                    'is_staff': user_info['is_staff'],
                }
            )
            if created:
                user.set_password(default_password)
                user.save()
                self.stdout.write(f"Created user: {user.email} (Password: {default_password})")
            else:
                self.stdout.write(f"User already exists: {user.email}")

        # Create a Django superuser
        superuser_email = 'superuser@hospital.org'
        if not User.objects.filter(email=superuser_email).exists():
            superuser = User.objects.create_superuser(
                email=superuser_email,
                name='Super User',
                password=default_password,
                role=roles['HOSPITAL_ADMINISTRATOR']
            )
            self.stdout.write(f"Created superuser: {superuser.email} (Password: {default_password})")
        else:
            self.stdout.write("Superuser already exists.")

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
                'hospital_name': 'St. Jude Clinic',
                'address': '456 Mercy Blvd',
                'city': 'Metropolis',
                'state': 'NY',
                'contact_number': '555-0188'
            },
            {
                'hospital_name': 'Khargone District Hospital',
                'address': 'Khandwa Road',
                'city': 'Khargone',
                'state': 'MP',
                'contact_number': '555-0200'
            }
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

        self.stdout.write('Seeding stations...')
        stations_data = [
            {
                'hospital': hospitals['Metro General Hospital'],
                'station_name': 'Station Alpha - Downtown',
                'latitude': 40.7128,
                'longitude': -74.0060
            },
            {
                'hospital': hospitals['Metro General Hospital'],
                'station_name': 'Station Beta - Uptown',
                'latitude': 40.7589,
                'longitude': -73.9851
            },
            {
                'hospital': hospitals['St. Jude Clinic'],
                'station_name': 'Station Gamma - East Side',
                'latitude': 40.7484,
                'longitude': -73.9857
            },
            {
                'hospital': hospitals['Khargone District Hospital'],
                'station_name': 'Khargone Central Station',
                'latitude': 21.820600,
                'longitude': 75.609400
            }
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

        self.stdout.write('Seeding drivers...')
        driver_users = [
            {'email': 'driver@hospital.org', 'license_no': 'DL-12345678', 'contact': '555-0100'},
            {'email': 'driver2@hospital.org', 'license_no': 'DL-87654321', 'contact': '555-0101'},
            {'email': 'driver3@hospital.org', 'license_no': 'DL-11223344', 'contact': '555-0102'}
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

        self.stdout.write('Seeding ambulances...')
        ambulances_data = [
            {
                'ambulance_number': 'AMB-001',
                'hospital': hospitals['Metro General Hospital'],
                'station': stations['Station Alpha - Downtown'],
                'type': 'Advanced Life Support',
                'status': 'ACTIVE'
            },
            {
                'ambulance_number': 'AMB-002',
                'hospital': hospitals['Metro General Hospital'],
                'station': stations['Station Beta - Uptown'],
                'type': 'Basic Life Support',
                'status': 'MAINTENANCE'
            },
            {
                'ambulance_number': 'AMB-003',
                'hospital': hospitals['St. Jude Clinic'],
                'station': stations['Station Gamma - East Side'],
                'type': 'Patient Transport',
                'status': 'INACTIVE'
            },
            {
                'ambulance_number': 'AMB-MP-09',
                'hospital': hospitals['Khargone District Hospital'],
                'station': stations['Khargone Central Station'],
                'type': 'Advanced Life Support',
                'status': 'ACTIVE'
            }
        ]

        for amb_info in ambulances_data:
            ambulance, created = Ambulance.objects.get_or_create(
                ambulance_number=amb_info['ambulance_number'],
                defaults=amb_info
            )
            if created:
                self.stdout.write(f"Created ambulance: {ambulance.ambulance_number}")

        self.stdout.write('Seeding equipment...')
        equipment_names = ['Defibrillator', 'Ventilator', 'Oxygen Tank', 'First Aid Kit', 'Trauma Kit']
        equipments = {}
        for name in equipment_names:
            eq, created = Equipment.objects.get_or_create(name=name)
            equipments[name] = eq
            if created:
                self.stdout.write(f"Created equipment: {name}")

        # Link equipment to mock ambulances
        amb_001 = Ambulance.objects.filter(ambulance_number='AMB-001').first()
        if amb_001:
            amb_001.equipment.add(equipments['Defibrillator'], equipments['Ventilator'], equipments['Oxygen Tank'], equipments['First Aid Kit'])
            self.stdout.write("Assigned equipment to AMB-001")

        amb_002 = Ambulance.objects.filter(ambulance_number='AMB-002').first()
        if amb_002:
            amb_002.equipment.add(equipments['Oxygen Tank'], equipments['First Aid Kit'])
            self.stdout.write("Assigned equipment to AMB-002")

        amb_003 = Ambulance.objects.filter(ambulance_number='AMB-003').first()
        if amb_003:
            amb_003.equipment.add(equipments['First Aid Kit'])
            self.stdout.write("Assigned equipment to AMB-003")

        amb_mp_09 = Ambulance.objects.filter(ambulance_number='AMB-MP-09').first()
        if amb_mp_09:
            amb_mp_09.equipment.add(equipments['Defibrillator'], equipments['Oxygen Tank'], equipments['First Aid Kit'])
            self.stdout.write("Assigned equipment to AMB-MP-09")

        self.stdout.write(self.style.SUCCESS('Database seeding completed successfully.'))

