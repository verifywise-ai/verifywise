import { Theme } from '@mui/material/styles';
import { background, status } from '../themes/palette';

/**
 * Centralized input styles for consistent hover, focus, and interaction states
 * across all form input components (text fields, selects, date pickers, etc.)
 *
 * Usage:
 * import { getInputStyles } from '@/presentation/utils/inputStyles';
 *
 * const MyComponent = () => {
 *   const theme = useTheme();
 *   return <Stack sx={getInputStyles(theme)}>...</Stack>
 * }
 */

export interface InputStylesOptions {
  /**
   * Whether the input has an error state
   */
  hasError?: boolean;
  /**
   * Custom hover border color (overrides default)
   */
  hoverBorderColor?: string;
  /**
   * Custom focus border color (overrides default)
   */
  focusBorderColor?: string;
  /**
   * Custom focus ring color (overrides default)
   */
  focusRingColor?: string;
  /**
   * Disable hover effects
   */
  disableHover?: boolean;
  /**
   * Disable focus ring (box-shadow)
   */
  disableFocusRing?: boolean;
}

/**
 * Returns consistent MUI sx styles for input components
 * Provides hover, focus, error, and disabled states
 */
export const getInputStyles = (theme: Theme, options: InputStylesOptions = {}) => {
  const {
    hasError = false,
    hoverBorderColor,
    focusBorderColor,
    focusRingColor,
    disableHover = false,
    disableFocusRing = false,
  } = options;

  // Color definitions
  const defaultBorderColor = theme.palette.border.dark;
  const hoverBorder = hoverBorderColor || '#5FA896';
  const focusBorder = focusBorderColor || theme.palette.primary.main;
  const focusRing = focusRingColor || `${theme.palette.primary.main}1A`; // 10% opacity
  const errorBorder = theme.palette.status?.error?.border || theme.palette.error.main;

  return {
    '& fieldset': {
      borderColor: hasError ? errorBorder : defaultBorderColor,
      borderRadius: theme.shape.borderRadius,
      transition: 'border-color 150ms ease-in-out, box-shadow 150ms ease-in-out',
    },

    // Hover state (when not disabled, not focused, and not in error)
    ...(!disableHover && {
      '&:not(:has(.Mui-disabled)):not(:has(.Mui-focused)) .MuiOutlinedInput-root:hover fieldset': {
        borderColor: hasError ? errorBorder : hoverBorder,
      },
    }),

    // Focus state - enhanced border and focus ring
    '& .MuiOutlinedInput-root.Mui-focused fieldset': {
      borderColor: hasError ? errorBorder : `${focusBorder} !important`,
      borderWidth: '2px',
      ...(!disableFocusRing && !hasError && {
        boxShadow: `0 0 0 3px ${focusRing}`,
      }),
    },

    // Error state
    ...(hasError && {
      '& .MuiOutlinedInput-root fieldset': {
        borderColor: `${errorBorder} !important`,
      },
      '& .MuiOutlinedInput-root.Mui-focused fieldset': {
        borderWidth: '2px',
        boxShadow: `0 0 0 3px ${errorBorder}1A`, // 10% opacity
      },
    }),

    // Disabled state
    '& .MuiOutlinedInput-root.Mui-disabled': {
      backgroundColor: theme.palette.grey?.[50] || background.accent,
      cursor: 'not-allowed',
      '& fieldset': {
        borderColor: theme.palette.grey?.[300] || status.default.border,
      },
    },
  };
};

/**
 * Returns styles specifically for MUI Select components
 * Select components have slightly different structure than TextField
 */
export const getSelectStyles = (theme: Theme, options: InputStylesOptions = {}) => {
  const {
    hasError = false,
    hoverBorderColor,
    focusBorderColor,
    focusRingColor,
    disableHover = false,
    disableFocusRing = false,
  } = options;

  const defaultBorderColor = theme.palette.border.dark;
  const hoverBorder = hoverBorderColor || '#5FA896';
  const focusBorder = focusBorderColor || theme.palette.primary.main;
  const focusRing = focusRingColor || `${theme.palette.primary.main}1A`;
  const errorBorder = theme.palette.status?.error?.border || theme.palette.error.main;

  return {
    '& .MuiOutlinedInput-notchedOutline': {
      borderColor: hasError ? errorBorder : defaultBorderColor,
      borderRadius: theme.shape.borderRadius,
      transition: 'border-color 150ms ease-in-out, box-shadow 150ms ease-in-out',
    },

    // Hover state
    ...(!disableHover && {
      '&:not(.Mui-disabled):hover .MuiOutlinedInput-notchedOutline': {
        borderColor: hasError ? errorBorder : hoverBorder,
      },
    }),

    // Focus state
    '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
      borderColor: hasError ? errorBorder : `${focusBorder} !important`,
      borderWidth: '2px',
      ...(!disableFocusRing && !hasError && {
        boxShadow: `0 0 0 3px ${focusRing}`,
      }),
    },

    // Error state for focused
    ...(hasError && {
      '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
        borderWidth: '2px',
        boxShadow: `0 0 0 3px ${errorBorder}1A`,
      },
    }),

    // Disabled state
    '&.Mui-disabled': {
      backgroundColor: theme.palette.grey?.[50] || background.accent,
      cursor: 'not-allowed',
      '& .MuiOutlinedInput-notchedOutline': {
        borderColor: theme.palette.grey?.[300] || status.default.border,
      },
    },
  };
};

