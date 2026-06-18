# API Specifications: Authentication & Authorization

All endpoints reside under the base path: **`http://localhost:8000/api/auth/`**

---

## 1. Login User

Authenticates a user's email and password, returning a JWT Access Token in the JSON payload, and setting a secure `HttpOnly` cookie for the Refresh Token.

* **Endpoint**: `/login/`
* **Method**: `POST`
* **Authentication**: None
* **Request Header**: `Content-Type: application/json`
* **Request Body**:
```json
{
  "email": "dispatcher@hospital.org",
  "password": "Password123"
}
```
* **Response (`200 OK`)**:
```json
{
  "access": "eyJhbGciOiJIUzI1NiIsIn...",
  "user": {
    "id": "e0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
    "name": "Jane Dispatcher",
    "email": "dispatcher@hospital.org",
    "role": {
      "id": "b182cb88-8b0b-4ef8-bb6d-6bb9bd380a22",
      "name": "DISPATCHER"
    },
    "created_at": "2026-06-17T13:30:00.000Z"
  }
}
```
* **Cookie set on response**:
  * Name: `refresh_token`
  * Attributes: `HttpOnly`, `SameSite=Lax`, `Max-Age=7 days`
* **Error Response (`400 Bad Request` - Invalid Credentials)**:
```json
{
  "non_field_errors": [
    "No active account found with the given credentials"
  ]
}
```

---

## 2. Refresh Token

Generates a new short-lived JWT Access Token using the `refresh_token` cookie stored in the browser session.

* **Endpoint**: `/refresh/`
* **Method**: `POST`
* **Authentication**: None (Reads `refresh_token` from HTTP-only cookie automatically)
* **Request Header**: `Content-Type: application/json`
* **Response (`200 OK`)**:
```json
{
  "access": "eyJhbGciOiJIUzI1NiIsIn..."
}
```
* **Error Response (`401 Unauthorized` - Expired or Invalid cookie)**:
```json
{
  "detail": "Token is invalid or expired"
}
```

---

## 3. Current User Profile

Fetches the account details of the currently authenticated session.

* **Endpoint**: `/me/`
* **Method**: `GET`
* **Authentication**: Required (`Authorization: Bearer <access_token>`)
* **Response (`200 OK`)**:
```json
{
  "id": "e0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
  "name": "Jane Dispatcher",
  "email": "dispatcher@hospital.org",
  "role": {
    "id": "b182cb88-8b0b-4ef8-bb6d-6bb9bd380a22",
    "name": "DISPATCHER"
  },
  "created_at": "2026-06-17T13:30:00.000Z"
}
```
* **Error Response (`401 Unauthorized` - Missing/Expired Access Token)**:
```json
{
  "detail": "Given token not valid for any token type"
}
```

---

## 4. Change Password

Updates the password of the currently authenticated user.

* **Endpoint**: `/change-password/`
* **Method**: `POST`
* **Authentication**: Required (`Authorization: Bearer <access_token>`)
* **Request Header**: `Content-Type: application/json`
* **Request Body**:
```json
{
  "old_password": "Password123",
  "new_password": "NewSecurePassword123!"
}
```
* **Response (`200 OK`)**:
```json
{
  "detail": "Password has been updated successfully."
}
```
* **Error Response (`400 Bad Request` - Password Mismatch/Incorrect Old)**:
```json
{
  "old_password": [
    "Incorrect old password."
  ]
}
```

---

## 5. List System Roles

Retrieves a list of all role configurations in the system.

* **Endpoint**: `/roles/`
* **Method**: `GET`
* **Authentication**: Required (`Authorization: Bearer <access_token>`)
* **Access Rules**: `HOSPITAL_ADMINISTRATOR` (or Superuser) only.
* **Response (`200 OK`)**:
```json
[
  {
    "id": "a182cb88-8b0b-4ef8-bb6d-6bb9bd380a11",
    "name": "HOSPITAL_ADMINISTRATOR"
  },
  {
    "id": "b182cb88-8b0b-4ef8-bb6d-6bb9bd380a22",
    "name": "DISPATCHER"
  }
]
```
* **Error Response (`403 Forbidden` - Insufficient role permissions)**:
```json
{
  "detail": "Only Hospital Administrators are allowed to view system roles."
}
```

---

## 6. Logout User

Invalidates the session, blacklists the refresh token, and clears the browser's `refresh_token` cookie.

* **Endpoint**: `/logout/`
* **Method**: `POST`
* **Authentication**: Required (`Authorization: Bearer <access_token>`)
* **Response (`205 Reset Content`)**: Empty response body.

---

# Testing with cURL / Postman Instructions

To test these APIs via Postman or curl, follow this sequence:

1. **Perform Login**:
   * Make a `POST` request to `http://localhost:8000/api/auth/login/` with the body containing credentials.
   * Copy the value of the `"access"` token.
2. **Authorize Subsequent Requests**:
   * In Postman, go to **Authorization** -> **Bearer Token** and paste the access token.
   * In `curl`, append: `-H "Authorization: Bearer <paste_token>"`
3. **Cookie Handling (Postman)**:
   * Postman automatically handles cookies, saving the `refresh_token` cookie on the login response. Subsequent requests to `/refresh/` can be tested immediately.
