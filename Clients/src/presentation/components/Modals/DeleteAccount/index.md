# DeleteAccountConfirmation Component

The DeleteAccountConfirmation component is designed to render a confirmation dialog for deleting an account. It displays a dialog when the `open` prop is true, allowing the user to confirm or cancel the deletion of their account. When the delete button is clicked, the dialog closes and a banner appears at the bottom-right corner of the page for 3 seconds, indicating the account has been removed.

## Props

- `open`: A boolean indicating whether the dialog is open.
- `onClose`: A function to be called when the dialog is closed.

## Example Usage

```jsx
import DeleteAccountConfirmation from "./DeleteAccountConfirmation";

const App = () => {
  const [isDialogOpen, setDialogOpen] = useState(false);
  const handleClose = () => setDialogOpen(false);

  return <DeleteAccountConfirmation open={isDialogOpen} onClose={handleClose} />;
};
```

## Styling

The DeleteAccountConfirmation component uses Material-UI's theme to style the dialog and banner. The styling includes:

- A custom width and height for the dialog.
- A banner with a specific width and duration.

## Customization

The DeleteAccountConfirmation component can be customized by passing a custom theme to the Material-UI provider. This allows for a high degree of flexibility in terms of styling and branding.

## Accessibility

The DeleteAccountConfirmation component is designed to be accessible and follows Material-UI's guidelines for accessibility. It includes attributes such as `aria-label` and `role` to ensure that the dialog and banner are accessible to screen readers and other assistive technologies.

## Future Development

Future development plans for the DeleteAccountConfirmation component include:

- Enhancing the component's accessibility features.
- Improving the component's performance and optimization.

## Contributing

Contributions to the DeleteAccountConfirmation component are welcome. If you have any suggestions or improvements, please feel free to open an issue or submit a pull request.
