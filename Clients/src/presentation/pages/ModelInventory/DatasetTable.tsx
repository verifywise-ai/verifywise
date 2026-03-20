/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useCallback, useMemo } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  useTheme,
  Stack,
  Typography,
  TableFooter,
  Tooltip,
  Box,
} from "@mui/material";
import TablePaginationActions from "../../components/TablePagination";
import "../../components/Table/index.css";
import singleTheme from "../../themes/v1SingleTheme";
import CustomIconButton from "../../components/IconButton";
import allowedRoles from "../../../application/constants/permissions";
import { useAuth } from "../../../application/hooks/useAuth";
import { ChevronsUpDown, ChevronUp, ChevronDown, Database, FileSpreadsheet, Tag, Link2 } from "lucide-react";
import EmptyStateTip from "../../components/EmptyState/EmptyStateTip";
import { EmptyState } from "../../components/EmptyState";
import {
  DatasetTableProps,
} from "../../../domain/interfaces/i.dataset";
import {
  getPaginationRowCount,
  setPaginationRowCount,
} from "../../../application/utils/paginationStorage";
import {
  tableRowHoverStyle,
  tableRowDeletingStyle,
  loadingContainerStyle,
  tableFooterRowStyle,
  showingTextCellStyle,
  paginationMenuProps,
  paginationSelectStyle,
  paginationStyle,
} from "./style";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import { displayFormattedDate } from "../../tools/isoDateToString";
import { DatasetStatus, DataClassification } from "../../../domain/enums/dataset.enum";
import Chip from "../../components/Chip";
import { palette } from "../../themes/palette";

dayjs.extend(utc);

const SelectorVertical = (props: any) => <ChevronsUpDown size={16} {...props} />;

// LocalStorage keys
const DATASET_SORTING_KEY = "verifywise_dataset_sorting";

// Types for sorting
type SortDirection = "asc" | "desc" | null;
type SortConfig = {
  key: string;
  direction: SortDirection;
};

// Constants for table
const TABLE_COLUMNS = [
  { id: "name", label: "NAME", sortable: true },
  { id: "version", label: "VERSION", sortable: true },
  { id: "type", label: "TYPE", sortable: true },
  { id: "source", label: "SOURCE", sortable: true },
  { id: "classification", label: "CLASSIFICATION", sortable: true },
  { id: "contains_pii", label: "PII", sortable: true },
  { id: "status", label: "STATUS", sortable: true },
  { id: "owner", label: "OWNER", sortable: true },
  { id: "updated_at", label: "UPDATED", sortable: true },
  { id: "actions", label: "", sortable: false },
];

const DEFAULT_ROWS_PER_PAGE = 10;

const TooltipCell: React.FC<{ value: string | null | undefined }> = ({
  value,
}) => {
  const displayValue = value || "-";
  const shouldShowTooltip = displayValue.length > 24;

  return shouldShowTooltip ? (
    <Tooltip title={displayValue} arrow>
      <span>{displayValue}</span>
    </Tooltip>
  ) : (
    <span>{displayValue}</span>
  );
};

const StatusBadge: React.FC<{ status: DatasetStatus }> = ({ status }) => {
  return <Chip label={status} />;
};

const ClassificationBadge: React.FC<{ classification: DataClassification }> = ({
  classification,
}) => {
  return <Chip label={classification} />;
};

const PIIBadge: React.FC<{ containsPii: boolean }> = ({ containsPii }) => {
  return <Chip label={containsPii ? "Yes" : "No"} />;
};

