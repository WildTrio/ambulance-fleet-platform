# Database Schema

## Hospital Ambulance Fleet Management & Emergency Dispatch Platform

This document is the source of truth for all database-related development.

All generated code must follow this schema.

Do not add, remove, or modify tables without explicit approval.

---

# Phase 1 Tables

## Role

Purpose:
Stores system roles.

Columns:

* id (UUID, PK)
* name (VARCHAR(50), UNIQUE)

Examples:

* Hospital Administrator
* Dispatcher
* Fleet Manager
* Driver
* Emergency Requestor

Relationship:

* One Role can have many Users

---

## User

Purpose:
Stores platform users.

Columns:

* id (UUID, PK)
* name (VARCHAR(100))
* email (VARCHAR(255), UNIQUE)
* password (VARCHAR(255))
* role_id (FK → Role.id)
* created_at
* updated_at

Relationship:

* Many Users belong to one Role

---

## AuditLog

Purpose:
Stores important user actions.

Columns:

* id (UUID, PK)
* user_id (FK → User.id)
* action
* timestamp
* details

Examples:

* Login
* Logout
* Password Changed

Relationship:

* One User can have many Audit Logs

---

# Future Phase Tables

These tables are not part of Phase 1 implementation.

Do not generate code for them unless explicitly requested.

## Hospital

* id
* hospital_name
* address
* city
* state
* contact_number

---

## Station

* id
* hospital_id
* station_name
* latitude
* longitude

---

## Ambulance

* id
* ambulance_number
* hospital_id
* station_id
* type
* status

---

## Driver

* id
* user_id
* contact
* license_number
* availability

---

## DriverAssignment

* id
* driver_id
* ambulance_id
* start_time
* end_time

---

## EmergencyRequest

* id
* requester_name
* contact_number
* emergency_type
* priority
* pickup_location
* latitude
* longitude
* status

---

## TripStatus

* id
* status_name

Examples:

* Assigned
* En Route
* At Incident
* Patient Onboard
* Hospital Arrival
* Completed

---

## Trip

* id
* request_id
* ambulance_id
* driver_id
* current_status_id
* start_time
* end_time
* distance_km

---

## TripStatusHistory

* id
* trip_id
* status_id
* updated_by
* remarks
* created_at

---

## GPSLog

* id
* ambulance_id
* trip_id
* latitude
* longitude
* recorded_at

---

## Maintenance

* id
* ambulance_id
* issue_type
* description
* service_date
* next_service_date
* status

---

## Notification

* id
* user_id
* title
* message
* status
* created_at

---

# Development Rules

1. Phase 1 code may only use:

   * Role
   * User
   * AuditLog

2. Future tables must not be implemented until their phase begins.

3. All Django models must match this schema.

4. All APIs must use these relationships.

5. Any schema changes require updating this document first.
