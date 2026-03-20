import React, { memo } from "react";
import {
  Button as MUIButton,
  ButtonProps as MUIButtonProps,
  useTheme,
  SxProps,
  Theme,
} from "@mui/material";
import { brand } from "../../themes/palette";

/**
 * Extended props interface for the Button component
 */
export interface ButtonProps extends Omit<MUIButtonProps, 'sx'> {
  /** Custom styles using MUI's sx prop */
  sx?: SxProps<Theme>;
  /** Test identifier for automated testing */
  testId?: string;
  /** Custom class name */
  className?: string;
}

/**
 * A custom Button component that wraps the Material-UI Button with consistent theming.
 * 
 * This component provides a standardized button with the application's default styling
 * while allowing full customization through the sx prop and other MUI Button props.
 * 
 * Features:
 * - Consistent theme-based styling
 * - Responsive design with flexible dimensions
 * - Full accessibility support
 * - Performance optimized with memoization
 * - TypeScript support with proper typing
 * 
 * @component
 * @example
 * ```tsx
 * <Button variant="contained" onClick={handleClick}>
 *   Click me
 * </Button>
 * 
 * <Button 
 *   variant="outlined" 
 *   sx={{ width: '200px' }}
 *   testId="submit-button"
 * >
 *   Submit
 * </Button>
 * ```
 * 
 * @param {ButtonProps} props - The props for the Button component
 * @returns {React.ReactElement} A styled Material-UI Button component
 */
/**
 * Button component implementation
 */
const Button = memo(React.forwardRef<HTMLButtonElement, ButtonProps>(function Button({
  children,
  sx,
  testId,
  className,
  ...rest
}, ref) {
  const theme = useTheme();
  
  // Define default styles using theme values
  const defaultStyles: SxProps<Theme> = {
    mt: 2,
    borderRadius: 2,
    width: "fit-content",
    minHeight: 25,
    height: "auto", // More flexible height
    fontSize: 11,
    px: 2, // Horizontal padding for better spacing
    py: 0.5, // Vertical padding for better text spacing
    border: `1px solid ${theme.palette.primary.main || '#13715B'}`,
    backgroundColor: theme.palette.primary.main || brand.primary,
    color: theme.palette.primary.contrastText || 'white',
    textTransform: 'none', // Prevent uppercase transformation
    fontWeight: 500,
    lineHeight: 1.2,
    transition: theme.transitions.create([
      'background-color',
      'border-color',
      'box-shadow',
      'transform'
    ], {
      duration: theme.transitions.duration.short,
    }),
    
    // Hover effects
    '&:hover': {
      backgroundColor: theme.palette.primary.dark || '#0f5d4a',
      borderColor: theme.palette.primary.dark || '#0f5d4a',
      transform: 'translateY(-1px)',
      boxShadow: theme.shadows[2],
    },
    
    // Focus effects for accessibility
    '&:focus': {
      outline: `2px solid ${theme.palette.primary.main || '#13715B'}`,
      outlineOffset: '2px',
    },
    
    // Active state
    '&:active': {
      transform: 'translateY(0)',
      boxShadow: theme.shadows[1],
    },
    
    // Disabled state
    '&.Mui-disabled': {
      backgroundColor: theme.palette.action.disabledBackground,
      borderColor: theme.palette.action.disabled,
      color: theme.palette.action.disabled,
    },
    
    // Ensure text doesn't wrap awkwardly
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  };

  return (
    <MUIButton
      ref={ref}
      className={className}
      data-testid={testId}
      sx={{ ...defaultStyles, ...sx }}
      aria-label={typeof children === 'string' ? children : undefined}
      {...rest}
    >
      {children}
    </MUIButton>
  );
}));

// Set display name for better debugging and dev tools
Button.displayName = 'Button';

export { Button };
