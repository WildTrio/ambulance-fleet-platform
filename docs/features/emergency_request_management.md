# Feature: Emergency Request Management

## Objective
Develop a system to log, prioritize, track, and manage emergency assistance requests. This module enables citizens (Emergency Requestors) to request help directly, and dispatchers/administrators to intake phone-in requests, prioritize them, and manage the emergency request queue.

## Workflow

### 1. Create Emergency Request
- **Citizen (Emergency Requestor)**: 
  1. Logs in and submits an emergency request.
  2. Input: `requester_name`, `contact_number`, `emergency_type`, `pickup_location`.
  3. Geocoding Assist: Upon entering the `pickup_location`, the system automatically attempts to fetch geographical coordinates (`latitude` and `longitude`) via a geocoding API.
     - If coordinates are found, they are pre-filled automatically.
     - If the API fails or cannot find the address, the user is prompted to input the `latitude` and `longitude` coordinates manually.
  4. The request's `created_by` field is automatically set to the logged-in user.
  5. The initial status is set to `PENDING`, and the priority defaults to `MEDIUM`.
- **Dispatcher / Hospital Administrator**:
  1. Receives an emergency phone call/incident report.
  2. Logs the request on behalf of the citizen.
  3. Input: `requester_name`, `contact_number`, `emergency_type`, `pickup_location` (with the same automatic geocoding/manual coordinate entry override flow), and optionally `priority` (defaults to `MEDIUM`).
  4. The request's `created_by` field is set to the dispatcher/administrator.

### 2. Priority Assignment
- Emergency requests are assigned a priority (`LOW`, `MEDIUM`, `HIGH`, `CRITICAL`).
- Only `DISPATCHER` and `HOSPITAL_ADMINISTRATOR` roles can update or assign a priority to a request.
- Citizens cannot change the priority of a request.

### 3. Emergency Queue Management
- `DISPATCHER` and `HOSPITAL_ADMINISTRATOR` can view the **Emergency Request Queue**.
- The queue displays active requests (`PENDING`, `ASSIGNED`, `IN_PROGRESS`).
- The list is sorted in descending order of severity: `CRITICAL` > `HIGH` > `MEDIUM` > `LOW`. Within the same priority, older requests (by `created_at` timestamp) are listed first.
- Dispatchers/Administrators can view details, update the request status, or change the priority.

### 4. Cancel/Update Request
- **Cancellation**:
  - An `EMERGENCY_REQUESTOR` can cancel their own requests (changing status to `CANCELLED`) if the request is in `PENDING` or `ASSIGNED` status.
  - A `DISPATCHER` or `HOSPITAL_ADMINISTRATOR` can cancel any request at any stage.
  - Once a request is marked `COMPLETED` or `CANCELLED`, no further status or detail updates are allowed.
- **Updates**:
  - `DISPATCHER` and `HOSPITAL_ADMINISTRATOR` can update any editable fields of a request.
  - `EMERGENCY_REQUESTOR` can update the pickup location, contact number, or requester name if the request is still `PENDING`.

---

## APIs
The backend exposes the following endpoints (see `docs/api/emergency-request-api-spec.md` for full specification):
- `GET /api/emergency-requests/` - List emergency requests (Queue). Filterable by status and priority. Dispatcher/Admin see all; Requestor sees own.
- `POST /api/emergency-requests/` - Create a new emergency request.
- `GET /api/emergency-requests/<id>/` - Retrieve a specific request.
- `PATCH /api/emergency-requests/<id>/` - Update a request (status, priority, details).
- `DELETE /api/emergency-requests/<id>/` - Restricted (Not allowed or Admin only; soft cancellation is preferred).

---

## Acceptance Criteria

### Input Validation & Business Rules
- **Fields Requirement**: `requester_name`, `contact_number`, `emergency_type`, `pickup_location`, `latitude`, and `longitude` are required.
- **Latitude / Longitude**: Must be valid decimal coordinates (Latitude: -90 to 90, Longitude: -180 to 180).
- **Status Constraints**:
  - Valid statuses: `PENDING`, `ASSIGNED`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`.
  - Once a request status is `COMPLETED` or `CANCELLED`, no further transitions or modifications are allowed.
- **Priority Values**: Must be one of `LOW`, `MEDIUM`, `HIGH`, `CRITICAL`. Only dispatchers/admins can modify this field.

### Security & RBAC
- **Read Access**:
  - `HOSPITAL_ADMINISTRATOR` and `DISPATCHER` can view all requests in the system.
  - `EMERGENCY_REQUESTOR` can only retrieve and view requests where `created_by` matches their own user account.
  - `FLEET_MANAGER` and `DRIVER` are denied access.
- **Create Access**:
  - `EMERGENCY_REQUESTOR` and `DISPATCHER` are permitted to create requests.
- **Update Access**:
  - `EMERGENCY_REQUESTOR` can only modify their own requests, restricted to fields `requester_name`, `contact_number`, `pickup_location`, `latitude`, `longitude`, and only when status is `PENDING`. They can change the status to `CANCELLED` if it is `PENDING` or `ASSIGNED`.
  - `DISPATCHER` and `HOSPITAL_ADMINISTRATOR` can modify any request's status, priority, and other fields.
- **Activity Logging**: All write operations (POST, PATCH) must generate user activity logs.
