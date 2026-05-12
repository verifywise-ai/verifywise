/**
 * @fileoverview Professional VWAvatar component for displaying user avatars.
 *
 * Features:
 * - Multiple size variants with consistent theming
 * - Image loading with fallback to initials
 * - Accessibility support with proper ARIA attributes
 * - TypeScript strict mode compliance
 * - Performance optimized with memoization
 * - Theme-based styling and responsive design
 *
 * @package
 */

import { memo, useMemo, useState, useCallback } from "react";
import { Avatar, SxProps, Theme, useTheme } from "@mui/material";

// Types
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

type AvatarSize = "small" | "medium" | "large";

type AvatarVariant = "circular" | "rounded" | "square";

interface AvatarDimensions {
  width: number;
  height: number;
  fontSize: number;
}

interface VWAvatarProps {
  /** User data for avatar display */
  user?: User;
  /** Size variant of the avatar */
  size?: AvatarSize;
  /** Shape variant of the avatar */
  variant?: AvatarVariant;
  /** Additional styling */
  sx?: SxProps<Theme>;
  /** Whether to show border around avatar */
  showBorder?: boolean;
  /** Custom onClick handler */
  onClick?: () => void;
  /** Custom alt text override */
  alt?: string;
}

// Constants
const AVATAR_CONFIG = {
  SIZES: {
    small: { width: 32, height: 32, fontSize: 13 },
    medium: { width: 64, height: 64, fontSize: 22 },
    large: { width: 128, height: 128, fontSize: 44 },
  } as const satisfies Record<AvatarSize, AvatarDimensions>,
  DEFAULT_SIZE: "small" as const,
  DEFAULT_VARIANT: "circular" as const,
} as const;

const DEFAULT_USER: User = {
  firstname: "Unknown",
  lastname: "User",
  pathToImage: undefined,
} as const;

// Utility functions
const getInitials = (firstname: string, lastname: string): string => {
  const firstInitial = firstname?.trim().charAt(0).toUpperCase() || "?";
  const lastInitial = lastname?.trim().charAt(0).toUpperCase() || "";
  return firstInitial + lastInitial;
};

// Note: Avatar colors are obtained from theme in component

/**
 * Professional avatar component for displaying user profile images or initials.
 *
 * @param {VWAvatarProps} props - Component props
 * @param {User} [props.user] - User data containing name and image information
 * @param {AvatarSize} [props.size='small'] - Size variant of the avatar
 * @param {AvatarVariant} [props.variant='circular'] - Shape variant of the avatar
 * @param {SxProps<Theme>} [props.sx] - Additional Material-UI styling
 * @param {boolean} [props.showBorder=true] - Whether to show border around avatar
 * @param {() => void} [props.onClick] - Optional click handler
 * @param {string} [props.alt] - Custom alt text for accessibility
 *
 * @returns {JSX.Element} Rendered avatar component
 *
 * @example
 * ```tsx
 * <VWAvatar
 *   user={{ firstname: 'John', lastname: 'Doe', pathToImage: '/path/to/image.jpg' }}
 *   size="medium"
 *   variant="circular"
 *   onClick={() => console.log('Avatar clicked')}
 * />
 * ```
 */
const VWAvatar = ({
  user = DEFAULT_USER,
  size = AVATAR_CONFIG.DEFAULT_SIZE,
  variant = AVATAR_CONFIG.DEFAULT_VARIANT,
  sx,
  showBorder = true,
  onClick,
  alt,
}: VWAvatarProps) => {
  const theme = useTheme();
  const [imageError, setImageError] = useState(false);
  const [imageLoading, setImageLoading] = useState(false);

  // Memoized computed values for performance
  const dimensions = useMemo(() => AVATAR_CONFIG.SIZES[size], [size]);

  const initials = useMemo(
    () => getInitials(user.firstname, user.lastname),
    [user.firstname, user.lastname],
  );

  const fullName = useMemo(
    () => `${user.firstname} ${user.lastname}`.trim() || "Unknown User",
    [user.firstname, user.lastname],
  );

  // Use theme-based colors
  const avatarColors = useMemo(
    () => ({
      backgroundColor: theme.palette.primary.main,
      color: theme.palette.common.white,
    }),
    [theme.palette.primary.main, theme.palette.common.white],
  );

  const shouldShowImage = Boolean(user.pathToImage && !imageError && !imageLoading);

  // Memoized event handlers
  const handleImageError = useCallback(() => {
    setImageError(true);
    setImageLoading(false);
  }, []);

  const handleImageLoad = useCallback(() => {
    setImageError(false);
    setImageLoading(false);
  }, []);

  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (onClick) {
        event.preventDefault();
        onClick();
      }
    },
    [onClick],
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (onClick && (event.key === "Enter" || event.key === " ")) {
        event.preventDefault();
        onClick();
      }
    },
    [onClick],
  );

  // Memoized styles
  const avatarStyles = useMemo(
    (): SxProps<Theme> => ({
      ...dimensions,
      "backgroundColor": shouldShowImage ? "transparent" : avatarColors.backgroundColor,
      "color": avatarColors.color,
      "border": showBorder
        ? `2px solid ${shouldShowImage ? theme.palette.primary.main : "transparent"}`
        : "none",
      "cursor": onClick ? "pointer" : "default",
      "transition": theme.transitions.create(["background-color", "border-color", "transform"], {
        duration: theme.transitions.duration.short,
      }),
      "&:hover": onClick
        ? {
            transform: "scale(1.05)",
            borderColor: theme.palette.primary.dark,
          }
        : {},
      "&:focus": onClick
        ? {
            outline: `2px solid ${theme.palette.primary.main}`,
            outlineOffset: 2,
          }
        : {},
      "fontSize": dimensions.fontSize,
      "fontWeight": 600,
      ...sx,
    }),
    [dimensions, shouldShowImage, showBorder, theme, onClick, sx, avatarColors],
  );

  const avatarProps = useMemo(() => {
    const baseProps = {
      src: shouldShowImage ? user.pathToImage : undefined,
      alt: alt || `${fullName} avatar`,
      variant,
      sx: avatarStyles,
      slotProps: {
        img: {
          "onError": handleImageError,
          "onLoad": handleImageLoad,
          "loading": "lazy" as const,
          "aria-hidden": true,
        },
      },
    };

    if (onClick) {
      return {
        ...baseProps,
        "component": "div" as const,
        "onClick": handleClick,
        "onKeyDown": handleKeyDown,
        "tabIndex": 0,
        "role": "button",
        "aria-label": `${fullName} avatar, click to view profile`,
      };
    }

    return {
      ...baseProps,
      "role": "img",
      "aria-label": `${fullName} avatar`,
    };
  }, [
    shouldShowImage,
    user.pathToImage,
    alt,
    fullName,
    variant,
    avatarStyles,
    handleImageError,
    handleImageLoad,
    onClick,
    handleClick,
    handleKeyDown,
  ]);

  return (
    <Avatar {...avatarProps}>
      {!shouldShowImage && (
        <>
          {imageLoading ? (
            // Simple loading text while image loads
            <span
              aria-label="Loading avatar image"
              style={{
                fontSize: dimensions.fontSize * 0.7,
                opacity: 0.7,
                color: avatarColors.color,
              }}
            >
              ...
            </span>
          ) : (
            <span aria-hidden="true" style={{ color: avatarColors.color }}>
              {initials}
            </span>
          )}
        </>
      )}
    </Avatar>
  );
};

// Memoized export for performance
export default memo(VWAvatar);
