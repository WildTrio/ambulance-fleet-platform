# API Specifications: Dispatch Console & Mission Management

All endpoints reside under the base path: **`http://localhost:8000/api/`**

---

## 1. Find Nearby Ambulances

Retrieves a list of all ambulances sorted by proximity to the specified incident location coordinates, displaying their distance, estimated time of arrival (ETA), availability status, and driver readiness.

* **Endpoint**: `/ambulances/nearby/`
* **Method**: `GET`
* **Authentication**: Required (`Authorization: Bearer <access_token>`)
* **Access Rules**: `HOSPITAL_ADMINISTRATOR`, `FLEET_MANAGER`, `DISPATCHER`

### GET Query Parameters (Required)
- `latitude`: Decimal degrees coordinate of the pickup location (between -90 and 90)
- `longitude`: Decimal degrees coordinate of the pickup location (between -180 and 180)

### Response (`200 OK`)
```json
[
  {
    "id": "d1c2cb88-8b0b-4ef8-bb6d-6bb9bd380a33",
    "ambulance_number": "AMB-001",
    "type": "Advanced Life Support",
    "status": "ACTIVE",
    "hospital": {
      "id": "a1c2cb88-8b0b-4ef8-bb6d-6bb9bd380a11",
      "hospital_name": "City Central Hospital"
    },
    "station": {
      "id": "c1c2cb88-8b0b-4ef8-bb6d-6bb9bd380a22",
      "station_name": "Station A - Downtown",
      "latitude": 37.774900,
      "longitude": -122.419400
    },
    "distance": 1.25,
    "eta": 3,
    "availability_status": "AVAILABLE",
    "readiness_info": "Ready",
    "active_driver": {
      "id": "e1c2cb88-8b0b-4ef8-bb6d-6bb9bd380a44",
      "name": "David Driver",
      "license_number": "DL-9923847"
    }
  }
]
```

---

## 2. Dispatch Incident (Create Mission)

Dispatches an ambulance to a pending emergency request, initiating a dispatch mission. Optionally permits assigning an available driver on the fly.

* **Endpoint**: `/missions/`
* **Method**: `POST`
* **Authentication**: Required (`Authorization: Bearer <access_token>`)
* **Access Rules**: `HOSPITAL_ADMINISTRATOR`, `DISPATCHER`

### POST Request Body
```json
{
  "emergency_request_id": "9a3f2d8b-ef66-4112-9c32-b9cf6d48b111",
  "ambulance_id": "d1c2cb88-8b0b-4ef8-bb6d-6bb9bd380a33",
  "driver_id": "e1c2cb88-8b0b-4ef8-bb6d-6bb9bd380a44"
}
```

### POST Response (`201 Created`)
```json
{
  "id": "c1d2e3f4-5678-90ab-cdef-1234567890ab",
  "emergency_request": {
    "id": "9a3f2d8b-ef66-4112-9c32-b9cf6d48b111",
    "requester_name": "John Doe",
    "contact_number": "555-0199",
    "emergency_type": "Stroke",
    "priority": "CRITICAL",
    "pickup_location": "742 Evergreen Terrace",
    "latitude": 37.774900,
    "longitude": -122.419400,
    "status": "ASSIGNED"
  },
  "ambulance": {
    "id": "d1c2cb88-8b0b-4ef8-bb6d-6bb9bd380a33",
    "ambulance_number": "AMB-001",
    "type": "Advanced Life Support",
    "status": "ACTIVE",
    "active_driver": {
      "id": "e1c2cb88-8b0b-4ef8-bb6d-6bb9bd380a44",
      "name": "David Driver",
      "license_number": "DL-9923847"
    },
    "active_mission": {
      "id": "c1d2e3f4-5678-90ab-cdef-1234567890ab",
      "status": "ASSIGNED",
      "emergency_type": "Stroke"
    }
  },
  "driver": {
    "id": "e1c2cb88-8b0b-4ef8-bb6d-6bb9bd380a44",
    "name": "David Driver",
    "email": "david.driver@hospital.org",
    "contact": "555-0101",
    "license_number": "DL-9923847",
    "availability": false
  },
  "status": "ASSIGNED",
  "created_at": "2026-06-22T12:00:00.000Z",
  "updated_at": "2026-06-22T12:00:00.000Z"
}
```

### Error Response (`400 Bad Request` - e.g., Ambulance Busy)
```json
{
  "ambulance_id": [
    "This ambulance is already assigned to an active mission."
  ]
}
```

---

## 3. List Missions

Lists all missions in the system, filterable by active/ongoing status.

* **Endpoint**: `/missions/`
* **Method**: `GET`
* **Authentication**: Required (`Authorization: Bearer <access_token>`)
* **Access Rules**: 
  - `HOSPITAL_ADMINISTRATOR`, `DISPATCHER`: Can view all dispatches.
  - `DRIVER`: Can view only their own assigned dispatches.

### GET Query Parameters (Optional)
- `active`: Set to `true` to filter out `COMPLETED` and `CANCELLED` missions.

---

## 4. Retrieve / Update Mission status

Retrieves or updates the status state of an active mission.

* **Endpoint**: `/missions/<id>/`
* **Method**: `GET` / `PATCH`
* **Authentication**: Required (`Authorization: Bearer <access_token>`)
* **Access Rules**:
  - `GET`: `HOSPITAL_ADMINISTRATOR`, `DISPATCHER`, and the assigned `DRIVER`
  - `PATCH`: `HOSPITAL_ADMINISTRATOR`, `DISPATCHER`, and the assigned `DRIVER`

### PATCH Request Body
```json
{
  "status": "EN_ROUTE"
}
```
*Valid statuses are:* `ASSIGNED`, `EN_ROUTE`, `ON_SITE`, `TRANSPORTING`, `ARRIVED_HOSPITAL`, `COMPLETED`, `CANCELLED`

### Response (`200 OK`)
```json
{
  "id": "c1d2e3f4-5678-90ab-cdef-1234567890ab",
  "emergency_request": {
    "id": "9a3f2d8b-ef66-4112-9c32-b9cf6d48b111",
    "requester_name": "John Doe",
    "contact_number": "555-0199",
    "emergency_type": "Stroke",
    "priority": "CRITICAL",
    "pickup_location": "742 Evergreen Terrace",
    "latitude": 37.774900,
    "longitude": -122.419400,
    "status": "IN_PROGRESS"
  },
  "ambulance": {
    "id": "d1c2cb88-8b0b-4ef8-bb6d-6bb9bd380a33",
    "ambulance_number": "AMB-001",
    "type": "Advanced Life Support",
    "status": "ACTIVE",
    "active_driver": {
      "id": "e1c2cb88-8b0b-4ef8-bb6d-6bb9bd380a44",
      "name": "David Driver",
      "license_number": "DL-9923847"
    },
    "active_mission": {
      "id": "c1d2e3f4-5678-90ab-cdef-1234567890ab",
      "status": "EN_ROUTE",
      "emergency_type": "Stroke"
    }
  },
  "driver": {
    "id": "e1c2cb88-8b0b-4ef8-bb6d-6bb9bd380a44",
    "name": "David Driver",
    "email": "david.driver@hospital.org",
    "contact": "555-0101",
    "license_number": "DL-9923847",
    "availability": false
  },
  "status": "EN_ROUTE",
  "created_at": "2026-06-22T12:00:00.000Z",
  "updated_at": "2026-06-22T12:05:00.000Z"
}
```
