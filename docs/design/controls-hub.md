# Controls Hub — UX/UI Design Spec

> **Feature:** Unified Cross-Framework Controls Library
> **Designer:** UX/UI Designer (agent)
> **Status:** Draft — v1 for Phase 2 Assessment
> **Last Updated:** 2026-04-16

This spec documents the UI design for the Controls Hub feature. Frontend
agents should treat this as the single source of truth for visual structure,
state behaviour, and component composition. All concrete tokens (colours,
spacing, typography) reference the existing `presentation/themes/` palette
and `singleTheme.tableStyles` primitives — do **not** introduce new tokens.

---

## 1. Information Architecture

```
  Sidebar  ─► ASSURANCE group
           └► "Controls hub"  (new entry, Library icon)

  Route    ─► /controls-hub

  Page shell
    ├─ Header (title + CTA cluster)
    ├─ BulkEditBar (conditional, when rows selected)
    ├─ ControlsMatrix (sortable + paginated MUI Table)
    └─ MasterControlDrawer (anchor=right, tabbed)
         ├─ Details
         ├─ Mappings
         ├─ Evidence
         └─ History
```

---

## 2. Page: Controls Hub

### 2.1 Layout (default state, ≥1280 px)

```
┌────────────────────────────────────────────────────────────────────────────┐
│  Controls hub                                        [+ New control] [⇩CSV]│
│  Organization-wide controls mapped across every framework you track.       │
│                                                                            │
│  [Search title/description…]   Status ▾   Owner ▾   Framework ▾            │
│                                                                            │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ ☐  TITLE ↕           STATUS   OWNER   EU AI   ISO42  ISO27  NIST AI │  │
│  ├──────────────────────────────────────────────────────────────────────┤  │
│  │ ☐  Risk management…  In progr  J. Doe  [3]    [2]    –      [1]     │  │
│  │ ☐  Data governance   Waiting   A. Lin  [1]    [4]    [2]    –       │  │
│  │ ☐  Access control    Done      R. Sha  –      [1]    [5]    [2]     │  │
│  │ ...                                                                  │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                       Rows per page [25 ▾]  ◀ 1 / 4 ▶     │
└────────────────────────────────────────────────────────────────────────────┘
```

Key pixel specs:

| Element          | Spec                                                  |
|------------------|-------------------------------------------------------|
| Page gutter      | `Stack sx={{ gap: "16px" }}` — same as ComplianceTracker |
| Heading          | `pageHeadingStyle` (from `commonStyles`)              |
| Subheading       | 13 px, `text.accent`                                  |
| Filter bar       | `Stack direction="row"` gap=12 px, 8 px padding       |
| Primary CTA      | `Button variant="contained"` — `brand.primary` bg     |
| Secondary CTA    | `Button variant="outlined"` — `border.dark` border    |
| Table            | `FileBasicTable` primitives — no DataGrid             |

### 2.2 Column Specifications

| Col # | Header       | Width  | Sort    | Type                                |
|-------|--------------|--------|---------|-------------------------------------|
| 0     | Checkbox     | 40 px  | —       | `Checkbox` per row + header         |
| 1     | Title        | flex   | asc/dsc | text, click → opens drawer          |
| 2     | Status       | 132 px | asc/dsc | `StatusPill` (reuse existing)       |
| 3     | Owner        | 140 px | asc/dsc | `UserBadge` (reuse existing)        |
| 4–7   | Framework    | 104 px | —       | `FrameworkCell` chip cluster        |
| 8     | Due date     | 120 px | asc/dsc | `getFormattedDueDate()`             |
| 9     | Actions      | 56 px  | —       | `IconButton type="more"`            |

`FrameworkCell` renders up to 3 visible chips with a `+N more` overflow
chip; on hover the full mapping list appears in a `Tooltip`.

### 2.3 State Inventory

| State            | Trigger                           | Visual                                                                 |
|------------------|-----------------------------------|------------------------------------------------------------------------|
| Default          | Data loaded, rows present         | Table with all columns, row `hover` bg `#FBFBFB`                       |
| Loading          | `useMasterControls().isLoading`   | `CustomizableSkeleton` rows × 8                                        |
| Empty            | No controls for this org          | `EmptyState` + `EmptyStateTip` "Import recommended mappings" CTA       |
| Error            | Query error                       | `EmptyState` with `AlertCircle` icon, "Reload" button                  |
| Filtered-empty   | Filters yield 0 rows              | `EmptyState` message "No controls match your filters." + "Clear" CTA   |
| Selection active | ≥1 checkbox checked               | `BulkEditBar` pins to top of matrix                                    |
| Demo rows        | Row `is_demo === true`            | Row bg tint `#F6F7F9`, edit/delete disabled, tooltip "Demo — read only"|

