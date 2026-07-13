# Feature: Dashboard & Analytics

## Objective
Develop a role-based, real-time analytics and monitoring platform that provides customized operational metrics, statistics, and trends for Dispatchers, Fleet Managers, and Hospital Administrators. The dashboards will aggregate information about active missions, pending requests, driver and vehicle availability, operational response times, and fleet utilization to support swift decision-making, bottleneck discovery, and historical review.

---

## Workflow

### 1. Dispatcher Dashboard
A dashboard tailored to live dispatching, ensuring dispatchers see current workload and available resources immediately.
* **Pending Requests**: Real-time count and detailed list of all `EmergencyRequest` records with `status = 'PENDING'`.
* **Active Missions**: Count and list of all active `Mission` records (where `status` is not in `['COMPLETED', 'CANCELLED']`).
* **Available Ambulances**: Count and list of all `Ambulance` records that are administrative status `ACTIVE` and lifecycle status `AVAILABLE`.

### 2. Fleet Dashboard
A dashboard optimized for fleet management, helping tracking crew shifts, vehicle health, and maintenance schedules.
* **Fleet Availability**: Summary breakdown of the fleet:
  - Total number of ambulances.
  - Count of vehicles by administrative status (`ACTIVE`, `MAINTENANCE`, `INACTIVE`).
  - Count of vehicles by lifecycle status (`AVAILABLE`, `ASSIGNED`, `EN_ROUTE`, `AT_INCIDENT`, `PATIENT_ONBOARD`, `HOSPITAL_ARRIVAL`, `SANITIZATION`, `READY`).
  - Current fleet ready/availability rate (percentage of active and available ambulances).
* **Maintenance Status**: List of ambulances currently in `MAINTENANCE` status or `SANITIZATION` lifecycle status, including the time they entered the state and remarks (from `AmbulanceLifecycleLog` or `AmbulanceOperationalHistory`).
* **Driver Availability**: 
  - Total number of registered drivers.
  - Number of drivers marked available (`availability = True`).
  - Number of drivers currently on active shifts (based on `Shift` records matching current time) versus off duty.
  - Detailed list of active drivers, their availability status, and their assigned ambulance (if any).

### 3. Administrator Dashboard
A dashboard geared towards long-term operational health, bottleneck detection, and performance tracking.
* **Response Time Metrics**:
  - **Average Response Time**: Average time from `EmergencyRequest` creation to the first lifecycle transition to `AT_INCIDENT` for that request's mission.
  - **Response Time by Priority**: Average response times grouped by priority (`LOW`, `MEDIUM`, `HIGH`, `CRITICAL`).
  - **Response Time Trend**: Daily average response time over the last 7 or 30 days.
* **Mission Statistics**:
  - **Total Missions**: Count of all missions created in the system.
  - **Completed Missions**: Count of missions with status `COMPLETED`.
  - **Cancelled Missions**: Count of missions with status `CANCELLED`.
  - **Success Rate**: Percentage of completed missions out of total terminal (completed + cancelled) missions.
  - **Average Trip Duration**: Average duration in minutes of completed trips.
  - **Average Trip Distance**: Average distance in kilometers of completed trips.
* **Fleet Utilization**:
  - **Active Fleet Utilization Rate**: Percentage of active vehicles currently deployed on active missions.
  - **Operational Hours**: Total duration (hours) spent on trips during a period.
* **Operational Performance**:
  - **Phase Durations (Bottleneck Analysis)**: Average duration spent in key lifecycle phases (e.g. `SANITIZATION` duration, `HOSPITAL_ARRIVAL` duration) calculated from `AmbulanceLifecycleLog` timestamps.
  - **Trip volume trends**: Count of missions per day over the last 7 or 30 days.

---

## APIs

Base path: `/api/dashboards/`

### 1. Dispatcher Dashboard Metrics
* **Endpoint**: `GET /api/dashboards/dispatcher/`
* **Access**: `HOSPITAL_ADMINISTRATOR`, `DISPATCHER`
* **Response (`200 OK`)**:
```json
{
  "pending_requests_count": 3,
  "pending_requests": [
    {
      "id": "uuid",
      "requester_name": "John Doe",
      "emergency_type": "Cardiac Arrest",
      "priority": "CRITICAL",
      "pickup_location": "123 Main St",
      "created_at": "2026-07-09T10:00:00Z"
    }
  ],
  "active_missions_count": 2,
  "active_missions": [
    {
      "id": "uuid",
      "emergency_request": {
        "id": "uuid",
        "requester_name": "Jane Smith",
        "emergency_type": "Trauma",
        "priority": "HIGH"
      },
      "ambulance_number": "AMB-001",
      "driver_name": "David Driver",
      "status": "EN_ROUTE",
      "created_at": "2026-07-09T10:05:00Z"
    }
  ],
  "available_ambulances_count": 5,
  "available_ambulances": [
    {
      "id": "uuid",
      "ambulance_number": "AMB-002",
      "type": "Advanced Life Support",
      "station_name": "North Station",
      "current_latitude": 21.820600,
      "current_longitude": 75.609400
    }
  ]
}
```

