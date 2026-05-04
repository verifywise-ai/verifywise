# FilterBy Component Implementation Guide

This document provides a comprehensive guide for implementing the FilterBy component across tables in the VerifyWise application.

## Overview

The FilterBy component is a flexible, cascading filter system that replaces multiple dropdown filters with a single unified UI. It supports:

- Multiple filter conditions (up to 4)
- AND/OR logic between conditions
- Three column types: `text`, `select`, `date`
- Dynamic filter options
- Active filter count badge

## Files

- **Component**: `src/presentation/components/Table/FilterBy.tsx`
- **Hook**: `src/application/hooks/useFilterBy.ts`
- **Types**: Exported from `FilterBy.tsx`

## Quick Start

### 1. Import Required Items

```typescript
import { FilterBy, FilterColumn } from "../../components/Table/FilterBy";
import { useFilterBy } from "../../../application/hooks/useFilterBy";
```

### 2. Define Filter Columns

```typescript
const filterColumns: FilterColumn[] = useMemo(
  () => [
    // Text column - supports: is, is_not, contains, does_not_contain, is_empty, is_not_empty
    {
      id: "name",
      label: "Name",
      type: "text" as const,
    },

    // Select column - supports: is, is_not, is_empty, is_not_empty
    {
      id: "status",
      label: "Status",
      type: "select" as const,
      options: [
        { value: "active", label: "Active" },
        { value: "inactive", label: "Inactive" },
      ],
    },

    // Date column - supports: in_1_day, in_7_days, in_2_weeks, in_30_days, is_today, is_past, is_empty, is_not_empty
    {
      id: "created_at",
      label: "Created date",
      type: "date" as const,
    },
  ],
  [],
);
```

### 3. Create Field Value Getter Function

This function extracts the value from your data model for a given field ID:

```typescript
const getFieldValue = useCallback(
  (item: YourDataType, fieldId: string): string | number | Date | null | undefined => {
    switch (fieldId) {
      case "name":
        return item.name;
      case "status":
        return item.status;
      case "created_at":
        return item.created_at;
      default:
        return null;
    }
  },
  [],
);
```

### 4. Initialize the Hook

```typescript
const { filterData, handleFilterChange } = useFilterBy<YourDataType>(getFieldValue);
```

### 5. Apply Filters to Data

```typescript
const filteredData = useMemo(() => {
  return filterData(yourData);
}, [filterData, yourData]);
```

### 6. Render the Component

```typescript
<FilterBy
  columns={filterColumns}
  onFilterChange={handleFilterChange}
/>
```

## Complete Example

