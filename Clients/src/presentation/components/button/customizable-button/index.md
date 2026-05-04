# CustomizableButton Component

A highly customizable, accessible, and feature-rich button component built on Material-UI. This component extends the standard MUI Button with additional functionality including loading states, theme integration, accessibility features, and performance optimizations.

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Installation](#installation)
- [Basic Usage](#basic-usage)
- [API Reference](#api-reference)
- [Advanced Usage](#advanced-usage)
- [Theme Integration](#theme-integration)
- [Accessibility](#accessibility)
- [Performance](#performance)
- [Examples](#examples)
- [Migration Guide](#migration-guide)
- [Troubleshooting](#troubleshooting)

## Overview

The CustomizableButton component is designed to provide a consistent, accessible, and feature-rich button experience across the VerifyWise application. It builds upon Material-UI's Button component while adding custom styling, loading states, and enhanced accessibility features.

### Key Benefits

- **Theme Integration**: Seamless integration with the application's design system
- **Loading States**: Built-in loading indicators with customizable spinners
- **Accessibility**: Full ARIA support and keyboard navigation
- **Performance**: Memoized component with optimized re-rendering
- **Flexibility**: Extensive customization options while maintaining consistency
- **Type Safety**: Full TypeScript support with comprehensive interfaces

## Features

### Core Features

- ✅ Material-UI Button extension with custom styling
- ✅ Loading state with spinner indicators
- ✅ Icon positioning (start, end, or custom)
- ✅ Theme-based color variants
- ✅ Full accessibility support
- ✅ Keyboard navigation
- ✅ Error handling with try-catch
- ✅ Performance optimization with memoization

### Advanced Features

- ✅ Custom loading indicators
- ✅ Link-style button variants
- ✅ Disabled state management
- ✅ Tooltip support
- ✅ Test ID support for automation
- ✅ Forward ref support
- ✅ Custom styling with sx prop
- ✅ Form integration (submit, reset, button types)

## Installation

The component is already included in the project. Import it as needed:

```typescript
import CustomizableButton from "./components/Button/CustomizableButton";
```

## Basic Usage

### Simple Button

```tsx
import CustomizableButton from "./components/Button/CustomizableButton";

function MyComponent() {
  return <CustomizableButton onClick={() => console.log("Clicked!")}>Click Me</CustomizableButton>;
}
```

### Button with Icon

```tsx
import CustomizableButton from "./components/Button/CustomizableButton";
import SaveIcon from "@mui/icons-material/Save";

function MyComponent() {
  return (
    <CustomizableButton variant="contained" startIcon={<SaveIcon />} onClick={handleSave}>
      Save Document
    </CustomizableButton>
  );
}
```

### Loading Button

```tsx
import CustomizableButton from "./components/Button/CustomizableButton";

function MyComponent() {
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setLoading(true);
    try {
      await submitData();
    } finally {
      setLoading(false);
    }
  };

  return (
    <CustomizableButton loading={loading} onClick={handleSubmit} variant="contained">
      Submit Form
    </CustomizableButton>
  );
}
```

## API Reference

### CustomizableButtonProps

| Prop               | Type                                                                      | Default       | Description                                    |
| ------------------ | ------------------------------------------------------------------------- | ------------- | ---------------------------------------------- |
| `variant`          | `"contained" \| "outlined" \| "text"`                                     | `"contained"` | The visual style variant of the button         |
| `size`             | `"small" \| "medium" \| "large"`                                          | `"medium"`    | The size of the button                         |
| `isDisabled`       | `boolean`                                                                 | `false`       | Whether the button is disabled                 |
| `isLink`           | `boolean`                                                                 | `false`       | Whether to style the button as a link          |
| `color`            | `"primary" \| "secondary" \| "success" \| "warning" \| "error" \| "info"` | `"primary"`   | The color theme of the button                  |
| `onClick`          | `(event: React.MouseEvent<HTMLButtonElement>) => void`                    | `undefined`   | Click event handler                            |
| `sx`               | `SxProps<Theme>`                                                          | `undefined`   | Custom styles using MUI's sx prop              |
| `text`             | `string`                                                                  | `undefined`   | Button text content (deprecated: use children) |
| `icon`             | `React.ReactNode`                                                         | `undefined`   | Icon element (deprecated: use startIcon)       |
| `startIcon`        | `React.ReactNode`                                                         | `undefined`   | Icon to display at the start                   |
| `endIcon`          | `React.ReactNode`                                                         | `undefined`   | Icon to display at the end                     |
| `children`         | `React.ReactNode`                                                         | `undefined`   | Button content                                 |
| `loading`          | `boolean`                                                                 | `false`       | Loading state with spinner                     |
| `loadingIndicator` | `React.ReactNode`                                                         | `undefined`   | Custom loading indicator                       |
| `ariaLabel`        | `string`                                                                  | `undefined`   | ARIA label for accessibility                   |
| `ariaDescribedBy`  | `string`                                                                  | `undefined`   | ARIA described by reference                    |
| `testId`           | `string`                                                                  | `undefined`   | Test identifier for automation                 |
| `type`             | `"button" \| "submit" \| "reset"`                                         | `"button"`    | HTML button type                               |
| `fullWidth`        | `boolean`                                                                 | `false`       | Whether button takes full width                |
| `className`        | `string`                                                                  | `undefined`   | Custom CSS class name                          |
| `title`            | `string`                                                                  | `undefined`   | Tooltip text                                   |

### Inherited Props

The component also accepts all standard HTML button attributes and Material-UI Button props through the `...rest` spread.

## Advanced Usage

### Custom Loading Indicator

```tsx
import CustomizableButton from "./components/Button/CustomizableButton";
import { LinearProgress } from "@mui/material";

function MyComponent() {
  return (
    <CustomizableButton
      loading={true}
      loadingIndicator={<LinearProgress sx={{ width: 20, height: 2 }} />}
      onClick={handleAction}
    >
      Processing...
    </CustomizableButton>
  );
}
```

### Form Integration

```tsx
import CustomizableButton from "./components/Button/CustomizableButton";

function MyForm() {
  return (
    <form onSubmit={handleSubmit}>
      {/* Form fields */}

      <CustomizableButton type="submit" variant="contained" loading={isSubmitting} fullWidth>
        Submit Form
      </CustomizableButton>

      <CustomizableButton type="reset" variant="outlined" onClick={handleReset}>
        Reset
      </CustomizableButton>
    </form>
  );
}
```

### Custom Styling

```tsx
import CustomizableButton from "./components/Button/CustomizableButton";
import { useTheme } from "@mui/material/styles";

function MyComponent() {
  const theme = useTheme();

  return (
    <CustomizableButton
      variant="contained"
      sx={{
        backgroundColor: theme.palette.primary.main,
        borderRadius: 2,
        textTransform: "none",
        fontWeight: 600,
        "&:hover": {
          backgroundColor: theme.palette.primary.dark,
          transform: "translateY(-2px)",
          boxShadow: theme.shadows[4],
        },
        transition: "all 0.2s ease-in-out",
      }}
      onClick={handleClick}
    >
      Custom Styled Button
    </CustomizableButton>
  );
}
```

### Icon Positioning

```tsx
import CustomizableButton from "./components/Button/CustomizableButton";
import { AddIcon, DeleteIcon, EditIcon } from "@mui/icons-material";

function MyComponent() {
  return (
    <Stack spacing={2}>
      {/* Start icon */}
      <CustomizableButton variant="contained" startIcon={<AddIcon />} onClick={handleAdd}>
        Add Item
      </CustomizableButton>

      {/* End icon */}
      <CustomizableButton
        variant="outlined"
        endIcon={<DeleteIcon />}
        color="error"
        onClick={handleDelete}
      >
        Delete Item
      </CustomizableButton>

      {/* Both icons */}
      <CustomizableButton
        variant="text"
        startIcon={<EditIcon />}
        endIcon={<EditIcon />}
        onClick={handleEdit}
      >
        Edit Item
      </CustomizableButton>
    </Stack>
  );
}
```

### Accessibility Features

```tsx
import CustomizableButton from "./components/Button/CustomizableButton";

function MyComponent() {
  return (
    <CustomizableButton
      variant="contained"
      ariaLabel="Save the current document"
      ariaDescribedBy="save-help-text"
      onClick={handleSave}
    >
      Save
    </CustomizableButton>
  );
}
```

## Theme Integration

The component integrates with the application's theme system through the `v1SingleTheme` configuration. Theme-based styling is automatically applied based on the `color` and `variant` props.

### Available Theme Colors

- `primary`: Main brand color (#13715B)
- `secondary`: Secondary brand color
- `success`: Success state color
- `warning`: Warning state color
- `error`: Error state color (#DB504A)
- `info`: Information state color

### Theme Structure

```typescript
// Theme configuration structure
const buttons = {
  primary: {
    contained: {
      height: 34,
      fontSize: "13px",
      backgroundColor: "#13715B",
      boxShadow: "none",
      textTransform: "Inherit",
      borderRadius: "4px",
      border: "1px solid #13715B",
      "&:hover": {
        backgroundColor: "#0f604d",
        border: "1px solid #0f604d",
      },
      // ... more styles
    },
    outlined: {
      // ... outlined styles
    },
    text: {
      // ... text styles
    },
  },
  // ... other colors
};
```

### Custom Theme Integration

To add new theme variants, update the `v1SingleTheme.ts` file:

```typescript
const buttons = {
  // ... existing colors
  custom: {
    contained: {
      backgroundColor: "#your-color",
      // ... other styles
    },
  },
};
```

## Accessibility

The component is fully accessible with comprehensive ARIA support:

### ARIA Features

- **aria-label**: Custom accessible label
- **aria-describedby**: Reference to descriptive text
- **aria-disabled**: Indicates disabled state
- **role**: Proper button role
- **tabIndex**: Keyboard navigation support

### Keyboard Navigation

- **Enter**: Activates the button
- **Space**: Activates the button
- **Tab**: Focuses the button
- **Escape**: (when in focus) - standard browser behavior

### Screen Reader Support

```tsx
<CustomizableButton
  ariaLabel="Delete selected items"
  ariaDescribedBy="delete-warning"
  onClick={handleDelete}
>
  Delete
</CustomizableButton>

<div id="delete-warning">
  This action cannot be undone
</div>
```

## Performance

The component is optimized for performance with several techniques:

### Memoization

```typescript
const CustomizableButton = memo(
  React.forwardRef<HTMLButtonElement, CustomizableButtonProps>(...)
);
```

### Optimized Callbacks

```typescript
const handleClick = useCallback(
  (event: React.MouseEvent<HTMLButtonElement>) => {
    // Handle click with error boundary
  },
  [onClick, loading, isDisabled],
);
```

### Performance Best Practices

1. **Stable References**: Use `useCallback` for event handlers
2. **Memoized Component**: Component is wrapped with `memo`
3. **Conditional Rendering**: Loading states are efficiently handled
4. **Minimal Re-renders**: Only re-renders when necessary props change

## Examples

### Dashboard Action Buttons

```tsx
import CustomizableButton from "./components/Button/CustomizableButton";
import { AddIcon, CloudDownloadIcon } from "@mui/icons-material";

function Dashboard() {
  return (
    <Stack spacing={2}>
      <CustomizableButton
        variant="contained"
        text="Create demo project"
        sx={{
          backgroundColor: "#13715B",
          border: "1px solid #13715B",
          gap: 2,
        }}
        icon={<CloudDownloadIcon />}
        onClick={handleGenerateDemoData}
        isDisabled={!canCreateProjects}
      />

      <CustomizableButton
        variant="contained"
        text="New project"
        sx={{
          backgroundColor: "#13715B",
          border: "1px solid #13715B",
          gap: 2,
        }}
        icon={<AddIcon />}
        onClick={handleCreateProject}
        isDisabled={!canCreateProjects}
      />
    </Stack>
  );
}
```

### Modal Action Buttons

```tsx
import CustomizableButton from "./components/Button/CustomizableButton";

function ModalActions() {
  return (
    <Stack direction="row" spacing={2} justifyContent="flex-end">
      <CustomizableButton variant="outlined" onClick={handleCancel} isDisabled={loading}>
        Cancel
      </CustomizableButton>

      <CustomizableButton variant="contained" onClick={handleSave} loading={loading} type="submit">
        Save Changes
      </CustomizableButton>
    </Stack>
  );
}
```

### Form Submit Button

```tsx
import CustomizableButton from "./components/Button/CustomizableButton";

function FormSubmit() {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);

    try {
      await submitForm();
    } catch (error) {
      console.error("Submit failed:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <CustomizableButton
      type="submit"
      variant="contained"
      loading={isSubmitting}
      fullWidth
      onClick={handleSubmit}
      ariaLabel="Submit the form"
    >
      {isSubmitting ? "Submitting..." : "Submit Form"}
    </CustomizableButton>
  );
}
```

### Icon-Only Button

```tsx
import CustomizableButton from "./components/Button/CustomizableButton";
import { SettingsIcon } from "@mui/icons-material";

function IconButton() {
  return (
    <CustomizableButton
      variant="text"
      size="small"
      startIcon={<SettingsIcon />}
      onClick={handleSettings}
      ariaLabel="Open settings"
      sx={{ minWidth: "auto", padding: 1 }}
    />
  );
}
```

## Migration Guide

### From Standard MUI Button

```tsx
// Before
import { Button } from "@mui/material";

<Button variant="contained" color="primary" onClick={handleClick} disabled={loading}>
  {loading ? "Loading..." : "Submit"}
</Button>;

// After
import CustomizableButton from "./components/Button/CustomizableButton";

<CustomizableButton variant="contained" color="primary" onClick={handleClick} loading={loading}>
  Submit
</CustomizableButton>;
```

### From Deprecated Props

```tsx
// Before (deprecated)
<CustomizableButton
  text="Button Text"
  icon={<Icon />}
/>

// After (recommended)
<CustomizableButton
  startIcon={<Icon />}
>
  Button Text
</CustomizableButton>
```

## Troubleshooting

### Common Issues

#### Button Not Responding to Clicks

**Problem**: Button appears clickable but doesn't respond to clicks.

**Solution**: Check if the button is disabled or in loading state:

```tsx
// Check these props
<CustomizableButton
  isDisabled={false} // Should be false
  loading={false} // Should be false
  onClick={handleClick} // Should be defined
>
  Click Me
</CustomizableButton>
```

#### Loading State Not Showing

**Problem**: Loading prop is true but no spinner appears.

**Solution**: Ensure the loading prop is properly set and not overridden:

```tsx
<CustomizableButton
  loading={isLoading} // Make sure this is true
  onClick={handleClick}
>
  Submit
</CustomizableButton>
```

#### Styling Not Applied

**Problem**: Custom styles in sx prop are not being applied.

**Solution**: Check the sx prop syntax and ensure it's properly typed:

```tsx
<CustomizableButton
  sx={{
    backgroundColor: "red", // Use proper MUI theme values
    "&:hover": {
      backgroundColor: "darkred",
    },
  }}
>
  Styled Button
</CustomizableButton>
```

#### Accessibility Issues

**Problem**: Screen readers not announcing button properly.

**Solution**: Add proper ARIA attributes:

```tsx
<CustomizableButton
  ariaLabel="Descriptive label for screen readers"
  ariaDescribedBy="help-text-id"
  onClick={handleClick}
>
  Button Text
</CustomizableButton>
```

### Debug Mode

Enable debug logging by setting the environment variable:

```bash
REACT_APP_DEBUG_CUSTOMIZABLE_BUTTON=true
```

This will log button interactions and state changes to the console.

### Performance Issues

If you experience performance issues:

1. **Check for unnecessary re-renders**: Use React DevTools Profiler
2. **Stable callback references**: Use `useCallback` for event handlers
3. **Minimize prop changes**: Avoid creating new objects in render

```tsx
// Good: Stable reference
const handleClick = useCallback(() => {
  // Handle click
}, []);

// Bad: New function on every render
<CustomizableButton onClick={() => handleClick()} />;
```

## Contributing

When contributing to the CustomizableButton component:

1. **Maintain Accessibility**: Ensure all new features are accessible
2. **Update Types**: Add proper TypeScript types for new props
3. **Test Performance**: Verify no performance regressions
4. **Update Documentation**: Keep this README current
5. **Follow Patterns**: Maintain consistency with existing code

## Related Components

- `Button`: Base Material-UI Button component
- `IconButton`: Icon-only button variant
- `LoadingButton`: MUI's loading button (alternative)
- `v1SingleTheme`: Theme configuration

## License

This component is part of the VerifyWise project and follows the project's licensing terms.
