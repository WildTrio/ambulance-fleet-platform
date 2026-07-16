# Feature Redesign: Analytics Dashboard (Stripe/Uber Style)

## Objective
Redesign the operational and analytics dashboard screens (Dispatcher, Fleet Manager, and Administrator views) into the premium, clean light theme (Stripe/Vercel/Uber Fleet style) specified in the frontend guidelines (`frontend/agents.md`). The page will be refactored into a type-safe TypeScript component (`AnalyticsDashboard.tsx`) relying entirely on utility Tailwind CSS.

---

## Workflow

The dashboard adapts its content based on the `type` role prop passed from the main layout (`dispatcher`, `fleet`, or `admin`):

### 1. Dispatcher View
- **KPI Metrics**: Critical-colored alert count for Pending Requests, warning indicators for Active Missions, and availability counts for Standby Ambulances.
- **Triage Lists**: 
  - *Pending Queue*: Incident cards with priority-colored left borders and flashing status lights.
  - *Active Missions*: Live operational statuses and assigned ambulance/driver cards.
  - *Available Fleet*: Operational telemetry coordinate data and base stations.

### 2. Fleet Manager View
- **KPI Metrics**: Availability rate percentage widget, total fleet size, and active driver roster count.
- **Roster & Breakdowns**:
  - *Lifecycle Status*: Progressive distribution tracks (Active, Maintenance, Inactive) and high-density lifecycle grids.
  - *Maintenance Register*: Mini tabular list detailing vehicles in sanitization or repairs, base stations, notes, and timestamps.
  - *Driver Shifts*: Grid-based roster cards indicating on-duty statuses, vehicle assignments, and dispatch availabilities.

### 3. Administrator View
- **KPI Metrics**: Average response times (minutes), overall mission success rates (%), vehicle utilization metrics, and cumulative travel hours.
- **Bottlenecks & Volumes**:
  - *Response Analysis*: Progressive comparative bar charts showing response times by priority level (Critical, High, Medium, Low), and historical daily response averages.
  - *Operational Bottlenecks*: Phase-turnover durations (Sanitization, Arrival, Travel, Dispatch) indicating potential friction areas.
  - *Volume Trends*: Detailed metrics on completed/cancelled count aggregates and daily caseload logs.

---

## APIs
* **URL**: `/api/dashboards/<type>/`
* **Method**: `GET`
* **Path Parameter**: `type` (`dispatcher` | `fleet` | `admin`)

---

## Acceptance Criteria
- Fully type-safe React component (`AnalyticsDashboard.tsx`).
- Conforms strictly to visual style specs: white card backgrounds, light slate borders, slate 900 headings, and organic shadows (`shadow-[0_2px_8px_rgba(0,0,0,0.04)]`).
- Remove all legacy CSS files and styling side effects.
- Dynamic data polling based on role type (10s for dispatcher, 30s for fleet, 60s for admin) with silent fetch loads.
