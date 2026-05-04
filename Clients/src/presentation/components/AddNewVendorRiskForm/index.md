# AddNewVendorRiskForm Component

The AddNewVendorRiskForm component provides a comprehensive form interface for creating and editing vendor risks. It features real-time validation, responsive design, and accessible controls for effective vendor risk management.

## Features

- **Dual Mode Support**: Create new vendor risks or edit existing ones
- **Comprehensive Validation**: Real-time field validation with user-friendly error messages
- **Responsive Design**: Adapts to different screen sizes with mobile-first approach
- **Accessibility**: Full ARIA support and keyboard navigation
- **Loading States**: Visual feedback during form submission
- **Error Handling**: Graceful error handling with toast notifications
- **Performance Optimized**: Memoized components and callbacks for optimal rendering

## Props

| Prop          | Type              | Required | Description                                            |
| ------------- | ----------------- | -------- | ------------------------------------------------------ |
| `closePopup`  | `() => void`      | Yes      | Callback function to close the form modal              |
| `onSuccess`   | `() => void`      | No       | Callback executed after successful form submission     |
| `popupStatus` | `"new" \| "edit"` | Yes      | Form mode: "new" for creation, "edit" for modification |

## Form Fields

### Required Fields

- **Vendor Name**: Select from available vendors
- **Action Owner**: Select from system users
- **Risk Name**: Text input (1-64 characters)
- **Review Date**: Date picker for risk review scheduling
- **Risk Description**: Multi-line text input (1-256 characters)

### Validation Rules

- Risk name: 1-64 characters
- Risk description: 1-256 characters
- Review date: Required date selection
- Vendor name: Must select from available options
- Action owner: Must select from available users

## Usage

### Basic Implementation

```tsx
import AddNewVendorRiskForm from "./AddNewVendorRiskForm";

const MyComponent = () => {
  const handleClose = () => {
    // Close modal logic
  };

  const handleSuccess = () => {
    // Refresh data or show success message
  };

  return (
    <AddNewVendorRiskForm closePopup={handleClose} onSuccess={handleSuccess} popupStatus="new" />
  );
};
```

### Edit Mode Implementation

```tsx
<AddNewVendorRiskForm closePopup={handleClose} onSuccess={handleUpdate} popupStatus="edit" />
```

## API Integration

The component integrates with the following endpoints:

- `POST /vendorRisks` - Create new vendor risk
- `PUT /vendorRisks/{id}` - Update existing vendor risk

### Request Format

```typescript
interface VendorRiskFormData {
  project_id: string | null;
  vendor_name: number;
  risk_name: string;
  owner: number;
  risk_level: string;
  review_date: string;
}
```

## State Management

The component uses React hooks for state management:

- `useState` for form values, errors, and loading states
- `useContext` for accessing global application state
- `useMemo` for performance optimization
- `useCallback` for event handler optimization

## Error Handling

- **Validation Errors**: Displayed inline with form fields
- **API Errors**: Shown as toast notifications
- **Network Errors**: Graceful fallback with user-friendly messages

## Accessibility Features

- ARIA labels and descriptions
- Keyboard navigation support
- Screen reader compatibility
- Focus management
- Error announcements

## Performance Optimizations

- Memoized form options and styles
- Optimized re-renders with useCallback
- Lazy loading for Alert component
- Efficient validation with debounced updates

## Dependencies

### Core Dependencies

- `@mui/material` - UI components and theming
- `react` - Core React functionality
- `dayjs` - Date manipulation
- `react-router-dom` - URL parameter access

### Internal Dependencies

- `Field` and `Select` components from Inputs module
- `DatePicker` component for date selection
- `Alert` component for notifications
- Validation functions from application layer
- API services from infrastructure layer
- Context providers for global state

## Styling

The component uses MUI's styling system with:

- Theme-based color schemes
- Responsive grid layouts
- Consistent spacing and typography
- Custom component styling overrides

## Browser Support

- Modern browsers with ES6+ support
- Mobile responsive design
- Touch-friendly interface elements

## License

This component is licensed under the MIT License.
