# Frontend Components

## Overview

VerifyWise has 105+ reusable components following consistent patterns. Components are organized by type (inputs, modals, tables, cards) in `Clients/src/presentation/components/`. This document covers the most commonly used components and their patterns.

## Component Organization

```
Clients/src/presentation/components/
├── Button/                    # Button variants
├── Cards/                     # Card components
├── Inputs/                    # Form inputs
│   ├── Field/                 # Text input
│   ├── Select/                # Dropdowns
│   ├── Datepicker/            # Date picker
│   ├── ChipInput/             # Tag input
│   ├── Radio/                 # Radio buttons
│   ├── Toggle/                # Switch
│   └── FileUpload/            # File upload
├── Modals/                    # Dialog modals
├── Drawer/                    # Side panels
├── Table/                     # Data tables
├── Sidebar/                   # Navigation
├── Alert/                     # Alerts
├── Toast/                     # Notifications
├── Avatar/                    # User avatars
├── Chip.tsx                   # Unified status/risk badge chip
├── Chip/                      # Specialized chips (DaysChip, CategoryChip)
├── Layout/                    # Page layouts
└── Tooltip/                   # Tooltips
```

## Button Components

### CustomizableButton

Primary button component with loading states, icons, and variants.

```tsx
// File: Clients/src/presentation/components/Button/CustomizableButton/index.tsx

import { CustomizableButton } from "@/presentation/components/Button/CustomizableButton";

<CustomizableButton
  variant="contained"        // "contained" | "outlined" | "text"
  size="medium"              // "small" | "medium" | "large"
  color="primary"            // "primary" | "secondary" | "success" | "warning" | "error"
  onClick={handleClick}
  loading={isLoading}        // Shows spinner when true
  startIcon={<AddIcon />}    // Icon before text
  endIcon={<ArrowIcon />}    // Icon after text
  isDisabled={false}
  fullWidth={false}
  ariaLabel="Save changes"
>
  Save
</CustomizableButton>
```

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `variant` | string | "contained" | Button style |
| `size` | string | "medium" | Button size |
| `color` | string | "primary" | Theme color |
| `loading` | boolean | false | Show loading spinner |
| `startIcon` | ReactNode | - | Icon before text |
| `endIcon` | ReactNode | - | Icon after text |
| `isDisabled` | boolean | false | Disabled state |
| `fullWidth` | boolean | false | Full width |

### ButtonToggle

Toggle between multiple options with animated background.

```tsx
// File: Clients/src/presentation/components/ButtonToggle/index.tsx

<ButtonToggle
  options={[
    { value: "all", label: "All", count: 10 },
    { value: "active", label: "Active", count: 5 },
    { value: "archived", label: "Archived", count: 3 },
  ]}
  value={activeValue}
  onChange={setActiveValue}
  height={34}
/>
```

## Input Components

### Field

Text input with label, validation, and helper text.

```tsx
// File: Clients/src/presentation/components/Inputs/Field/index.tsx

<Field
  type="text"               // "text" | "password" | "description" | "url" | "number"
  label="Project name"
  value={value}
  onChange={handleChange}
  error="Name is required"  // Error message
  isRequired={true}         // Shows asterisk
  isOptional={true}         // Shows "(optional)"
  placeholder="Enter name"
  disabled={false}
  min={0}                   // For number type
  max={100}                 // For number type
/>
```

**Type Variants:**
- `text` - Standard text input
- `password` - Password with visibility toggle
- `description` - Multiline textarea
- `url` - URL input with http:// prefix
- `number` - Numeric input with min/max

### Select

Dropdown select component.

```tsx
// File: Clients/src/presentation/components/Inputs/Select/index.tsx

<Select
  id="status"
  label="Status:"
  value={selectedValue}
  onChange={handleChange}
  items={[
    { _id: "1", name: "Active" },
    { _id: "2", name: "Pending" },
    { _id: "3", name: "Completed" },
  ]}
  isRequired={true}
  placeholder="Select status"
  disabled={false}
  error="Status is required"
/>
```

### CustomizableMultiSelect

Multi-select with chip display.

