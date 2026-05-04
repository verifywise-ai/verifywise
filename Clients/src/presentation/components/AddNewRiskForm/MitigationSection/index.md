# MitigationSection Component

The MitigationSection component is a crucial part of the AddNewRiskForm component, designed to facilitate the addition and management of mitigation details for identified risks within a project. It provides a user-friendly interface for inputting and managing mitigation-related information, ensuring that all necessary details are captured and validated.

## Features

- **Comprehensive Form Fields**: Captures mitigation status, current risk level, deadline, mitigation plan, implementation strategy, likelihood, risk severity, approver, approval status, assessment date, and recommendations
- **Form Validation**: Built-in validation with error handling for all required fields
- **Role-Based Permissions**: Supports editing restrictions based on user roles using the permissions system
- **Risk Level Calculation**: Integration with the RiskLevel component for calculating residual risk based on likelihood and severity scores
- **Lazy Loading**: Optimized performance with lazy-loaded components (Select, Field, DatePicker, RiskLevel, Alert)
- **Responsive Design**: Flexible layout with proper spacing and responsive behavior
- **Date Management**: Advanced date handling with dayjs for deadline and assessment date fields
- **User Selection**: Dynamic user options for approver selection from the users hook

## Props

- `mitigationValues`: `MitigationFormValues` - Current form values containing all mitigation data
- `setMitigationValues`: `Dispatch<SetStateAction<MitigationFormValues>>` - State setter function for updating form values
- `mitigationErrors`: `MitigationFormErrors` (optional) - Form validation errors object, defaults to empty object
- `userRoleName`: `string` - Current user's role name for permission-based editing restrictions

## Usage

To use the MitigationSection component, import it and pass the required props:

```jsx
import MitigationSection from "./MitigationSection";

const [mitigationValues, setMitigationValues] =
  useState <
  MitigationFormValues >
  {
    mitigationStatus: 0,
    currentRiskLevel: 0,
    deadline: "",
    mitigationPlan: "",
    implementationStrategy: "",
    likelihood: 0,
    riskSeverity: 0,
    approver: 0,
    approvalStatus: 0,
    dateOfAssessment: "",
    recommendations: "",
  };

const [mitigationErrors, setMitigationErrors] = useState < MitigationFormErrors > {};

return (
  <MitigationSection
    mitigationValues={mitigationValues}
    setMitigationValues={setMitigationValues}
    mitigationErrors={mitigationErrors}
    userRoleName="project_manager"
  />
);
```

## Component Structure

The component is organized into several logical sections:

1. **Form Header**: Alert display for notifications
2. **Main Form Fields**:
   - Row 1: Mitigation status, current risk level, deadline
   - Row 2: Mitigation plan and implementation strategy
3. **Risk Level Calculation**: Interactive risk level calculator
4. **Risk Approval**: Approver selection, approval status, and assessment date
5. **Recommendations**: Optional recommendations field

## Key Features

### Form Validation

- All required fields are validated with error display
- Optional chaining (`?.`) used for safe error access
- Default empty object for mitigationErrors prop

### Permission System

- Uses `allowedRoles.projectRisks.edit` to determine editing permissions
- Disables form fields when user lacks appropriate role

### Performance Optimizations

- Lazy loading of all form components
- Memoized styles and user options
- Callback functions for event handlers to prevent unnecessary re-renders

### Styling

- Consistent field widths and spacing
- Theme-aware styling using MUI's useTheme hook
- Responsive layout with proper gap management

## Dependencies

### Core React

- `react` - FC, useState, useCallback, useMemo, lazy, Suspense, Dispatch, SetStateAction

### Material-UI

- `@mui/material/Stack` - Layout component
- `@mui/material/Divider` - Visual separator
- `@mui/material/Typography` - Text display
- `@mui/material/SelectChangeEvent` - Select event types
- `@mui/material/useTheme` - Theme access

### Date Management

- `dayjs` - Date manipulation and formatting
- `Dayjs` - TypeScript types for dayjs

### Internal Components

- `Select` - Custom select input component (lazy loaded)
- `Field` - Custom text field component (lazy loaded)
- `DatePicker` - Custom date picker component (lazy loaded)
- `RiskLevel` - Risk level calculation component (lazy loaded)
- `Alert` - Alert notification component (lazy loaded)

### Hooks and Utilities

- `useUsers` - Hook for fetching user data
- `allowedRoles` - Permission constants
- `alertState` - Alert state interface
- Form value and error interfaces from parent component

### Styling

- `styles.module.css` - Component-specific styles

## License

This component is licensed under the MIT License.
