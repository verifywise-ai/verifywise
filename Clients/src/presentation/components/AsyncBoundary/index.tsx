import type { FC, ReactNode } from "react";
import { Box, Button, Stack, Typography, useTheme } from "@mui/material";
import type { LucideIcon } from "lucide-react";
import { AlertCircle, Inbox } from "lucide-react";
import { EmptyState } from "../EmptyState";
import CustomizableSkeleton from "../Skeletons";

export interface AsyncBoundaryProps {
  /** When true, a loading fallback is rendered. */
  isLoading: boolean;
  /** Error object or message. Takes precedence over loading/empty states. */
  error?: Error | string | unknown | null;
  /** When true (and not loading or errored), the empty state is rendered. */
  isEmpty?: boolean;
  /** Content rendered when data is available. */
  children: ReactNode;
  /** Called when the user presses the Retry button in the error state. */
  onRetry?: () => void;
  /** Custom loading UI. Defaults to a full-width rectangular skeleton. */
  loadingFallback?: ReactNode;
  /** Custom error UI. Defaults to the standard error card. */
  errorFallback?: ReactNode;
  /** Icon for the empty state. Defaults to Inbox. */
  emptyIcon?: LucideIcon;
  /** Message for the empty state. */
  emptyMessage?: string;
  /** Additional content below the empty-state message (e.g. EmptyStateTip). */
  emptyChildren?: ReactNode;
}

/**
 * Reusable async-state boundary.
 *
 * Combines loading, error, and empty-state handling in one component while
 * reusing the StyleGuide-approved EmptyState and skeleton patterns.
 *
 * State precedence: error > loading > empty > children.
 */
export const AsyncBoundary: FC<AsyncBoundaryProps> = ({
  isLoading,
  error,
  isEmpty,
  children,
  onRetry,
  loadingFallback,
  errorFallback,
  emptyIcon = Inbox,
  emptyMessage,
  emptyChildren,
}) => {
  const theme = useTheme();

  if (error) {
    if (errorFallback) {
      return <>{errorFallback}</>;
    }

    const message =
      typeof error === "string"
        ? error
        : error instanceof Error
          ? error.message
          : "Something went wrong. Please try again.";

    return (
      <Stack
        alignItems="center"
        justifyContent="center"
        spacing={2}
        sx={{
          width: "100%",
          py: 6,
          px: 3,
          border: `1px dashed ${theme.palette.error.main}`,
          borderRadius: "4px",
          backgroundColor: theme.palette.error.light
            ? `${theme.palette.error.light}14`
            : undefined,
        }}
        role="alert"
        aria-live="assertive"
      >
        <AlertCircle size={40} color={theme.palette.error.main} strokeWidth={1.5} />
        <Typography
          sx={{
            fontSize: 13,
            color: theme.palette.error.main,
            fontWeight: 500,
            textAlign: "center",
            maxWidth: 400,
            lineHeight: 1.5,
          }}
        >
          {message}
        </Typography>
        {onRetry && (
          <Button
            variant="outlined"
            size="small"
            onClick={onRetry}
            sx={{ mt: 1 }}
            aria-label="Retry loading data"
          >
            Retry
          </Button>
        )}
      </Stack>
    );
  }

  if (isLoading) {
    if (loadingFallback) {
      return <>{loadingFallback}</>;
    }

    return (
      <Box sx={{ width: "100%" }} role="status" aria-label="Loading">
        <CustomizableSkeleton variant="rectangular" width="100%" height={200} />
      </Box>
    );
  }

  if (isEmpty) {
    return (
      <EmptyState icon={emptyIcon} message={emptyMessage}>
        {emptyChildren}
      </EmptyState>
    );
  }

  return <>{children}</>;
};

export default AsyncBoundary;
