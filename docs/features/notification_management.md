# Feature Specification: Notification Management (Phase 10)

## Objective
Develop an event-driven notification system to keep dispatchers, admins, fleet managers, and drivers informed of operational milestones. Support in-app, email, SMS, and push notification channels.

## Workflow

### 1. Event Triggers (Django Signals)
The notification system is decoupled using Django Signals to listen to database model updates:
* **New Emergency Request**: Listens to `post_save` on `EmergencyRequest` when status is `PENDING`.
* **Ambulance Assigned**: Listens to `post_save` on `Mission` creation.
* **Driver Assigned**: Listens to `post_save` on `Mission` creation (notifying the driver user).
* **Mission Started**: Listens to `post_save` on `Mission` when status transitions to `EN_ROUTE`.
* **Mission Completed**: Listens to `post_save` on `Mission` when status transitions to `COMPLETED`.
* **Emergency Escalation**: Checked during dispatcher dashboard polling: raises warning alerts if a critical request remains `PENDING` for longer than 3 minutes.

### 2. Notification Channels
* **In-App**: Saved in database and polled/updated in the frontend.
* **Email**: Dispatched using Django's built-in `send_mail` with console logger backend configuration.
* **SMS**: Mocked and printed to the terminal console log.
* **Push Notifications**: Uses the browser HTML5 Web Notifications API to trigger desktop alerts.

---

## APIs

### 1. `GET /api/notifications/`
* **Access**: Authenticated users
* **Response**: List of user's notifications (ordered by `created_at` descending)
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

### 2. `POST /api/notifications/mark-all-read/`
* **Access**: Authenticated users
* **Response**: Success code confirming all notifications are marked as read.

### 3. `PATCH /api/notifications/<id>/`
* **Access**: Notification owner
* **Request**:
```json
{
  "is_read": true
}
```

---

## Acceptance Criteria
1. When an incident is logged, dispatchers receive a desktop push alert and in-app notification.
2. When a driver is dispatched to an ambulance, they receive an email, a mock SMS log entry, and an in-app notice.
3. Transitioning mission states triggers notification alerts for dispatchers and emails to requesters.
4. If a critical request is unassigned for over 3 minutes, it triggers an "Escalation Alert" to all dispatchers.
5. Users can view their notifications via a notification bell in the navbar and mark them as read.
