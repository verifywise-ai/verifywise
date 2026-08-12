# AddNewRiskForm Component

The AddNewRiskForm component is a comprehensive form system designed to facilitate the addition and editing of risks and mitigations through a user-friendly tabbed interface. It serves as a crucial tool for risk management and mitigation planning, providing complete form validation, state management, and API integration.

## Features

- **Tabbed Interface**: Easy navigation between Risks and Mitigation sections with Material-UI tabs
- **Dual Mode Support**: Supports both "new" and "edit" modes for creating and updating risks
- **Comprehensive Form Validation**: Built-in validation for all form fields with custom error handling
- **Lazy Loading**: Optimized performance with lazy-loaded RiskSection and MitigationSection components
- **Role-Based Permissions**: Integration with permission system for create/edit restrictions
- **Risk Level Calculation**: Automatic risk level calculation using RiskCalculator utility
- **API Integration**: Complete CRUD operations with proper error handling and loading states
- **State Management**: Sophisticated state management for both risk and mitigation data
- **Context Integration**: Uses VerifyWiseContext for accessing existing risk data in edit mode
- **Custom Styling**: Theme-aware styling with centralized constants and custom button components

## Props

- `closePopup`: `Function` - Function to close the popup/modal
- `onSuccess`: `Function` - Callback function called on successful form submission
- `onError`: `Function` (optional) - Callback function called on form submission error, defaults to empty function
- `onLoading`: `Function` (optional) - Callback function called during form submission, defaults to empty function
- `popupStatus`: `string` - Status of the popup ("new" for creating, "edit" for updating)
- `initialRiskValues`: `RiskFormValues` (optional) - Initial values for risk form, defaults to riskInitialState
- `initialMitigationValues`: `MitigationFormValues` (optional) - Initial values for mitigation form, defaults to mitigationInitialState

## Usage

To use the AddNewRiskForm component, import it and pass the required props:

```jsx
import AddNewRiskForm from "./AddNewRiskForm";

const handleClosePopup = () => {
  // Function to close the popup
};

const handleSuccess = () => {
  // Handle successful form submission
  console.log("Risk saved successfully!");
};

const handleError = (errorMessage: string) => {
  // Handle form submission error
  console.error("Error:", errorMessage);
};

const handleLoading = (message: string) => {
  // Handle loading state
  console.log(message);
};

return (
  <AddNewRiskForm
    closePopup={handleClosePopup}
    onSuccess={handleSuccess}
    onError={handleError}
    onLoading={handleLoading}
    popupStatus="new"
    initialRiskValues={{
      riskName: "",
      actionOwner: 0,
      aiLifecyclePhase: 0,
      riskDescription: "",
      riskCategory: [1],
      potentialImpact: "",
      assessmentMapping: 0,
      controlsMapping: 0,
      likelihood: 1,
      riskSeverity: 1,
      riskLevel: 0,
      reviewNotes: "",
    }}
    initialMitigationValues={{
      mitigationStatus: 0,
      mitigationPlan: "",
      currentRiskLevel: 0,
      implementationStrategy: "",
      deadline: new Date().toISOString(),
      doc: "",
      likelihood: 1,
      riskSeverity: 1,
      approver: 0,
      approvalStatus: 0,
      dateOfAssessment: new Date().toISOString(),
      recommendations: "",
    }}
  />
);
```

## Component Structure

The component is organized into several key sections:

1. **Tab Navigation**: Material-UI TabContext with Risks and Mitigation tabs
2. **Risk Section**: Lazy-loaded RiskSection component for risk data input
3. **Mitigation Section**: Lazy-loaded MitigationSection component for mitigation data input
4. **Action Button**: Dynamic save/update button with role-based permissions

## Key Features

### Form Validation

- **Comprehensive Validation**: Validates all required fields for both risk and mitigation forms
- **Custom Validation Limits**: Centralized validation constants for consistent field limits
- **Error State Management**: Separate error states for risk and mitigation forms
- **Smart Tab Switching**: Automatically switches to the tab with validation errors

