import { memo } from "react";
import {
  Box,
  TableCell,
  TableFooter,
  TablePagination,
  TableRow,
  Typography,
  useTheme,
} from "@mui/material";
import { ChevronsUpDown } from "lucide-react";
import TablePaginationActions from "../../TablePagination";

const SelectorVertical = (props: React.SVGAttributes<SVGSVGElement>) => (
  <ChevronsUpDown size={16} {...props} />
);

interface StandardTablePaginationProps {
  totalCount: number;
  page: number;
  rowsPerPage: number;
  onPageChange: (_: unknown, newPage: number) => void;
  onRowsPerPageChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  getRange: string;
  entityLabel: string;
  entityLabelPlural?: string;
  colSpan: number;
  rowsPerPageOptions?: number[];
}

const StandardTablePagination: React.FC<StandardTablePaginationProps> = memo(({
  totalCount,
  page,
  rowsPerPage,
  onPageChange,
  onRowsPerPageChange,
  getRange,
  entityLabel,
  entityLabelPlural,
  colSpan,
  rowsPerPageOptions = [5, 10, 15, 20, 25],
}) => {
  const theme = useTheme();
  const plural = entityLabelPlural ?? `${entityLabel}s`;
  const capitalPlural = plural.charAt(0).toUpperCase() + plural.slice(1);

  return (
    <TableFooter>
      <TableRow>
        <TableCell colSpan={colSpan} sx={{ border: "none", p: 0 }}>
          <Box
            sx={{
              display: "flex",
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              paddingX: theme.spacing(4),
            }}
          >
            <Typography
              sx={{
                paddingX: theme.spacing(2),
                fontSize: 12,
                opacity: 0.7,
                color: theme.palette.text.secondary,
              }}
            >
              Showing {getRange} of {totalCount} {totalCount !== 1 ? plural : entityLabel}
            </Typography>
            <Box sx={{ display: "flex", alignItems: "center" }}>
              <TablePagination
                component="div"
                count={totalCount}
                page={page}
                onPageChange={onPageChange}
                rowsPerPage={rowsPerPage}
                rowsPerPageOptions={rowsPerPageOptions}
                onRowsPerPageChange={onRowsPerPageChange}
                ActionsComponent={TablePaginationActions}
                labelRowsPerPage={`${capitalPlural} per page`}
                labelDisplayedRows={({ page: p, count }) =>
                  `Page ${p + 1} of ${Math.max(
                    0,
                    Math.ceil(count / rowsPerPage)
                  )}`
                }
                sx={{
                  mt: theme.spacing(6),
                  color: theme.palette.text.secondary,
                  "& .MuiSelect-select": {
                    width: theme.spacing(10),
                    borderRadius: theme.shape.borderRadius,
                    border: `1px solid ${theme.palette.border.light}`,
                    padding: theme.spacing(4),
                  },
                }}
                slotProps={{
                  select: {
                    MenuProps: {
                      keepMounted: true,
                      PaperProps: {
                        className: "pagination-dropdown",
                        sx: { mt: 0, mb: theme.spacing(2) },
                      },
                      transformOrigin: {
                        vertical: "bottom",
                        horizontal: "left",
                      },
                      anchorOrigin: {
                        vertical: "top",
                        horizontal: "left",
                      },
                      sx: { mt: theme.spacing(-2) },
                    },
                    inputProps: { id: "pagination-dropdown" },
                    IconComponent: SelectorVertical,
                    sx: {
                      ml: theme.spacing(4),
                      mr: theme.spacing(12),
                      minWidth: theme.spacing(20),
                      textAlign: "left",
                    },
                  },
                }}
              />
            </Box>
          </Box>
        </TableCell>
      </TableRow>
    </TableFooter>
  );
});

export default StandardTablePagination;
