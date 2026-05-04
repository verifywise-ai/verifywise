# Table Export Functionality Guide

## Overview

The table export functionality allows users to export table data to PDF, CSV, or XLSX formats. This guide explains how to implement this feature on any table in the application.

## Components

### 1. ExportMenu Component

**Location:** `Clients/src/presentation/components/Table/ExportMenu.tsx`

A reusable dropdown menu component that provides export options.

**Props:**

- `data` - Array of objects containing the data to export
- `columns` - Array of column definitions with `id` and `label`
- `filename` (optional) - Base filename for the exported file (default: 'export')
- `title` (optional) - Title to display in PDF exports

### 2. Export Utilities

**Location:** `Clients/src/application/utils/tableExport.ts`

Contains three export functions:

- `exportToCSV(data, columns, filename)` - Exports data to CSV format
- `exportToExcel(data, columns, filename)` - Exports data to XLSX format
- `exportToPDF(data, columns, filename, title)` - Exports data to PDF format

## Implementation Steps

### Step 1: Import the ExportMenu Component

```typescript
import { ExportMenu } from "../../components/Table/ExportMenu";
```

### Step 2: Define Export Columns

Create a `useMemo` hook to define which columns to export:

```typescript
const exportColumns = useMemo(() => {
  return [
    { id: "column1", label: "Column 1 Display Name" },
    { id: "column2", label: "Column 2 Display Name" },
    { id: "column3", label: "Column 3 Display Name" },
    // ... add more columns as needed
  ];
}, []);
```

### Step 3: Prepare Export Data

Create a `useMemo` hook to format your data for export:

```typescript
const exportData = useMemo(() => {
  return filteredData.map((item) => {
    return {
      column1: item.field1 || "-",
      column2: item.field2 || "-",
      column3: item.field3 ? "Yes" : "No",
      // ... format more fields as needed
    };
  });
}, [filteredData, anyOtherDependencies]);
```

**Important:**

- Transform data as needed (e.g., user IDs to names, booleans to Yes/No)
- Handle null/undefined values with fallbacks (use `|| '-'` or `|| 'N/A'`)
- Format dates, percentages, or other special values

### Step 4: Add ExportMenu to Your UI

Place the `ExportMenu` component where you want the export button to appear (typically near action buttons):

```typescript
<Stack direction="row" gap="8px" alignItems="center">
  <ExportMenu
    data={exportData}
    columns={exportColumns}
    filename="my-table-name"
    title="My Table Title"
  />
  <CustomizableButton
    text="Add New Item"
    // ... other props
  />
</Stack>
```

## Complete Example

Here's a complete example from the Vendors page:

```typescript
// 1. Import
import { ExportMenu } from "../../components/Table/ExportMenu";

// 2. Define columns
const exportColumns = useMemo(() => {
  return [
    { id: 'vendor_name', label: 'Name' },
    { id: 'assignee', label: 'Assignee' },
    { id: 'review_status', label: 'Status' },
    { id: 'scorecard', label: 'Scorecard' },
    { id: 'review_date', label: 'Review Date' },
  ];
}, []);

// 3. Prepare data
const exportData = useMemo(() => {
  return filteredVendors.map((vendor: VendorModel) => {
    const assigneeUser = users.find((user) => user.id === vendor.assignee);
    const assigneeName = assigneeUser
      ? `${assigneeUser.name} ${assigneeUser.surname}`
      : 'Unassigned';

    return {
      vendor_name: vendor.vendor_name,
      assignee: assigneeName,
      review_status: vendor.review_status || 'Not started',
      scorecard: vendor.risk_score !== null && vendor.risk_score !== undefined
        ? `${vendor.risk_score}%`
        : 'N/A',
      review_date: vendor.review_date || 'N/A',
    };
  });
}, [filteredVendors, users]);

// 4. Add to UI
<Stack direction="row" gap="8px" alignItems="center">
  <ExportMenu
    data={exportData}
    columns={exportColumns}
    filename="vendors"
    title="Vendor List"
  />
  <CustomizableButton
    text="Add new vendor"
    // ... other props
  />
</Stack>
```

## Data Formatting Tips

### Handling User References

```typescript
const assigneeUser = users.find((user) => user.id === item.assignee);
const assigneeName = assigneeUser ? `${assigneeUser.name} ${assigneeUser.surname}` : "Unassigned";
```

### Handling Booleans

```typescript
security_assessment: item.security_assessment ? "Yes" : "No";
```

### Handling Percentages

```typescript
// Make sure to check for null AND undefined to handle 0 values
scorecard: item.risk_score !== null && item.risk_score !== undefined
  ? `${item.risk_score}%`
  : "N/A";
```

### Handling Dates

```typescript
status_date: item.status_date || "-";
```

### Handling Null/Undefined

```typescript
field: item.field || "-";
// or
field: item.field ?? "N/A";
```

## Styling Notes

The ExportMenu component:

- Uses a "..." (MoreVertical) icon
- Has a height of exactly 34px to match other buttons
- Maintains 8px gap from adjacent buttons when using `gap="8px"` in Stack
- Shows custom SVG icons (PDF=red, CSV=orange, XLSX=green) in the dropdown

## Required Dependencies

Make sure these packages are installed in `package.json`:

```json
{
  "dependencies": {
    "jspdf": "^3.0.3",
    "jspdf-autotable": "^5.0.2",
    "xlsx": "^0.18.5",
    "file-saver": "^2.0.5"
  }
}
```

## Examples in Codebase

1. **Vendors Table**: `Clients/src/presentation/pages/Vendors/index.tsx` (lines 468-493, 672-678)
2. **Model Inventory Table**: `Clients/src/presentation/pages/ModelInventory/index.tsx` (lines 200-229, 1196-1201)

## Troubleshooting

### Export shows "N/A" instead of values

- Check that you're using the correct field name from your data model
- Verify the field exists and has data
- For numeric values like 0, use `!== null && !== undefined` instead of `||`

### PDF export doesn't work

- Ensure `jspdf-autotable` is imported correctly: `import autoTable from 'jspdf-autotable'`
- Check browser console for errors
- Verify the export data and columns are properly formatted

### Icons not showing

- Make sure the SVG icon files exist in `Clients/src/presentation/assets/icons/`
- Check for import errors in the browser console
- Try a hard refresh (Ctrl+Shift+R)
