# API Specifications: Dashboard & Analytics

All endpoints reside under the base path: **`http://localhost:8000/api/`**

---

## 1. Dispatcher Dashboard Metrics

Retrieves summary statistics of pending and active emergencies for operational dispatch monitoring.

* **Endpoint**: `/dashboards/dispatcher/`
* **Method**: `GET`
* **Authentication**: Required (`Authorization: Bearer <access_token>`)
* **Access Rules**: `HOSPITAL_ADMINISTRATOR`, `DISPATCHER`

### Response (`200 OK`)
```json
{
  "pending_requests_count": 2,
  "active_missions_count": 1,
  "available_ambulances_count": 3,
  "pending_requests": [
    {
      "id": "e0a1b2c3-4d5e-6f7a-8b9c-0d1e2f3a4b5c",
      "requester_name": "John Doe",
      "contact_number": "555-0100",
      "emergency_type": "Cardiac Arrest",
      "priority": "CRITICAL",
      "pickup_location": "123 Health Ave, Metropolis",
      "latitude": "40.712800",
      "longitude": "-74.006000",
      "status": "PENDING",
      "created_at": "2026-07-09T10:00:00Z"
    }
  ],
  "active_missions": [
    {
      "id": "a0b1c2d3-4e5f-6a7b-8c9d-0e1f2a3b4c5d",
      "status": "EN_ROUTE",
      "emergency_request": {
        "id": "f0a1b2c3-4d5e-6f7a-8b9c-0d1e2f3a4b5d",
        "requester_name": "Jane Smith",
        "emergency_type": "Stroke",
        "priority": "HIGH",
        "pickup_location": "456 Mercy Blvd, Metropolis"
      },
      "ambulance": {
        "id": "b0c1d2e3-4f5a-6b7c-8d9e-0f1a2b3c4d5e",
        "ambulance_number": "AMB-001"
      },
      "driver": {
        "id": "c0d1e2f3-4a5b-6c7d-8e9f-0a1b2c3d4e5f",
        "name": "David Driver"
      }
    }
  ]
}
```

---

## 2. Fleet Manager Dashboard Metrics

Retrieves vehicle deployment metrics, maintenance allocations, and on-duty driver status.

* **Endpoint**: `/dashboards/fleet/`
* **Method**: `GET`
* **Authentication**: Required (`Authorization: Bearer <access_token>`)
* **Access Rules**: `HOSPITAL_ADMINISTRATOR`, `FLEET_MANAGER`

### Response (`200 OK`)
```json
{
  "total_ambulances": 4,
  "ambulances_by_status": {
    "ACTIVE": 2,
    "MAINTENANCE": 1,
    "INACTIVE": 1
  },
  "ambulances_by_lifecycle": {
    "AVAILABLE": 1,
    "ASSIGNED": 0,
    "EN_ROUTE": 1,
    "AT_INCIDENT": 0,
    "PATIENT_ONBOARD": 0,
    "HOSPITAL_ARRIVAL": 0,
    "SANITIZATION": 0,
    "READY": 0
  },
  "active_availability_rate": 50.0,
  "maintenance_list": [
    {
      "id": "b0c1d2e3-4f5a-6b7c-8d9e-0f1a2b3c4d5f",
      "ambulance_number": "AMB-002",
      "status": "MAINTENANCE",
      "lifecycle_status": "AVAILABLE",
      "last_updated": "2026-07-09T09:30:00Z"
    }
  ],
  "sanitization_list": [],
  "drivers_summary": {
    "total_drivers": 3,
    "on_duty_count": 3,
    "standby_available_count": 2
  },
  "driver_roster": [
    {
      "id": "c0d1e2f3-4a5b-6c7d-8e9f-0a1b2c3d4e5f",
      "name": "David Driver",
      "availability": false,
      "on_duty": true,
      "assigned_ambulance": "AMB-001"
    },
    {
      "id": "d0e1f2a3-4b5c-6d7e-8f9a-0b1c2d3e4f5a",
      "name": "Bob Driver",
      "availability": true,
      "on_duty": true,
      "assigned_ambulance": "None"
    }
  ]
}
```

---

## 3. Administrator Dashboard Metrics

Retrieves analytics, average response times, bottleneck phase analytics, and mission success logs.

* **Endpoint**: `/dashboards/admin/`
* **Method**: `GET`
* **Authentication**: Required (`Authorization: Bearer <access_token>`)
* **Access Rules**: `HOSPITAL_ADMINISTRATOR`

### Response (`200 OK`)
```json
{
  "response_time_metrics": {
    "average_response_time_minutes": 12.5,
    "by_priority": {
      "CRITICAL": 8.2,
      "HIGH": 11.4,
      "MEDIUM": 14.1,
      "LOW": 18.5
    },
    "daily_trends_30_days": [
      {
        "date": "2026-07-08",
        "average_response_time_minutes": 13.1,
        "cases_count": 5
      },
      {
        "date": "2026-07-09",
        "average_response_time_minutes": 12.5,
        "cases_count": 3
      }
    ]
  },
  "mission_statistics": {
    "total_missions": 10,
    "completed_missions": 8,
    "cancelled_missions": 2,
    "success_rate_percentage": 80.0,
    "average_mission_duration_minutes": 35.6,
    "average_mission_distance_km": 14.2
  },
  "fleet_utilization": {
    "active_utilization_rate_percentage": 25.0,
    "cumulative_trip_hours": 124.5
  },
  "bottleneck_analysis": {
    "average_minutes_en_route": 10.2,
    "average_minutes_at_incident": 8.5,
    "average_minutes_patient_onboard": 12.4,
    "average_minutes_hospital_arrival": 5.1,
    "average_minutes_sanitization": 15.0
  }
}
```
