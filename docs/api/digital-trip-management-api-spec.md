# API Specifications: Digital Trip Management Module (Phase 8)

All endpoints reside under the base path: **`http://localhost:8000/api/`**

---

## 1. List Trips

* **Endpoint**: `/trips/`
* **Method**: `GET`
* **Authentication**: Required (`Authorization: Bearer <access_token>`)
* **Access Rules**: 
  - `HOSPITAL_ADMINISTRATOR`, `FLEET_MANAGER`, `DISPATCHER`
  - `DRIVER` is **forbidden** (must use `/trips/my-trips/` instead)

### Query Parameters (Optional)
- `driver_id`: Filter trips by driver UUID.
- `ambulance_id`: Filter trips by ambulance UUID.
- `status`: Filter by trip status (`ACTIVE`, `COMPLETED`, `CANCELLED`).
- `start_date`: YYYY-MM-DD (Filter trips starting on or after this date).
- `end_date`: YYYY-MM-DD (Filter trips starting on or before this date).

### Response (`200 OK`)
```json
[
  {
    "id": "a1b2c3d4-5678-90ab-cdef-1234567890ab",
    "mission": {
      "id": "e9876543-210f-4321-a987-6543210fedcb",
      "status": "COMPLETED",
      "emergency_request": {
        "id": "f8765432-10fe-3210-9876-543210fedcba",
        "requester_name": "John Requestor",
        "medical_issue": "Chest pain, possible cardiac event"
      }
    },
    "ambulance": {
      "id": "c8a40de6-13a8-4c91-bdf4-d6a9d7c49b4c",
      "ambulance_number": "AMB-001"
    },
    "driver": {
      "id": "d7a40de6-13a8-4c91-bdf4-d6a9d7c49b4d",
      "name": "Rahul Driver"
    },
    "status": "COMPLETED",
    "start_time": "2026-07-04T12:00:00Z",
    "end_time": "2026-07-04T12:35:00Z",
    "distance_km": 12.45,
    "summary": "Trip completed successfully. Total duration: 35 mins. Total distance: 12.45 km. Driver: Rahul Driver. Vehicle: AMB-001. Patient: John Requestor (Chest pain, possible cardiac event). Destination: Metro General Hospital.",
    "created_at": "2026-07-04T11:55:00Z",
    "updated_at": "2026-07-04T12:35:00Z"
  }
]
```

---

## 2. Retrieve Trip Details

* **Endpoint**: `/trips/<id>/`
* **Method**: `GET`
* **Authentication**: Required
* **Access Rules**:
  - `HOSPITAL_ADMINISTRATOR`, `FLEET_MANAGER`, `DISPATCHER`
  - The assigned `DRIVER` of the trip (other drivers receive `403 Forbidden`)

### Response (`200 OK`)
```json
{
  "id": "a1b2c3d4-5678-90ab-cdef-1234567890ab",
  "mission": {
    "id": "e9876543-210f-4321-a987-6543210fedcb",
    "status": "COMPLETED",
    "emergency_request": {
      "id": "f8765432-10fe-3210-9876-543210fedcba",
      "requester_name": "John Requestor",
      "medical_issue": "Chest pain, possible cardiac event"
    }
  },
  "ambulance": {
    "id": "c8a40de6-13a8-4c91-bdf4-d6a9d7c49b4c",
    "ambulance_number": "AMB-001"
  },
  "driver": {
    "id": "d7a40de6-13a8-4c91-bdf4-d6a9d7c49b4d",
    "name": "Rahul Driver"
  },
  "status": "COMPLETED",
  "start_time": "2026-07-04T12:00:00Z",
  "end_time": "2026-07-04T12:35:00Z",
  "distance_km": 12.45,
  "summary": "Trip completed successfully. Total duration: 35 mins. Total distance: 12.45 km. Driver: Rahul Driver. Vehicle: AMB-001. Patient: John Requestor (Chest pain, possible cardiac event). Destination: Metro General Hospital.",
  "created_at": "2026-07-04T11:55:00Z",
  "updated_at": "2026-07-04T12:35:00Z"
}
```

---

## 3. Driver's Personal Trip Logs

Retrieve all trips (active, completed, or cancelled) driven by the currently authenticated driver.

* **Endpoint**: `/trips/my-trips/`
* **Method**: `GET`
* **Authentication**: Required
* **Access Rules**: `DRIVER`

### Response (`200 OK`)
```json
[
  {
    "id": "a1b2c3d4-5678-90ab-cdef-1234567890ab",
    "mission": {
      "id": "e9876543-210f-4321-a987-6543210fedcb",
      "status": "COMPLETED",
      "emergency_request": {
        "id": "f8765432-10fe-3210-9876-543210fedcba",
        "requester_name": "John Requestor",
        "medical_issue": "Chest pain, possible cardiac event"
      }
    },
    "ambulance": {
      "id": "c8a40de6-13a8-4c91-bdf4-d6a9d7c49b4c",
      "ambulance_number": "AMB-001"
    },
    "driver": {
      "id": "d7a40de6-13a8-4c91-bdf4-d6a9d7c49b4d",
      "name": "Rahul Driver"
    },
    "status": "COMPLETED",
    "start_time": "2026-07-04T12:00:00Z",
    "end_time": "2026-07-04T12:35:00Z",
    "distance_km": 12.45,
    "summary": "Trip completed successfully. Total duration: 35 mins. Total distance: 12.45 km. Driver: Rahul Driver. Vehicle: AMB-001. Patient: John Requestor (Chest pain, possible cardiac event). Destination: Metro General Hospital.",
    "created_at": "2026-07-04T11:55:00Z",
    "updated_at": "2026-07-04T12:35:00Z"
  }
]
```
