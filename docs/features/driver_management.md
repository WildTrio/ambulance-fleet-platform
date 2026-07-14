# Feature: Driver Management Module

## Objective
Develop a centralized driver management capability to maintain records, license numbers, availability status, shifts, and certifications for all drivers, and integrate with the ambulance fleet and assignment engine under RBAC.

## Workflow

### 1. Add Driver
- A `Hospital Administrator` or `Fleet Manager` adds a driver by providing:
  - Account Details: `email`, `name`, `password` (default password is created, user can change it later).
  - Profile Details: `contact`, `license_number`, `availability` (default to True).
- Validation ensures:
  - `email` is unique across all users.
  - `license_number` is unique across all drivers.

### 2. Edit Driver
- A `Hospital Administrator` or `Fleet Manager` updates an existing driver's:
  - Account details: `name`, `email`.
  - Profile details: `contact`, `license_number`, `availability`.
- Validation checks for uniqueness on email and license_number.

### 3. Driver Availability Management (Availability Engine)
- A driver's `availability` is a boolean.
- When `availability` is `False` (and they are not currently assigned to an ambulance), they cannot receive assignments.
- When a driver is assigned to an ambulance, their `availability` is automatically set to `False` (busy).
- When they are unassigned from an ambulance, their `availability` returns to `True` (available).
- **Business Rule Check**: Any attempt to assign a driver whose `availability` is `False` and who does not have an active assignment to another ambulance will fail with a validation error (400 Bad Request).

### 4. Shift Management
- A `Hospital Administrator` or `Fleet Manager` manages shifts for a driver.
- A `Shift` contains:
  - `start_time` (DateTimeField)
  - `end_time` (DateTimeField)
- Validation ensures `end_time` is after `start_time`.

### 5. Certification Management
- A `Hospital Administrator` or `Fleet Manager` manages driver certifications.
- A `Certification` contains:
  - `name` (e.g. BLS, ALS, CPR, EVOC)
  - `certificate_number`
  - `issuing_authority`
  - `issue_date` (DateField)
  - `expiry_date` (DateField)
- Validation ensures `expiry_date` is after `issue_date`.

---

## APIs

Base path: `/api/`

- `GET /api/drivers/` - List all drivers (query param `available=true` to filter active available ones). (Admin, Fleet Manager, Dispatcher)
- `POST /api/drivers/` - Create a new driver profile and corresponding user. (Admin, Fleet Manager)
- `GET /api/drivers/<id>/` - Retrieve driver details, active assignment, and related fields. (Admin, Fleet Manager, Dispatcher)
- `PATCH /api/drivers/<id>/` - Update driver profile and user details. (Admin, Fleet Manager)
- `DELETE /api/drivers/<id>/` - Delete driver profile and corresponding user. (Admin, Fleet Manager)
- `GET /api/drivers/<id>/shifts/` - List all shifts for a driver. (Admin, Fleet Manager, Dispatcher)
- `POST /api/drivers/<id>/shifts/` - Create a new shift for a driver. (Admin, Fleet Manager)
- `PATCH /api/shifts/<id>/` - Edit a shift. (Admin, Fleet Manager)
- `DELETE /api/shifts/<id>/` - Delete a shift. (Admin, Fleet Manager)
- `GET /api/drivers/<id>/certifications/` - List certifications for a driver. (Admin, Fleet Manager, Dispatcher)
- `POST /api/drivers/<id>/certifications/` - Create a new certification. (Admin, Fleet Manager)
- `PATCH /api/certifications/<id>/` - Edit a certification. (Admin, Fleet Manager)
- `DELETE /api/certifications/<id>/` - Delete a certification. (Admin, Fleet Manager)

---

## Acceptance Criteria

### Security & RBAC
- **Read Access**: Only `Hospital Administrator`, `Fleet Manager`, and `Dispatcher` roles are permitted to read drivers, shifts, and certifications. Others receive `403 Forbidden`.
- **Write/Action Access**: Only `Hospital Administrator` and `Fleet Manager` roles are permitted to add/edit/delete drivers, shifts, and certifications. Others receive `403 Forbidden`.
- **Audit Logging**: All write operations (POST, PUT, PATCH, DELETE) must generate a user activity log via the middleware.

### Business Rules & Validation
- **Unique License Number**: Prevent driver profile creation/updates with duplicate license numbers (case-insensitive).
- **Unique Email**: Prevent creation/updates with duplicate emails.
- **Availability Guard**: Ensure that drivers marked unavailable (`availability=False` and no active assignment) cannot be assigned to an ambulance.
- **Assignment Integrity**: Enforce that a driver can only have one active ambulance assignment at a time.
- **Cascade Delete**: Deleting a driver cleans up their linked User account.
- **Contact Number Format Check**: Enforce that the contact number of a driver must be exactly 10 digits (matching pattern `^[0-9]{10}$`) at both application level (serializers) and database layer (check constraints) to prevent invalid data entry.

