# Feature: Reverse Ambulance Search Engine (Intelligent Recommendation)

## Objective
Develop an intelligent ambulance recommendation system that ranks and filters ambulances for emergency dispatch based on proximity, operational availability, driver readiness, and medical equipment matching.

## Workflow

### 1. Recommendation Request
* A `Hospital Administrator` or `Dispatcher` initiates a recommendation request by specifying:
  * Latitude & Longitude (usually from a selected Emergency Request).
* Optional search/filter parameters can be provided:
  * `max_distance` (float, maximum driving/straight-line distance in kilometers).
  * `type` (string, ambulance type: e.g., "Basic Life Support", "Advanced Life Support").
  * `has_driver` (boolean, if true, only returns ambulances with an active driver assigned).
  * `required_equipment` (string, comma-separated list of required equipment names, e.g. "Defibrillator,Oxygen Tank").

### 2. Database Schema
To support equipment availability, the system includes:
* **Equipment Model**: Tracks functional medical equipment items (e.g. Defibrillator, Ventilator, Oxygen Tank).
* **Ambulance Association**: A Many-to-Many relationship on `Ambulance` linking it to available functional equipment:
  `equipment = ManyToManyField(Equipment)`

### 3. Scoring Model (Recommendation Engine)
The recommendation score is calculated on a 0–100 scale (higher is better) using an exponential decay model for distance:
1. **Distance Score (Max 50 points)**:
   * Calculated using an exponential decay to ensure it is naturally bounded and does not overflow:
     $$\text{Distance Score} = 50.0 \times e^{-\frac{\text{distance}}{15.0}}$$
   * `distance_penalty = 50.0 - distance_score` (always bounded between `0` and `50`).
2. **Driver Score (Max 30 points)**:
   * **30 points** if the ambulance has an active driver assigned (immediately ready).
   * **10 points** if the ambulance has no driver assigned (requires driver assignment).
3. **Equipment Match Score (Max 20 points)**:
   * If `required_equipment` is requested:
     * `equipment_score = 20.0 * (matched / requested)`
   * If no equipment is requested:
     * `equipment_score = 20.0` points.
4. **Final Score Formula**:
   * `Score = Distance Score + Driver Score + Equipment Score + Readiness Score (future)`
   * Clamped between `0` and `100`.

* Only **ACTIVE** ambulances that are not currently on a mission (i.e. `availability_status = AVAILABLE`) are recommended.
* If `required_equipment` is specified, the system strictly filters and returns only ambulances that possess all requested items.
* The results are returned sorted by `recommendation_score` descending (highest score first).

### 4. Dispatch Console Integration
* The Dispatch Console's allocation panel is upgraded with a **Search & Recommendation Engine** control bar.
* Dispatchers can live-filter recommendations by Max Distance, Ambulance Type, Driver Assigned state, and required equipment.
* Each ambulance card displays its calculated **Recommendation Score**, detailed breakdown, and list of on-board equipment.

---

## APIs

Base path: `/api/`

### GET /api/ambulances/recommend/
* **Method**: `GET`
* **Access**: `HOSPITAL_ADMINISTRATOR`, `FLEET_MANAGER`, `DISPATCHER`
* **Query Parameters**:
  * `latitude` (decimal, required)
  * `longitude` (decimal, required)
  * `max_distance` (float, optional)
  * `type` (string, optional)
  * `has_driver` (boolean, optional)
  * `required_equipment` (string, optional)
* **Response Payload (`200 OK`)**:
  ```json
  [
    {
      "id": "uuid",
      "ambulance_number": "AMB-001",
      "type": "Advanced Life Support",
      "status": "ACTIVE",
      "hospital": {
        "id": "uuid",
        "hospital_name": "City Hospital"
      },
      "station": {
        "id": "uuid",
        "station_name": "Station A",
        "latitude": 37.774900,
        "longitude": -122.419400
      },
      "distance": 1.5,
      "eta": 4,
      "availability_status": "AVAILABLE",
      "readiness_info": "Ready",
      "active_driver": {
        "id": "uuid",
        "name": "David Driver"
      },
      "equipment": ["Defibrillator", "Oxygen Tank"],
      "recommendation_score": 95.0,
      "score_breakdown": {
        "base_driver_score": 30.0,
        "distance_penalty": 5.0,
        "equipment_score": 20.0,
        "readiness_score": 0.0
      }
    }
  ]
  ```
  
### GET /api/equipment/
* **Method**: `GET`
* **Access**: `Authenticated users`
* **Response Payload (`200 OK`)**:
  ```json
  [
    {
      "id": "uuid",
      "name": "Defibrillator"
    },
    {
      "id": "uuid",
      "name": "Oxygen Tank"
    }
  ]
  ```

### POST /api/equipment/
* **Method**: `POST`
* **Access**: `Authenticated users`
* **Request Payload**:
  ```json
  {
    "name": "Ventilator"
  }
  ```
* **Response Payload (`201 Created`)**:
  ```json
  {
    "id": "uuid",
    "name": "Ventilator"
  }
  ```

### PUT/PATCH /api/ambulances/<id>/
* **Method**: `PUT` / `PATCH`
* **Access**: `HOSPITAL_ADMINISTRATOR`, `FLEET_MANAGER`
* **Request Payload (supporting equipment list write)**:
  ```json
  {
    "ambulance_number": "AMB-001",
    "hospital_id": "uuid",
    "equipment": ["Defibrillator", "Ventilator", "New Special Equipment"]
  }
  ```
* **Response Payload (`200 OK`)**:
  ```json
  {
    "id": "uuid",
    "ambulance_number": "AMB-001",
    "hospital": {
      "id": "uuid",
      "hospital_name": "City Hospital"
    },
    "station": null,
    "type": "Basic Life Support",
    "status": "ACTIVE",
    "active_driver": null,
    "active_mission": null,
    "equipment": ["Defibrillator", "Ventilator", "New Special Equipment"]
  }
  ```
  *(Note: Any custom equipment names passed in the list that do not already exist in the database are automatically created on-the-fly and linked to the ambulance.)*

---

---

## Acceptance Criteria

### Business Rules & Validation
* **RBAC**: Only authorized roles (`HOSPITAL_ADMINISTRATOR`, `FLEET_MANAGER`, `DISPATCHER`) can query the recommendation API.
* **Status Filter**: Ambulances on active missions, under maintenance, or inactive are excluded from recommendations.
* **Equipment Filtering**: If specific equipment is required, only ambulances with all requested equipment are returned.
* **UI Controls**: The Dispatch Console must allow users to adjust recommendation parameters, including required equipment, dynamically.