```tsx
// File: Clients/src/presentation/components/Inputs/Select/Multi/index.tsx

<CustomizableMultiSelect
  id="categories"
  label="Categories:"
  value={selectedCategories}     // Array of IDs
  onChange={handleChange}
  items={[
    { _id: "1", name: "Security" },
    { _id: "2", name: "Privacy" },
    { _id: "3", name: "Compliance" },
  ]}
  placeholder="Select categories"
  error={error}
/>
```

### ChipInput

Tag/chip input with autocomplete.

```tsx
// File: Clients/src/presentation/components/Inputs/ChipInput/index.tsx

<ChipInput
  id="tags"
  label="Tags:"
  value={tags}                   // Array of strings
  onChange={setTags}
  placeholder="Add tags"
  error={error}
/>
```

### DatePicker

Date selection input.

```tsx
// File: Clients/src/presentation/components/Inputs/Datepicker/index.tsx

import { DatePicker } from "@/presentation/components/Inputs/Datepicker";
import dayjs from "dayjs";

<DatePicker
  label="Due date:"
  date={dayjs(dueDate)}
  handleDateChange={(newDate) => setDueDate(newDate?.toDate())}
  disabled={false}
/>
```

### Radio

Radio button with title and description.

```tsx
// File: Clients/src/presentation/components/Inputs/Radio/index.tsx

<Radio
  title="High Risk"
  description="Systems that could affect safety or fundamental rights"
  selected={riskLevel === "high"}
  onClick={() => setRiskLevel("high")}
/>
```

### Toggle

Switch component.

```tsx
// File: Clients/src/presentation/components/Inputs/Toggle/index.tsx

<Toggle
  checked={isEnabled}
  onChange={(e) => setIsEnabled(e.target.checked)}
  disabled={false}
/>
```

## Modal Components

### StandardModal

Base modal for dialogs and confirmations.

```tsx
// File: Clients/src/presentation/components/Modals/Basic/index.tsx

<StandardModal
  isOpen={isOpen}
  onClose={handleClose}
  title="Confirm Delete"
  description="Are you sure you want to delete this item?"
  onSubmit={handleSubmit}
  submitLabel="Delete"
  cancelLabel="Cancel"
  loading={isDeleting}
>
  {/* Optional additional content */}
  <Field label="Reason" value={reason} onChange={setReason} />
</StandardModal>
```

### useStandardModal Hook

```tsx
// Common pattern for modal state
const {
  isOpen,
  openModal,
  closeModal,
  modalData,
  setModalData,
} = useStandardModal();
```

### Drawer Dialog Pattern

Large side panels for complex editing (used for clauses, controls, etc.).

```tsx
// Pattern from ISO42001ClauseDrawerDialog

<Drawer
  open={isOpen}
  onClose={handleClose}
  anchor="right"
  PaperProps={{ sx: { width: "50vw" } }}
>
  <TabContext value={activeTab}>
    <Box sx={{ borderBottom: 1, borderColor: "divider" }}>
      <TabList onChange={(e, v) => setActiveTab(v)}>
        <Tab label="Details" value="details" />
        <Tab label="Evidence" value="evidence" />
        <Tab label="Notes" value="notes" />
      </TabList>
    </Box>

    <TabPanel value="details">
      <Stack spacing={3}>
        <Field label="Title" value={title} onChange={setTitle} />
        <Select label="Status" value={status} items={statusItems} />
        <DatePicker label="Due Date" date={dueDate} />
      </Stack>
    </TabPanel>

    <TabPanel value="evidence">
      <FileUpload files={files} onUpload={handleUpload} />
    </TabPanel>

    <TabPanel value="notes">
      <NotesSection entityId={entityId} />
    </TabPanel>
  </TabContext>

  <Box sx={{ p: 2, borderTop: 1, borderColor: "divider" }}>
    <CustomizableButton onClick={handleSave} loading={isSaving}>
      Save
    </CustomizableButton>
  </Box>
</Drawer>
```

## Table Components

### CustomizableBasicTable

Main data table with pagination and row selection.

