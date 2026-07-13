# Frontend UAT Test Plan — Hospital-Level Multi-Tenancy (Data Isolation)

This guide outlines step-by-step procedures to manually verify that data isolation (multi-tenancy) is correctly enforced in the React frontend interface using the seeded credentials.

---

## 🔑 Test Credentials (Password: `Password123`)

We have prepared two separate hospitals with distinct data:

### 1. Metro General Hospital
* **Administrator**: `admin@metro.org` (Manages Metro dashboard)
* **Dispatcher**: `dispatcher@metro.org` (Manages Metro Emergency Queue & Console)
* **Fleet Manager**: `fleet@metro.org` (Manages Metro Ambulances & Stations)
* **Drivers**: `driver1@metro.org`, `driver2@metro.org`, `driver3@metro.org`
* **Citizen (Requestor)**: `citizen1@gmail.com`

### 2. Khargone District Hospital
* **Administrator**: `admin@khargone.org`
* **Dispatcher**: `dispatcher@khargone.org`
* **Fleet Manager**: `fleet@khargone.org`
* **Drivers**: `driver1@khargone.org`, `driver2@khargone.org`
* **Citizen (Requestor)**: `citizen2@gmail.com`

### 3. Superuser (Bypasses Isolation)
* **Admin Portal**: `superuser@hospital.org` (Can access all records across both hospitals)

---

## 🧪 Step-by-Step Frontend Testing Guide

### Test Case 1: Station and Ambulance Isolation (Fleet Manager Portal)
1. **Login as Metro Fleet Manager**:
   * Open the frontend application in your browser.
   * Log in with `fleet@metro.org` / `Password123`.
   * Navigate to the **Fleet Management** dashboard.
   * **Verification**: You should only see Metro ambulances (`MET-AMB-001` through `MET-AMB-004`) and Metro stations (`Metro Downtown Station`, `Metro Uptown Station`, `Metro East Side Station`). No Khargone (`KHG-*`) entries should be visible.
2. **Login as Khargone Fleet Manager**:
   * Logout, then log in with `fleet@khargone.org` / `Password123`.
   * Navigate to the **Fleet Management** dashboard.
   * **Verification**: You should only see Khargone ambulances (`KHG-AMB-001` through `KHG-AMB-003`) and Khargone stations (`Khargone Central Station`, `Khargone Highway Station`). No Metro (`MET-*`) entries should be visible.

---

### Test Case 2: Driver Onboarding & Account Scoping
1. **Onboard a Driver as Metro Fleet Manager**:
   * Log in with `fleet@metro.org` / `Password123`.
   * Navigate to the **Driver Directory** and click **Onboard Driver**.
   * Create a new driver (e.g., `test_driver_metro@metro.org`).
   * **Verification**:
     * The driver profile is created under Metro General Hospital.
     * Navigate to the User Administration list (if available or check the database/API). The matching user account created automatically has `hospital` set to **Metro General Hospital** (implicitly derived on the backend from the manager's hospital context).
2. **Attempt Cross-Hospital Assignment**:
   * Log in with `dispatcher@metro.org` / `Password123`.
   * Go to the **Dispatch Console**.
   * Try to assign a driver to an ambulance.
   * **Verification**: The driver dropdown list should only contain drivers belonging to Metro General Hospital (`driver1@metro.org`, `driver2@metro.org`, etc.). Drivers from Khargone (`driver1@khargone.org`, etc.) must not appear.

---

### Test Case 3: Emergency Intake and Queue Isolation
1. **Submit an Intake Request as Metro Dispatcher**:
   * Log in with `dispatcher@metro.org` / `Password123`.
   * Navigate to **Emergency Intake** and submit a request for a patient (e.g., "Ankit Verma" - Cardiac Arrest).
   * Go to the **Emergency Queue**.
   * **Verification**: You should see only Metro General Hospital emergency requests in the queue (like "Ankit Verma", "Sneha Gupta", "Ravi Kumar").
2. **Submit a Request as Khargone Dispatcher**:
   * Log in with `dispatcher@khargone.org` / `Password123`.
   * Go to the **Emergency Queue**.
   * **Verification**: You should see only Khargone District Hospital requests (like "Mohan Patel", "Sunita Devi"). Metro requests (e.g., "Ankit Verma") must not appear in the queue.

---

### Test Case 4: Dispatch Console & Recommendation Engine (Proximity Search)
1. **Access Dispatch Console as Metro Dispatcher**:
   * Log in with `dispatcher@metro.org` / `Password123`.
   * Select a pending emergency request and click **Dispatch**.
   * View the recommended ambulance listing.
   * **Verification**: Only active ambulances from Metro General Hospital (`MET-AMB-001`, `MET-AMB-002`, etc.) are queried and recommended. No Khargone ambulances are recommended, even if they are geographically closer to the incident.
2. **Access Dispatch Console as Khargone Dispatcher**:
   * Log in with `dispatcher@khargone.org` / `Password123`.
   * Select a Khargone request and click **Dispatch**.
   * **Verification**: Only Khargone ambulances (`KHG-AMB-001`, `KHG-AMB-002`) are recommended.

---

### Test Case 5: Analytics and KPIs (Administrator Dashboard)
1. **Login as Metro Admin**:
   * Log in with `admin@metro.org` / `Password123`.
   * Navigate to the **Admin Dashboard**.
   * **Verification**: KPI metrics, charts, success rates, average response times, and trip statistics are calculated exclusively from Metro General Hospital missions.
2. **Login as Khargone Admin**:
   * Log in with `admin@khargone.org` / `Password123`.
   * Navigate to the **Admin Dashboard**.
   * **Verification**: The stats must only reflect Khargone District Hospital's data.

---

### Test Case 6: Admin Portal (Superuser Check)
1. **Login to the Django Admin Panel as Superuser**:
   * Navigate to `/admin/` in your browser.
   * Log in with `superuser@hospital.org` / `Password123`.
   * **Verification**: You should be able to view and manage all `Hospital`, `Ambulance`, `Driver`, `EmergencyRequest`, and `User` records from all hospitals.
