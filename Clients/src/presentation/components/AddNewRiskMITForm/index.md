# AddNewRiskMITModal Component

A React modal component that allows users to browse, search, and select risks from the MIT AI Risk Database for importing into their risk management system.

## Overview

The `AddNewRiskMITModal` component provides an interactive interface for users to search through a comprehensive database of AI-related risks, select specific risks, and import them into their risk assessment workflow. The component features a searchable table with filtering capabilities and seamless data mapping to the application's risk data structure.

## Features

- **Search Functionality**: Real-time search across risk names, categories, and descriptions
- **Interactive Table**: Clickable rows with radio button selection
- **Responsive Design**: Adapts to different screen sizes with responsive breakpoints
- **Data Mapping**: Automatic conversion from MIT database format to application format
- **Accessibility**: Full ARIA support and keyboard navigation
- **Performance Optimized**: Memoized handlers and filtered data for smooth user experience

## Props

| Prop             | Type                                   | Required | Description                                                   |
| ---------------- | -------------------------------------- | -------- | ------------------------------------------------------------- |
| `isOpen`         | `boolean`                              | Yes      | Controls the modal's visibility state                         |
| `setIsOpen`      | `(open: boolean) => void`              | Yes      | Function to update the modal's open state                     |
| `onRiskSelected` | `(riskData: SelectedRiskData) => void` | No       | Callback function called when a risk is selected and imported |

## Data Structures

### RiskData Interface

```typescript
interface RiskData {
  Id: number;
  Summary: string;
  Description: string;
  "Risk Severity": string;
  Likelihood: string;
  "Risk Category": string;
}
```

### SelectedRiskData Interface

```typescript
interface SelectedRiskData {
  riskName: string;
  actionOwner: number;
  aiLifecyclePhase: number;
  riskDescription: string;
  riskCategory: number[];
  potentialImpact: string;
  assessmentMapping: number;
  controlsMapping: number;
  likelihood: number;
  riskSeverity: number;
  riskLevel: number;
  reviewNotes: string;
}
```

## Usage

```tsx
import AddNewRiskMITModal from "./AddNewRiskMITForm";

function RiskManagementComponent() {
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleRiskSelected = (riskData: SelectedRiskData) => {
    // Handle the imported risk data
    console.log("Selected risk:", riskData);
    // Add to your risk management system
  };

  return (
    <>
      <Button onClick={() => setIsModalOpen(true)}>Add Risk from Database</Button>

      <AddNewRiskMITModal
        isOpen={isModalOpen}
        setIsOpen={setIsModalOpen}
        onRiskSelected={handleRiskSelected}
      />
    </>
  );
}
```

## Component Architecture

### State Management

- `search`: Current search term for filtering risks
- `selectedId`: ID of the currently selected risk (null if none selected)

### Key Functions

#### Data Mapping Functions

- `mapSeverity(severity: string)`: Maps MIT severity strings to application Severity enum
- `mapLikelihood(likelihood: string)`: Maps MIT likelihood strings to application Likelihood enum
- `mapRiskCategories(riskCategories: string)`: Maps MIT category strings to application category IDs

#### Event Handlers

- `handleClose()`: Closes modal and resets state
- `handleSearchChange()`: Updates search term for filtering
- `handleRowClick()`: Toggles risk selection on row click
- `handleRadioChange()`: Toggles risk selection on radio button click
- `handleUseSelectedRisk()`: Processes selected risk and calls onRiskSelected callback

### Performance Optimizations

- **Memoized Filtering**: `filteredRisks` is memoized to prevent unnecessary re-computations
- **Memoized Handlers**: All event handlers are wrapped with `useCallback` to prevent unnecessary re-renders
- **Efficient Search**: Search function uses case-insensitive matching across multiple fields

## Styling and Theming

The component uses Material-UI's theming system and includes:

- Responsive breakpoints for mobile, tablet, and desktop
- Consistent spacing using theme.spacing()
- Color scheme integration with theme.palette
- Custom styling for table cells, buttons, and interactive elements

### Modal Configuration

```typescript
const MODAL_CONFIG = {
  MAX_WIDTH: 1000,
  MAX_HEIGHT: "50vh",
  SEARCH_FIELD_WIDTH: 350,
} as const;
```

## Accessibility Features

- **ARIA Labels**: All interactive elements have proper ARIA labels
- **Keyboard Navigation**: Full keyboard support for table navigation
- **Focus Management**: Proper focus handling for modal interactions
- **Screen Reader Support**: Semantic HTML structure with proper roles
- **Color Contrast**: Uses theme colors that meet accessibility standards

## Dependencies

### External Dependencies

- `@mui/material`: Material-UI components and theming
- `@mui/icons-material`: Material-UI icons
- `react`: React hooks and state management

### Internal Dependencies

- `../../assets/imgs/empty-state.svg`: Placeholder image for empty states
- `../../assets/MITAIRISKDB.json`: MIT AI Risk Database data
- `../RiskLevel/constants`: Likelihood and Severity enums
- `../AddNewRiskForm/projectRiskValue`: Risk category items

## Error Handling

The component includes comprehensive error handling:

- **Data Validation**: Checks for valid risk data before processing
- **Console Logging**: Logs errors for debugging purposes
- **Graceful Degradation**: Handles missing or malformed data gracefully
- **User Feedback**: Displays appropriate messages for empty search results

## Browser Support

- Modern browsers with ES6+ support
- Responsive design works on mobile, tablet, and desktop
- Material-UI compatibility across supported browsers

## Performance Considerations

- **Lazy Loading**: Modal content is only rendered when open
- **Memoization**: Prevents unnecessary re-renders of expensive operations
- **Efficient Filtering**: Search algorithm optimized for large datasets
- **Virtual Scrolling**: Consider implementing for very large risk databases

## Future Enhancements

Potential improvements for future versions:

- **Pagination**: For handling very large risk databases
- **Advanced Filtering**: Multiple filter criteria (severity, likelihood, category)
- **Bulk Selection**: Allow selecting multiple risks at once
- **Export Functionality**: Export filtered results
- **Favorites**: Mark frequently used risks as favorites
- **Recent Selections**: Remember recently selected risks

## Testing

The component should be tested for:

- **User Interactions**: Search, selection, and modal operations
- **Data Mapping**: Correct conversion between MIT and application formats
- **Accessibility**: Keyboard navigation and screen reader compatibility
- **Responsive Design**: Behavior across different screen sizes
- **Error Scenarios**: Handling of invalid or missing data

## Contributing

When contributing to this component:

1. Maintain the existing prop interface for backward compatibility
2. Follow the established naming conventions and code structure
3. Add appropriate TypeScript types for any new functionality
4. Include accessibility features for any new interactive elements
5. Update this documentation for any significant changes