/**
 * Returns styles for DatePicker and other MUI X components
 * These components use similar structure to TextField but may need slight adjustments
 */
export const getDatePickerStyles = (theme: Theme, options: InputStylesOptions = {}) => {
  // DatePicker uses same structure as TextField, so we can reuse getInputStyles
  return getInputStyles(theme, options);
};

/**
 * Returns styles for Autocomplete components
 */
export const getAutocompleteStyles = (theme: Theme, options: InputStylesOptions = {}) => {
  const {
    hasError = false,
    hoverBorderColor,
    focusBorderColor,
    focusRingColor,
    disableHover = false,
    disableFocusRing = false,
  } = options;

  const defaultBorderColor = theme.palette.border.dark;
  const hoverBorder = hoverBorderColor || '#5FA896';
  const focusBorder = focusBorderColor || theme.palette.primary.main;
  const focusRing = focusRingColor || `${theme.palette.primary.main}1A`;
  const errorBorder = theme.palette.status?.error?.border || theme.palette.error.main;

  return {
    '& .MuiOutlinedInput-root': {
      '& fieldset': {
        borderColor: hasError ? errorBorder : defaultBorderColor,
        borderRadius: theme.shape.borderRadius,
        transition: 'border-color 150ms ease-in-out, box-shadow 150ms ease-in-out',
      },

      // Hover state
      ...(!disableHover && {
        '&:not(.Mui-disabled):hover fieldset': {
          borderColor: hasError ? errorBorder : hoverBorder,
        },
      }),

      // Focus state
      '&.Mui-focused fieldset': {
        borderColor: hasError ? errorBorder : `${focusBorder} !important`,
        borderWidth: '2px',
        ...(!disableFocusRing && !hasError && {
          boxShadow: `0 0 0 3px ${focusRing}`,
        }),
      },

      // Error focus state
      ...(hasError && {
        '&.Mui-focused fieldset': {
          borderWidth: '2px',
          boxShadow: `0 0 0 3px ${errorBorder}1A`,
        },
      }),

      // Disabled state
      '&.Mui-disabled': {
        backgroundColor: theme.palette.grey?.[50] || background.accent,
        '& fieldset': {
          borderColor: theme.palette.grey?.[300] || status.default.border,
        },
      },
    },
  };
};

/**
 * Returns styles for SearchBox component
 * SearchBox is a special input with icon prefix
 */
export const getSearchBoxStyles = (theme: Theme, options: InputStylesOptions = {}) => {
  const {
    hoverBorderColor,
    focusBorderColor,
    focusRingColor,
    disableHover = false,
    disableFocusRing = false,
  } = options;

  const defaultBorderColor = theme.palette.border.dark;
  const hoverBorder = hoverBorderColor || '#5FA896';
  const focusBorder = focusBorderColor || theme.palette.primary.main;
  const focusRing = focusRingColor || `${theme.palette.primary.main}1A`;

  return {
    border: `1px solid ${defaultBorderColor}`,
    borderRadius: theme.shape.borderRadius,
    transition: 'border-color 150ms ease-in-out, box-shadow 150ms ease-in-out',

    // Hover state
    ...(!disableHover && {
      '&:hover': {
        borderColor: hoverBorder,
      },
    }),

    // Focus-within state (when input inside is focused)
    '&:focus-within': {
      borderColor: `${focusBorder}`,
      borderWidth: '2px',
      padding: '9px', // Compensate for 2px border (was 10px with 1px border)
      ...(!disableFocusRing && {
        boxShadow: `0 0 0 3px ${focusRing}`,
      }),
    },
  };
};

/**
 * Helper function to get cursor style based on input type
 */
export const getInputCursor = (type: 'text' | 'select' | 'datepicker' | 'button'): string => {
  switch (type) {
    case 'select':
    case 'datepicker':
    case 'button':
      return 'pointer';
    case 'text':
    default:
      return 'text';
  }
};