```tsx
// File: Clients/src/presentation/components/Table/index.tsx

<CustomizableBasicTable
  data={{
    rows: [
      { id: 1, name: "Risk 1", level: "High", status: "Open" },
      { id: 2, name: "Risk 2", level: "Medium", status: "Mitigated" },
    ],
    cols: [
      { id: "name", name: "Risk Name" },
      { id: "level", name: "Risk Level" },
      { id: "status", name: "Status" },
    ],
  }}
  paginated={true}
  table="risks"                        // For localStorage key
  label="Project risk"                 // For pagination label
  onRowClick={handleRowClick}          // Row click handler
  setSelectedRow={setSelectedRow}      // Selected row setter
  setAnchorEl={setAnchorEl}            // For context menu
/>
```

**Features:**
- Pagination (5, 10, 15, 25 rows per page)
- Rows per page persisted in localStorage
- Row click handling
- Risk level auto-calculation
- Responsive styling

## Card Components

### ProjectCard

Comprehensive project display card.

```tsx
// File: Clients/src/presentation/components/Cards/ProjectCard/index.tsx

<ProjectCard
  project={project}
  onSettingsClick={handleSettings}
  onFrameworkClick={handleFramework}
/>
```

**Features:**
- Progress bars for frameworks
- Framework action buttons
- Owner info and last updated
- Loading skeleton state

### InfoCard

Simple info card with icon and action.

```tsx
// File: Clients/src/presentation/components/Cards/InfoCard/index.tsx

<InfoCard
  title="Total Risks"
  body="15 risks identified"
  icon={<WarningIcon />}
  actionIcon={<ArrowForwardIcon />}
  actionTooltip="View all"
  onActionClick={handleViewAll}
  isActionActive={true}
/>
```

### StatsCard

Progress statistics card.

```tsx
// File: Clients/src/presentation/components/Cards/StatsCard/index.tsx

<StatsCard
  title="Assessments"
  completed={15}
  total={20}
/>
```

## Layout Components

### PageHeader

Standard page header.

```tsx
// File: Clients/src/presentation/components/Layout/PageHeader.tsx

<PageHeader
  title="Risk Management"
  description="Manage and track project risks"
  rightContent={
    <CustomizableButton startIcon={<AddIcon />}>
      Add Risk
    </CustomizableButton>
  }
/>
```

### Sidebar

Navigation sidebar.

```tsx
// File: Clients/src/presentation/components/Sidebar/index.tsx

// Usually rendered at App level
<Sidebar
  menuGroups={[
    {
      title: "Discovery",
      items: [
        { label: "Dashboard", path: "/", icon: <DashboardIcon /> },
        { label: "Tasks", path: "/tasks", icon: <TaskIcon />, badge: taskCount },
      ],
    },
  ]}
  activePath={location.pathname}
/>
```

### EmptyState

Empty state placeholder.

```tsx
// File: Clients/src/presentation/components/EmptyState/index.tsx
import { Database } from "lucide-react";

<EmptyState
  icon={Database}
  message="No datasets found. Add a dataset to get started."
/>
```

## Status Components

### Alert

Status alert messages.

```tsx
// File: Clients/src/presentation/components/Alert/CustomizableAlert/index.tsx

<CustomizableAlert
  title="Changes saved successfully"
  status="success"          // "success" | "info" | "warning" | "error"
/>
```

### Toast

Notification toast.

```tsx
// File: Clients/src/presentation/components/Toast/index.tsx

<Toast
  message="Item deleted"
  visible={showToast}
  onClose={() => setShowToast(false)}
/>
```

### Chip

Unified badge component for risk levels, statuses, severities, and boolean values. Renders consistent light pastel styling with theme-derived colors. See the runnable showcase in StyleGuide → Chips.

```tsx
// File: Clients/src/presentation/components/Chip.tsx

import Chip from "@/presentation/components/Chip";

// Explicit variant
<Chip label="High" variant="high" />

// Auto-derived variant from common labels (case-insensitive)
<Chip label="Approved" />
<Chip label="In progress" />

// Sizes: "small" (24px, default) | "medium" (34px)
<Chip label="Pending" variant="warning" size="small" />
<Chip label="Pending" variant="warning" size="medium" />

// Lowercase display
<Chip label="In progress" variant="warning" uppercase={false} />

// Custom colors (one-off cases only — prefer variant)
<Chip label="Custom" backgroundColor="#E8F5E9" textColor="#2E7D32" />

// Optional leading icon
<Chip label="Blocked" variant="error" icon={<AlertCircle size={12} />} />
```

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `label` | string | — | Text displayed in the chip (required) |
| `variant` | `ChipVariant` | auto | Semantic color variant; derived from label when omitted |
| `size` | `"small"` \| `"medium"` | `"small"` | Chip height (24px or 34px) |
| `uppercase` | boolean | `true` | Uppercase label text |
| `backgroundColor` | string | — | Override background (use with `textColor`) |
| `textColor` | string | — | Override text color (use with `backgroundColor`) |
| `icon` | ReactNode | — | Optional icon before the label |

