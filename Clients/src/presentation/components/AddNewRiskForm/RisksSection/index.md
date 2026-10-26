# RiskSection Component

The RiskSection component is a crucial part of the AddNewRiskForm component, designed to facilitate the addition and management of risks within a project. It provides a user-friendly interface for inputting and managing risk-related information, ensuring that all necessary details are captured and validated.

## Features

- **Comprehensive Form Fields**: Captures risk name, description, potential impact, review notes, action owner, AI lifecycle phase, and risk categories
- **Multi-Select Risk Categories**: Advanced autocomplete component for selecting multiple risk categories with chip display
- **Form Validation**: Built-in validation with error handling for all required fields
- **Role-Based Permissions**: Supports editing restrictions based on user roles using the permissions system
- **Risk Level Calculation**: Integration with the RiskLevel component for calculating inherent risk based on likelihood and severity scores
- **Lazy Loading**: Optimized performance with lazy-loaded RiskLevel component
- **Responsive Design**: Flexible layout with proper spacing and responsive behavior
- **User Selection**: Dynamic user options for action owner selection from the users hook
- **Custom Styling**: Consistent styling with theme-aware design and custom form constants

## Props

- `riskValues`: `RiskFormValues` - Current form values containing all risk data
- `setRiskValues`: `Dispatch<SetStateAction<RiskFormValues>>` - State setter function for updating form values
- `riskErrors`: `RiskFormErrors` - Form validation errors object
- `userRoleName`: `string` - Current user's role name for permission-based editing restrictions

## Usage

To use the RiskSection component, import it and pass the required props:

```jsx
import RiskSection from "./RiskSection";

const [riskValues, setRiskValues] =
  useState <
  RiskFormValues >
  {
    riskName: "",
    riskDescription: "",
    potentialImpact: "",
    reviewNotes: "",
    actionOwner: 0,
    aiLifecyclePhase: 0,
    riskCategory: [],
    likelihood: 0,
    riskSeverity: 0,
  };

const [riskErrors, setRiskErrors] = useState < RiskFormErrors > {};

return (
  <RiskSection
    riskValues={riskValues}
    setRiskValues={setRiskValues}
    riskErrors={riskErrors}
    userRoleName="project_manager"
  />
);
```

## Component Structure

The component is organized into several logical sections:

1. **Form Header**: Alert display for notifications
2. **Main Form Fields**:
   - Row 1: Risk name, action owner, AI lifecycle phase
   - Row 2: Risk description with risk categories, potential impact
3. **Risk Level Calculation**: Interactive risk level calculator for inherent risk
4. **Review Notes**: Optional review notes field

## Key Features

### Form Validation

- All required fields are validated with error display
- Custom error styling with theme-aware colors
- Field-specific validation messages

### Permission System

- Uses `allowedRoles.projectRisks.edit` to determine editing permissions
- Disables form fields when user lacks appropriate role
- Read-only mode for autocomplete when editing is disabled

### Performance Optimizations

- Lazy loading of RiskLevel component
- Memoized callback functions for event handlers
- Optimized re-rendering with proper dependency arrays

### Advanced Autocomplete

- Multi-select functionality for risk categories
- Custom chip display with conditional delete icons
- Custom styling for dropdown options and focus states
- Proper keyboard navigation support

### Styling System

- Centralized form constants for consistent sizing
- Theme-aware styling using MUI's useTheme hook
- Custom form row styles with responsive behavior
- Consistent spacing and layout management

## Form Constants

The component uses centralized constants for consistent styling:

```typescript
const FORM_CONSTANTS = {
  FIELD_WIDTH: "325px",
  LARGE_FIELD_WIDTH: "670px",
  MIN_HEIGHT: 500,
  MAX_HEIGHT: 500,
  CONTENT_MAX_HEIGHT: 600,
  TEXT_AREA_MAX_HEIGHT: "120px",
  SPACING: 8.5,
} as const;
```

## Dependencies

### Core React

- `react` - FC, useState, useCallback, Suspense, Dispatch, SetStateAction

### Material-UI

- `@mui/material/Stack` - Layout component
- `@mui/material/Divider` - Visual separator
- `@mui/material/Typography` - Text display
- `@mui/material/useTheme` - Theme access
- `@mui/material/SelectChangeEvent` - Select event types
- `@mui/material/Autocomplete` - Multi-select component
- `@mui/material/Box` - Container component
- `@mui/material/TextField` - Text input component
- `@mui/icons-material/KeyboardArrowDown` - Dropdown icon

### Internal Components

- `Field` - Custom text field component
- `Select` - Custom select input component
- `Alert` - Alert notification component
- `RiskLevel` - Risk level calculation component (lazy loaded)

### Hooks and Utilities

- `useUsers` - Hook for fetching user data
- `allowedRoles` - Permission constants
- `alertState` - Alert state interface
- Form value and error interfaces from parent component

### Data Sources

- `aiLifecyclePhase` - AI lifecycle phase options
- `riskCategoryItems` - Risk category options for autocomplete

## License

This component is licensed under the MIT License.
