# Feature Redesign: Driver Command Console (Uber Style)

## Objective
Redesign the Driver Command Console (`DriverConsole.jsx`) into a type-safe `DriverConsole.tsx` using TypeScript, Tailwind CSS, and shadcn/ui components. The layout and experience will be redesigned to mimic the "Uber Driver" interface, featuring a prominent live navigation map (occupying full height or screen-split) with overlapping/docked interactive sheets containing vehicle information, active trip/incident metrics, operational actions, and lifecycle logs. It will conform to the visual style guidelines in `frontend/agents.md`.

---

## Workflow
The Driver Command Console is the primary operational portal for field drivers. It allows drivers to view their active ambulance assignment, update their operational status throughout an emergency lifecycle, track patient pickups/destinations on a live map, and view past trip records.

### 1. No Assignment State
- If the driver has no active ambulance assignment, they are shown a clean, empty state card instructing them to contact dispatch or their fleet manager for assignment, with a refresh button.

### 2. Map-First Split Layout
- **Mobile/Stack Layout**: The Leaflet map occupies the top portion of the screen (or full screen background) and the action console is a bottom sheet wrapper.
- **Desktop/Split Layout**: The Leaflet map fills the left section of the screen, and the control console sits in a scrollable panel/sidebar on the right.

### 3. Active Mission Drawer / Uber-style Panel
- When an active mission is assigned, the console shows:
  - Mission headers: priority badge (Critical, High, Medium, Low), emergency type, and patient name.
  - Navigation route details: Current status, Distance (km), and ETA (mins) to pickup/hospital.
  - Address Timeline: Showing pickup location to destination hospital in a vertical sequence (similar to Uber's pickup/dropoff timeline).
  - A prominent, dark primary "Transition Action Button" that updates to the next valid state based on the ambulance lifecycle engine.
  - Interactive controls to "Use Device GPS" or "Simulate Route" for testing.

### 4. Interactive Maps & Custom Markers
- Display Leaflet map with custom DivIcon markers styled with Tailwind CSS:
  - **Red Flashing Ambulance**: Engaged in a critical mission (`CRITICAL` priority active mission).
  - **Blue Ambulance**: En route, onboard, or arriving at hospital.
  - **Grey Ambulance**: Sanitizing, inactive, or ready.
- Polylines representing the route to destination, automatically centering/panning.

### 5. Right Sidebar Panels
- **Vehicle Specs**: Assigned vehicle number, vehicle type, and hospital base details.
- **Lifecycle Timeline Log**: A clean, vertical chronological stream showing status transition logs for the current session.
- **Past Trips History**: A collapsible list of previous trips showing dates, distances, durations, and summaries.

---

## APIs
- `GET /api/ambulances/my-assignment/` — Fetch active driver assignment details.
- `GET /api/ambulances/:id/lifecycle-history/` — Fetch transition history for the current ambulance.
- `GET /api/trips/my-trips/` — Fetch past completed/cancelled trips.
- `POST /api/ambulances/:id/transition-lifecycle/` — Update ambulance status (body: `status`, `remarks`).
- `GET /api/missions/:id/route/` — Get active mission route geometry and ETA.
- `POST /api/ambulances/:id/update-location/` — Report driver coordinates to the server (body: `latitude`, `longitude`).

---

## Acceptance Criteria
- Migrated to `DriverConsole.tsx` with strict TypeScript types for assignments, history, and route payloads.
- Fully adheres to `frontend/agents.md` color scheme: White card backgrounds (`#FFFFFF`), light slate borders (`#E2E8F0`), primary slate-900 labels, and black accent action buttons (`#000000` with hover state `#1E293B`).
- Leaflet map is responsive and features custom DivIcons replacing the default Leaflet pins.
- The UI layout is split cleanly (map-first) to emulate the Uber operational interface.
- Complete removal of legacy stylesheet `DriverConsole.css`.
- Fully responsive on mobile (`375px`), tablet (`768px`), and desktop (`1024px+`).
- Error and success alerts styled using clean custom overlays or standard notification toasts rather than raw banner divs.
