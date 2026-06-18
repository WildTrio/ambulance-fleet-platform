# Role-Based Access Control (RBAC) Matrix

This document defines the permissions for each system role across the different modules of the Hospital Ambulance Fleet Management & Emergency Dispatch Platform.

---

## Role Definitions

- **HOSPITAL_ADMINISTRATOR**: Full control over platform settings, users, and audit logs.
- **DISPATCHER**: Manages emergency requests and trips. Coordinates ambulance assignments.
- **FLEET_MANAGER**: Manages ambulance assets, drivers, and maintenance.
- **DRIVER**: Interacts with assigned trips and updates real-time status/GPS of their trip.
- **EMERGENCY_REQUESTOR**: Requests emergency assistance and tracks the assigned ambulance.

---

## Permissions Matrix

| Feature Module | Action/Endpoint | Hospital Administrator | Dispatcher | Fleet Manager | Driver | Emergency Requestor |
|---|---|:---:|:---:|:---:|:---:|:---:|
| **Auth** | Login / Logout / Session Info | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Auth** | Change Own Password | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Auth** | Manage Users & Roles | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Auth** | View Audit Logs | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Ambulance** | View Ambulances | ✅ | ✅ | ✅ | ❌ | ❌ |
| **Ambulance** | Add/Edit/Delete Ambulances | ✅ | ❌ | ✅ | ❌ | ❌ |
| **Driver** | View Driver Statuses | ✅ | ✅ | ✅ | ❌ | ❌ |
| **Driver** | Manage Drivers | ✅ | ❌ | ✅ | ❌ | ❌ |
| **Dispatch** | View Dispatch Logs | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Dispatch** | Create/Update Trips | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Trips** | Update Trip (Route/GPS) | ❌ | ❌ | ❌ | ✅ (Own Only) | ❌ |
| **Trips** | View Trip Status | ✅ | ✅ | ✅ | ✅ (Own Only) | ✅ (Own Only) |
| **Emergency Request**| Create Request | ❌ | ✅ (On behalf) | ❌ | ❌ | ✅ |
| **Emergency Request**| View Own Request | ❌ | ❌ | ❌ | ❌ | ✅ |

*Legend*:
- ✅: Allowed
- ❌: Denied
- Own Only: Allowed only if the resource is assigned to or created by the current user.
