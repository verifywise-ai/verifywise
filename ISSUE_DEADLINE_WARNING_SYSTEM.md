# Feature: Add deadline warning banners to relevant pages

> **Last Updated:** 2026-06-25  
> **Status:** Phase 1 (Tasks) implemented on branch `feature/deadline-warning-box-ui`

## Description

Add a warning banner system that displays above the Tips component on relevant pages, alerting users to overdue and due-soon deadlines. The warning shows aggregated counts and provides snooze options.

## Background

Currently, users have no proactive notification of approaching deadlines. They must manually check each entity to discover overdue or upcoming items. This feature improves user awareness and helps prevent missed deadlines.

## User Story

As a compliance manager, I want to see warnings about upcoming deadlines when I visit relevant pages, so that I can prioritize my work and avoid missing important dates.

## Scope

**Phase 1: Tasks** (implemented)
- Display on Tasks page (`/tasks`)
- Show overdue tasks count
- Show tasks due within 14 days count (configurable via `DEADLINE_CONFIG.dueSoonDays`)

**Future Phases:**
- Vendors (review_date)
- Policies (next_review_date)
- Risks (mitigation deadline)

---

## Requirements

### Functional Requirements

1. **Warning Banner Position**
   - Display above TipBox via `PageHeaderExtended.warningBanner`
   - Only show on relevant pages (Tasks page for Phase 1)
   - Hidden when there are no warnings, while loading, or while snoozed
   - Show/hide uses MUI `Collapse` (300ms) to avoid abrupt layout jumps

2. **Warning Categories**
   - **Overdue**: Items with `due_date < today`, status not `Completed` or `Deleted`
   - **Due soon**: Items with `due_date` from today through today + N days (default 14)

3. **Display Format**
   - Show aggregated counts, not individual items
   - Header title: **Task deadlines**
   - Count row examples:
     - `3 overdue • 5 due` (both present)
     - `3 overdue` or `5 due` (single category)
   - Bullet separator (`•`) between counts when both are shown
   - Clickable filter/scroll (optional — not implemented in Phase 1)

4. **Snooze Options**
   - "Snooze for 1 hour"
   - "Snooze for 24 hours"
   - "Snooze for 1 week"
   - Store snooze state in localStorage with expiry timestamp (ms)

5. **Dismiss Behavior**
   - **⋮** menu icon (`MoreVertical`) opens the snooze dropdown (not an immediate dismiss)
   - Snooze persists per user (localStorage keyed by `userId`)

### Technical Requirements

1. **Frontend Components**
   - `DeadlineWarningBox` — banner UI + snooze menu
   - `deadlineWarning.styles.ts` — sx styles using `status.warning` from `palette.ts`
   - `useDeadlineWarnings` — React Query hook for summary counts
   - `deadlineSnooze.ts` — localStorage snooze helpers
   - `deadline.repository.ts` — `GET /api/deadlines/summary` client

2. **Backend API**
   - Endpoint: `GET /api/deadlines/summary?days={number}`
   - Query param `days`: due-soon window (backend default **7** if omitted; frontend sends **14**)
   - Response envelope (`STATUS_CODE[200]`):
     ```json
     {
       "message": "OK",
       "data": {
         "overdue": 3,
         "dueSoon": 5,
         "dueSoonDays": 14
       }
     }
     ```
   - Scoped to the authenticated user's organization

3. **Data Sources**

   | Entity | Field | Overdue Logic |
   |--------|-------|---------------|
   | Tasks | `due_date` | `due_date < CURRENT_DATE AND status NOT IN ('Completed', 'Deleted')` |

4. **localStorage Schema**
   ```json
   {
     "key": "verifywise_deadline_snooze_{userId}",
     "value": {
       "snoozeUntil": 1710000000000
     }
   }
   ```
   `snoozeUntil` is a Unix epoch in **milliseconds**.

---

## UI Design

### Warning Banner Layout

```
┌─────────────────────────────────────────────────────────────────┐
│  ⚠️  Task deadlines                                          [⋮] │
│  ───────────────────────────────────────────────────────────────│
│  3 overdue  •  5 due                                            │
└─────────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────────┐
│  💡 Tip 1 of 3: Managing Tasks                             [×] │
│  ...                                                            │
└─────────────────────────────────────────────────────────────────┘
```

### Snooze Menu (on clicking ⋮)