**Variant groups:**

| Group | Variants |
|-------|----------|
| Risk levels | `critical`, `high`, `medium`, `low`, `very-low` |
| Status | `success`, `warning`, `error`, `info`, `default` |
| Severity | `catastrophic`, `major`, `moderate`, `minor`, `negligible` |
| Boolean | `yes`, `no` |

**Guidelines:**

- Prefer label-only usage — common labels like `"Approved"`, `"In progress"`, and `"High"` map automatically.
- Pass an explicit `variant` when the label is custom or ambiguous.
- Do not re-implement inline badge styling; use this component instead of raw MUI `Chip` or hardcoded `Box` styles.
- Use `TagChip` (from `components/Tags`) for policy category tags, not for risk/status badges.

### DaysChip

Due date chip with urgency styling.

```tsx
// File: Clients/src/presentation/components/Chip/DaysChip.tsx

<DaysChip
  dueDate={dueDate}
  maxDays={50}              // Shows "50+d" for larger values
  urgentThreshold={3}       // Yellow if within threshold
/>
```

## Avatar Components

### Avatar

User avatar with initials.

```tsx
// File: Clients/src/presentation/components/Avatar/index.tsx

<Avatar
  name="John Doe"
  size={40}
  imageUrl={user.profilePhoto}  // Optional
/>
```

### VWAvatar

VerifyWise avatar wrapper.

```tsx
// Auto-generates background color from name
<VWAvatar name="Jane Smith" />
```

## Tooltip Components

### EnhancedTooltip

Advanced tooltip with title and content.

```tsx
// File: Clients/src/presentation/components/Tooltip/EnhancedTooltip.tsx

<EnhancedTooltip
  title="Risk Level"
  content="The calculated risk level based on severity and likelihood"
>
  <InfoIcon />
</EnhancedTooltip>
```

### HelperIcon

Icon with hover tooltip.

```tsx
<HelperIcon
  tooltip="This field is required for compliance"
/>
```

## Common Patterns

### Form Pattern

```tsx
const [formData, setFormData] = useState({
  name: "",
  status: "",
  dueDate: null,
});

const handleChange = (field: string) => (value: any) => {
  setFormData((prev) => ({ ...prev, [field]: value }));
};

return (
  <Stack spacing={3}>
    <Field
      label="Name"
      value={formData.name}
      onChange={(e) => handleChange("name")(e.target.value)}
      isRequired
    />
    <Select
      label="Status"
      value={formData.status}
      onChange={(e) => handleChange("status")(e.target.value)}
      items={statusOptions}
    />
    <DatePicker
      label="Due Date"
      date={formData.dueDate}
      handleDateChange={handleChange("dueDate")}
    />
    <CustomizableButton onClick={handleSubmit} loading={isSubmitting}>
      Save
    </CustomizableButton>
  </Stack>
);
```

### Modal with Form Pattern

```tsx
const [isOpen, setIsOpen] = useState(false);
const [formData, setFormData] = useState(initialData);

const handleSubmit = async () => {
  try {
    await saveData(formData);
    setIsOpen(false);
    showSuccess("Saved successfully");
  } catch (error) {
    showError("Failed to save");
  }
};

return (
  <>
    <CustomizableButton onClick={() => setIsOpen(true)}>
      Add Item
    </CustomizableButton>

    <StandardModal
      isOpen={isOpen}
      onClose={() => setIsOpen(false)}
      title="Add New Item"
      onSubmit={handleSubmit}
    >
      <Stack spacing={2}>
        <Field label="Name" value={formData.name} onChange={...} />
        <Select label="Type" value={formData.type} items={...} />
      </Stack>
    </StandardModal>
  </>
);
```

