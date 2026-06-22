# Feature: Dispatch Console

## Objective
Develop a centralized operational dispatch center that enables dispatchers and administrators to monitor emergency requests, find nearby available ambulances, assign drivers, dispatch ambulances to incidents (creating missions), and monitor active missions.

## Workflow

### 1. View Dispatch Console Dashboard
- **Access**: `HOSPITAL_ADMINISTRATOR` and `DISPATCHER` roles.
- **Incident List**: Displays active emergency requests (`PENDING`, `ASSIGNED`, `IN_PROGRESS`) sorted by priority severity and age (oldest first).
- **Incident Selection**: Selecting an active emergency request displays the dispatch card with coordinates and pickup location.

### 2. View Nearby Ambulances & Readiness
- Upon selecting an incident, the system fetches nearby ambulances.
- **Distance & ETA Calculation**: The system queries the GraphHopper Route API using thread-parallel execution to compute real driving distance (in kilometers) and ETA (in minutes) between the incident's coordinates and each ambulance's station coordinates.
- **Fail-Safe Fallback**: If the GraphHopper API key is not configured, or if the API request fails/times out, the system automatically falls back to calculating straight-line (Haversine) distance and estimates the ETA assuming a standard driving speed (e.g. 40 km/h) to guarantee high availability and prevent application crashes.
- **Ambulance Grid/List**: Displays:
  - Ambulance vehicle number and type.
  - Station name and calculated distance from incident.
  - **Availability Status**:
    - `AVAILABLE`: Active ambulance and not on a mission.
    - `ON_MISSION`: Currently assigned to an active mission.
    - `MAINTENANCE`: Under maintenance.
    - `INACTIVE`: Inactive.
  - **Readiness Information**:
    - `Ready`: If `AVAILABLE` and has an active driver assigned.
    - `No Driver`: If `AVAILABLE` and has no active driver.
    - `On Mission`: If currently on an active mission.
    - `Under Maintenance`: If under maintenance.
    - `Inactive`: If inactive.
  - **Current Driver**: Name and license number of the driver (if assigned).
- The list of ambulances is sorted by distance ascending (nearest first).

### 3. Driver & Ambulance Assignment (Mission Creation)
- **Assign Driver on the fly**: If a dispatcher selects an `ACTIVE` ambulance that has `No Driver`, they can select an available driver (marked `availability=True`) from a dropdown list and assign them directly to the ambulance.
- **Assign Ambulance (Dispatch)**: The dispatcher can assign any `Ready` ambulance to the selected incident.
- **Mission Creation Engine**:
  - Submitting the assignment creates a new `Mission` record with status `ASSIGNED`.
  - The linked `EmergencyRequest` status transitions to `ASSIGNED`.
  - The driver and ambulance are now occupied by this active mission.

### 4. Monitor & Track Active Missions
- A dedicated panel on the Dispatch Dashboard displays all ongoing missions (`ASSIGNED`, `EN_ROUTE`, `ON_SITE`, `TRANSPORTING`, `ARRIVED_HOSPITAL`).
- Dispatchers/Administrators can transition mission statuses:
  - `ASSIGNED` -> `EN_ROUTE` -> `ON_SITE` -> `TRANSPORTING` -> `ARRIVED_HOSPITAL` -> `COMPLETED`.
  - When the mission status changes to `EN_ROUTE` (or subsequent transit states), the linked `EmergencyRequest` status changes to `IN_PROGRESS`.
  - When the mission status is updated to `COMPLETED`:
    - The `Mission` status becomes `COMPLETED`.
    - The linked `EmergencyRequest` status becomes `COMPLETED`.
    - The ambulance and driver are freed and become available for other assignments.
  - If a mission is `CANCELLED`:
    - The `Mission` status becomes `CANCELLED`.
    - The linked `EmergencyRequest` status is reset back to `PENDING` so that it can be dispatched to a different ambulance.
  - If an `EmergencyRequest` itself is cancelled, any active mission linked to it is automatically cancelled as well.

### 5. Fleet Dashboard Visibility & Operational Locks
- **Real-Time Visibility**: Fleet Managers and Administrators can see if an ambulance is currently on a mission (indicated by a pulsing **"On Mission (STATUS)"** badge) directly in the Ambulance Fleet Management grid.
- **Operational Safety Locks**:
  - To prevent operational conflicts, all edit, transfer, delete, status change, and driver assignment controls are disabled in the frontend UI for any ambulance currently active on a mission.
  - The backend `AmbulanceViewSet` enforces strict guards to reject any attempts to update driver assignment, transfer station, change status, edit details, or delete the ambulance, returning `400 Bad Request` with an appropriate message.

---

## APIs

The backend exposes the following endpoints (see [dispatch-console-mission-api-spec.md](file:///home/why_ashh/yash/ambulance/docs/api/dispatch-console-mission-api-spec.md) for full specification):

Base path: `/api/`

### 1. Find Nearby Ambulances
- `GET /api/ambulances/nearby/`
  - Query parameters:
    - `latitude` (decimal, required)
    - `longitude` (decimal, required)
  - Returns a list of all ambulances with calculated driving distance, estimated ETA, availability status, readiness information, and current driver. Sorted by distance ascending.

### 2. Create Mission
- `POST /api/missions/`
  - Payload:
    ```json
    {
      "emergency_request_id": "uuid",
      "ambulance_id": "uuid",
      "driver_id": "uuid" (optional)
    }
    ```
  - Creates an active mission and transitions the request's status to `ASSIGNED`. If `driver_id` is supplied, it assigns the driver to the ambulance first.

### 3. List / Update Mission
- `GET /api/missions/` - List all missions (supports filtering by `active=true`).
- `GET /api/missions/<id>/` - Retrieve mission details.
- `PATCH /api/missions/<id>/` - Update mission status.
  - Payload:
    ```json
    {
      "status": "EN_ROUTE"
    }
    ```

---

## Acceptance Criteria

### Business Rules & Validation
- **Role Permissions**: Only `HOSPITAL_ADMINISTRATOR` and `DISPATCHER` roles can create, view, or update missions and view nearby ambulances. Other roles receive `403 Forbidden`.
- **Distance & ETA Calculation**: Real driving distance and ETA calculated via GraphHopper API, with a robust fallback to Haversine straight-line distance and speed-based ETA estimation in case of API failure.
- **Dispatch Validation**:
  - Only `PENDING` emergency requests can be dispatched (create mission).
  - Only `ACTIVE` ambulances can be dispatched.
  - Ambulances already on an active mission cannot be dispatched.
  - Ambulances must have a driver assigned to be dispatched.
- **Status Coherence**: Updating the mission status automatically updates the linked emergency request's status accordingly (`ASSIGNED`/`IN_PROGRESS`/`COMPLETED`).
- **Cancellation Flow**: Cancelling a mission reverts the emergency request back to `PENDING` and frees the ambulance. Cancelling the emergency request itself automatically cancels the linked mission.
- **Operational Safety Locks**:
  - Direct modifications to a vehicle's assignments, station, administrative status, or details are blocked on the backend when it is on an active mission, returning `400 Bad Request`.
  - Frontend buttons (Assign, Transfer, Status, Edit, Delete) are disabled for ambulances on a mission, with tooltips indicating that the vehicle is currently busy.

### Audit Logging
- Every mission creation and status update must generate user activity logs.
