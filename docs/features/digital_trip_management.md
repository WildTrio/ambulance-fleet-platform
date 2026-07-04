# Feature: Digital Trip Management (Phase 8)

## Objective
Develop a fully automated digital trip recording and tracking system. The system automatically creates a trip record when a mission is initialized, logs start and end timestamps based on driver transitions, computes actual travel distances using coordinates, tracks driver/ambulance pairings, and generates a natural-language summary report upon mission completion.

---

## Workflow

The automated trip lifecycle proceeds as follows:

```
[Mission Created] ────(Auto Trigger)────> [Trip Created: Status = ACTIVE]
                                                 │
                                         (Driver transitions to EN_ROUTE)
                                                 │
                                                 ▼
                                         [Start Time Logged]
                                                 │
                                   (Driver transitions to READY/AVAILABLE)
                                                 │
                                                 ▼
                                         [End Time Logged]
                                                 │
                                 (Calculate distance & duration)
                                                 │
                                                 ▼
                                   [Generate Mission Summary Report]
                                                 │
                                                 ▼
                                    [Trip Status = COMPLETED/CANCELLED]
```

### 1. Trip Initialization & Tracking
* **Trip Creation**: A `Trip` record is automatically created in `ACTIVE` status when a new `Mission` is created.
* **Start Time Recording**: The `start_time` is logged when the ambulance departs and transitions to the `EN_ROUTE` operational status.
* **End Time Recording**: The `end_time` is logged when the mission concludes (the operational status transitions to `AVAILABLE` / completed or is aborted/cancelled).

### 2. Distance & Duration Calculations
* **Duration**: Calculated as `end_time - start_time`.
* **Distance Calculation**: The total distance (in kilometers) is calculated using the Haversine formula based on when the cancellation/completion occurs:
  * **Normal Completion**: Calculated as **Segment 1 + Segment 2**:
    * *Segment 1 (Dispatch Route)*: Station coordinates to the incident scene (`EmergencyRequest` coordinates).
    * *Segment 2 (Transport Route)*: Incident scene coordinates to the hospital station coordinates.
  * **Cancellation before Departure (in ASSIGNED status)**:
    * If cancelled before the ambulance departs, `start_time` and `end_time` are set to the cancellation timestamp, and the distance is recorded as `0.0`.
  * **Cancellation after Departure but before patient pick-up (in EN_ROUTE or AT_INCIDENT status)**:
    * Calculated as **Segment 1** (Station to Incident), representing the outbound leg.
  * **Cancellation after patient pick-up (in PATIENT_ONBOARD or HOSPITAL_ARRIVAL status)**:
    * Calculated as **Segment 1 + Segment 2** (Station ➔ Incident ➔ Hospital), as the transport was already initiated or completed before cancellation.
  * **Safety Fallback**: If coordinates are missing or invalid, the distance defaults to `0.0` to prevent runtime crashes.

### 3. Mission Summary Generation
Upon trip completion or cancellation, the system automatically generates a concise summary text:
* **Completed Trip Summary Template**:
  ```
  Trip completed successfully. Total duration: {minutes} mins. Total distance: {distance} km. Driver: {driver_name}. Vehicle: {ambulance_number}. Patient: {patient_name} ({incident_type}). Destination: {hospital_name}.
  ```
* **Cancelled Trip Summary Template**:
  ```
  Trip cancelled midway. Phase reached: {last_phase}. Total duration: {minutes} mins. Total distance: {distance} km. Driver: {driver_name}. Vehicle: {ambulance_number}. Reason/Remarks: {remarks_or_cancellation_reason}.
  ```

---

## APIs

Base path: `/api/`

### 1. List All Trips
* **URL**: `/api/trips/`
* **Method**: `GET`
* **Headers**:
  * `Authorization: Bearer <token>`
* **Query Parameters**:
  * `driver_id` (UUID) - Filter by driver
  * `ambulance_id` (UUID) - Filter by vehicle
  * `status` (String) - Filter by status (`ACTIVE`, `COMPLETED`, `CANCELLED`)
  * `start_date` (YYYY-MM-DD) - Filter trips starting on or after this date
  * `end_date` (YYYY-MM-DD) - Filter trips starting on or before this date
* **Access Control**: `HOSPITAL_ADMINISTRATOR`, `DISPATCHER`, or `FLEET_MANAGER`.

### 2. Retrieve Specific Trip Details
* **URL**: `/api/trips/<id>/`
* **Method**: `GET`
* **Headers**:
  * `Authorization: Bearer <token>`
* **Access Control**: `HOSPITAL_ADMINISTRATOR`, `DISPATCHER`, `FLEET_MANAGER`, or the assigned `DRIVER` of the trip.

### 3. Retrieve Driver's Own Trips
* **URL**: `/api/trips/my-trips/`
* **Method**: `GET`
* **Headers**:
  * `Authorization: Bearer <token>`
* **Access Control**: Authenticated users with the `DRIVER` role. Returns only trips driven by the logged-in user.

---

## Acceptance Criteria

### Trip Logging Accuracy
* A `Trip` object must be created automatically upon creating a new `Mission`.
* The `start_time` must be recorded only when the ambulance transitions to `EN_ROUTE`.
* The `end_time` must match the timestamp when the mission is completed or cancelled.
* If a mission is cancelled before the driver transitions to `EN_ROUTE` (i.e. was in `ASSIGNED`), the `start_time` and `end_time` should both default to the cancellation timestamp, and the distance should be `0.0`.

### Distance Engine
* Calculate geodesic distance accurately using the Haversine formula.
* Safely handle situations where station coordinates or emergency request coordinates are null by defaulting to `0.0` rather than causing an error.

### Security & RBAC
* Only admins, dispatchers, and fleet managers can fetch the full list of trips.
* A driver must be blocked from requesting `/api/trips/` (receives `403 Forbidden`).
* A driver must only be allowed to request `/api/trips/my-trips/` or retrieve details for a specific trip if they were the designated driver of that trip.

### UI Delivery
* **Management UI**: A dedicated **Trip History** table in the Dispatch Console with columns for Driver, Ambulance, Duration, Distance, Status, and Date. Clicking on a row opens a modal displaying the full trip details and the generated summary report.
* **Driver UI**: A collapsible **Trip Log** panel in the Driver Console displaying a list of their past completed trips.
