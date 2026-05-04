# InviteUserModal Component

The InviteUserModal component is designed to render a modal dialog for inviting a new user to join a team. It displays a modal when the `isOpen` prop is true, allowing the user to input the email and role of the new team member. The component dynamically adjusts its styling based on the Material-UI theme.

## Props

- `isOpen`: A boolean indicating whether the modal is open.
- `setIsOpen`: A function to set the modal's open state.
- `onSendInvite`: A function to handle sending the invite.

## Example Usage

```jsx
import InviteUserModal from "./InviteUserModal";

const App = () => {
  const [isOpen, setIsOpen] = useState(false);
  const handleSendInvite = (email, role) => {
    // Handle sending the invite logic here
  };

  return <InviteUserModal isOpen={isOpen} setIsOpen={setIsOpen} onSendInvite={handleSendInvite} />;
};
```

## Styling

The InviteUserModal component uses Material-UI's theme to style the modal. The styling includes:

- A custom positioning and layout for the modal content.
- A close icon for closing the modal.
- Custom typography and spacing for the modal content.

## Customization

The InviteUserModal component can be customized by passing a custom theme to the Material-UI provider. This allows for a high degree of flexibility in terms of styling and branding.

## Accessibility

The InviteUserModal component is designed to be accessible and follows Material-UI's guidelines for accessibility. It includes attributes such as `aria-label` and `role` to ensure that the modal is accessible to screen readers and other assistive technologies.

## Future Development

Future development plans for the InviteUserModal component include:

- Enhancing the component's accessibility features.
- Improving the component's performance and optimization.

## Contributing

Contributions to the InviteUserModal component are welcome. If you have any suggestions or improvements, please feel free to open an issue or submit a pull request.
