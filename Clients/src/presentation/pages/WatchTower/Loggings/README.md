# WatchTowerLogs Component

A component for displaying application logs in a vertically scrollable card format, providing real-time debugging and monitoring capabilities.

## Features

- **Log Display**: Shows application logs line by line with proper formatting
- **Log Level Highlighting**: Automatically detects and highlights different log levels (ERROR, WARN, INFO, DEBUG)
- **Line Numbers**: Displays line numbers for easy reference and debugging
- **Scrollable Interface**: Vertically scrollable card with custom scrollbar styling
- **Loading States**: Shows loading indicator while fetching logs
- **Error Handling**: Graceful error handling with user-friendly messages
- **Info Messages**: Displays information about log file status and line count
- **Empty States**: Shows placeholder when no logs are available
- **Responsive Design**: Adapts to different screen sizes

## Usage

The component is automatically used in the WatchTower page under the "Logs" tab.

```tsx
import WatchTowerLogs from "./Loggings";

// Used in WatchTower component
<TabPanel value="2" sx={tabPanelStyle}>
  <WatchTowerLogs />
</TabPanel>;
```

## Data Source

- **Endpoint**: `/logger/logs`
- **Method**: GET
- **Authentication**: Requires Bearer token
- **Authorization**: Admin only (`logs.admin` permission). Other roles get 403, and the page hides the Logs tab for them
- **Response Format**:
  ```typescript
  {
    success: boolean;
    message: string;
    data: string[] | null;
  }
  ```

## Log Display Features

### Log Level Detection

The component automatically detects log levels and applies appropriate styling:

- **ERROR**: Red text with light red background
- **WARN**: Orange text with light orange background
- **SUCCESS/SUCCESSFUL**: Green text with light green background
- **INFO**: Blue text with light blue background
- **DEBUG**: Purple text with light purple background

### Styling

- **Card Container**: Paper component with border and rounded corners
- **Scrollable Area**: Max height of 70vh with custom scrollbar
- **Line Numbers**: Right-aligned, non-selectable numbers
- **Monospace Font**: Consistent character spacing for log readability
- **Hover Effects**: Subtle background color change on line hover

## Error Handling

The component handles various error scenarios:

- **Network Errors**: Displays error message for failed API calls
- **No Logs Available**: Shows appropriate message when no logs exist for the current day
- **File Not Found**: Handles cases where log files don't exist
- **Empty Logs**: Shows placeholder when logs array is empty

## Performance Considerations

- **Line Limit**: Backend returns last 500 lines by default
- **Virtual Scrolling**: Consider implementing virtual scrolling for very large log files
- **Real-time Updates**: Currently loads logs on component mount (consider polling for real-time updates)

## Dependencies

- **LogLine Component**: Individual log line display component
- **Logs Repository**: API communication layer
- **Material-UI**: UI components and theming
- **Placeholder Image**: Empty state illustration
