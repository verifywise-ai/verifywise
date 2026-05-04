# Breadcrumbs Component

A comprehensive, accessible, and customizable breadcrumb navigation component built on Material-UI. This component provides both manual and auto-generated breadcrumb functionality with extensive customization options.

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Installation](#installation)
- [Basic Usage](#basic-usage)
- [API Reference](#api-reference)
- [Advanced Usage](#advanced-usage)
- [Route Mapping](#route-mapping)
- [Accessibility](#accessibility)
- [Performance](#performance)
- [Examples](#examples)
- [Troubleshooting](#troubleshooting)

## Overview

The Breadcrumbs component is designed to provide intuitive navigation context for users within your application. It supports both manual breadcrumb creation and automatic generation from the current route, making it suitable for various navigation patterns.

### Key Benefits

- **Auto-generation**: Automatically creates breadcrumbs from current route
- **Accessibility**: Full ARIA support and keyboard navigation
- **Performance**: Memoized components and optimized rendering
- **Customizable**: Extensive styling and behavior options
- **Type-safe**: Full TypeScript support with comprehensive interfaces

## Features

### Core Features

- ✅ Auto-generation from current route
- ✅ Manual breadcrumb items
- ✅ Custom route mapping
- ✅ Label truncation
- ✅ Keyboard navigation
- ✅ ARIA accessibility
- ✅ Theme integration
- ✅ Performance optimization

### Advanced Features

- ✅ Dynamic route pattern matching
- ✅ Custom click handlers
- ✅ Disabled state support
- ✅ Tooltip integration
- ✅ Responsive design
- ✅ Error handling

## Installation

The component is already included in the project. Import it as needed:

```typescript
import Breadcrumbs from "./components/Breadcrumbs";
import PageBreadcrumbs from "./components/Breadcrumbs/PageBreadcrumbs";
```

## Basic Usage

### Auto-generated Breadcrumbs

```tsx
import Breadcrumbs from "./components/Breadcrumbs";

function MyPage() {
  return (
    <div>
      <Breadcrumbs autoGenerate={true} />
    </div>
  );
}
```

### Manual Breadcrumbs

```tsx
import Breadcrumbs, { BreadcrumbItem } from "./components/Breadcrumbs";

function MyPage() {
  const breadcrumbItems: BreadcrumbItem[] = [
    { label: "Home", path: "/" },
    { label: "Projects", path: "/projects" },
    { label: "Current Project", path: "/projects/123" },
  ];

  return (
    <div>
      <Breadcrumbs items={breadcrumbItems} />
    </div>
  );
}
```

### Using PageBreadcrumbs (Recommended)

```tsx
import PageBreadcrumbs from "./components/Breadcrumbs/PageBreadcrumbs";

function MyPage() {
  return (
    <div>
      <PageBreadcrumbs />
    </div>
  );
}
```

## API Reference

### BreadcrumbsProps

| Prop              | Type                    | Default            | Description                         |
| ----------------- | ----------------------- | ------------------ | ----------------------------------- |
| `items`           | `BreadcrumbItem[]`      | `undefined`        | Array of breadcrumb items           |
| `separator`       | `React.ReactNode`       | `<NavigateNext />` | Custom separator icon               |
| `maxItems`        | `number`                | `8`                | Maximum number of items to show     |
| `sx`              | `SxProps<Theme>`        | `undefined`        | Custom styles                       |
| `autoGenerate`    | `boolean`               | `false`            | Auto-generate from current route    |
| `showCurrentPage` | `boolean`               | `true`             | Show current page as last item      |
| `homeLabel`       | `string`                | `"Home"`           | Custom home label                   |
| `homePath`        | `string`                | `"/"`              | Custom home path                    |
| `truncateLabels`  | `boolean`               | `true`             | Truncate long labels                |
| `maxLabelLength`  | `number`                | `20`               | Maximum length for truncated labels |
| `onItemClick`     | `(item, index) => void` | `undefined`        | Custom click handler                |

### BreadcrumbItem

| Property   | Type         | Required | Description                          |
| ---------- | ------------ | -------- | ------------------------------------ |
| `label`    | `string`     | ✅       | Display label for the breadcrumb     |
| `path`     | `string`     | ❌       | Navigation path for the breadcrumb   |
| `onClick`  | `() => void` | ❌       | Custom click handler                 |
| `disabled` | `boolean`    | ❌       | Whether the breadcrumb is disabled   |
| `id`       | `string`     | ❌       | Unique identifier for the breadcrumb |
| `tooltip`  | `string`     | ❌       | Tooltip text for additional context  |

### PageBreadcrumbsProps

Extends `BreadcrumbsProps` with additional properties:

| Prop                 | Type                     | Default     | Description                    |
| -------------------- | ------------------------ | ----------- | ------------------------------ |
| `className`          | `string`                 | `undefined` | Additional CSS class           |
| `testId`             | `string`                 | `undefined` | Test identifier for automation |
| `customRouteMapping` | `Record<string, string>` | `undefined` | Custom route mappings          |

## Advanced Usage

### Custom Click Handlers

```tsx
import Breadcrumbs, { BreadcrumbItem } from "./components/Breadcrumbs";

function MyPage() {
  const handleItemClick = (item: BreadcrumbItem, index: number) => {
    console.log(`Clicked: ${item.label} at index ${index}`);
    // Custom navigation logic
  };

  const items: BreadcrumbItem[] = [
    { label: "Home", path: "/" },
    { label: "Projects", onClick: () => console.log("Custom click!") },
    { label: "Current Project" },
  ];

  return <Breadcrumbs items={items} onItemClick={handleItemClick} />;
}
```

### Custom Styling

```tsx
import Breadcrumbs from "./components/Breadcrumbs";
import { useTheme } from "@mui/material";

function MyPage() {
  const theme = useTheme();

  return (
    <Breadcrumbs
      autoGenerate={true}
      sx={{
        backgroundColor: theme.palette.grey[100],
        borderRadius: 1,
        px: 2,
        py: 1,
        "& .MuiBreadcrumbs-separator": {
          color: theme.palette.primary.main,
        },
      }}
    />
  );
}
```

### Disabled Items

```tsx
import Breadcrumbs, { BreadcrumbItem } from "./components/Breadcrumbs";

function MyPage() {
  const items: BreadcrumbItem[] = [
    { label: "Home", path: "/" },
    { label: "Projects", path: "/projects" },
    { label: "Current Project", disabled: true },
  ];

  return <Breadcrumbs items={items} />;
}
```

### Custom Separator

```tsx
import Breadcrumbs from "./components/Breadcrumbs";
import { ChevronRight } from "@mui/icons-material";

function MyPage() {
  return <Breadcrumbs autoGenerate={true} separator={<ChevronRight fontSize="small" />} />;
}
```

## Route Mapping

The component uses a centralized route mapping system defined in `routeMapping.ts`. This system provides:

### Static Route Mappings

Predefined mappings for common routes:

```typescript
export const routeMapping: Record<string, string> = {
  "/": "Dashboard",
  "/project-view": "Project Overview",
  "/vendors": "Vendor Management",
  "/settings": "Settings",
  // ... more mappings
};
```

### Dynamic Route Patterns

Pattern-based matching for dynamic routes:

```typescript
export const dynamicRoutePatterns = [
  {
    pattern: /\/project-view.*projectId=/,
    label: "Project Details",
  },
  {
    pattern: /\/fairness-results\/\w+/,
    label: "Fairness Results",
  },
  // ... more patterns
];
```

### Adding Custom Mappings

To add new route mappings, update the `routeMapping.ts` file:

```typescript
// Add to routeMapping object
"/new-page": "New Page Label",

// Or add to dynamicRoutePatterns array
{
  pattern: /\/new-page\/\d+/,
  label: "New Page Details",
}
```

## Accessibility

The component is fully accessible with:

- **ARIA Labels**: Proper `aria-label` and `aria-current` attributes
- **Keyboard Navigation**: Full keyboard support with Enter and Space keys
- **Screen Reader Support**: Semantic HTML structure
- **Focus Management**: Visible focus indicators
- **Role Attributes**: Proper `role` attributes for navigation

### Accessibility Features

```tsx
// Automatic ARIA attributes
<nav role="navigation" aria-label="Page breadcrumb navigation">
  <ol role="list">
    <li role="listitem">
      <button role="button" aria-label="Navigate to Home" tabIndex={0}>
        Home
      </button>
    </li>
    <li role="listitem" aria-current="page">
      Current Page
    </li>
  </ol>
</nav>
```

## Performance

The component is optimized for performance with:

- **Memoization**: `useMemo` and `useCallback` hooks prevent unnecessary re-renders
- **Lazy Evaluation**: Route mapping is computed only when needed
- **Efficient Updates**: Minimal DOM updates on route changes

### Performance Best Practices

1. **Use PageBreadcrumbs**: The memoized wrapper component for better performance
2. **Stable References**: Use stable references for `onItemClick` handlers
3. **Minimal Props**: Only pass necessary props to avoid unnecessary re-renders

```tsx
// Good: Stable reference
const handleClick = useCallback((item, index) => {
  // Handle click
}, []);

// Good: Memoized component
const MemoizedBreadcrumbs = memo(PageBreadcrumbs);
```

## Examples

### E-commerce Product Page

```tsx
import PageBreadcrumbs from "./components/Breadcrumbs/PageBreadcrumbs";

function ProductPage() {
  return (
    <div>
      <PageBreadcrumbs homeLabel="Store" homePath="/store" maxLabelLength={30} />
      {/* Product content */}
    </div>
  );
}
```

### Admin Dashboard

```tsx
import Breadcrumbs, { BreadcrumbItem } from "./components/Breadcrumbs";

function AdminPage() {
  const items: BreadcrumbItem[] = [
    { label: "Admin", path: "/admin" },
    { label: "Users", path: "/admin/users" },
    { label: "User Details", tooltip: "Viewing user profile information" },
  ];

  return <Breadcrumbs items={items} sx={{ mb: 2 }} />;
}
```

### Multi-level Navigation

```tsx
import PageBreadcrumbs from "./components/Breadcrumbs/PageBreadcrumbs";

function DeepNavigationPage() {
  return (
    <PageBreadcrumbs
      showCurrentPage={true}
      truncateLabels={true}
      maxLabelLength={15}
      onItemClick={(item, index) => {
        // Custom analytics tracking
        analytics.track("breadcrumb_click", {
          label: item.label,
          index,
          path: item.path,
        });
      }}
    />
  );
}
```

## Troubleshooting

### Common Issues

#### Breadcrumbs Not Showing

**Problem**: Breadcrumbs component renders nothing.

**Solution**: Check if `autoGenerate` is enabled or `items` array is provided:

```tsx
// Make sure one of these is true:
<Breadcrumbs autoGenerate={true} />
// OR
<Breadcrumbs items={breadcrumbItems} />
```

#### Route Mapping Not Working

**Problem**: Auto-generated breadcrumbs show raw paths instead of readable labels.

**Solution**: Add your route to the mapping in `routeMapping.ts`:

```typescript
// Add to routeMapping object
"/your-route": "Your Route Label",
```

#### Styling Issues

**Problem**: Custom styles not applying correctly.

**Solution**: Use the `sx` prop with proper MUI theme structure:

```tsx
<Breadcrumbs
  sx={{
    "& .MuiBreadcrumbs-separator": {
      color: "primary.main",
    },
    "& .MuiBreadcrumbs-ol": {
      flexWrap: "wrap",
    },
  }}
/>
```

#### Performance Issues

**Problem**: Component re-renders too frequently.

**Solution**: Use `PageBreadcrumbs` (memoized) and stable callback references:

```tsx
const handleClick = useCallback((item, index) => {
  // Handle click
}, []);

<PageBreadcrumbs onItemClick={handleClick} />;
```

### Debug Mode

Enable debug logging by setting the environment variable:

```bash
REACT_APP_DEBUG_BREADCRUMBS=true
```

This will log route mapping decisions and component updates to the console.

## Contributing

When contributing to the Breadcrumbs component:

1. **Update Route Mappings**: Add new routes to `routeMapping.ts`
2. **Test Accessibility**: Ensure keyboard navigation and screen reader compatibility
3. **Performance**: Use memoization and avoid unnecessary re-renders
4. **Documentation**: Update this README for new features
5. **Type Safety**: Maintain full TypeScript support

## Related Components

- `PageBreadcrumbs`: Memoized wrapper with application-specific defaults
- `routeMapping.ts`: Centralized route mapping configuration
- Material-UI `Breadcrumbs`: Base component from MUI library

## License

This component is part of the VerifyWise project and follows the project's licensing terms.