```
┌──────────────────────┐
│ Snooze for 1 hour    │
│ Snooze for 24 hours  │
│ Snooze for 1 week    │
└──────────────────────┘
```

### Responsive behavior

- Count row wraps on narrow viewports (`flexWrap: wrap`)
- Banner padding and spacing defined in `deadlineWarning.styles.ts`

---

## Styling

Implemented via [`Clients/src/presentation/themes/palette.ts`](Clients/src/presentation/themes/palette.ts) **`status.warning`** tokens (not separate overdue/due-soon chips):

| Element | Token / value |
|---------|----------------|
| Banner background | `status.warning.bg` (`#FFF8E1`) |
| Banner border | `1px solid status.warning.border` (`#F5E6B8`) |
| Border radius | `4px` |
| Header & count text | `status.warning.text` (`#795548`) |
| Header title weight | `700` |
| Count text weight | `500` |
| Divider | `status.warning.border` |

Styles live in [`Clients/src/presentation/components/DeadlineWarningBox/deadlineWarning.styles.ts`](Clients/src/presentation/components/DeadlineWarningBox/deadlineWarning.styles.ts).

---

## Acceptance Criteria

- [x] Warning banner appears on Tasks page when there are overdue or upcoming tasks
- [x] Banner shows correct counts for overdue and due-soon items
- [x] Snooze menu appears when clicking the menu icon (⋮)
- [x] Snooze persists across page refreshes (localStorage)
- [x] Banner reappears after snooze period expires
- [x] Banner does not appear if no deadlines exist
- [x] Banner appears above Tips component
- [x] Responsive design works on mobile (wrapping count row)

---

## Files to Create/Modify

### Implemented — Frontend

| File | Purpose |
|------|---------|
| `Clients/src/presentation/components/DeadlineWarningBox/index.tsx` | Main warning banner component |
| `Clients/src/presentation/components/DeadlineWarningBox/deadlineWarning.styles.ts` | Banner sx styles and palette tokens |
| `Clients/src/presentation/components/DeadlineWarningBox/__tests__/DeadlineWarningBox.test.tsx` | Component tests |
| `Clients/src/application/hooks/useDeadlineWarnings.ts` | Hook for fetching summary counts |
| `Clients/src/application/config/deadlineConfig.ts` | `dueSoonDays`, snooze durations/labels |
| `Clients/src/application/repository/deadline.repository.ts` | API client for deadline summary |
| `Clients/src/application/utils/deadlineSnooze.ts` | Snooze localStorage helpers |
| `Clients/src/presentation/pages/Tasks/index.tsx` | Passes `<DeadlineWarningBox />` to `PageHeaderExtended` |
| `Clients/src/i18n/translations.ts` | DE/FR/ES strings for banner copy |

### Implemented — Backend

| File | Purpose |
|------|---------|
| `Servers/controllers/deadline.ctrl.ts` | `getDeadlinesSummary` controller |
| `Servers/routes/deadline.route.ts` | `GET /summary` route |
| `Servers/utils/deadline.utils.ts` | Overdue / due-soon count queries |
| `Servers/app.ts` | Registers `/api/deadlines` routes |

---

## Dependencies

- **Design tokens:** `status.warning` from `Clients/src/presentation/themes/palette.ts`
- **Layout integration:** `PageHeaderExtended.warningBanner` prop
- **Icons:** Lucide `AlertTriangle`, `MoreVertical`
- **Backend:** Tasks model `isOverdue()` aligns with query logic

**Not used in Phase 1 implementation:** `InfoBox`, `DaysChip` (custom banner layout instead)

---

## Available Entities with Deadlines (Future Phases)

| Entity | Field | Type | Current State |
|--------|-------|------|---------------|
| Tasks | `due_date` | DATE | ✅ Phase 1 complete |
| Vendors | `review_date` | DATE | Has review status enum |
| Policies | `next_review_date` | DATE | Field exists |
| Risks | `deadline` | DATE | Mitigation deadline |
| Models | `status_date` | DATE | Status tracking only |
| Training | N/A | ENUM | No date field |

---

## Labels

`enhancement`, `frontend`, `backend`, `ux`, `phase-1`

---

## Estimated Effort

| Area | Time |
|------|------|
| Backend API | 2-3 hours |
| Frontend Component | 4-5 hours |
| Testing | 2 hours |
| **Total** | **8-10 hours** |