```typescript
import React, { useState, useMemo, useCallback } from "react";
import { Stack, Box } from "@mui/material";
import { FilterBy, FilterColumn } from "../../components/Table/FilterBy";
import { useFilterBy } from "../../../application/hooks/useFilterBy";
import { SearchBox } from "../../components/Search";
import YourTable from "./YourTable";

interface DataItem {
  id: number;
  name: string;
  status: string;
  owner_id: number;
  created_at: string;
}

const YourPage: React.FC = () => {
  const [data, setData] = useState<DataItem[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState("");

  // Dynamic options generator for owner field
  const getUniqueOwners = useCallback(() => {
    const ownerIds = new Set<string>();
    data.forEach((item) => {
      if (item.owner_id) {
        ownerIds.add(item.owner_id.toString());
      }
    });

    return Array.from(ownerIds)
      .sort()
      .map((ownerId) => {
        const user = users.find((u) => u.id.toString() === ownerId);
        const userName = user ? `${user.name} ${user.surname}`.trim() : `User ${ownerId}`;
        return { value: ownerId, label: userName };
      });
  }, [data, users]);

  // Define filter columns
  const filterColumns: FilterColumn[] = useMemo(() => [
    {
      id: 'name',
      label: 'Name',
      type: 'text' as const,
    },
    {
      id: 'status',
      label: 'Status',
      type: 'select' as const,
      options: [
        { value: 'approved', label: 'Approved' },
        { value: 'pending', label: 'Pending' },
        { value: 'rejected', label: 'Rejected' },
      ],
    },
    {
      id: 'owner_id',
      label: 'Owner',
      type: 'select' as const,
      options: getUniqueOwners(),
    },
    {
      id: 'created_at',
      label: 'Created date',
      type: 'date' as const,
    },
  ], [getUniqueOwners]);

  // Field value getter
  const getFieldValue = useCallback(
    (item: DataItem, fieldId: string): string | number | Date | null | undefined => {
      switch (fieldId) {
        case 'name':
          return item.name;
        case 'status':
          return item.status;
        case 'owner_id':
          return item.owner_id?.toString();
        case 'created_at':
          return item.created_at;
        default:
          return null;
      }
    },
    []
  );

  // Initialize filter hook
  const { filterData, handleFilterChange } = useFilterBy<DataItem>(getFieldValue);

  // Apply filters and search
  const filteredData = useMemo(() => {
    // First apply FilterBy conditions
    const filterByResults = filterData(data);

    // Then apply search filter (if search is separate)
    if (!searchTerm.trim()) {
      return filterByResults;
    }

    return filterByResults.filter((item) =>
      item.name?.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [filterData, data, searchTerm]);

  return (
    <Stack spacing={2}>
      {/* Filter Row */}
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Stack direction="row" spacing={2} alignItems="center">
          {/* FilterBy replaces multiple dropdowns */}
          <FilterBy
            columns={filterColumns}
            onFilterChange={handleFilterChange}
          />

          {/* Search remains separate */}
          <Box sx={{ width: 200 }}>
            <SearchBox
              placeholder="Search..."
              value={searchTerm}
              onChange={setSearchTerm}
            />
          </Box>
        </Stack>

        {/* Right side buttons */}
        <Stack direction="row" spacing={2}>
          {/* Add button, export, etc. */}
        </Stack>
      </Stack>

      {/* Table */}
      <YourTable data={filteredData} />
    </Stack>
  );
};

export default YourPage;
```

## Filter Column Types

### Text Columns

```typescript
{
  id: 'field_name',
  label: 'Display Label',
  type: 'text' as const,
}
```

**Available operators:**
| Operator | Description |
|----------|-------------|
| `is` | Exact match (case-insensitive) |
| `is_not` | Does not match exactly |
| `contains` | Contains substring |
| `does_not_contain` | Does not contain substring |
| `is_empty` | Field is null, undefined, or empty string |
| `is_not_empty` | Field has a value |

### Select Columns

```typescript
{
  id: 'field_name',
  label: 'Display Label',
  type: 'select' as const,
  options: [
    { value: 'value1', label: 'Label 1' },
    { value: 'value2', label: 'Label 2' },
  ],
}
```

**Available operators:**
| Operator | Description |
|----------|-------------|
| `is` | Equals selected value |
| `is_not` | Does not equal selected value |
| `is_empty` | Field is null, undefined, or empty |
| `is_not_empty` | Field has a value |

### Date Columns

```typescript
{
  id: 'field_name',
  label: 'Display Label',
  type: 'date' as const,
}
```

**Available operators:**
| Operator | Description |
|----------|-------------|
| `in_1_day` | Within next 24 hours |
| `in_7_days` | Within next 7 days |
| `in_2_weeks` | Within next 14 days |
| `in_30_days` | Within next 30 days |
| `is_today` | Is today's date |
| `is_past` | Date is in the past |
| `is_empty` | No date set |
| `is_not_empty` | Has a date |

## Dynamic Options

For fields like "Owner" or "Approver" where options come from data:

```typescript
const getUniqueApprovers = useCallback(() => {
  const approverIds = new Set<string>();

  data.forEach((item) => {
    if (item.approver) {
      approverIds.add(item.approver.toString());
    }
  });

  return Array.from(approverIds)
    .sort()
    .map((approverId) => {
      const user = users.find((u) => u.id.toString() === approverId);
      const userName = user ? `${user.name} ${user.surname}`.trim() : `User ${approverId}`;
      return { value: approverId, label: userName };
    });
}, [data, users]);

// Use in filter columns
const filterColumns: FilterColumn[] = useMemo(
  () => [
    {
      id: "approver",
      label: "Approver",
      type: "select" as const,
      options: getUniqueApprovers(),
    },
  ],
  [getUniqueApprovers],
);
```

## Integration with Other Features

### With GroupBy

```typescript
const filteredData = useMemo(() => {
  return filterData(data);
}, [filterData, data]);

// GroupBy works on already filtered data
const groupedData = useTableGrouping({
  data: filteredData,
  groupByField: groupBy,
  sortOrder: groupSortOrder,
  getGroupKey: getGroupKey,
});
```

### With Export

```typescript
// Export uses the filtered data
const exportData = useMemo(() => {
  return filteredData.map((item) => ({
    // Map to export columns
  }));
}, [filteredData]);

<ExportMenu
  data={exportData}
  columns={exportColumns}
  filename="export"
/>
```

### With Search

```typescript
const filteredData = useMemo(() => {
  // Apply FilterBy first
  const filterByResults = filterData(data);

  // Then apply search
  if (!searchTerm.trim()) {
    return filterByResults;
  }

  return filterByResults.filter((item) =>
    item.name?.toLowerCase().includes(searchTerm.toLowerCase()),
  );
}, [filterData, data, searchTerm]);
```

## UI Behavior

- **Filter Button**: Displays "Filter" with badge showing active filter count
- **Popover**: Opens on button click, min-width 700px
- **Multiple Conditions**: Up to 4 filter conditions can be added
- **AND/OR Toggle**: Available on 2nd, 3rd, 4th conditions
- **Add Filter**: "+ Add filter" link adds new condition row
- **Clear All**: Resets all filter conditions
- **Auto-close**: Popover doesn't auto-close, user must click outside

## Component Order in Filter Row

**IMPORTANT**: The components in the filter row should follow this order:

```
FilterBy → GroupBy → Search
```

This provides a consistent user experience across all tables in the application:

1. **FilterBy** - Primary filtering mechanism (leftmost)
2. **GroupBy** - Group/organize the filtered results
3. **Search** - Quick text search within filtered/grouped results (rightmost in left section)

Example layout:

```typescript
<Stack direction="row" spacing={2} alignItems="center">
    <FilterBy
        columns={filterColumns}
        onFilterChange={handleFilterChange}
    />
    <GroupBy
        options={groupByOptions}
        onGroupChange={handleGroupChange}
    />
    <Box sx={{ width: 200 }}>
        <SearchBox
            placeholder="Search..."
            value={searchTerm}
            onChange={setSearchTerm}
        />
    </Box>
</Stack>
```

## Removing Old Dropdowns

When implementing FilterBy, remove:

1. Individual filter dropdown components
2. Related state variables (e.g., `statusFilter`, `categoryFilter`)
3. Individual filter change handlers
4. Individual filter logic in useMemo

Replace with the unified FilterBy pattern shown above.

## Checklist for Implementation

- [ ] Import FilterBy and useFilterBy
- [ ] Define filterColumns with appropriate types
- [ ] Create dynamic option generators if needed
- [ ] Create getFieldValue function
- [ ] Initialize useFilterBy hook
- [ ] Update filteredData useMemo to use filterData
- [ ] Add FilterBy component to UI
- [ ] Remove old dropdown filters and their state
- [ ] Test all filter combinations
- [ ] Verify integration with search, groupBy, export

## Troubleshooting

**Filters not working:**

- Check that `fieldId` in getFieldValue matches `id` in filterColumns
- Ensure getFieldValue returns the correct type (string for select columns)

**Dynamic options not updating:**

- Add data dependency to useMemo for filterColumns
- Ensure the dynamic getter function is in the dependency array

**Date filters not matching:**

- Ensure date fields return Date objects or valid date strings
- Check timezone handling if dates seem off by a day