### State Management

- **Initial State Handling**: Proper initialization from props or default values
- **Edit Mode Support**: Populates forms with existing data from context in edit mode
- **Form State Synchronization**: Keeps risk and mitigation states synchronized

### API Integration

- **CRUD Operations**: Supports both POST (create) and PUT (update) operations
- **Risk Level Calculation**: Automatic calculation of risk levels using RiskCalculator
- **Form Data Transformation**: Converts form data to API-compatible format
- **Error Handling**: Comprehensive error handling with user feedback

### Permission System

- **Role-Based Access**: Uses `allowedRoles.projectRisks` for create/edit permissions
- **Dynamic Button States**: Disables save/update button based on user permissions
- **Context-Aware**: Integrates with authentication context for user role

## Validation Constants

The component uses centralized validation limits:

```typescript
const VALIDATION_LIMITS = {
  RISK_NAME: { MIN: 3, MAX: 255 },
  RISK_DESCRIPTION: { MIN: 1, MAX: 256 },
  POTENTIAL_IMPACT: { MIN: 1, MAX: 256 },
  REVIEW_NOTES: { MIN: 0, MAX: 1024 },
  MITIGATION_PLAN: { MIN: 1, MAX: 1024 },
  IMPLEMENTATION_STRATEGY: { MIN: 1, MAX: 1024 },
  RECOMMENDATIONS: { MIN: 1, MAX: 1024 },
  REQUIRED_FIELD: { MIN: 1 },
} as const;
```

## Component Constants

Centralized styling and behavior constants:

```typescript
const COMPONENT_CONSTANTS = {
  MAX_HEIGHT: 550,
  BUTTON_HEIGHT: 34,
  TAB_MARGIN_TOP: "30px",
  TAB_PADDING: "24px 0 0",
  PRIMARY_COLOR: "#13715B",
  TAB_GAP: "34px",
  MIN_TAB_HEIGHT: "20px",
  BORDER_RADIUS: 2,
} as const;
```

## Dependencies

### Core React

- `react` - FC, useState, useCallback, lazy, Suspense, useContext, useEffect

### React Router

- `react-router` - useSearchParams for URL parameter access

### Material-UI

- `@mui/material/Box` - Container component
- `@mui/material/Stack` - Layout component
- `@mui/material/Tab` - Tab component
- `@mui/material/useTheme` - Theme access
- `@mui/lab/TabContext` - Tab context provider
- `@mui/lab/TabList` - Tab list component
- `@mui/lab/TabPanel` - Tab panel component

### Material-UI Icons

- `@mui/icons-material/Save` - Save icon
- `@mui/icons-material/Update` - Update icon

### Date Management

- `dayjs` - Date manipulation and formatting

### Internal Components

- `RiskSection` - Risk form section (lazy loaded)
- `MitigationSection` - Mitigation form section (lazy loaded)
- `CustomizableButton` - Custom button component

### Hooks and Utilities

- `useAuth` - Authentication hook for user role
- `useUsers` - Users data hook
- `VerifyWiseContext` - Application context for data access
- `allowedRoles` - Permission constants

### Validation

- `checkStringValidation` - String validation utility
- `selectValidation` - Select field validation utility

### API and Data

- `apiServices` - API service for HTTP requests
- `RiskCalculator` - Risk level calculation utility
- Form value and error interfaces from local interface file

### Data Sources

- `aiLifecyclePhase` - AI lifecycle phase options
- `riskCategoryItems` - Risk category options
- `mitigationStatusItems` - Mitigation status options
- `approvalStatusItems` - Approval status options
- `riskLevelItems` - Risk level options
- `likelihoodItems` - Likelihood options
- `riskSeverityItems` - Risk severity options

### Styling

- `tabStyle` - Tab styling configuration
- `styles.module.css` - Component-specific styles

## License

This component is licensed under the MIT License.
