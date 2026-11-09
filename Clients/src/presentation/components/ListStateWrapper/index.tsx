import type { ReactNode } from "react";
import { Box } from "@mui/material";
import type { SxProps, Theme } from "@mui/material";
import Alert from "../Alert";
import CustomizableSkeleton from "../Skeletons";

interface ListStateWrapperProps {
  /** Array rendered by the list. Empty arrays show the supplied empty state. */
  items: readonly unknown[];
  /** Whether the initial list request is in progress. */
  isLoading: boolean;
  /** User-facing error message for a failed list request. */
  errorMessage?: string | null;
  /** Approved empty-state content for this list, usually EmptyState or TableEmptyStateLayout. */
  emptyState: ReactNode;
  /** Populated list or table content. */
  children: ReactNode;
  /** Keeps the loading placeholder aligned with the expected list height. */
  loadingHeight?: number | string;
  /** Accessible label announced while the list is loading. */
  loadingLabel?: string;
  /** Heading used by the inline error alert. */
  errorTitle?: string;
  /** Optional layout styling applied around every state. */
  sx?: SxProps<Theme>;
}

/**
 * Applies the standard loading, error, empty, and populated states to list views.
 *
 * Callers retain control of their contextual empty state and populated content,
 * while loading and error presentation stay consistent across the application.
 */
const ListStateWrapper = ({
  items,
  isLoading,
  errorMessage,
  emptyState,
  children,
  loadingHeight = 400,
  loadingLabel = "Loading list",
  errorTitle = "Unable to load data",
  sx,
}: ListStateWrapperProps) => {
  let content: ReactNode;

  if (isLoading) {
    content = (
      <Box role="status" aria-label={loadingLabel} aria-busy="true">
        <CustomizableSkeleton variant="rectangular" width="100%" height={loadingHeight} />
      </Box>
    );
  } else if (errorMessage) {
    content = (
      <Alert
        variant="error"
        title={errorTitle}
        body={errorMessage}
        sx={{ position: "static", width: "100%", boxSizing: "border-box" }}
      />
    );
  } else if (items.length === 0) {
    content = emptyState;
  } else {
    content = children;
  }

  const wrapperSx: SxProps<Theme> = sx
    ? [{ width: "100%", minWidth: 0 }, ...(Array.isArray(sx) ? sx : [sx])]
    : { width: "100%", minWidth: 0 };

  return (
    <Box sx={wrapperSx} data-testid="list-state-wrapper">
      {content}
    </Box>
  );
};

export default ListStateWrapper;
export type { ListStateWrapperProps };
