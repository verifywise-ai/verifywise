import type { FC, ReactNode } from "react";
import { Stack, Table } from "@mui/material";
import type { SxProps, Theme } from "@mui/material";
import singleTheme from "../../../themes/v1SingleTheme";
import ScrollableTableContainer from "../ScrollableTableContainer";

interface TableEmptyStateLayoutProps {
  /** Table head element (TableHead or header component) */
  header: ReactNode;
  /** EmptyState block rendered below the header */
  children: ReactNode;
  /** Gap between header table and empty state (theme spacing units). Default 4 = 8px */
  gap?: number;
  tableSx?: SxProps<Theme>;
  tableContainerSx?: SxProps<Theme>;
  /** Accessible name of the scrollable header region. Default "Columns" */
  ariaLabel?: string;
}

/**
 * Standard empty table layout: column header row + EmptyState below.
 * Matches StyleGuide empty state pattern for tables.
 */
export const TableEmptyStateLayout: FC<TableEmptyStateLayoutProps> = ({
  header,
  children,
  gap = 4,
  tableSx = singleTheme.tableStyles.primary.frame,
  tableContainerSx,
  ariaLabel = "Columns",
}) => (
  <Stack spacing={gap} sx={{ width: "100%" }}>
    {/* A header row wider than its card scrolls sideways, and with no rows there is
        nothing inside to focus, so the region itself takes focus while it overflows. */}
    <ScrollableTableContainer sx={tableContainerSx} ariaLabel={ariaLabel}>
      <Table sx={tableSx}>{header}</Table>
    </ScrollableTableContainer>
    {children}
  </Stack>
);

export default TableEmptyStateLayout;
