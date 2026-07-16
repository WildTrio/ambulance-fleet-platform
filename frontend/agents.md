# Frontend Agent Guidelines: Lifeline Dispatch Enterprise

This document serves as the absolute source of truth for the development, architecture, styling, and implementation of the frontend application for the **Hospital Ambulance Fleet Management & Emergency Dispatch Platform** (Lifeline Dispatch). Any AI agent working on this repository must strictly adhere to these standards to ensure production-grade, highly performant, accessible, and visual-standard-compliant code.

---

## 1. Overall Project Philosophy
- **Enterprise-First Operational Tooling**: This is not a consumer-facing app. It is a critical operational console used by Fleet Managers, Dispatchers, Hospital Admins, and Drivers. Focus on density of information, instant accessibility of controls, telemetry response speed, and high-reliability states.
- **Developer & Agent Ergonomics**: Code must be predictable, self-documenting, strongly-typed, and highly modular.
- **Composition over Configuration**: Prefer composing simple building blocks into complex views rather than configuring monolithic components with hundreds of props.
- **Optimistic State Updates**: Critical dispatch actions (assigning drivers, changing statuses) should respond instantly, utilizing optimistic UI updates via TanStack Query.

---

## 2. UI/UX Design System & Aesthetics
The application implements a premium, ultra-clean **light theme** (inspired by Stripe, Linear, Vercel, and Uber Fleet).

### 2.1 Color Palette (Strictly Enforced)
- **Primary Background**: `#FFFFFF` (Pure white).
- **Secondary/Card Background**: `#F8FAFC` / `#F1F5F9` (Slate 50 / Slate 100).
- **Primary Borders**: `#E2E8F0` (Slate 200).
- **Text Primary**: `#0F172A` (Slate 900) - for headings, main labels.
- **Text Secondary**: `#475569` (Slate 600) - for body text, descriptions.
- **Text Muted**: `#94A3B8` (Slate 400) - for placeholders, secondary dates.
- **Accent Primary**: `#000000` (Pure black) - for main action buttons, active navigation markers.
- **Interactive State**: Hover states on black buttons should be `#1E293B` (Slate 800) or `#334155` (Slate 700).
- **Semantic Color Usage Rules**:
  - **Emergency/Critical/Alert**: **Red** (`#EF4444` / Slate 900 red text). Used ONLY for emergency requests, active critical incidents, or deletion destructions.
  - **Success/Available**: **Green** (`#10B981`). Used ONLY for success banners, active on-duty states, or fully sanitized available ambulances.
  - **Info/In-Route**: **Blue** (`#3B82F6`). Used ONLY for info banners, active ongoing transit/trips, or informational telemetry.
  - No random colors. Keep the interface monochromatic, using color strictly for status highlighting.

### 2.2 Typography
- **Primary Font**: `Plus Jakarta Sans`, system-ui, -apple-system, sans-serif.
- **Body & Code Font**: `Inter` and system-monospace.
- **Visual Scale**:
  - `h1`: `text-3xl font-bold tracking-tight text-slate-900`
  - `h2`: `text-xl font-semibold tracking-tight text-slate-900`
  - `h3`: `text-lg font-medium text-slate-900`
  - `body`: `text-sm leading-relaxed text-slate-600`
  - `caption`: `text-xs text-slate-400 font-medium`

### 2.3 Spacing & Borders
- **Spacing Scale**: Tailored tailwind padding/margins (e.g., `p-4`, `p-6`, `p-8` / `gap-4`, `gap-6`). Never use arbitrary spacing values like `p-[13px]`.
- **Border Radius**: Always use a standard large radius: `rounded-2xl` (`16px`) for cards, panels, modals; `rounded-lg` (`8px`) for buttons and form fields.
- **Shadows**: Soft, premium organic shadows. Use `shadow-sm` or `shadow-[0_2px_8px_rgba(0,0,0,0.04)]`. Avoid heavy, dark dropshadows.

---

## 3. Folder & File Structure
Organized using a hybrid Feature-based and Atomic component architecture:

