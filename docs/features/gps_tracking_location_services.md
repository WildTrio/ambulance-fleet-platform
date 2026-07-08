# Feature: GPS Tracking & Location Services (Phase 9)

## Objective
Develop a live ambulance tracking capability. The system will support real-time location updates from the driver, track and plot routes on map displays, calculate live distance/ETA metrics, and record a history of locations for route reviews of past trips.

---

## Workflow

```
[Driver starts mission / shifts]
       │
(Driver updates current coordinates via GPS or Simulator)
       │
       ▼
[Update Ambulance location fields] ───> [Create GPSLog linked to active Trip (if any)]
       │
(Web App Polling: Dispatcher / Driver fetches live state & routes)
       │
       ▼
[Leaflet Map draws live marker, route line, & dynamic ETA to target]
```

### 1. Real-Time Location Updates
* **Location Storage**: The `Ambulance` model is updated with `current_latitude` and `current_longitude`.
* **GPS Logging**: Every location update creates a `GPSLog` entry linked to the ambulance. If the ambulance is currently assigned to an active `Trip`, the log entry is linked to that `Trip`.
* **Update Interval**: The driver's device (or simulator) posts location updates periodically (e.g. every 5–10 seconds) during an active mission.

### 2. Route Tracking & Calculations
* **Route Coordinates**: The backend provides routing coordinates via GraphHopper (using the backend API key to avoid exposing keys to the client) or falls back to geodesic routing (straight-line segment coordinates) if GraphHopper is offline or not configured.
* **ETA Calculation**: Calculated dynamically using the live routing distance and a standard speed fallback (40 km/h) or routing metadata from GraphHopper.

### 3. Location History
* **Path Recorders**: For any past/completed trip, the UI can request the path history to draw the exact path the driver took.

### 4. Leaflet Map UI
* **Dispatcher Map**: Displays all active ambulances and incident request sites, drawing active paths and animating movement.
* **Driver Map**: Focuses on the driver's current position and target destination (pickup scene or hospital), and includes a route simulation control panel.

---

## Database Schema

### 1. Ambulance Model (Updates)
* `current_latitude` (Decimal, 9 digits, 6 decimal places, null=True, blank=True)
* `current_longitude` (Decimal, 9 digits, 6 decimal places, null=True, blank=True)

### 2. GPSLog Model (New)
* `id` (UUID, PK)
* `ambulance` (FK → Ambulance, on_delete=CASCADE)
* `trip` (FK → Trip, on_delete=SET_NULL, null=True, blank=True)
* `latitude` (Decimal, 9 digits, 6 decimal places)
* `longitude` (Decimal, 9 digits, 6 decimal places)
* `recorded_at` (DateTimeField, auto_now_add=True)

---

## APIs

Base path: `/api/`

### 1. Update Ambulance Location
* **URL**: `/api/ambulances/<id>/update-location/`
* **Method**: `POST`
* **Headers**: `Authorization: Bearer <token>`
* **Request Payload**:
  ```json
  {
    "latitude": 21.820600,
    "longitude": 75.609400
  }
  ```
* **Access Control**: `HOSPITAL_ADMINISTRATOR`, `DISPATCHER`, or the designated `DRIVER` of the ambulance.

### 2. Fetch Active Mission Route
* **URL**: `/api/missions/<id>/route/`
* **Method**: `GET`
* **Headers**: `Authorization: Bearer <token>`
* **Response Payload (`200 OK`)**:
  ```json
  {
    "route": [[21.8206, 75.6094], [21.8250, 75.6120], ...],
    "distance_km": 1.25,
    "eta_minutes": 2
  }
  ```
* **Access Control**: Authenticated users.

### 3. Fetch Trip Location History
* **URL**: `/api/trips/<id>/route-history/`
* **Method**: `GET`
* **Headers**: `Authorization: Bearer <token>`
* **Response Payload (`200 OK`)**:
  ```json
  [
    {
      "latitude": 21.820600,
      "longitude": 75.609400,
      "recorded_at": "2026-07-08T14:48:11Z"
    },
    ...
  ]
  ```
* **Access Control**: Authenticated users.

---

## Acceptance Criteria

### Backend Validation
* Location updates must require valid decimal coordinates (latitude: -90 to 90, longitude: -180 to 180).
* Updating an ambulance's location must insert a `GPSLog` record and link it to the active `Trip` if one exists.
* The recommend engine API must fallback to using `current_latitude`/`current_longitude` on the `Ambulance` if they are defined, instead of defaulting to the home station coordinates.

### Map Interface & Simulation
* **Leaflet Map**: Render maps inside the Dispatcher Console, Driver Console, and Trip Details modal.
* **Route Line**: Highlight routes (blue polyline) for active missions.
* **Simulator**: Drivers can check a box to simulate coordinates moving along the route, firing location updates to the backend at regular intervals.
