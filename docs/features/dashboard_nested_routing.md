# Feature Specification: Dashboard Nested Path-Based Routing

## Objective
Migrate the dashboard console tabs (`profile`, `driver-console`, `ambulances`, etc.) from standard React component state (`useState`) to URL path-based routes using React Router DOM. This ensures tab state persists across page refreshes and enables direct path linking (e.g., sharing or bookmarking `/driver-console`).

---

## Workflow
1. **Initial Visit / Refresh**:
   - The user visits a URL (e.g. `/driver-console`).
   - The router matches the path and mounts `<Dashboard />`.
   - `<Dashboard />` resolves the current tab by parsing `location.pathname`.
2. **Tab Switching**:
   - Clicking a sidebar item updates the URL path (e.g. navigates to `/ambulances`).
   - React Router triggers a re-render.
   - The dashboard highlights the active sidebar item and displays the mapped component.
3. **Invalid Paths**:
   - If the pathname does not match any valid tab ID, the application defaults/redirects to `/profile`.

---

## APIs
- `useLocation()` from `react-router-dom` to inspect `location.pathname`.
- `useNavigate()` from `react-router-dom` to transition paths on sidebar clicks.

---

## Acceptance Criteria
- Tab state is completely derived from the URL path.
- Page refresh preserves active tab.
- Invalid paths default gracefully to profile (`/` or `/profile`).
- Zero console routing errors or compilation warnings.