```text
frontend/
├── public/
├── src/
│   ├── assets/               # SVGs, Static Logos, Icons
│   ├── components/           # Global Shared UI Components
│   │   ├── ui/               # atomic shadcn components (Button, Card, Input...)
│   │   ├── layout/           # Sidebar, Navbar, PageWrapper, RoleGuard
│   │   └── telemetry/        # Map components, route calculators
│   ├── context/              # Context Providers (AuthContext, ThemeContext)
│   ├── hooks/                # Global Reusable Hooks (useDebounce, useLocalStorage...)
│   ├── lib/                  # Library configurations (axios/api client, utils)
│   ├── routes/               # Route Configuration & Guards
│   ├── services/             # API request functions organized by feature
│   ├── store/                # Zustand global stores (telemetry, dispatchQueue)
│   ├── styles/               # global css variables & tailwind directives
│   ├── types/                # typescript models and contract types
│   ├── features/             # Feature Modules (self-contained logic)
│   │   ├── auth/
│   │   ├── ambulances/
│   │   ├── drivers/
│   │   ├── dispatch/
│   │   ├── analytics/
│   │   └── trips/
│   ├── App.tsx
│   └── main.tsx
```

---

## 4. Coding Conventions & TypeScript Standards
- **File Extensions**: Use `.tsx` for React components; `.ts` for utilities, types, routes, and services.
- **Exports**: Prefer named exports over default exports for components to simplify imports and refactoring.
  ```typescript
  export const Button = () => { ... } // Recommended
  ```
- **Type Definitions**:
  - Prefer `interface` for data objects/contracts and `type` for unions/functions.
  - Never use `any`. Use `unknown` with type guards if the type is truly dynamic.
  - Always type API responses and hook returns.
  - Place shared types in `src/types/` and component-specific types in the component's file.

---

## 5. Styling Standards: Tailwind CSS & shadcn/ui
- **shadcn/ui**: All components generated must use tailwind utilities and classes merged via `clsx` and `tailwind-merge` in a `cn` helper.
  ```typescript
  import { clsx, type ClassValue } from "clsx"
  import { twMerge } from "tailwind-merge"

  export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
  }
  ```
- **Variants**: Leverage `class-variance-authority` (cva) for components that have distinct visual states (e.g. status badges: Critical, Sanitizing, Available).
- **Responsive Classes**: Use tailwind responsive prefixes: `sm:`, `md:`, `lg:`, `xl:`. Build mobile-first.

---

## 6. State Management Architecture
- **Server State**: Managed exclusively with **TanStack Query (React Query)**. Do NOT store fetch responses in local component state.
  - Fetch queries: Use `useQuery`.
  - State modifying mutations: Use `useMutation`. Implement optimistic updates for critical user feedback.
  - Query caching: Set realistic stale/cache times. (e.g., dispatch telemetry staleTime: 5000ms).
- **Global UI State**: Managed with **Zustand**. Keep store footprints minimal. Use for:
  - Sidebar toggled state
  - Map overlay selections (active layers)
  - Active telemetry simulation controls
- **Local Component State**: Use standard React `useState` / `useReducer` for UI states isolated to a single component (e.g., dropdown expanded, modal open).

---

## 7. API Layer Organization
- **Base Request Client**: Utilize an Axios instance configured in `src/lib/api.ts`.
- **Interceptors**:
  - Request: Automatically attach the JWT `access_token` from storage, excluding login/refresh endpoints.
  - Response: Handle automatic `401 Unauthorized` token refreshing via secure HTTP-Only cookies. Dispatches `auth_session_expired` global event if refresh fails.
- **Service Declarations**: Organise requests by feature in `src/features/[feature]/services/` or `src/services/`.
  ```typescript
  export const getAmbulances = async (): Promise<Ambulance[]> => {
    const { data } = await api.get("/ambulances/");
    return data;
  };
  ```

---

## 8. Form Standards: React Hook Form & Zod
- **Strict Validation**: All forms must have client-side validation schema defined with **Zod** and handled by **React Hook Form** via `zodResolver`.
- **Validation Rules**:
  - E.g., Phone numbers must be verified as exactly 10 digits (`z.string().regex(/^\d{10}$/, "Must be exactly 10 digits")`).
  - Emails must be validated against `z.string().email()`.
- **Interactive Feedback**: Display inline helper text under inputs only when the user has interacted with the field (touch state) and there is an active error.

