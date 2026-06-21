# Project Rules

Project:
Hospital Ambulance Fleet Management & Emergency Dispatch Platform

Stack:

* Django
* Django REST Framework
* PostgreSQL
* React
* Vite

## Rule 1

Implement only the requested scope.

Do not build future features.

Do not modify unrelated modules.

## Rule 2

Documentation before implementation.

Every feature must have:

* Objective
* Workflow
* APIs
* Acceptance Criteria

Store feature docs in:

docs/features/

## Rule 3

Code must be production ready.

Requirements:

* Input validation
* Proper exception handling
* Meaningful error messages
* No crashes on invalid input
* Secure authentication and authorization

## Rule 4

Keep implementations simple.

Follow YAGNI.

Do not over-engineer.

## Rule 5

Before coding provide:

1. Understanding
2. Database Changes
3. API Changes
4. Implementation Plan

Wait for approval before implementation.

## Completed Phases

* **Phase 1**: Authentication & Authorization
* **Phase 4**: Emergency Request Management

## Future Roadmap & Enhancements

* **WebSockets Integration**: Implement Django Channels and Redis to move the Emergency Queue and Citizen Tracking to WebSockets (instead of live polling) for real-time instantaneous updates. This should be combined with the GPS location tracking phase.
* **Server-Side Pagination**: Configure django-rest-framework pagination for the past/completed emergency cases to optimize database queries once records scale up.

