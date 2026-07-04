# API Specification: Ambulance Lifecycle Tracking (Phase 7)

This document provides the complete API specification for the **Ambulance Lifecycle Tracking** module. It describes the endpoints, validation constraints, security rules, and state transitions.

---

## 1. Retrieve Current Driver Assignment
Retrieve the active ambulance assignment for the currently authenticated driver.

* **URL**: `/api/ambulances/my-assignment/`
* **Method**: `GET`
* **Headers**: 
  * `Authorization: Bearer <token>`
* **Access Control**: Authenticated users with the `DRIVER` role.

### Response Examples

#### Scenario A: Driver has an active ambulance assignment
* **Status**: `200 OK`
* **Payload**:
  ```json
  {
    "id": "c8a40de6-13a8-4c91-bdf4-d6a9d7c49b4c",
    "ambulance_number": "AMB-001",
    "type": "Advanced Life Support",
    "status": "ACTIVE",
    "lifecycle_status": "EN_ROUTE",
    "hospital": {
      "id": "d0e12345-6789-abcd-ef01-23456789abcd",
      "hospital_name": "Metro General Hospital"
    },
    "station": {
      "id": "e1f23456-7890-abcd-ef01-23456789abcd",
      "station_name": "Station Alpha - Downtown"
    },
    "equipment": [
      "Defibrillator",
      "Ventilator",
      "Oxygen Tank"
    ],
    "active_mission": {
      "id": "f2a34567-8901-abcd-ef01-23456789abcd",
      "status": "EN_ROUTE",
      "emergency_request": {
        "id": "a5d67890-1234-abcd-ef01-23456789abcd",
        "requester_name": "John Requestor",
        "contact_number": "555-0100",
        "location_name": "Times Square",
        "latitude": 40.7580,
        "longitude": -73.9855,
        "medical_issue": "Chest pain, possible cardiac event",
        "priority": "CRITICAL"
      }
    }
  }
  ```

#### Scenario B: Driver does not have an active assignment (Standby)
* **Status**: `200 OK`
* **Payload**:
  ```json
  {
    "detail": "No active ambulance assignment found for this driver."
  }
  ```

---

## 2. Transition Operational Lifecycle Status
Transition the operational status of the ambulance. Validates the state change using the state-machine rules, keeps the active mission and emergency request statuses synchronized, and handles administrative status overrides.

* **URL**: `/api/ambulances/<id>/transition-lifecycle/`
* **Method**: `POST`
* **Headers**: 
  * `Authorization: Bearer <token>`
  * `Content-Type: application/json`
* **Access Control**: `HOSPITAL_ADMINISTRATOR`, `DISPATCHER`, or the `DRIVER` currently assigned to the target ambulance.

### Request Payload
```json
{
  "status": "AT_INCIDENT",
  "remarks": "Arrived at scene. Patient is being evaluated."
}
```

### State-Machine Transitions Rules
The backend transitions the ambulance using the following logic:
* **Allowed Transitions**:
  * `AVAILABLE` ➔ `ASSIGNED`
  * `ASSIGNED` ➔ `EN_ROUTE` or `AVAILABLE`
  * `EN_ROUTE` ➔ `AT_INCIDENT` or `AVAILABLE`
  * `AT_INCIDENT` ➔ `PATIENT_ONBOARD` or `AVAILABLE`
  * `PATIENT_ONBOARD` ➔ `HOSPITAL_ARRIVAL`, `SANITIZATION`, or `AVAILABLE`
  * `HOSPITAL_ARRIVAL` ➔ `SANITIZATION` or `AVAILABLE`
  * `SANITIZATION` ➔ `READY` or `AVAILABLE`
  * `READY` ➔ `AVAILABLE`

### Special Business Rules Enforced on Transition

1. **Sanitization Automatic Maintenance**:
   * Transitioning into `SANITIZATION` automatically updates the ambulance's administrative status to `MAINTENANCE`. This filters the vehicle out of the dispatcher's recommendation list to prevent accidental dispatches.
   * The driver assignment remains active so they can complete the sanitization process.

