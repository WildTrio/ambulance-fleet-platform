# API Specifications: Emergency Request Management

All endpoints reside under the base path: **`http://localhost:8000/api/`**

---

## 1. List / Create Emergency Requests

* **Endpoint**: `/emergency-requests/`
* **Method**: `GET` (List) / `POST` (Create)
* **Authentication**: Required (`Authorization: Bearer <access_token>`)
* **Access Rules**:
  - `GET`: `HOSPITAL_ADMINISTRATOR`, `DISPATCHER`, `EMERGENCY_REQUESTOR`
    - *Note: Administrators and Dispatchers retrieve all requests. Emergency Requestors retrieve only requests they created.*
  - `POST`: `DISPATCHER`, `EMERGENCY_REQUESTOR`

### GET Query Parameters (Optional)
- `status`: Filter requests by status (e.g. `PENDING`, `ASSIGNED`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`)
- `priority`: Filter requests by priority (e.g. `LOW`, `MEDIUM`, `HIGH`, `CRITICAL`)

### GET Response (`200 OK`)
Returns a list of requests. For Administrators and Dispatchers, the list is sorted by:
1. Priority descending (`CRITICAL` > `HIGH` > `MEDIUM` > `LOW`)
2. `created_at` ascending (older requests first)

For Requestors, it is sorted by `created_at` descending.

```json
[
  {
    "id": "a3c2cb88-8b0b-4ef8-bb6d-6bb9bd380a01",
    "requester_name": "John Doe",
    "contact_number": "555-0199",
    "emergency_type": "Cardiac Arrest",
    "priority": "CRITICAL",
    "pickup_location": "123 Main St, Springfield",
    "latitude": "37.774900",
    "longitude": "-122.419400",
    "status": "PENDING",
    "created_by": {
      "id": "e3c2cb88-8b0b-4ef8-bb6d-6bb9bd380a44",
      "email": "citizen@gmail.com",
      "name": "Emergency Requestor"
    },
    "created_at": "2026-06-21T10:00:00Z",
    "updated_at": "2026-06-21T10:05:00Z"
  }
]
```

### POST Request Body
```json
{
  "requester_name": "John Doe",
  "contact_number": "555-0199",
  "emergency_type": "Cardiac Arrest",
  "pickup_location": "123 Main St, Springfield",
  "latitude": 37.7749,
  "longitude": -122.4194,
  "priority": "CRITICAL"
}
```
*Note: `priority` is optional and can only be set if request is made by a `DISPATCHER` or `HOSPITAL_ADMINISTRATOR`. If a citizen sets it, it is ignored and defaulted to `MEDIUM`.*

### POST Response (`201 Created`)
```json
{
  "id": "a3c2cb88-8b0b-4ef8-bb6d-6bb9bd380a01",
  "requester_name": "John Doe",
  "contact_number": "555-0199",
  "emergency_type": "Cardiac Arrest",
  "priority": "CRITICAL",
  "pickup_location": "123 Main St, Springfield",
  "latitude": "37.774900",
  "longitude": "-122.419400",
  "status": "PENDING",
  "created_by": {
    "id": "e3c2cb88-8b0b-4ef8-bb6d-6bb9bd380a44",
    "email": "citizen@gmail.com",
    "name": "Emergency Requestor"
  },
  "created_at": "2026-06-21T10:00:00Z",
  "updated_at": "2026-06-21T10:00:00Z"
}
```

---

## 2. Retrieve / Update / Delete Emergency Request

* **Endpoint**: `/emergency-requests/<id>/`
* **Method**: `GET` / `PATCH` / `DELETE`
* **Authentication**: Required
* **Access Rules**:
  - `GET`: `HOSPITAL_ADMINISTRATOR`, `DISPATCHER`, `EMERGENCY_REQUESTOR` (Own Only)
  - `PATCH`: `HOSPITAL_ADMINISTRATOR`, `DISPATCHER`, `EMERGENCY_REQUESTOR` (Own Only, restricted to `PENDING` status for details, or changing status to `CANCELLED`)
  - `DELETE`: Denied (Method not allowed)

### PATCH Request Body (Example: Dispatcher updating status and priority)
```json
{
  "priority": "CRITICAL",
  "status": "ASSIGNED"
}
```

### PATCH Request Body (Example: Citizen cancelling request)
```json
{
  "status": "CANCELLED"
}
```

### PATCH Response (`200 OK`)
```json
{
  "id": "a3c2cb88-8b0b-4ef8-bb6d-6bb9bd380a01",
  "requester_name": "John Doe",
  "contact_number": "555-0199",
  "emergency_type": "Cardiac Arrest",
  "priority": "CRITICAL",
  "pickup_location": "123 Main St, Springfield",
  "latitude": "37.774900",
  "longitude": "-122.419400",
  "status": "ASSIGNED",
  "created_by": {
    "id": "e3c2cb88-8b0b-4ef8-bb6d-6bb9bd380a44",
    "email": "citizen@gmail.com",
    "name": "Emergency Requestor"
  },
  "created_at": "2026-06-21T10:00:00Z",
  "updated_at": "2026-06-21T10:08:00Z"
}
```

### PATCH Error Response (`400 Bad Request` - e.g., Request already completed or cancelled)
```json
{
  "detail": "Cannot modify an emergency request that is already COMPLETED or CANCELLED."
}
```
