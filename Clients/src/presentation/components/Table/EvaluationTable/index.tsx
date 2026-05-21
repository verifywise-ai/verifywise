import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TablePagination,
  TableRow,
  useTheme,
  TableFooter,
} from "@mui/material";
import { useMemo, useState, useCallback, useEffect } from "react";
import TablePaginationActions from "../../TablePagination";
import StandardTableHead from "../StandardTableHead";
import { EmptyState } from "../../EmptyState";
import EmptyStateTip from "../../EmptyState/EmptyStateTip";
import { ChevronsUpDown, FlaskConical, Play, Database, BarChart3 } from "lucide-react";

const SelectorVertical = (props: React.SVGProps<SVGSVGElement>) => (
  <ChevronsUpDown size={16} {...props} />
);
import { paginationStatus, paginationStyle, paginationDropdown, paginationSelect } from "./styles";
import singleTheme from "../../../themes/v1SingleTheme";
import {
  getPaginationRowCount,
  setPaginationRowCount,
} from "../../../../application/utils/paginationStorage";
import { IEvaluationTableProps, IEvaluationRow } from "../../../types/interfaces/i.table";
import type { SortConfig, StandardColumn } from "../../../../domain/types/standardTable";

import EvaluationTableBody from "./TableBody";

const EVALUATION_SORTING_KEY = "verifywise_evaluation_sorting";

// Map column labels to sortable field keys
const columnSortKeys: Record<string, string> = {
  "EXPERIMENT NAME": "name",
  "MODEL": "model",
  "JUDGE/SCORER": "judge",
  "# PROMPTS": "prompts",
  "DATASET": "dataset",
  "DATE": "date",
};

// Column width definitions for consistent spacing
const columnWidths: Record<string, string> = {
  "EXPERIMENT NAME": "20%",
  "MODEL": "12%",
  "JUDGE/SCORER": "16%",
  "# PROMPTS": "8%",
  "DATASET": "12%",
  "LINKED MODEL": "10%",
  "DATE": "14%",
  "ACTION": "60px",
};

const toStandardColumns = (labels: string[]): StandardColumn[] =>
  labels.map((label) => ({
    id: columnSortKeys[label] || label.toLowerCase(),
    label,
    sortable: !!columnSortKeys[label],
    width: columnWidths[label],
    minWidth: label === "ACTION" ? "60px" : undefined,
  }));