2. **Ready Status Auto-Completion**:
   * Transitioning to `READY` (from `SANITIZATION`) automatically updates the ambulance's lifecycle status to `AVAILABLE` and restores its administrative status to `ACTIVE`.
   * The active `Mission` status is automatically updated to `COMPLETED`.
   * The associated `EmergencyRequest` status is automatically updated to `COMPLETED`.

3. **Driver Cancellation restriction**:
   * A user with the role of `DRIVER` is **forbidden** from transitioning to `AVAILABLE` unless the current status is `READY` (Mission completion). Drivers cannot abort/cancel active missions on their own. Only `DISPATCHER` or `HOSPITAL_ADMINISTRATOR` can cancel/abort missions.

### Response Examples

#### Scenario A: Successful Transition (e.g. to AT_INCIDENT)
* **Status**: `200 OK`
* **Payload**:
  ```json
  {
    "detail": "Ambulance lifecycle status updated successfully.",
    "lifecycle_status": "AT_INCIDENT"
  }
  ```

#### Scenario B: Successful Sanitization Complete (Transitioning to READY)
* **Status**: `200 OK`
* **Payload**:
  ```json
  {
    "detail": "Ambulance lifecycle status updated successfully.",
    "lifecycle_status": "AVAILABLE"
  }
  ```

#### Scenario C: Invalid Transition (e.g. ASSIGNED ➔ PATIENT_ONBOARD)
* **Status**: `400 Bad Request`
* **Payload**:
  ```json
  {
    "detail": "Cannot transition operational status from ASSIGNED to PATIENT_ONBOARD."
  }
  ```

#### Scenario D: Driver attempts to Abort/Cancel a mission
* **Status**: `403 Forbidden`
* **Payload**:
  ```json
  {
    "detail": "Drivers are not authorized to cancel or abort active missions. Please contact a Dispatcher."
  }
  ```

#### Scenario E: Ambulance is in administrative maintenance/inactive mode
* **Status**: `400 Bad Request`
* **Payload**:
  ```json
  {
    "detail": "Cannot transition status of an ambulance that is MAINTENANCE."
  }
  ```

---

## 3. Retrieve Operational Lifecycle History / Audit Trail
Retrieve a chronological audit log of all operational transitions performed on a specific ambulance.

* **URL**: `/api/ambulances/<id>/lifecycle-history/`
* **Method**: `GET`
* **Headers**: 
  * `Authorization: Bearer <token>`
* **Access Control**: `HOSPITAL_ADMINISTRATOR`, `DISPATCHER`, `FLEET_MANAGER`, or the assigned `DRIVER`.

### Response Example
* **Status**: `200 OK`
* **Payload**:
  ```json
  [
    {
      "id": "e9a0de54-32b7-4c91-bdf4-d6a9d7c49b4c",
      "from_status": "SANITIZATION",
      "to_status": "AVAILABLE",
      "changed_at": "2026-07-04T12:00:00Z",
      "changed_by": "Rahul Driver",
      "remarks": "Sanitization complete. Ambulance is fully sterilized and ready."
    },
    {
      "id": "d8a90de5-21a6-4c91-bdf4-d6a9d7c49b4c",
      "from_status": "HOSPITAL_ARRIVAL",
      "to_status": "SANITIZATION",
      "changed_at": "2026-07-04T11:45:00Z",
      "changed_by": "Jane Dispatcher",
      "remarks": "Patient handed over. Beginning decontamination."
    },
    {
      "id": "c7a80de4-10a5-4c91-bdf4-d6a9d7c49b4c",
      "from_status": "ASSIGNED",
      "to_status": "EN_ROUTE",
      "changed_at": "2026-07-04T11:15:00Z",
      "changed_by": "Rahul Driver",
      "remarks": "Departing station."
    }
  ]
  ```
