# Feature Redesign: Drivers Management Page (Stripe/Uber Style)

## Objective
Redesign the Drivers management page by migrating `Drivers.jsx` to a type-safe `Drivers.tsx` component using TypeScript and Tailwind CSS utility classes, following the premium light-theme guidelines from `frontend/agents.md`.

---

## Workflow
The Drivers page manages driver profiles, shift scheduling, and certification records. It is accessible to Hospital Administrators, Fleet Managers, and Dispatchers.

### Features Preserved
- **KPI Metrics Row**: Total Drivers, Available count, Off-Duty count
- **Availability Filter**: Dropdown filter for all/available drivers
- **Driver Cards Grid**: Responsive grid of driver profile cards with availability badges
- **Add/Edit Driver Modal**: Form for creating/editing driver accounts (name, email, password, contact, license, availability)
- **Shift Management Modal**: Schedule/edit/delete shifts with datetime-local inputs
- **Certification Management Modal**: Add/edit/delete certifications with expiry tracking and valid/expired badges
- **Role-based Write Access**: Only HOSPITAL_ADMINISTRATOR and FLEET_MANAGER can add/edit/delete

---

## APIs
- `GET /api/drivers/` — List drivers (with optional `?available=true` filter)
- `POST /api/drivers/` — Create new driver
- `PATCH /api/drivers/:id/` — Update driver
- `DELETE /api/drivers/:id/` — Delete driver
- `GET /api/shifts/?driver_id=:id` — List shifts for a driver
- `POST /api/shifts/` — Create shift
- `PATCH /api/shifts/:id/` — Update shift
- `DELETE /api/shifts/:id/` — Delete shift
- `GET /api/certifications/?driver_id=:id` — List certifications
- `POST /api/certifications/` — Create certification
- `PATCH /api/certifications/:id/` — Update certification
- `DELETE /api/certifications/:id/` — Delete certification

---

## Acceptance Criteria
- Fully type-safe React component (`Drivers.tsx`)
- Conforms to visual style: white card backgrounds, light slate borders, slate 900 headings, organic shadows
- Remove all legacy CSS files (`Drivers.css`)
- Responsive grid layout (1 col mobile, 2 col tablet, 3 col desktop)
- Lucide React icons replacing emojis
- All modals use the premium overlay pattern with backdrop blur
