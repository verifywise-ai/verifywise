# VWAvatar Component

The VWAvatar component is a professional, accessible avatar component for displaying user profile images or initials. It features multiple size variants, image loading with fallback, comprehensive accessibility support, and performance optimizations.

## Features

- **Multiple Size Variants**: Three predefined sizes with consistent theming
- **Image Loading with Fallback**: Graceful fallback to user initials when image fails to load
- **Accessibility Support**: Full ARIA attributes, keyboard navigation, and screen reader compatibility
- **Performance Optimized**: Memoized components and callbacks for optimal rendering
- **Theme Integration**: Seamless integration with MUI theme system
- **Interactive Support**: Optional click handlers with hover and focus states
- **TypeScript Support**: Full type safety with comprehensive interfaces

## Props

| Prop         | Type                                  | Required | Default        | Description                                     |
| ------------ | ------------------------------------- | -------- | -------------- | ----------------------------------------------- |
| `user`       | `User`                                | No       | `DEFAULT_USER` | User data containing name and image information |
| `size`       | `"small" \| "medium" \| "large"`      | No       | `"small"`      | Size variant of the avatar                      |
| `variant`    | `"circular" \| "rounded" \| "square"` | No       | `"circular"`   | Shape variant of the avatar                     |
| `sx`         | `SxProps<Theme>`                      | No       | `undefined`    | Additional Material-UI styling                  |
| `showBorder` | `boolean`                             | No       | `true`         | Whether to show border around avatar            |
| `onClick`    | `() => void`                          | No       | `undefined`    | Optional click handler                          |
| `alt`        | `string`                              | No       | `undefined`    | Custom alt text for accessibility               |

## User Interface

```typescript
interface User {
  /** User's first name */
  firstname: string;
  /** User's last name */
  lastname: string;
  /** Path to user's profile image */
  pathToImage?: string;
  /** Optional user ID for better accessibility */
  id?: string | number;
}
```

## Size Variants

| Size   | Width | Height | Font Size | Use Case                |
| ------ | ----- | ------ | --------- | ----------------------- |
| small  | 32px  | 32px   | 13px      | Comments, notifications |
| medium | 64px  | 64px   | 22px      | User lists, cards       |
| large  | 128px | 128px  | 44px      | Profile pages, headers  |

## Usage

### Basic Implementation

```tsx
import VWAvatar from "./VWAvatar";

const MyComponent = () => {
  const user = {
    firstname: "John",
    lastname: "Doe",
    pathToImage: "/path/to/profile.jpg",
  };

  return <VWAvatar user={user} size="medium" variant="circular" />;
};
```

### Interactive Avatar

```tsx
<VWAvatar
  user={user}
  size="large"
  onClick={() => navigateToProfile(user.id)}
  showBorder={true}
  sx={{ margin: 2 }}
/>
```

### Fallback to Initials

```tsx
// When no image is provided or image fails to load
<VWAvatar user={{ firstname: "Jane", lastname: "Smith" }} size="medium" />
// Displays "JS" initials
```

## Image Loading Behavior

1. **Image Available**: Displays the user's profile image
2. **Image Loading**: Shows loading indicator ("...")
3. **Image Error**: Falls back to user initials
4. **No Image**: Directly displays user initials

## Accessibility Features

- **ARIA Labels**: Proper labeling for screen readers
- **Keyboard Navigation**: Enter and Space key support for interactive avatars
- **Focus Management**: Visible focus indicators
- **Alt Text**: Descriptive alt text for images
- **Role Attributes**: Proper semantic roles (img/button)

## Styling

### Theme Integration

The component automatically adapts to your MUI theme:

- Uses theme colors for borders and focus states
- Respects theme transitions and durations
- Integrates with theme palette

### Custom Styling

```tsx
<VWAvatar
  user={user}
  sx={{
    "border": "3px solid #custom-color",
    "boxShadow": "0 4px 8px rgba(0,0,0,0.1)",
    "&:hover": {
      transform: "scale(1.1)",
    },
  }}
/>
```

## Performance Optimizations

- **Memoized Component**: Prevents unnecessary re-renders
- **Memoized Computed Values**: Cached calculations for dimensions and initials
- **Optimized Event Handlers**: useCallback for stable function references
- **Lazy Image Loading**: Images load only when needed

## Error Handling

- **Image Load Errors**: Graceful fallback to initials
- **Missing User Data**: Default user fallback
- **Invalid Props**: Type-safe prop validation

## Browser Support

- Modern browsers with ES6+ support
- CSS Grid and Flexbox support
- Image lazy loading support
- ARIA attribute support

## Dependencies

### Core Dependencies

- `@mui/material` - Avatar component and theming
- `react` - Core React functionality

### Internal Dependencies

- MUI theme system for consistent styling
- React hooks for state and performance optimization

## Best Practices

1. **Always provide user data**: Even if minimal, provide firstname and lastname
2. **Use appropriate sizes**: Match avatar size to context and importance
3. **Handle click events**: Make interactive avatars clearly clickable
4. **Test accessibility**: Verify screen reader compatibility
5. **Optimize images**: Use appropriately sized profile images

## License

This component is licensed under the MIT License.
