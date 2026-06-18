# Feature: Ambulance Management Module

## Objective
Develop a comprehensive ambulance master management system to maintain records, stations, and operational status of all ambulances, support driver assignment, manage station transfers, enforce operational business rules, and log all operational events for history tracking.

## Workflow

### 1. Add/Edit/View Ambulance
1. **Add Ambulance**: A `Hospital Administrator` or `Fleet Manager` provides the `ambulance_number`, `hospital_id`, `station_id` (optional), `type` (e.g., Basic Life Support, Advanced Life Support, Patient Transport), and initial `status` (e.g., ACTIVE, MAINTENANCE, INACTIVE).
   - Validation ensures the `ambulance_number` is unique.
2. **Edit Ambulance**: A `Hospital Administrator` or `Fleet Manager` updates the fields of an existing ambulance.
3. **View Ambulance**: `Hospital Administrator`, `Fleet Manager`, or `Dispatcher` views lists of ambulances or individual details.

### 2. Change Status & Log Changes
1. A `Hospital Administrator` or `Fleet Manager` updates an ambulance's status (e.g., to `MAINTENANCE` or `INACTIVE`).
2. The system validates if the status transition is permitted. If the status changes to `MAINTENANCE` or `INACTIVE`, any current active driver assignment is automatically ended (or unassigned).
3. The change is logged in the `AmbulanceOperationalHistory` table with the old status, new status, timestamp, responsible user, and optional remarks.

### 3. Assign/Unassign Driver
1. A `Hospital Administrator` or `Fleet Manager` assigns a driver to an ambulance.
2. The validation engine enforces:
   - The ambulance status must be `ACTIVE`.
   - Ambulances under `MAINTENANCE` or `INACTIVE` cannot receive driver assignments.
   - The driver's availability must be `True`.
3. If the driver is already assigned to another ambulance, the previous assignment is closed (`end_time` set to current time) and the driver is reassigned.
4. If the ambulance had a previous active assignment, it is closed, and the new assignment is started.
5. The assignment/unassignment is logged in `AmbulanceOperationalHistory`.

### 4. Transfer Station
1. A `Hospital Administrator` or `Fleet Manager` transfers an ambulance to another station.
2. The system updates the `station_id` and logs the transfer (old station to new station) in `AmbulanceOperationalHistory`.

### 5. View Operational History
1. Users with access roles can view a timeline of operational history (status changes, driver assignments, station transfers) for any ambulance.

---

## APIs

Base path: `/api/`

- `GET /api/ambulances/` - List all ambulances (accessible to Admin, Fleet Manager, Dispatcher).
- `POST /api/ambulances/` - Create a new ambulance (accessible to Admin, Fleet Manager).
- `GET /api/ambulances/<id>/` - Retrieve a specific ambulance details (accessible to Admin, Fleet Manager, Dispatcher).
- `PATCH /api/ambulances/<id>/` - Update ambulance details (accessible to Admin, Fleet Manager).
- `DELETE /api/ambulances/<id>/` - Delete an ambulance (accessible to Admin, Fleet Manager).
- `POST /api/ambulances/<id>/assign-driver/` - Assign or unassign driver (accessible to Admin, Fleet Manager).
- `POST /api/ambulances/<id>/transfer/` - Transfer ambulance to another station (accessible to Admin, Fleet Manager).
- `POST /api/ambulances/<id>/change-status/` - Change ambulance status and record history (accessible to Admin, Fleet Manager).
- `GET /api/ambulances/<id>/history/` - View operational history logs (accessible to Admin, Fleet Manager, Dispatcher).
- `GET /api/hospitals/` - List all hospitals (accessible to Admin, Fleet Manager, Dispatcher).
- `GET /api/stations/` - List all stations (accessible to Admin, Fleet Manager, Dispatcher).
- `GET /api/drivers/` - List all drivers (accessible to Admin, Fleet Manager).

---

## Acceptance Criteria

### Business Logic & Validation
- **Unique Ambulance Number**: The validation engine must prevent creation/updating of ambulances with duplicate vehicle numbers (case-insensitive).
- **Active Assignment Rule**: Only active ambulances (status = `ACTIVE`) can receive driver assignments.
- **Maintenance Assignment Rule**: Ambulances under `MAINTENANCE` cannot receive driver assignments.
- **Driver Reassignment**: Assigning a driver to an ambulance marks their availability as `False` (or handled via active assignments) and closes any of their active assignments on other ambulances.

### Security & RBAC
- **Read Access**: Only `Hospital Administrator`, `Fleet Manager`, and `Dispatcher` roles are permitted to read ambulance list and details. Others receive `403 Forbidden`.
- **Write/Action Access**: Only `Hospital Administrator` and `Fleet Manager` roles are permitted to add/edit/delete/assign/transfer/change status. Others receive `403 Forbidden`.
- **Audit logs**: Write operations must also generate standard User Activity Logs as handled by `UserActivityLoggingMiddleware`.

### Operational History Logging
- Every status change, station transfer, and driver assignment/unassignment must create an `AmbulanceOperationalHistory` log entry with a timestamp, action type, old and new values, and the user who made the change.
