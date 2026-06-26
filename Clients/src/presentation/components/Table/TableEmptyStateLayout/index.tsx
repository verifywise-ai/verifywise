import type { FC, ReactNode } from "react";
import { Stack, Table, TableContainer } from "@mui/material";
import type { SxProps, Theme } from "@mui/material";
import singleTheme from "../../../themes/v1SingleTheme";

interface TableEmptyStateLayoutProps {
  /** Table head element (TableHead or header component) */
  header: ReactNode;
  /** EmptyState block rendered below the header */
  children: ReactNode;
  /** Gap between header table and empty state (theme spacing units). Default 4 = 8px */
  gap?: number;
  tableSx?: SxProps<Theme>;
  tableContainerSx?: SxProps<Theme>;
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
}) => (
  <Stack spacing={gap} sx={{ width: "100%" }}>
    <TableContainer sx={tableContainerSx}>
      <Table sx={tableSx}>{header}</Table>
    </TableContainer>
    {children}
  </Stack>
);

export default TableEmptyStateLayout;
