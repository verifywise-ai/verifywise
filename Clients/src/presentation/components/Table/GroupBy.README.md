# GroupBy Component - Usage Guide

The GroupBy functionality is a fully reusable component system that can be easily added to any table in the application.

## Components

### 1. `GroupBy` - The dropdown button component

The main UI component that users interact with to select grouping options.

### 2. `GroupBadge` - Circular count indicator

A reusable badge component that shows counts in a green circle.

### 3. `GroupedTableView` - Grouped rendering helper

A component that handles the conditional rendering of grouped vs ungrouped tables.

### 4. `useGroupByState` - State management hook

Manages the groupBy field and sort order state.

### 5. `useTableGrouping` - Data grouping hook

Generic hook that groups any data based on a custom key extraction function.

---

## How to Add GroupBy to Any Table

### Step 1: Import the required components and hooks

```tsx
import { GroupBy } from "../../components/Table/GroupBy";
import { useTableGrouping, useGroupByState } from "../../../application/hooks/useTableGrouping";
import { GroupedTableView } from "../../components/Table/GroupedTableView";
```

### Step 2: Set up state management

```tsx
const MyTablePage: React.FC = () => {
  const [data, setData] = useState<MyDataType[]>([]);

  // Add grouping state
  const { groupBy, groupSortOrder, handleGroupChange } = useGroupByState();

  // ... rest of your component
};
```

### Step 3: Define how to extract group keys from your data

Create a function that tells the system how to extract the group key from each data item:

```tsx
const getMyDataGroupKey = (item: MyDataType, field: string): string | string[] => {
  switch (field) {
    case "status":
      return item.status || "Unknown";

    case "category":
      return item.category || "Uncategorized";

    case "assignees":
      // For fields that can have multiple values, return an array
      // The item will appear in multiple groups
      if (item.assignees && item.assignees.length > 0) {
        return item.assignees.map((assignee) => assignee.name);
      }
      return "Unassigned";

    case "date":
      return item.date ? new Date(item.date).toLocaleDateString() : "No Date";

    default:
      return "Other";
  }
};
```

### Step 4: Use the grouping hook

```tsx
const groupedData = useTableGrouping({
  data: data,
  groupByField: groupBy,
  sortOrder: groupSortOrder,
  getGroupKey: getMyDataGroupKey,
});
```

### Step 5: Add the GroupBy button to your UI

Typically placed in the filter row alongside search and other filters:

```tsx
<Stack direction="row" spacing={2}>
  <SearchBox ... />

  <GroupBy
    options={[
      { id: 'status', label: 'Status' },
      { id: 'category', label: 'Category' },
      { id: 'assignees', label: 'Assignees' },
      { id: 'date', label: 'Date' },
    ]}
    onGroupChange={handleGroupChange}
  />
</Stack>
```

### Step 6: Render your table with GroupedTableView

Replace your existing table rendering with:

```tsx
<GroupedTableView
  groupedData={groupedData}
  ungroupedData={data}
  renderTable={(data, options) => (
    <MyTable
      data={data}
      // ... your other props
      hidePagination={options?.hidePagination}
    />
  )}
/>
```

**Important**: Your table component must support a `hidePagination` prop (or similar) to hide pagination when showing grouped results.

---

## Complete Example

Here's a complete example for a Vendors table:

```tsx
import React, { useState } from 'react';
import { Stack } from '@mui/material';
import { GroupBy } from "../../components/Table/GroupBy";
import { useTableGrouping, useGroupByState } from "../../../application/hooks/useTableGrouping";
import { GroupedTableView } from "../../components/Table/GroupedTableView";
import VendorsTable from "../../components/Table/VendorsTable";

const Vendors: React.FC = () => {
  const [vendors, setVendors] = useState<Vendor[]>([]);

  // Grouping state
  const { groupBy, groupSortOrder, handleGroupChange } = useGroupByState();

  // Define group key extraction
  const getVendorGroupKey = (vendor: Vendor, field: string): string | string[] => {
    switch (field) {
      case 'risk_level':
        return vendor.risk_level || 'Unknown';
      case 'status':
        return vendor.status || 'Unknown';
      case 'country':
        return vendor.country || 'Unknown';
      default:
        return 'Other';
    }
  };

  // Apply grouping
  const groupedVendors = useTableGrouping({
    data: vendors,
    groupByField: groupBy,
    sortOrder: groupSortOrder,
    getGroupKey: getVendorGroupKey,
  });

  return (
    <Stack gap={2}>
      {/* Filters Row */}
      <Stack direction="row" spacing={2}>
        <SearchBox ... />
        <Select ... />

        <GroupBy
          options={[
            { id: 'risk_level', label: 'Risk Level' },
            { id: 'status', label: 'Status' },
            { id: 'country', label: 'Country' },
          ]}
          onGroupChange={handleGroupChange}
        />
      </Stack>

      {/* Table */}
      <GroupedTableView
        groupedData={groupedVendors}
        ungroupedData={vendors}
        renderTable={(data, options) => (
          <VendorsTable
            vendors={data}
            onEdit={handleEdit}
            onDelete={handleDelete}
            hidePagination={options?.hidePagination}
          />
        )}
      />
    </Stack>
  );
};
```

---

## Features

- ✅ **Fully typed** - TypeScript generic support for any data type
- ✅ **Multiple groups** - Items can belong to multiple groups (e.g., multiple assignees)
- ✅ **Customizable** - Define your own group options and extraction logic
- ✅ **Sort control** - A→Z and Z→A sorting of groups
- ✅ **Auto-hide pagination** - Pagination automatically hidden in grouped view
- ✅ **Circular badges** - Consistent badge design for counts
- ✅ **Scroll handling** - Dropdown closes on scroll to prevent detachment
- ✅ **Accessible** - Built with MUI components for accessibility

---

## Tips

1. **Keep group options relevant** - Only offer grouping by fields that make sense for your data
2. **Handle null/undefined** - Always provide fallback values in your `getGroupKey` function
3. **Consider performance** - For very large datasets (1000+ items), grouping is computed on every render
4. **Pagination limit** - Grouped tables show up to 100 items per group by default

---

## Troubleshooting

**Q: The dropdown stays detached when I scroll**
A: This is fixed - the dropdown now automatically closes when scrolling.

**Q: My table doesn't support `hidePagination`**
A: Add a `hidePagination?: boolean` prop to your table component that conditionally renders the pagination footer.

**Q: I want different badge colors**
A: Edit the `GroupBadge` component in `GroupBy.tsx` to customize colors.

**Q: Can I group by computed/derived fields?**
A: Yes! Your `getGroupKey` function can perform any computation. The `field` parameter tells you which grouping option was selected.