const EvaluationTable: React.FC<IEvaluationTableProps> = ({
  columns,
  rows,
  removeModel,
  page,
  setCurrentPagingation,
  onShowDetails,
  onRerun,
  onDownload,
  onCopy,
  hidePagination = false,
}) => {
  const standardColumns = useMemo(() => toStandardColumns(columns), [columns]);

  const [rowsPerPage, setRowsPerPage] = useState(() => getPaginationRowCount("evaluation", 10));

  // Initialize sorting state from localStorage or default to date desc
  const [sortConfig, setSortConfig] = useState<SortConfig>(() => {
    const saved = localStorage.getItem(EVALUATION_SORTING_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (!parsed.key || !parsed.direction) {
          return { key: "date", direction: "desc" };
        }
        return parsed;
      } catch {
        return { key: "date", direction: "desc" };
      }
    }
    return { key: "date", direction: "desc" };
  });

  // Save sorting state to localStorage
  useEffect(() => {
    localStorage.setItem(EVALUATION_SORTING_KEY, JSON.stringify(sortConfig));
  }, [sortConfig]);

  // Sorting handler
  const handleSort = useCallback((columnKey: string) => {
    setSortConfig((prevConfig) => {
      if (prevConfig.key === columnKey) {
        if (prevConfig.direction === "asc") {
          return { key: columnKey, direction: "desc" };
        } else if (prevConfig.direction === "desc") {
          return { key: "", direction: null };
        }
      }
      return { key: columnKey, direction: "asc" };
    });
  }, []);

  // Sort the rows based on current sort configuration
  const sortedRows = useMemo(() => {
    if (!rows || !sortConfig.key || !sortConfig.direction) {
      return rows || [];
    }

    const sortableRows = [...rows];

    return sortableRows.sort((a: IEvaluationRow, b: IEvaluationRow) => {
      let aValue: string | number;
      let bValue: string | number;

      switch (sortConfig.key) {
        case "id":
          aValue = a.id.toLowerCase();
          bValue = b.id.toLowerCase();
          break;
        case "model":
          aValue = a.model.toLowerCase();
          bValue = b.model.toLowerCase();
          break;
        case "judge":
          aValue = (a.judge || "").toLowerCase();
          bValue = (b.judge || "").toLowerCase();
          break;
        case "prompts":
          aValue = a.prompts ?? 0;
          bValue = b.prompts ?? 0;
          break;
        case "dataset":
          aValue = a.dataset.toLowerCase();
          bValue = b.dataset.toLowerCase();
          break;
        case "date":
          aValue = a.date ? new Date(a.date).getTime() : 0;
          bValue = b.date ? new Date(b.date).getTime() : 0;
          break;
        default:
          return 0;
      }

      if (typeof aValue === "string" && typeof bValue === "string") {
        const comparison = aValue.localeCompare(bValue);
        return sortConfig.direction === "asc" ? comparison : -comparison;
      }

      if (aValue < bValue) return sortConfig.direction === "asc" ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === "asc" ? 1 : -1;
      return 0;
    });
  }, [rows, sortConfig]);

  const theme = useTheme();

  const getRange = useMemo(() => {
    const start = page * rowsPerPage + 1;
    const end = Math.min(page * rowsPerPage + rowsPerPage, sortedRows?.length ?? 0);
    return `${start} - ${end}`;
  }, [page, rowsPerPage, sortedRows?.length]);

  const handleChangePage = useCallback(
    (_: unknown, newPage: number) => {
      setCurrentPagingation(newPage);
    },
    [setCurrentPagingation],
  );

  const handleChangeRowsPerPage = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const newRowsPerPage = parseInt(event.target.value, 10);
      setRowsPerPage(newRowsPerPage);
      setPaginationRowCount("evaluation", newRowsPerPage);
      setCurrentPagingation(0);
    },
    [setRowsPerPage, setCurrentPagingation],
  );

  return (
    <>
      <TableContainer sx={{ mt: 10 }}>
        <Table sx={{ ...singleTheme.tableStyles.primary.frame }}>
          <StandardTableHead
            columns={standardColumns}
            sortConfig={sortConfig}
            onSort={handleSort}
          />
          {sortedRows.length !== 0 ? (
            <>
              <EvaluationTableBody
                rows={sortedRows}
                onRemoveModel={removeModel}
                onShowDetails={onShowDetails}
                onRerun={onRerun}
                onDownload={onDownload}
                onCopy={onCopy}
                page={hidePagination ? 0 : page}
                rowsPerPage={hidePagination ? sortedRows.length : rowsPerPage}
              />
              {!hidePagination && (
                <TableFooter>
                  <TableRow
                    sx={{
                      "& .MuiTableCell-root.MuiTableCell-footer": {
                        paddingX: theme.spacing(8),
                        paddingY: theme.spacing(4),
                      },
                    }}
                  >
                    <TableCell sx={paginationStatus(theme)}>
                      Showing {getRange} of {sortedRows?.length} evaluation
                      {sortedRows?.length !== 1 ? "s" : ""}
                    </TableCell>
                    <TablePagination
                      count={sortedRows.length}
                      page={page}
                      onPageChange={handleChangePage}
                      rowsPerPage={rowsPerPage}
                      rowsPerPageOptions={[5, 10, 15, 20, 25]}
                      onRowsPerPageChange={handleChangeRowsPerPage}
                      ActionsComponent={(props) => <TablePaginationActions {...props} />}
                      labelRowsPerPage="Evaluations per page"
                      labelDisplayedRows={({ page, count }) =>
                        `Page ${page + 1} of ${Math.max(0, Math.ceil(count / rowsPerPage))}`
                      }
                      sx={paginationStyle(theme)}
                      slotProps={{
                        select: {
                          MenuProps: {
                            keepMounted: true,
                            PaperProps: {
                              className: "pagination-dropdown",
                              sx: paginationDropdown(theme),
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
                          sx: paginationSelect(theme),
                        },
                      }}
                    />
                  </TableRow>
                </TableFooter>
              )}
            </>
          ) : (
            <TableBody>
              <TableRow>
                <TableCell colSpan={columns.length} sx={{ border: "none", p: 0 }}>
                  <EmptyState
                    icon={FlaskConical}
                    message="No experiments run yet. Create an experiment to evaluate model performance."
                  >
                    <EmptyStateTip
                      icon={Play}
                      title="Run your first experiment"
                      description="Select a dataset, pick one or more models, and choose scorers. The system runs each prompt through the models and grades the outputs."
                    />
                    <EmptyStateTip
                      icon={Database}
                      title="Prepare a dataset first"
                      description="Experiments need a dataset with prompts and expected outputs. Upload one in the datasets tab before running an experiment."
                    />
                    <EmptyStateTip
                      icon={BarChart3}
                      title="Compare results over time"
                      description="Each experiment run is saved here with scores and metadata. Run the same dataset across different models or configs to track progress."
                    />
                  </EmptyState>
                </TableCell>
              </TableRow>
            </TableBody>
          )}
        </Table>
      </TableContainer>
    </>
  );
};

export default EvaluationTable;
