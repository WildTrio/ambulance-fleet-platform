# Feature: Ambulance Lifecycle Tracking

## Objective
Develop a robust operational mission tracking workflow that manages the operational lifecycle status of ambulances and synchronizes their active phases with incident missions. The system will enforce a state transition engine, log a full audit trail of transitions for timeline tracking, and provide a monitoring dashboard for dispatchers/managers and a command console for drivers.

## Workflow

The ambulance operational lifecycle consists of the following status transitions:

```
[Available] ──(Dispatch/Create Mission)──> [Assigned]
                                               │
                                       (Depart / En Route)
                                               │
                                               ▼
[Ready] <──(Complete Sanitization)── [Sanitization] <──(Arrive Hospital)── [Hospital Arrival] <──(Onboard Patient)── [Patient Onboard] <──(Arrive Scene)── [At Incident] <──(Depart / En Route)── [En Route]
   │
 (Mark Available)
   │
   ▼
[Available] (Completes Mission & Request)
```

### 1. State Machine Transitions (Status Engine)
- **Available**: The ambulance is active, in-service, has an assigned driver, and is not currently on a mission.
- **Assigned**: The dispatcher assigns a `Ready` ambulance to a pending incident. The ambulance status transitions from `AVAILABLE` to `ASSIGNED`.
- **En Route**: The driver departs from the station towards the incident scene. The status transitions from `ASSIGNED` to `EN_ROUTE`.
- **At Incident**: The ambulance arrives at the scene of the incident. The status transitions from `EN_ROUTE` to `AT_INCIDENT`.
- **Patient Onboard**: The patient is loaded and secured in the ambulance. The status transitions from `AT_INCIDENT` to `PATIENT_ONBOARD`.
- **Hospital Arrival**: The ambulance arrives at the designated hospital. The status transitions from `PATIENT_ONBOARD` to `HOSPITAL_ARRIVAL`.
- **Sanitization**: The patient is handed over, and the crew begins cleaning and disinfecting the ambulance. The status transitions from `HOSPITAL_ARRIVAL` to `SANITIZATION`.
- **Ready**: Sanitization is complete, and the vehicle is fully ready. The status transitions from `SANITIZATION` to `READY`.
- **Complete (Back to Available)**: The crew marks the vehicle as available. The status transitions from `READY` to `AVAILABLE`. This final transition automatically:
  - Sets the linked `Mission` status to `COMPLETED`.
  - Sets the linked `EmergencyRequest` status to `COMPLETED`.
  - Frees the driver and ambulance from the active mission.

### 2. Exception/Cancellation Flows
- If a mission is cancelled or aborted at any point before `SANITIZATION` (i.e. in `ASSIGNED`, `EN_ROUTE`, `AT_INCIDENT`):
  - The mission transitions to `CANCELLED`.
  - The emergency request is reverted back to `PENDING` to allow reassignment.
  - The ambulance operational status resets directly to `AVAILABLE`.
- If a mission is cancelled or aborted *after* a patient has been onboarded (i.e. in `PATIENT_ONBOARD` or `HOSPITAL_ARRIVAL`):
  - The mission transitions to `CANCELLED` (or `COMPLETED` depending on dispatcher action).
  - The ambulance transitions to `SANITIZATION` to ensure sanitization protocols are completed before returning to `AVAILABLE` status.

### 3. Timeline Tracking & Audit Trail
- Every lifecycle status transition (both successful transitions and cancellations) must log a record in `AmbulanceLifecycleLog`.
- Each log entry stores the old status, new status, user who performed the transition, timestamp, and optional remarks (e.g. sanitization notes).

---

## APIs

Base path: `/api/`

### 1. Transition Operational Lifecycle
- `POST /api/ambulances/<id>/transition-lifecycle/`
  - Payload:
    ```json
    {
      "status": "EN_ROUTE",
      "remarks": "Departing station"
    }
    ```
  - Transition the operational status of the ambulance. Validates the transition using the state transition engine. Updates the linked active mission and emergency request statuses in sync.
  - Access Control: `HOSPITAL_ADMINISTRATOR`, `DISPATCHER`, or the `DRIVER` currently assigned to the ambulance.

### 2. Retrieve Lifecycle History / Audit Trail
- `GET /api/ambulances/<id>/lifecycle-history/`
  - Returns a chronological list of status transitions for the ambulance, including the user, status change, timestamp, and remarks.
  - Access Control: `HOSPITAL_ADMINISTRATOR`, `DISPATCHER`, `FLEET_MANAGER`, or the assigned `DRIVER`.

### 3. Sync with Mission Update API
- `PATCH /api/missions/<id>/`
  - Updating the mission status via this endpoint will also trigger the corresponding ambulance operational status update, run the state transition validation, and write to the audit trail.

---

## Acceptance Criteria

### Security & RBAC
- **Transition Access**: Only `HOSPITAL_ADMINISTRATOR`, `DISPATCHER`, or the `DRIVER` assigned to that specific ambulance can perform lifecycle status updates. Others receive `403 Forbidden`.
- **View Access**: `HOSPITAL_ADMINISTRATOR`, `DISPATCHER`, `FLEET_MANAGER`, and the assigned `DRIVER` can view the audit trail and lifecycle status.

### Status Engine Rules
- Reject invalid state transitions with `400 Bad Request` and a descriptive message (e.g. "Cannot transition directly from Assigned to Patient Onboard").
- Prevent transitioning an ambulance's lifecycle status if the ambulance is administrative status `MAINTENANCE` or `INACTIVE`.
- Ensure cancellation logic correctly resets ambulance to `AVAILABLE` or transitions to `SANITIZATION`.

### Real-Time & Timeline Visuals
- The tracking dashboard must display all ambulances, color-coded by their lifecycle phase, with pulsing indicator lights.
- Selecting an ambulance displays its current active mission (if any), a visual progress stepper (indicating completed and active phases), and a chronological list of its lifecycle logs (the status audit trail).
- If the logged-in user is a `DRIVER` with an active mission, they must see a tailored control panel to easily advance their ambulance through the lifecycle phases with one click.
