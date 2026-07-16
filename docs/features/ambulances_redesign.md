# Feature Redesign: Ambulances Fleet Page (Stripe/Uber Style)

## Objective
Redesign the Ambulances fleet management page by migrating `Ambulances.jsx` to a type-safe `Ambulances.tsx` component using TypeScript and Tailwind CSS utility classes.

---

## Workflow
The Ambulances page manages the full ambulance fleet lifecycle. Accessible to Hospital Administrators, Fleet Managers, and Dispatchers.

### Features Preserved
- **KPI Metrics Row**: Total Fleet, Active count, Maintenance count, Inactive count
- **Multi-filter Bar**: Status, Type, and Station dropdowns + search
- **Fleet Cards Grid**: Responsive grid with status-colored badges, equipment tags, driver info
- **Add/Edit Ambulance Modal**: Full form with equipment checkbox grid and custom equipment input
- **Assign Driver Modal**: Select available drivers for assignment
- **Transfer Station Modal**: Move ambulance to a different station
- **Change Status Modal**: Status transition with remarks/reason textarea
- **History Timeline Modal**: Chronological event log with old→new value transitions
- **Active mission lock**: Disables edit/assign/transfer/status/delete when ambulance is on active mission

---

## APIs
- `GET /api/ambulances/` — List (with optional `?status=`, `?type=`, `?station_id=` filters)
- `POST /api/ambulances/` — Create
- `PATCH /api/ambulances/:id/` — Update
- `DELETE /api/ambulances/:id/` — Delete
- `POST /api/ambulances/:id/assign-driver/` — Assign/unassign driver
- `POST /api/ambulances/:id/transfer/` — Transfer station
- `POST /api/ambulances/:id/change-status/` — Change status with remarks
- `GET /api/ambulances/:id/history/` — Operational history timeline
- `GET /api/hospitals/` — List hospitals
- `GET /api/stations/` — List stations
- `GET /api/equipment/` — List equipment
- `GET /api/drivers/?available=true` — List available drivers

---

## Acceptance Criteria
- Fully type-safe React component (`Ambulances.tsx`)
- Premium light theme styling matching existing redesigned pages
- Remove all legacy CSS files (`Ambulances.css`)
- Responsive grid layout with equipment tag pills
- All 6 modal types preserved with consistent styling
