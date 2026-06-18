# Hospital Ambulance Fleet Management & Emergency Dispatch Platform

A secure, role-restricted web platform for managing hospital ambulance fleets, driver schedules, stations, status changes, and dispatch tracking.

---

## 🛠️ Technology Stack

* **Backend**: Django 4.2+, Django REST Framework, SimpleJWT (JWT tokens)
* **Frontend**: React (Vite), Axios, Vanilla CSS Custom Design
* **Database**: PostgreSQL (Running in Docker)

---

## 🚀 Key Modules & Features

### Phase 1: Authentication & Authorization
* **Secure Login**: Session handling via short-lived JWT Access Tokens and secure HTTP-Only Refresh cookies.
* **RBAC Engine**: Dynamic permission validation based on 5 system roles (`HOSPITAL_ADMINISTRATOR`, `FLEET_MANAGER`, `DISPATCHER`, `DRIVER`, `EMERGENCY_REQUESTOR`).
* **Audit Logs**: Logs all security events (login success/failures, password changes).

### Phase 2: Ambulance Fleet Management
* **Fleet Dashboard**: Grid interface detailing vehicle status, station, hospital, and active drivers.
* **Business Validation Engine**:
  * Uniqueness constraints on ambulance registration numbers.
  * Blocks driver assignments to non-active vehicles (e.g., vehicles under maintenance or inactive).
  * Auto-closes previous assignments during driver reassignments.
  * Auto-terminates active assignments when an ambulance goes under maintenance/inactive.
* **Operational History Logs**: A timeline logging status changes (with optional remarks), station transfers, and driver assignments.
* **Administrative lookups**: Dropdown lookups feeding hospitals, stations, and available drivers lists.

---

## 💻 Running the Project Locally

### 1. Database Setup
Ensure your PostgreSQL Docker container is running:
```bash
docker start pg-ambulance
```

### 2. Backend (Django)
Set up the virtual environment, install python libraries, apply database migrations, seed default database mock records, and run the development server:
```bash
# Navigate to backend folder
cd backend

# Create virtual environment (if not present) and activate it
python -m venv .venv
source .venv/bin/activate

# Install requirements
pip install -r requirements.txt

# Run migrations
python manage.py migrate

# Seed mock accounts, hospitals, stations, drivers, and ambulances
python manage.py seed_data

# Start backend server (starts on http://127.0.0.1:8000)
python manage.py runserver
```

### 3. Frontend (React + Vite)
Install node modules and start Vite development client:
```bash
# Navigate to frontend folder
cd frontend

# Install node dependencies
npm install

# Start development client (starts on http://localhost:5173)
npm run dev
```

---

## 🔑 Mock Test Credentials
All mock accounts are preseeded with the password **`Password123`**:

* **Hospital Admin**: `admin@hospital.org` (Full Write Access)
* **Fleet Manager**: `fleet@hospital.org` (Full Write Access)
* **Dispatcher**: `dispatcher@hospital.org` (Read-Only Access)
* **Driver**: `driver@hospital.org` (No Fleet Access)
* **Emergency Requestor**: `citizen@gmail.com` (No Fleet Access)

---

## 🧪 Testing the APIs
To run backend unit test suites checking authentication rules, uniqueness validation, and vehicle business constraints:
```bash
python backend/manage.py test authentication ambulances
```
