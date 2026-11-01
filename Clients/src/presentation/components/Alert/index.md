# Alert Component

The Alert component is designed to display various types of messages to the user. It can render an alert box with different styles based on the variant prop, supporting the display of icons, titles, and body text. Additionally, it can function as a toast notification.

## Features

- Supports different alert variants: success, info, warning, and error.
- Displays icons, titles, and body text based on the variant.
- Can be used as a toast notification.
- Customizable styling options using MUI's styling system.

## Props

- `variant`: The type of alert to display. Options are "success", "info", "warning", and "error".
- `title`: The title text of the alert.
- `body`: The body text of the alert.
- `isToast`: Whether the alert is a toast notification (shows a close button).
- `inline`: Render in the page flow instead of floating in the top-right corner. Without it the alert is always `position: fixed`, even when `isToast` is false, so set it for alerts that sit inside a panel, form or modal.
- `hasIcon`: Whether to display an icon in the alert. Defaults to true.
- `onClick`: Callback function to handle click events.

## Usage

To use the Alert component, simply import it and pass the required props:

```jsx
import Alert from "./Alert";

const handleAlertClick = () => {
  // Function to handle alert click events
};

return (
  <Alert
    variant="success"
    title="Success Alert"
    body="This is a success alert."
    isToast={true}
    onClick={handleAlertClick}
  />
);
```