### Dropdown Menu Pattern

```tsx
const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

return (
  <>
    <CustomizableButton
      onClick={(e) => setAnchorEl(e.currentTarget)}
      endIcon={<ExpandMoreIcon />}
    >
      Actions
    </CustomizableButton>

    <Popover
      open={Boolean(anchorEl)}
      anchorEl={anchorEl}
      onClose={() => setAnchorEl(null)}
    >
      <MenuList>
        <MenuItem onClick={handleEdit}>Edit</MenuItem>
        <MenuItem onClick={handleDelete}>Delete</MenuItem>
      </MenuList>
    </Popover>
  </>
);
```

## Design System Constants

| Property | Value |
|----------|-------|
| Primary color | `#13715B` |
| Border color | `#d0d5dd` |
| Border radius | `4px` |
| Button height | `34px` |
| Spacing unit | `8px` (theme.spacing(1)) |

## Key Files

| Component | Path |
|-----------|------|
| CustomizableButton | `components/Button/CustomizableButton/index.tsx` |
| Field | `components/Inputs/Field/index.tsx` |
| Select | `components/Inputs/Select/index.tsx` |
| DatePicker | `components/Inputs/Datepicker/index.tsx` |
| StandardModal | `components/Modals/Basic/index.tsx` |
| CustomizableBasicTable | `components/Table/index.tsx` |
| ProjectCard | `components/Cards/ProjectCard/index.tsx` |
| PageHeader | `components/Layout/PageHeader.tsx` |
| Sidebar | `components/Sidebar/index.tsx` |
| EmptyState | `components/EmptyState/index.tsx` |

## Bulk Actions

Tables that need multi-row selection + batch operations (mark-complete, archive, assign-reviewer, etc.) compose three reusable pieces:

- `useBulkSelection<T>` (`application/hooks/useBulkSelection.ts`) — selection state. Returns `{ selectedIds, isSelected, toggle, toggleAll, clear, allSelected, someSelected, count }`. Selection persists across re-renders; `allSelected`/`someSelected` reflect the rows currently passed in.
- `StandardTableHead` (`components/Table/StandardTableHead`) — accepts an optional `selection` prop that renders the indeterminate-aware select-all checkbox in a leading cell.
- `BulkActionsToolbar` (`components/Table/BulkActionsToolbar`) — sticky strip that appears when `count > 0`, showing action buttons. Each action takes `{ id, label, icon?, onClick, disabled?, confirm? }`. Actions with `confirm` open the existing `Dialogs/ConfirmationModal` automatically.

```tsx
const { selectedIds, isSelected, toggle, toggleAll, clear, allSelected, someSelected, count } =
  useBulkSelection<MyRow>({ rows: pageRows, getId: (r) => r.id });

const actions: BulkAction[] = [
  { id: "complete", label: "Mark complete", onClick: () => mutate({ ids: selectedIds, action: "mark_complete" }) },
  { id: "archive", label: "Archive", onClick: archive,
    confirm: { title: "Archive selected?", body: "...", confirmLabel: "Archive", danger: true } },
];

return (
  <>
    {canRunBulkActions && <BulkActionsToolbar count={count} onClear={clear} actions={actions} />}
    <Table>
      <StandardTableHead
        columns={cols}
        sortConfig={sortConfig}
        onSort={onSort}
        selection={canRunBulkActions ? { allSelected, someSelected, onToggleAll: toggleAll } : undefined}
      />
      {/* body rows render their own leading <TableCell padding="checkbox"> with <Checkbox /> */}
    </Table>
  </>
);
```

Gate `canRunBulkActions` on the user's role (typically Admin / Editor) and pass an `onBulkActionSuccess` callback so the parent can refetch and clear the selection after each mutation. The matching backend conventions live in [Backend Patterns → Bulk action endpoints](../guides/backend-patterns.md#bulk-action-endpoints).

## Related Documentation

- [Frontend Overview](./overview.md)
- [Styling](./styling.md)
- [Backend Patterns → Bulk action endpoints](../guides/backend-patterns.md#bulk-action-endpoints)