### 2.4 Filters & Sorting

- Search: debounced (300 ms) — filters `title` + `description` client-side.
- Status filter: multi-select, persisted in URL query param `?status=`.
- Owner filter: user dropdown (same component as ComplianceTracker).
- Framework filter: shows only master controls with ≥1 mapping in the picked framework.
- Sort: localStorage key `controls_hub_sort_v1`, shape `{ key, direction }`.

---

## 3. Master Control Drawer

Opens on row click (or "New control" CTA). Uses MUI `<Drawer anchor="right">`
width 560 px, 100 vh. Composition matches `ISO42001ClauseDrawerDialog`.

### 3.1 Header

```
┌─────────────────────────────────────────────────────────────┐
│  Master control · #12                                  [×]  │
│  Access Control — Principle of Least Privilege              │
│  ● Waiting  · Owner: J. Doe  · Due Jun 1, 2026              │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 Tabs

| Tab        | Icon          | Component                  | Lazy?           |
|------------|---------------|----------------------------|-----------------|
| Details    | `FileText`    | `DetailsTab`               | eager           |
| Mappings   | `Link`        | `MappingsTab`              | lazy + Suspense |
| Evidence   | `FolderOpen`  | `EvidenceTab`              | lazy + Suspense |
| History    | `ClockHistory`| `HistoryTab`               | lazy + Suspense |

Active tab controlled by local `useState("details")`; preserved in URL
hash (`#details`, `#mappings`, etc.) so the drawer state is linkable.

### 3.3 Details Tab

Form fields (all reuse existing components):

1. `Field` — Title (required, max 255)
2. `RichTextEditor` — Description
3. `Select` — Status (3 options)
4. `Select` — Risk review (3 options + unset)
5. `Select` — Owner (users in org)
6. `Select` — Reviewer
7. `Select` — Approver
8. `DatePicker` — Due date
9. `RichTextEditor` — Implementation details
10. Footer: `Save` (primary), `Cancel` (text). Disabled if no dirty state.

### 3.4 Mappings Tab

```
  Framework                Mapped to                                [+ Add]
  ─────────────────────────────────────────────────────────────────────────
  EU AI Act                Art. 9 — Risk management system            [×]
  EU AI Act                Art. 15 — Accuracy, robustness             [×]
  ISO 42001                6.1 — Actions to address risks             [×]
  NIST AI RMF              GOVERN-1.1                                 [×]
```

- "Add" opens a modal with a `Tabs` widget — one tab per framework — listing
  all available requirements. The user selects 1+ rows then confirms.
- Each row can be removed with the `[×]` IconButton; a confirmation tooltip
  ("Remove this mapping?") prevents accidental deletion.
- Saving mappings triggers **PropagationPreviewModal** (§5) before persisting.

### 3.5 Evidence Tab

Reuses the existing `file-links` pattern (`attachFileToEntity` /
`getEntityFiles` from `file.repository.ts`). Target entity type:
`master_control`. No bespoke UI — list + upload + preview, same as the
file manager tab used elsewhere.

### 3.6 History Tab

Reuses the generic change-history timeline component (wherever the
client reads `ENTITY_HISTORY_CONFIGS`). Entity type `"master_control"`
must be registered in `Clients/src/config/changeHistory.config.ts`
(T-041) before this tab can render.

---

## 4. Bulk Edit Bar

Appears above the table when ≥1 row is selected. Anchored `sticky top=0`.

```
┌──────────────────────────────────────────────────────────────────────────┐
│ 3 selected          Status ▾    Owner ▾    Due date ▾     [Apply] [×]   │
└──────────────────────────────────────────────────────────────────────────┘
```

- Background: `brand.primary` @ 8 % tint (`rgba(19,113,91,0.08)`).
- "Apply" → optimistic update via `useBulkUpdateMasterControls`.
- Changed fields are dispatched in a single PATCH.

---

## 5. Propagation Preview Modal

Triggered when saving a master control edit that will fan out to mapped
framework rows. MUI `Dialog`, max-width 640 px.

