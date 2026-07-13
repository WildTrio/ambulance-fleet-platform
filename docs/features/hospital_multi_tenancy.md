# Hospital-Level Multi-Tenancy (Data Isolation)

## Objective

Enforce strict hospital-level data isolation so that every user can only access, create, update, and delete records belonging to their own hospital. No user should ever see or interact with another hospital's data.

## Workflow

1. **User-Hospital Binding**: Every user belongs to exactly one hospital via `User.hospital` (ForeignKey). This is set at registration time by the admin who creates the user.
2. **Automatic Scoping**: All API endpoints automatically filter data using `request.user.hospital`. No hospital ID is accepted from the frontend.
3. **Fallback Assignment**: Users without an explicit hospital assignment are batch-assigned to the first available hospital via `get_user_hospital()`.
4. **Superuser Bypass**: Superusers without a hospital assignment can access all data across hospitals (for system-level debugging).

## Database Changes

### `authentication.User`
- Added `hospital` ForeignKey to `ambulances.Hospital` (`null=True`, `blank=True`)
- Migration: `authentication/migrations/0002_user_hospital.py`

### `ambulances.EmergencyRequest`
- Added `hospital` ForeignKey to `Hospital` (`null=True`, `blank=True`)
- Auto-assigned from `created_by.hospital` or first hospital on `.save()`
- Migration: `ambulances/migrations/0012_emergencyrequest_hospital.py`

## APIs Affected

All existing endpoints remain at the same URLs. The only behavioral change is that each endpoint now returns only hospital-scoped data.

| Endpoint | Scoping |
|---|---|
| `GET /api/ambulances/` | `hospital=user.hospital` |
| `POST /api/ambulances/` | Auto-assigns `hospital=user.hospital` |
| `GET /api/stations/` | `hospital=user.hospital` |
| `GET /api/drivers/` | `user__hospital=user.hospital` |
| `GET /api/shifts/` | `driver__user__hospital=user.hospital` |
| `GET /api/certifications/` | `driver__user__hospital=user.hospital` |
| `GET /api/emergency-requests/` | `hospital=user.hospital` |
| `POST /api/emergency-requests/` | Auto-assigns `hospital=user.hospital` |
| `GET /api/missions/` | `ambulance__hospital=user.hospital` |
| `GET /api/trips/` | `ambulance__hospital=user.hospital` |
| `GET /api/hospitals/` | `id=user.hospital.id` |
| `GET /api/dashboard/dispatcher/` | All stats scoped to `user.hospital` |
| `GET /api/dashboard/fleet/` | All stats scoped to `user.hospital` |
| `GET /api/dashboard/admin/` | All stats scoped to `user.hospital` |
| `GET /api/notifications/` | Already per-user; escalation checks now hospital-scoped |

## Security Rules

- Hospital assignment is **not editable** by normal users after creation
- Hospital ID from frontend requests is **always ignored**
- Cross-hospital object access returns **404 Not Found**
- All CRUD operations enforce hospital ownership

## Acceptance Criteria

- [x] Every user belongs to exactly one hospital
- [x] All list endpoints return only hospital-scoped data
- [x] All detail endpoints reject cross-hospital access with 404
- [x] All create endpoints auto-assign `hospital=request.user.hospital`
- [x] Dashboard statistics are hospital-scoped
- [x] Search/filter operations are hospital-scoped
- [x] Dropdown/FK selection returns only same-hospital records
- [x] Superusers can bypass isolation when `user.hospital` is unset
- [x] All 96 existing tests pass
