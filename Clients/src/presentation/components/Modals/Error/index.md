# ErrorModal Component

The ErrorModal component is designed to display an error message to the user in a modal dialog. It is a reusable component that can be used throughout the application to handle error scenarios in a consistent manner.

## Props

- `open`: A boolean indicating whether the modal is open.
- `errorMessage`: The error message to be displayed in the modal.
- `handleClose`: A function to be called when the modal is closed.

## Example Usage

```jsx
import ErrorModal from "./ErrorModal";

const App = () => {
  const [isDialogOpen, setDialogOpen] = useState(false);
  const handleClose = () => setDialogOpen(false);

  return <ErrorModal open={isDialogOpen} errorMessage="An error occurred." onClose={handleClose} />;
};
```