const DatasetTable: React.FC<DatasetTableProps> = ({
  data,
  isLoading,
  onEdit,
  onDelete,
  paginated = true,
  deletingId,
  hidePagination = false,
  flashRowId,
}) => {
  const theme = useTheme();
  const { userRoleName } = useAuth();
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(() =>
    getPaginationRowCount("datasets", DEFAULT_ROWS_PER_PAGE)
  );

  // Sorting state
  const [sortConfig, setSortConfig] = useState<SortConfig>(() => {
    const saved = localStorage.getItem(DATASET_SORTING_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
    return { key: "", direction: null };
  });

  // Persist sorting to localStorage
  const handleSort = useCallback((columnId: string) => {
    setSortConfig((prevConfig) => {
      let newConfig: SortConfig;
      if (prevConfig.key === columnId) {
        if (prevConfig.direction === "asc") {
          newConfig = { key: columnId, direction: "desc" };
        } else if (prevConfig.direction === "desc") {
          newConfig = { key: "", direction: null };
        } else {
          newConfig = { key: columnId, direction: "asc" };
        }
      } else {
        newConfig = { key: columnId, direction: "asc" };
      }
      localStorage.setItem(DATASET_SORTING_KEY, JSON.stringify(newConfig));
      return newConfig;
    });
  }, []);

  // Sort data based on sortConfig
  const sortedData = useMemo(() => {
    if (!sortConfig.key || !sortConfig.direction) {
      return data;
    }

    return [...data].sort((a, b) => {
      const aValue = (a as any)[sortConfig.key];
      const bValue = (b as any)[sortConfig.key];

      if (aValue === null || aValue === undefined) return 1;
      if (bValue === null || bValue === undefined) return -1;

      let comparison = 0;
      if (typeof aValue === "string" && typeof bValue === "string") {
        comparison = aValue.localeCompare(bValue);
      } else if (typeof aValue === "boolean" && typeof bValue === "boolean") {
        comparison = aValue === bValue ? 0 : aValue ? -1 : 1;
      } else {
        comparison = aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
      }

      return sortConfig.direction === "desc" ? -comparison : comparison;
    });
  }, [data, sortConfig]);

  // Pagination
  const paginatedData = useMemo(() => {
    if (!paginated) return sortedData;
    const startIndex = page * rowsPerPage;
    return sortedData.slice(startIndex, startIndex + rowsPerPage);
  }, [sortedData, page, rowsPerPage, paginated]);

  const handleChangePage = useCallback(
    (_event: React.MouseEvent<HTMLButtonElement> | null, newPage: number) => {
      setPage(newPage);
    },
    []
  );

  const handleChangeRowsPerPage = useCallback(
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const newRowsPerPage = parseInt(event.target.value, 10);
      setRowsPerPage(newRowsPerPage);
      setPaginationRowCount("datasets", newRowsPerPage);
      setPage(0);
    },
    []
  );

  const getSortIcon = useCallback(
    (columnId: string) => {
      if (sortConfig.key !== columnId) {
        return <SelectorVertical style={{ marginLeft: 4 }} />;
      }
      if (sortConfig.direction === "asc") {
        return <ChevronUp size={16} style={{ marginLeft: 4 }} />;
      }
      return <ChevronDown size={16} style={{ marginLeft: 4 }} />;
    },
    [sortConfig]
  );

  const hasEditPermission = useMemo(
    () =>
      allowedRoles.modelInventory.edit?.includes(userRoleName || "") ?? false,
    [userRoleName]
  );
  const hasDeletePermission = useMemo(
    () =>
      allowedRoles.modelInventory.delete?.includes(userRoleName || "") ?? false,
    [userRoleName]
  );

  const handleRowClick = useCallback(
    (e: React.MouseEvent, datasetId: string) => {
      if (
        (e.target as HTMLElement).closest("button") ||
        (e.target as HTMLElement).closest("a")
      ) {
        return;
      }
      if (hasEditPermission && onEdit) {
        onEdit(datasetId);
      }
    },
    [hasEditPermission, onEdit]
  );

  if (isLoading) {
    return (
      <Box sx={loadingContainerStyle}>
        <Typography>Loading datasets...</Typography>
      </Box>
    );
  }

  if (!data || data.length === 0) {
    return (
      <EmptyState
        icon={Database}
        message="No datasets found. Add a dataset to start tracking your AI training and validation data."
        showBorder={true}
      >
        <EmptyStateTip
          icon={FileSpreadsheet}
          title="What to document"
          description="Record dataset name, source, size, format, and the date it was collected or last updated. Include any preprocessing steps applied."
        />
        <EmptyStateTip
          icon={Tag}
          title="Label data quality"
          description="Note whether the dataset has been reviewed for bias, completeness, and accuracy. Track any known quality issues or limitations."
        />
        <EmptyStateTip
          icon={Link2}
          title="Link to models"
          description="Connect each dataset to the models that use it for training or validation. This creates traceability for audits and impact analysis."
        />
      </EmptyState>
    );
  }

  return (
    <TableContainer>
      <Table sx={{ minWidth: 650, ...singleTheme.tableStyles.primary.frame }}>
        <TableHead
          sx={{
            backgroundColor: singleTheme.tableStyles.primary.header.backgroundColors,
          }}
        >
          <TableRow sx={singleTheme.tableStyles.primary.header.row}>
            {TABLE_COLUMNS.map((column) => (
              <TableCell
                key={column.id}
                onClick={column.sortable ? () => handleSort(column.id) : undefined}
                sx={{
                  ...singleTheme.tableStyles.primary.header.cell,
                  ...(column.sortable && {
                    cursor: "pointer",
                    userSelect: "none",
                    "&:hover": {
                      backgroundColor: "rgba(0, 0, 0, 0.04)",
                    },
                  }),
                }}
              >
                <Stack direction="row" alignItems="center">
                  {column.label}
                  {column.sortable && getSortIcon(column.id)}
                </Stack>
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {paginatedData.map((dataset) => {
            const isDeleting = deletingId === String(dataset.id);
            const isFlashing = flashRowId === dataset.id;

            return (
              <TableRow
                key={dataset.id}
                onClick={(e) => handleRowClick(e, String(dataset.id))}
                sx={{
                  ...tableRowHoverStyle,
                  ...(hasEditPermission ? { cursor: "pointer" } : {}),
                  ...(isDeleting ? tableRowDeletingStyle : {}),
                  ...(isFlashing
                    ? {
                        animation: "flashRow 1s ease-in-out",
                        "@keyframes flashRow": {
                          "0%": { backgroundColor: "rgba(19, 113, 91, 0.3)" },
                          "100%": { backgroundColor: "transparent" },
                        },
                      }
                    : {}),
                }}
              >
                <TableCell>
                  <TooltipCell value={dataset.name} />
                </TableCell>
                <TableCell>
                  <TooltipCell value={dataset.version} />
                </TableCell>
                <TableCell>
                  <Chip label={dataset.type} />
                </TableCell>
                <TableCell>
                  <TooltipCell value={dataset.source} />
                </TableCell>
                <TableCell>
                  <ClassificationBadge classification={dataset.classification} />
                </TableCell>
                <TableCell>
                  <PIIBadge containsPii={dataset.contains_pii} />
                </TableCell>
                <TableCell>
                  <StatusBadge status={dataset.status} />
                </TableCell>
                <TableCell>
                  <TooltipCell value={dataset.owner} />
                </TableCell>
                <TableCell>
                  {dataset.updated_at
                    ? displayFormattedDate(dataset.updated_at)
                    : "-"}
                </TableCell>
                <TableCell
                  onClick={(e) => e.stopPropagation()}
                >
                  <Stack direction="row" alignItems="center" gap={0.5}>
                    {(hasEditPermission || hasDeletePermission) && onEdit && onDelete && (
                      <CustomIconButton
                        id={dataset.id || 0}
                        onEdit={() => onEdit(String(dataset.id))}
                        onDelete={() => onDelete(String(dataset.id))}
                        onMouseEvent={() => {}}
                        warningTitle="Delete this dataset?"
                        warningMessage="When you delete this dataset, all data related to this dataset will be removed. This action is non-recoverable."
                        type=""
                      />
                    )}
                  </Stack>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
        {paginated && !hidePagination && (
          <TableFooter>
            <TableRow
              sx={{
                ...tableFooterRowStyle(theme),
                borderTop: `1px solid ${palette.border.dark}`,
              }}
            >
              <TableCell
                colSpan={4}
                sx={{
                  ...showingTextCellStyle(theme),
                  borderBottom: "none",
                }}
              >
                Showing {paginatedData.length} of {data.length} datasets
              </TableCell>
              <TableCell colSpan={6} align="right" sx={{ borderBottom: "none" }}>
                <TablePagination
                  rowsPerPageOptions={[5, 10, 15, 25]}
                  component="div"
                  count={data.length}
                  rowsPerPage={rowsPerPage}
                  page={page}
                  onPageChange={handleChangePage}
                  onRowsPerPageChange={handleChangeRowsPerPage}
                  ActionsComponent={TablePaginationActions}
                  slotProps={{
                    select: {
                      MenuProps: paginationMenuProps(theme),
                      sx: paginationSelectStyle(theme),
                    },
                  }}
                  sx={paginationStyle(theme)}
                />
              </TableCell>
            </TableRow>
          </TableFooter>
        )}
      </Table>
    </TableContainer>
  );
};

export default DatasetTable;
