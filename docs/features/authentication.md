# Feature: Authentication & Authorization

## Objective
Establish a secure, centralized authentication and role-based access control (RBAC) system for the Hospital Ambulance Fleet Management & Emergency Dispatch Platform. This system ensures only authorized personnel can access the application, and their permissions are strictly bound to their assigned roles.

## Business Problem
The dispatch system coordinates critical and life-saving operations (ambulance fleet, drivers, dispatch logs, emergency requests). Unauthorized access could compromise sensitive patient data, hijack dispatch routing, or falsify vehicle status. Additionally, different user types (administrators, dispatchers, fleet managers, drivers, and requestors) need distinct access limits to prevent operational conflicts and ensure compliance.

## Roles
The system supports 5 primary roles:
1. **Hospital Administrator**: Full access to settings, user management, and audit logs.
2. **Dispatcher**: Manages and coordinates emergency requests and trips.
3. **Fleet Manager**: Manages ambulances, drivers, and maintenance schedules.
4. **Driver**: Views assigned trips and updates route/location status.
5. **Emergency Requestor**: Submits emergency requests and tracks the assigned ambulance.

## Workflow

### 1. User Login Workflow
1. User provides `username` or `email` and `password`.
2. Backend validates credentials:
   - If invalid: Increment failure count, return `401 Unauthorized`, log failure in `AuditLog`.
   - If valid: Return short-lived JWT Access Token and a secure HTTP-only cookie with a Refresh Token.
3. Audit log entry is created with the action `LOGIN_SUCCESS` along with IP, User-Agent, and timestamp.

### 2. Session Management & Token Refresh
1. Frontend stores Access Token in memory and includes it in the HTTP Authorization header (`Bearer <token>`).
2. When the Access Token expires (e.g., after 15 minutes), the frontend requests a refresh using the Refresh Token from the HTTP-only cookie.
3. If the Refresh Token is valid, a new Access Token is returned.
4. On logout, the Refresh Token is blacklisted on the backend, the cookie is cleared, and the action `LOGOUT` is logged.

### 3. Role-Based Access Control (RBAC)
1. Every API request passes through a global RBAC middleware.
2. The middleware extracts the user's role from the token payload or database.
3. The request path and HTTP method are validated against the role's allowed permissions.
4. Unauthorized requests are blocked with a `403 Forbidden` response.

---

## APIs
The backend exposes the following endpoints (see [authentication-api-spec.md](file:///home/why_ashh/yash/ambulance/docs/api/authentication-api-spec.md) for full specification):
- `POST /api/auth/login/` - Authenticate user, set Refresh Token cookie, return Access Token.
- `POST /api/auth/logout/` - Revoke tokens and clear cookies.
- `POST /api/auth/refresh/` - Refresh the Access Token.
- `GET /api/auth/me/` - Retrieve authenticated user profile and roles.
- `POST /api/auth/change-password/` - Update the user password.
- `GET /api/auth/roles/` - List roles (Hospital Administrator only).

---

## Acceptance Criteria

### Security & Authentication
- Passwords must be hashed using Django's default PBKDF2/Argon2.
- JWT Access Tokens must expire in 15 minutes.
- JWT Refresh Tokens must expire in 7 days and be stored in a `Secure`, `HttpOnly`, `SameSite=Lax/Strict` cookie.
- Every login attempt (success or failure) and logout must be recorded in the `AuditLog` table.

### Access Control
- Unauthenticated users must be denied access to all protected endpoints with `401 Unauthorized`.
- Authenticated users attempting to access endpoints outside their role privileges must receive a `403 Forbidden`.
- Role assignments can only be changed by a `Hospital Administrator`.

### Error Handling & Validation
- Validation errors must return `400 Bad Request` with structured JSON showing errors per field.
- No tracebacks or raw database details must be exposed in error responses.
