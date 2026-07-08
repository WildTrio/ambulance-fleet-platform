# API Specifications: GPS Tracking & Location Services (Phase 9)

All endpoints reside under the base path: **`http://localhost:8000/api/`**

---

## 1. Update Ambulance Location

Updates the live coordinate values of an ambulance and appends a record in the GPS log history.

* **Endpoint**: `/ambulances/<id>/update-location/`
* **Method**: `POST`
* **Authentication**: Required (`Authorization: Bearer <access_token>`)
* **Access Rules**: 
  - `HOSPITAL_ADMINISTRATOR`, `DISPATCHER`
  - The `DRIVER` currently assigned to this specific ambulance (other drivers receive `403 Forbidden`).

### Request Headers
* `Content-Type: application/json`

### Request Body
```json
{
  "latitude": 21.820600,
  "longitude": 75.609400
}
```

### Response (`200 OK`)
```json
{
  "detail": "Location updated successfully.",
  "current_latitude": 21.820600,
  "current_longitude": 75.609400,
  "trip_id": "a1b2c3d4-5678-90ab-cdef-1234567890ab"
}
```

---

## 2. Retrieve Active Mission Route

Fetches the routing coordinate polyline path and real-time ETA from the ambulance's current location to its target destination (incident location or hospital).

* **Endpoint**: `/missions/<id>/route/`
* **Method**: `GET`
* **Authentication**: Required (`Authorization: Bearer <access_token>`)
* **Access Rules**:
  - `HOSPITAL_ADMINISTRATOR`, `DISPATCHER`, `FLEET_MANAGER`
  - The assigned `DRIVER` of the mission

### Response (`200 OK`)
```json
{
  "route": [
    [21.820600, 75.609400],
    [21.821500, 75.610500],
    [21.823200, 75.611800],
    [21.825000, 75.612000]
  ],
  "distance_km": 1.25,
  "eta_minutes": 2,
  "destination": {
    "name": "Khargone Central Station",
    "latitude": 21.825000,
    "longitude": 75.612000
  }
}
```

---

## 3. Retrieve Trip Route History

Retrieves the series of logged coordinates recorded for a specific trip, ordered chronologically.

* **Endpoint**: `/trips/<id>/route-history/`
* **Method**: `GET`
* **Authentication**: Required (`Authorization: Bearer <access_token>`)
* **Access Rules**:
  - `HOSPITAL_ADMINISTRATOR`, `DISPATCHER`, `FLEET_MANAGER`
  - The assigned `DRIVER` of the trip

### Response (`200 OK`)
```json
[
  {
    "latitude": 21.820600,
    "longitude": 75.609400,
    "recorded_at": "2026-07-08T14:48:11.123456Z"
  },
  {
    "latitude": 21.821500,
    "longitude": 75.610500,
    "recorded_at": "2026-07-08T14:48:21.654321Z"
  },
  {
    "latitude": 21.823200,
    "longitude": 75.611800,
    "recorded_at": "2026-07-08T14:48:31.987654Z"
  }
]
```
