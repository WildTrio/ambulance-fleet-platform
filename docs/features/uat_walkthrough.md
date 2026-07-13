# Manual User Acceptance Testing (UAT) Scenario Script

This guide outlines the step-by-step scenario scripts to manually test the end-to-end operational flow of the Hospital Ambulance Fleet Management & Emergency Dispatch Platform.

---

## 🔑 Preseeded Credentials
Use the following accounts for testing. All accounts are preseeded with the password **`Password123`**:
* **Citizen Requestor**: `citizen@gmail.com`
* **Dispatcher**: `dispatcher@hospital.org`
* **Driver**: `driver@hospital.org`
* **Fleet Manager**: `fleet@hospital.org`
* **Hospital Admin**: `admin@hospital.org`

---

## 📋 Scenario Scripts

### Scenario 1: Emergency Request Intake (Citizen User)
1. Navigate to `http://localhost:5173/login` in your browser.
2. Log in using `citizen@gmail.com`.
3. Under the **🚨 Emergency Requests** tab:
   * Enter a contact number: `555-0150`.
   * Select an Emergency Type: e.g. `Stroke`.
   * Enter the Pickup Location name: `Central Park West`.
   * Set Latitude: `21.830600` and Longitude: `75.619400` (or click coordinates geocoding if available).
   * Click **Submit Emergency Request**.
4. **Expected Result**: 
   * A toast notification: *"Emergency request registered successfully!"* appears.
   * The new request appears in the requests table with status `PENDING`.

---

### Scenario 2: Intake Verification & Dispatch (Dispatcher User)
1. Open a new private browser window or log out and log back in as `dispatcher@hospital.org`.
2. Navigate to **🖥️ Dispatch Console**.
3. Under **Active Incidents**, locate the incident you registered in Scenario 1 and click to select it.
4. **Expected Result**: 
   * The center card fills with details of the selected incident.
   * The Map displays a red incident marker at `(21.8306, 75.6194)`.
   * The list of recommended standby ambulances appears, sorted by recommended scores.
5. Click to select the closest available ambulance (e.g. `AMB-101`).
   * *If the vehicle requires a driver, select one from the "Assign Available Driver" dropdown.*
6. Click **🚀 Dispatch [Ambulance Number]**.
7. **Expected Result**:
   * A toast notification: *"Successfully dispatched [Ambulance Number]!"* appears.
   * The incident is removed from the pending list and moves to the **Active Missions Monitor** pane on the right.
   * The dispatcher can click **Track on Map** to overlay the route polyline.

---

### Scenario 3: Real-Time Telemetry & Status Transitions (Driver User)
1. Log in to another browser session as `driver@hospital.org`.
2. **Expected Result**: 
   * You land on the **🎮 Driver Console**.
   * Your assigned vehicle number and current mission details (e.g. *"Active Dispatch Mission: Stroke"*) are visible.
3. Check the **Use Device GPS** checkbox or the **Simulate Route** checkbox (if simulating).
4. Under **Update Operational Status**, click **Transition to En Route**.
5. **Expected Result**: 
   * A toast notification: *"Successfully transitioned to En Route"* appears.
   * The graphical stepper updates to step 2.
6. Progress the status step-by-step:
   * **Transition to At Incident** (Stepper step 3).
   * **Transition to Patient Onboard** (Stepper step 4).
   * **Transition to Hospital Arrival** (Stepper step 5).
   * **Transition to Sanitization** (Stepper step 6).
   * **Transition to Ready** (Stepper step 7).
7. Click **Complete Mission (Available)**.
8. **Expected Result**: 
   * The mission is resolved. 
   * The driver console reverts to *"No Active Mission - Standby"* status.
   * Under **Past Trips History**, a new trip record appears showing the calculated road distance and travel summary.

---

### Scenario 4: Fleet Overview & Driver Shifts (Fleet Manager User)
1. Log in as `fleet@hospital.org`.
2. Navigate to **🚛 Fleet Dashboard**.
3. **Expected Result**: 
   * View the **Active Fleet Availability Rate** widget.
   * Observe the status counters (Active, Maintenance, Inactive) and lifecycle status breakdown.
   * Check the **Ambulance Under Sanitization/Maintenance** tables.
   * Verify that drivers are displayed as **"ON DUTY"** with green indicator lights, indicating their active shifts.

---

### Scenario 5: Operational Performance Analytics (Hospital Admin User)
1. Log in as `admin@hospital.org`.
2. Navigate to **📈 Admin Analytics**.
3. **Expected Result**: 
   * The KPI widgets show the global average response times, success rates, and fleet utilization rates.
   * The **Operational Phase Bottlenecks** progress bars display average minutes spent in each phase (e.g. En Route, Sanitization).
   * The response times by priority severity (Critical, High, Medium, Low) are populated.
   * A historical table displays daily case volume and average response times.