---

## 9. Telemetry & Maps (React Leaflet)
- **Component Separation**: Map layout containers must be decoupled from data layers.
- **Map Marker Standard**: Custom styled SVG markers rather than default leaflet blue pins. Custom indicators for:
  - Red flashing ambulance: engaged in critical mission.
  - Grey ambulance: sanitizing or inactive.
  - Blue ambulance: en route.
- **Performance**: Always utilize React Leaflet's map instance reference to dynamically center/pan/flyTo coordinates rather than rebuilding the Map container on coordinate changes.

---

## 10. Data Visualization (Recharts)
- **Chart Layouts**: Implement responsive containers: `<ResponsiveContainer width="100%" height={350}>`.
- **Styling**: Remove grid borders, use soft dotted lines, and style tooltip wrappers to match the slate card themes.
- **Interaction**: Add subtle micro-animations for hover bars/lines using CSS transitions or Recharts animation parameters.

---

## 11. Tables (TanStack Table)
- **Headers & Cells**: Columns must be defined using strict TypeScript accessors.
- **State Controls**: Include sorting icons in headers, a clear search bar on top, status badge column filters, and server-side pagination controllers in the footer.
- **States**: Ensure clean loading skeletons and custom empty state illustrations are provided.

---

## 12. Accessibility (a11y) & Performance
- **Semantic HTML**: Use tags like `<main>`, `<nav>`, `<aside>`, `<header>`, `<article>` appropriately.
- **Interactive Element Requirements**:
  - All clickable nodes must have specific roles or `aria-label` labels.
  - Forms must link labels to inputs via `htmlFor`.
  - Focus indicators must be prominent on tab navigation (`focus-visible:ring-2`).
- **Performance Rules**:
  - Image files should be compressed or SVGs.
  - Large libraries (like Leaflet, Recharts) should be code-split and lazy-loaded via `React.lazy`.
  - Minimize unnecessary re-renders; memoize heavy calculations with `useMemo`.

---

## 13. UI State Guidelines: Loading, Empty, and Error States

### 13.1 Loading States
- Never use full-page blank screens. Use **Skeleton loaders** shaped to resemble the incoming layout card.
- For list loads, render at least 3 row skeleton lines to avoid layout shifting.
- Primary buttons undergoing form submissions must render inline loading spinners and be disabled.

### 13.2 Empty States
- Dashboard tabs, search results, queues, or tables without data must display an illustration or simple icon, a short descriptive heading, and a primary action button if applicable (e.g., "Assign driver to begin").

### 13.3 Error Boundaries & Handling
- Enclose feature dashboards in dynamic error boundaries. If an API request fails, provide a localized card offering a retry function rather than letting the entire application crash.

---

## 14. Testing Expectations
- **Unit Tests**: Test core utilities, calculation helpers (e.g., Haversine distance, recommendation scoring) with Jest or Vitest.
- **Component Tests**: Assert button clicks, dialog/modal displays, role-based visibility triggers, and form validations using React Testing Library.
- **Mocking**: Mock API calls using MSW (Mock Service Worker) to match backend endpoint specs.

---

## 15. Development & Git Workflow Checklist
- Run local lint checks: `npm run lint` before committing.
- Commit messages must follow semantic conventions: `feat: add driver scheduler`, `fix: correct ETA tooltip alignment`.
- Ensure all types are exported, unused imports are cleared, and responsiveness checked at `375px`, `768px`, `1024px`, and `1440px`.

---

## 16. Do's and Don'ts

### Do's:
- **Do** wrap map logic, chart renderers, and tables in reusable container components.
- **Do** enforce exact validation schemas (Zod) on all edit/creation payloads.
- **Do** handle authorization dynamically using a custom React layout or router guard checking `allowedRoles`.
- **Do** ensure page layouts look uniform, clean, white background, using thin slate borders and rounded-2xl panels.

### Don'ts:
- **Don't** add arbitrary styled elements or non-standard inline css styles.
- **Don't** write manual debounce timers; use hooks or libraries.
- **Don't** use generic default alert popups; leverage styled custom modal dialogs.
- **Don't** perform direct state mutation in React or Zustand; always use the provided update actions.