### 2. Fleet Dashboard Metrics
* **Endpoint**: `GET /api/dashboards/fleet/`
* **Access**: `HOSPITAL_ADMINISTRATOR`, `FLEET_MANAGER`
* **Response (`200 OK`)**:
```json
{
  "fleet_summary": {
    "total_ambulances": 10,
    "by_status": {
      "ACTIVE": 8,
      "MAINTENANCE": 1,
      "INACTIVE": 1
    },
    "by_lifecycle": {
      "AVAILABLE": 5,
      "ASSIGNED": 1,
      "EN_ROUTE": 1,
      "AT_INCIDENT": 1,
      "PATIENT_ONBOARD": 0,
      "HOSPITAL_ARRIVAL": 0,
      "SANITIZATION": 0,
      "READY": 0
    },
    "availability_rate": 50.0
  },
  "maintenance_list": [
    {
      "id": "uuid",
      "ambulance_number": "AMB-003",
      "status": "MAINTENANCE",
      "lifecycle_status": "SANITIZATION",
      "entered_at": "2026-07-09T09:15:00Z",
      "remarks": "Post-incident vehicle sanitization"
    }
  ],
  "driver_availability": {
    "total_drivers": 12,
    "available_drivers_count": 8,
    "on_duty_count": 6,
    "off_duty_count": 6,
    "active_drivers_list": [
      {
        "id": "uuid",
        "name": "Sarah Driver",
        "availability": true,
        "on_duty": true,
        "assigned_ambulance": "AMB-001"
      }
    ]
  }
}
```

### 3. Administrator Dashboard Metrics
* **Endpoint**: `GET /api/dashboards/admin/`
* **Access**: `HOSPITAL_ADMINISTRATOR`
* **Response (`200 OK`)**:
```json
{
  "response_time_metrics": {
    "average_response_time_minutes": 12.4,
    "by_priority": {
      "CRITICAL": 8.2,
      "HIGH": 11.5,
      "MEDIUM": 14.2,
      "LOW": 18.0
    },
    "daily_trends": [
      {"date": "2026-07-08", "avg_response_time_minutes": 11.9},
      {"date": "2026-07-09", "avg_response_time_minutes": 12.4}
    ]
  },
  "mission_statistics": {
    "total_missions": 45,
    "completed_missions": 38,
    "cancelled_missions": 7,
    "success_rate": 84.4,
    "average_trip_duration_minutes": 32.5,
    "average_trip_distance_km": 14.8
  },
  "fleet_utilization": {
    "active_utilization_rate": 37.5,
    "total_trip_hours": 120.5
  },
  "operational_performance": {
    "average_phase_durations_minutes": {
      "EN_ROUTE": 8.5,
      "AT_INCIDENT": 12.0,
      "PATIENT_ONBOARD": 15.0,
      "HOSPITAL_ARRIVAL": 10.0,
      "SANITIZATION": 20.0
    },
    "daily_mission_volume": [
      {"date": "2026-07-08", "missions_count": 12},
      {"date": "2026-07-09", "missions_count": 15}
    ]
  }
}
```

---

## Acceptance Criteria

### Security & Access Control
* Access to `/api/dashboards/dispatcher/` is allowed only for `HOSPITAL_ADMINISTRATOR` and `DISPATCHER` roles.
* Access to `/api/dashboards/fleet/` is allowed only for `HOSPITAL_ADMINISTRATOR` and `FLEET_MANAGER` roles.
* Access to `/api/dashboards/admin/` is allowed only for `HOSPITAL_ADMINISTRATOR` roles.
* Unauthenticated requests are rejected with `401 Unauthorized`.
* Unauthorized roles are rejected with `403 Forbidden`.

### Computations & Robustness
* Empty databases or days without data must be handled gracefully, returning defaults like `0` or `null` rather than raising `ZeroDivisionError` or throwing `500 Internal Server Error`.
* Average response time calculation must handle missing data points correctly (e.g. if an active mission hasn't reached the scene yet or was cancelled before arrival, it is excluded from response time calculation).
* Utilization rate calculations should ignore inactive/retired vehicles if total count is used as a base.

### Frontend Integration
* **KPI Widgets**: Displays quick summaries (e.g., total pending requests, active missions, average response time, fleet availability percentage) in visually distinct cards with responsive colors.
* **Role-Based Tab Visibility**: Tabs for Dispatcher, Fleet, and Admin dashboards should appear conditionally based on the logged-in user's role.
* **Visual Data Presentation**: Use smooth grid layouts, indicator indicators (e.g. green for available, amber for active, red for pending critical requests), and detailed summary tables.
