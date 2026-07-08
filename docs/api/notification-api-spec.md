# API Specification: Notification Management (Phase 10)

### Base URL: `/api/notifications/`

---

### 1. List Notifications
Retrieve the list of notifications for the currently authenticated user.

* **Endpoint**: `GET /api/notifications/`
* **Authentication**: Token Required (JWT Bearer)
* **Query Parameters**:
  * `unread=true` (optional: filter to show only unread notifications)
* **Response `200 OK`**:
```json
[
  {
    "id": "e2a4a75e-a6ef-46c5-927c-3f92110c7bf0",
    "title": "New Assignment",
    "message": "You have been assigned to Mission #29 with AMB-001.",
    "notification_type": "DRIVER_ASSIGNED",
    "is_read": false,
    "created_at": "2026-07-08T15:40:24Z"
  }
]
```

---

### 2. Mark Notification as Read
Toggle the `is_read` status of a specific notification.

* **Endpoint**: `PATCH /api/notifications/<id>/`
* **Authentication**: Token Required (JWT Bearer, must be owner of the notification)
* **Payload**:
```json
{
  "is_read": true
}
```
* **Response `200 OK`**:
```json
{
  "id": "e2a4a75e-a6ef-46c5-927c-3f92110c7bf0",
  "title": "New Assignment",
  "message": "You have been assigned to Mission #29 with AMB-001.",
  "notification_type": "DRIVER_ASSIGNED",
  "is_read": true,
  "created_at": "2026-07-08T15:40:24Z"
}
```

---

### 3. Mark All as Read
Mark all pending notifications for the current user as read in bulk.

* **Endpoint**: `POST /api/notifications/mark-all-read/`
* **Authentication**: Token Required (JWT Bearer)
* **Response `200 OK`**:
```json
{
  "detail": "All notifications marked as read."
}
```
