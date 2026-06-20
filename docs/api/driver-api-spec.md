# API Specifications: Driver Management Module

All endpoints reside under the base path: **`http://localhost:8000/api/`**

---

## 1. List / Create Drivers

* **Endpoint**: `/drivers/`
* **Method**: `GET` (List) / `POST` (Create)
* **Authentication**: Required (`Authorization: Bearer <access_token>`)
* **Access Rules**: 
  - `GET`: `HOSPITAL_ADMINISTRATOR`, `FLEET_MANAGER`, `DISPATCHER`
  - `POST`: `HOSPITAL_ADMINISTRATOR`, `FLEET_MANAGER`

### GET Query Parameters (Optional)
- `available`: `true` (Filter only drivers who are currently available for assignment and not active on any vehicle)

### POST Request Body
```json
{
  "name": "Jane Driver",
  "email": "jane@hospital.org",
  "password": "Password123",
  "contact": "555-0102",
  "license_number": "DL-55223344",
  "availability": true
}
```

### POST Response (`201 Created`)
```json
{
  "id": "e3c2cb88-8b0b-4ef8-bb6d-6bb9bd380a44",
  "user": "a2c2cb88-8b0b-4ef8-bb6d-6bb9bd380a12",
  "name": "Jane Driver",
  "email": "jane@hospital.org",
  "contact": "555-0102",
  "license_number": "DL-55223344",
  "availability": true
}
```

---

## 2. Retrieve / Update / Delete Driver

* **Endpoint**: `/drivers/<id>/`
* **Method**: `GET` / `PATCH` / `DELETE`
* **Authentication**: Required
* **Access Rules**:
  - `GET`: `HOSPITAL_ADMINISTRATOR`, `FLEET_MANAGER`, `DISPATCHER`
  - `PATCH` / `DELETE`: `HOSPITAL_ADMINISTRATOR`, `FLEET_MANAGER`

### PATCH Request Body (e.g., Toggle Availability or Edit Contact)
```json
{
  "contact": "555-0199",
  "availability": true
}
```
*Note: Manually updating `availability` from `false` to `true` automatically terminates any active ambulance assignments and logs the unassignment history.*

### GET Response (`200 OK`)
```json
{
  "id": "e3c2cb88-8b0b-4ef8-bb6d-6bb9bd380a44",
  "user": "a2c2cb88-8b0b-4ef8-bb6d-6bb9bd380a12",
  "name": "Jane Driver",
  "email": "jane@hospital.org",
  "contact": "555-0199",
  "license_number": "DL-55223344",
  "availability": true
}
```

### DELETE Response (`204 No Content`)
*Note: Cascades and deletes the linked User account, as well as driver assignment history.*

### DELETE Error Response (`400 Bad Request` - e.g., Driver is currently assigned to an active ambulance)
```json
{
  "detail": "Active drivers cannot be deleted. Unassign the driver from their ambulance first."
}
```

---

## 3. Shift Scheduler

Endpoints to manage scheduled working shifts for drivers.

* **Endpoint**: `/shifts/` (List / Create) or `/shifts/<id>/` (Retrieve / Edit / Delete)
* **Method**: `GET` / `POST` / `PATCH` / `DELETE`
* **Authentication**: Required
* **Access Rules**:
  - `GET`: `HOSPITAL_ADMINISTRATOR`, `FLEET_MANAGER`, `DISPATCHER`
  - `POST` / `PATCH` / `DELETE`: `HOSPITAL_ADMINISTRATOR`, `FLEET_MANAGER`

### GET Query Parameters (Optional)
- `driver_id`: Filter shifts by driver UUID

### POST / PATCH Request Body
```json
{
  "driver": "e3c2cb88-8b0b-4ef8-bb6d-6bb9bd380a44",
  "start_time": "2026-06-25T08:00:00Z",
  "end_time": "2026-06-25T16:00:00Z"
}
```
*Validation: End time must fall after start time.*

### POST Response (`201 Created`)
```json
{
  "id": "f1c2cb88-8b0b-4ef8-bb6d-6bb9bd380a88",
  "driver": "e3c2cb88-8b0b-4ef8-bb6d-6bb9bd380a44",
  "start_time": "2026-06-25T08:00:00Z",
  "end_time": "2026-06-25T16:00:00Z"
}
```

---

## 4. Certification Logger

Endpoints to record credentials and training certificates.

* **Endpoint**: `/certifications/` (List / Create) or `/certifications/<id>/` (Retrieve / Edit / Delete)
* **Method**: `GET` / `POST` / `PATCH` / `DELETE`
* **Authentication**: Required
* **Access Rules**:
  - `GET`: `HOSPITAL_ADMINISTRATOR`, `FLEET_MANAGER`, `DISPATCHER`
  - `POST` / `PATCH` / `DELETE`: `HOSPITAL_ADMINISTRATOR`, `FLEET_MANAGER`

### GET Query Parameters (Optional)
- `driver_id`: Filter certifications by driver UUID

### POST / PATCH Request Body
```json
{
  "driver": "e3c2cb88-8b0b-4ef8-bb6d-6bb9bd380a44",
  "name": "Advanced Cardiovascular Life Support (ACLS)",
  "certificate_number": "CERT-2026-8899",
  "issuing_authority": "American Heart Association",
  "issue_date": "2025-01-10",
  "expiry_date": "2027-01-10"
}
```
*Validation: Expiry date must fall after issue date.*

### POST Response (`201 Created`)
```json
{
  "id": "g1c2cb88-8b0b-4ef8-bb6d-6bb9bd380a77",
  "driver": "e3c2cb88-8b0b-4ef8-bb6d-6bb9bd380a44",
  "name": "Advanced Cardiovascular Life Support (ACLS)",
  "certificate_number": "CERT-2026-8899",
  "issuing_authority": "American Heart Association",
  "issue_date": "2025-01-10",
  "expiry_date": "2027-01-10"
}
```
