# API Specifications: Ambulance Management Module

All endpoints reside under the base path: **`http://localhost:8000/api/`**

---

## 1. List / Create Ambulances

* **Endpoint**: `/ambulances/`
* **Method**: `GET` (List) / `POST` (Create)
* **Authentication**: Required (`Authorization: Bearer <access_token>`)
* **Access Rules**: 
  - `GET`: `HOSPITAL_ADMINISTRATOR`, `FLEET_MANAGER`, `DISPATCHER`
  - `POST`: `HOSPITAL_ADMINISTRATOR`, `FLEET_MANAGER`

### GET Query Parameters (Optional)
- `status`: Filter by status (`ACTIVE`, `MAINTENANCE`, `INACTIVE`)
- `type`: Filter by ambulance type
- `station_id`: Filter by station UUID

### POST Request Body
```json
{
  "ambulance_number": "AMB-2026-001",
  "hospital_id": "a1c2cb88-8b0b-4ef8-bb6d-6bb9bd380a11",
  "station_id": "c1c2cb88-8b0b-4ef8-bb6d-6bb9bd380a22",
  "type": "Advanced Life Support",
  "status": "ACTIVE"
}
```

### POST Response (`201 Created`)
```json
{
  "id": "d1c2cb88-8b0b-4ef8-bb6d-6bb9bd380a33",
  "ambulance_number": "AMB-2026-001",
  "hospital": {
    "id": "a1c2cb88-8b0b-4ef8-bb6d-6bb9bd380a11",
    "hospital_name": "City Central Hospital"
  },
  "station": {
    "id": "c1c2cb88-8b0b-4ef8-bb6d-6bb9bd380a22",
    "station_name": "Station A - Downtown"
  },
  "type": "Advanced Life Support",
  "status": "ACTIVE",
  "active_driver": null
}
```

---

## 2. Retrieve / Update / Delete Ambulance

* **Endpoint**: `/ambulances/<id>/`
* **Method**: `GET` / `PATCH` / `DELETE`
* **Authentication**: Required
* **Access Rules**:
  - `GET`: `HOSPITAL_ADMINISTRATOR`, `FLEET_MANAGER`, `DISPATCHER`
  - `PATCH` / `DELETE`: `HOSPITAL_ADMINISTRATOR`, `FLEET_MANAGER`

### PATCH Request Body (e.g., Edit Details)
```json
{
  "ambulance_number": "AMB-2026-001-REV",
  "type": "Basic Life Support"
}
```

### GET Response (`200 OK`)
```json
{
  "id": "d1c2cb88-8b0b-4ef8-bb6d-6bb9bd380a33",
  "ambulance_number": "AMB-2026-001-REV",
  "hospital": {
    "id": "a1c2cb88-8b0b-4ef8-bb6d-6bb9bd380a11",
    "hospital_name": "City Central Hospital"
  },
  "station": {
    "id": "c1c2cb88-8b0b-4ef8-bb6d-6bb9bd380a22",
    "station_name": "Station A - Downtown"
  },
  "type": "Basic Life Support",
  "status": "ACTIVE",
  "active_driver": {
    "id": "e1c2cb88-8b0b-4ef8-bb6d-6bb9bd380a44",
    "name": "David Driver",
    "license_number": "DL-9923847"
  }
}
```

---

## 3. Assign Driver

Assigns an available driver to an ambulance.

* **Endpoint**: `/ambulances/<id>/assign-driver/`
* **Method**: `POST`
* **Authentication**: Required
* **Access Rules**: `HOSPITAL_ADMINISTRATOR`, `FLEET_MANAGER`
* **Request Body** (to assign a driver):
```json
{
  "driver_id": "e1c2cb88-8b0b-4ef8-bb6d-6bb9bd380a44"
}
```
* **Request Body** (to unassign current driver):
```json
{
  "driver_id": null
}
```

### Response (`200 OK`)
```json
{
  "detail": "Driver assigned successfully.",
  "ambulance_id": "d1c2cb88-8b0b-4ef8-bb6d-6bb9bd380a33",
  "active_driver": {
    "id": "e1c2cb88-8b0b-4ef8-bb6d-6bb9bd380a44",
    "name": "David Driver"
  }
}
```

### Error Response (`400 Bad Request` - e.g., Ambulance Under Maintenance)
```json
{
  "non_field_errors": [
    "Ambulance under maintenance cannot receive assignments."
  ]
}
```

---

## 4. Transfer Station

Transfers the ambulance to a different station.

* **Endpoint**: `/ambulances/<id>/transfer/`
* **Method**: `POST`
* **Authentication**: Required
* **Access Rules**: `HOSPITAL_ADMINISTRATOR`, `FLEET_MANAGER`
* **Request Body**:
```json
{
  "station_id": "f2c2cb88-8b0b-4ef8-bb6d-6bb9bd380a55"
}
```

### Response (`200 OK`)
```json
{
  "detail": "Ambulance station transferred successfully.",
  "old_station": "Station A - Downtown",
  "new_station": "Station B - Uptown"
}
```

---

## 5. Change Status

Changes operational status of the ambulance and requires optional remarks.

* **Endpoint**: `/ambulances/<id>/change-status/`
* **Method**: `POST`
* **Authentication**: Required
* **Access Rules**: `HOSPITAL_ADMINISTRATOR`, `FLEET_MANAGER`
* **Request Body**:
```json
{
  "status": "MAINTENANCE",
  "remarks": "Scheduled engine tuning and oil change"
}
```

### Response (`200 OK`)
```json
{
  "detail": "Ambulance status updated successfully.",
  "old_status": "ACTIVE",
  "new_status": "MAINTENANCE"
}
```

---

## 6. View Operational History

* **Endpoint**: `/ambulances/<id>/history/`
* **Method**: `GET`
* **Authentication**: Required
* **Access Rules**: `HOSPITAL_ADMINISTRATOR`, `FLEET_MANAGER`, `DISPATCHER`

### Response (`200 OK`)
```json
[
  {
    "id": "h1c2cb88-8b0b-4ef8-bb6d-6bb9bd380a99",
    "event_type": "STATUS_CHANGE",
    "old_value": "ACTIVE",
    "new_value": "MAINTENANCE",
    "changed_by": "admin@hospital.org",
    "changed_at": "2026-06-18T10:00:00.000Z",
    "remarks": "Scheduled engine tuning and oil change"
  },
  {
    "id": "h2c2cb88-8b0b-4ef8-bb6d-6bb9bd380a98",
    "event_type": "DRIVER_ASSIGNMENT",
    "old_value": null,
    "new_value": "David Driver",
    "changed_by": "admin@hospital.org",
    "changed_at": "2026-06-18T09:00:00.000Z",
    "remarks": ""
  }
]
```

---

## 7. Supporting Data Endpoints

To populate dropdown lists on the frontend screens.

### Get Hospitals
* **Endpoint**: `/hospitals/`
* **Method**: `GET`
* **Access Rules**: `HOSPITAL_ADMINISTRATOR`, `FLEET_MANAGER`, `DISPATCHER`

### Get Stations
* **Endpoint**: `/stations/`
* **Method**: `GET`
* **Access Rules**: `HOSPITAL_ADMINISTRATOR`, `FLEET_MANAGER`, `DISPATCHER`

### Get Drivers
* **Endpoint**: `/drivers/`
* **Method**: `GET`
* **Access Rules**: `HOSPITAL_ADMINISTRATOR`, `FLEET_MANAGER`
* **Query Params**:
  - `available`: `true` (filter only drivers without active assignments)
