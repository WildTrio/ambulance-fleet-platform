# Directory & Architecture Structure

This document outlines the codebase organization for the backend (Django) and frontend (React + Vite) components of the platform.

---

## Backend Directory Structure (Django)

We group all core authentication components inside a dedicated Django app called `authentication`.

```text
backend/
├── manage.py
├── requirements.txt
├── config/                  # Django Project Configuration
│   ├── __init__.py
│   ├── asgi.py
│   ├── settings.py          # Database settings, JWT settings, installed apps
│   ├── urls.py              # Root routing, forwards to api/auth/
│   └── wsgi.py
└── authentication/          # Authentication & Authorization App
    ├── __init__.py
    ├── admin.py             # Admin registrations for User, Role, AuditLog
    ├── apps.py
    ├── middleware.py        # RBAC and Activity Logging middleware
    ├── models.py            # Role, User, and AuditLog schemas
    ├── serializers.py       # Login, User, Role, and PasswordChange serializers
    ├── urls.py              # App routing (/login, /logout, /me, /change-password, etc.)
    └── views.py             # Core authentication views
```

### Backend Design Choices:
1. **Custom User Model**: Extended from Django's `AbstractUser` to support UUID keys and custom `role` assignment.
2. **SimpleJWT Integration**: Uses `djangorestframework-simplejwt` to handle JWT creation, validation, and blacklisting.
3. **Audit Log Middleware**: Logs key security operations (`LOGIN_SUCCESS`, `LOGIN_FAILURE`, `LOGOUT`, `PASSWORD_CHANGE`) directly to the database.
4. **RBAC Middleware / Custom Permission Classes**: Custom permissions verify if the requestor has the proper role.

---

## Frontend Directory Structure (React + Vite)

The frontend is structured to keep UI concerns and state/service concerns decoupled.

```text
frontend/
├── index.html
├── package.json
├── vite.config.js
└── src/
    ├── main.jsx
    ├── App.jsx
    ├── index.css            # Global modern styles & variables
    ├── components/
    │   └── ProtectedRoute.jsx # Route guard verifying auth status and role permissions
    ├── context/
    │   └── AuthContext.jsx  # Context provider for login, logout, and token refreshing
    ├── pages/
    │   └── Login.jsx        # Premium login interface (with animations)
    ├── services/
    │   └── api.js           # Axios instance with request/response interceptors for JWT
    └── utils/
        └── roles.js         # Constants matching backend role configurations
```

### Frontend Design Choices:
1. **Context State**: Centralized `AuthContext` to coordinate token refresh flows, status checks, and current user profile metadata.
2. **Axios Interceptors**: Intercepts requests to append `Bearer <token>` in the Authorization header. Intercepts `401` responses to attempt automatic Token Refresh and retry failed requests.
3. **Protected Routes**: Wrap layouts using a `<ProtectedRoute>` component. Supports checks like `allowedRoles={['DISPATCHER', 'HOSPITAL_ADMINISTRATOR']}` to block unauthorized users.
4. **Premium Aesthetics**: Clean styling using Vanilla CSS custom variables, gradients, responsive designs, glassmorphism layout elements, and smooth transition animations.