```
┌──────────────────────────────────────────────────────────────┐
│ Propagation preview                                          │
│                                                              │
│ You're about to update "Access Control".                     │
│ The following 6 framework rows will be updated:              │
│                                                              │
│  • EU AI Act — Art. 9 Risk management          Status → Done │
│  • EU AI Act — Art. 15 Accuracy                Status → Done │
│  • ISO 42001 — 6.1 Actions to address risks    Status → Done │
│  • ISO 27001 — A.5.15 Access control           Status → Done │
│  • NIST AI RMF — GOVERN-1.1                    Status → Done │
│  • NIST AI RMF — MANAGE-2.3                    Status → Done │
│                                                              │
│                              [ Cancel ] [ Confirm & propagate]│
└──────────────────────────────────────────────────────────────┘
```

- Only shown when the edit changes `status`, `owner`, or `implementation_details`
  (other fields don't propagate in v1).
- User's choice "Confirm" → PATCH the master + atomic fan-out on server.
- "Cancel" → revert field(s) to pre-edit value.

---

## 6. Empty State / Import Recommended Mappings

When an organization has zero master controls:

```
   ┌──────────────────────────────────────────────┐
   │   [icon]  No master controls yet             │
   │                                              │
   │   Start from scratch, or import our curated  │
   │   library of ~25 cross-framework controls    │
   │   covering Risk Management, Access Control,  │
   │   Data Governance, and more.                 │
   │                                              │
   │   [ + New control ]  [ Import recommended ]  │
   └──────────────────────────────────────────────┘
```

- "Import recommended" → POST `/master-controls/seed-recommended`.
- Shows a spinner while import runs, then refetches the matrix.

---

## 7. CSV Export

Button in page header. Clicking opens a confirmation dialog:

```
  Export master controls?
  You are exporting 47 master controls including 182 framework mappings.
  The file will be delivered as a CSV.
                                          [ Cancel ] [ Download CSV ]
```

Endpoint: `GET /master-controls/export?format=csv` returns
`Content-Type: text/csv` with `Content-Disposition: attachment; filename=...`.

---

## 8. Accessibility

| Requirement       | Implementation                                                    |
|-------------------|-------------------------------------------------------------------|
| Keyboard nav      | Tab order Header → Filters → Table rows → Drawer; Esc closes drawer |
| Row focus         | `TableRow` gains `outline: 2px solid brand.primary` on focus      |
| ARIA labels       | All IconButtons carry `aria-label`; Tabs use `role="tab"`         |
| Colour contrast   | Status pill text/bg pairs verified ≥ 4.5:1 (existing tokens)      |
| Reduced motion    | Drawer transition `prefers-reduced-motion: reduce` → 0 ms         |
| Screen reader     | Matrix announces "Row X of Y" when focus changes                  |

---

## 9. Responsive Behaviour

| Viewport         | Change                                                        |
|------------------|---------------------------------------------------------------|
| ≥ 1440 px        | All 4 framework columns visible                               |
| 1200–1439 px     | Frameworks collapse to a single "Mappings" column with chips  |
| < 1200 px        | Drawer becomes full-screen; table becomes horizontally scroll |
| < 768 px (future)| Table becomes a card list (out of scope for v1)               |

---

## 10. Design Tokens Used

Colours (from `presentation/themes/palette`):
- `brand.primary` (#13715B) — CTAs, selection highlight
- `text.primary` — body text
- `text.accent` — helper text
- `background.alt` (#FCFCFD) — drawer bg
- `border.dark` (#d0d5dd) — table + drawer borders
- `status.success/warning/error.{bg,text}` — status pills

Spacing:
- Page gap: 16 px
- Row padding: 12 px vertical / 16 px horizontal
- Filter bar gap: 12 px

Typography:
- Heading: `pageHeadingStyle` (h1 equivalent)
- Subheading: 13 px / `text.accent`
- Table header: `singleTheme.tableStyles.primary.header.cell`
- Table body: `singleTheme.tableStyles.primary.body.cell`

---

## 11. Open Questions (for future iteration — not blocking v1)

1. Should archived / deprecated master controls be soft-hidden or shown in a "Deleted" tab?
2. Should propagation run on a per-field basis (e.g. `status` only) or always include `owner`/`implementation_details`?
3. Should the matrix support column reordering via drag? (No in v1.)
4. Do we need an "Impact" dashboard (how many frameworks does this control cover)?

*End of spec.*
