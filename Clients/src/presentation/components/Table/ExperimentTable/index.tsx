import { Table, TableBody, TableCell, TableContainer, TableRow, Typography } from "@mui/material";
import { useCallback, useMemo } from "react";
import { FlaskConical, Play, Database, BarChart3 } from "lucide-react";
import singleTheme from "../../../themes/v1SingleTheme";
import ExperimentTableBody from "./ExperimentTableBody";
import StandardTableHead from "../StandardTableHead";
import StandardTablePagination from "../StandardTablePagination";
import { EmptyState } from "../../EmptyState";
import EmptyStateTip from "../../EmptyState/EmptyStateTip";
import { useStandardTable } from "../../../../application/hooks/useStandardTable";
import type { StandardColumn } from "../../../../domain/types/standardTable";
import type { IExperimentRow, IExperimentTableProps } from "../../../types/interfaces/i.table";

// EXPERIMENT NAME body cell is left-aligned (default); every other body cell
// uses textAlign: "center". StandardTableHead defaults to left when `align`
// is omitted, so headers must match here or they drift off their column.
const ALL_COLUMNS: StandardColumn[] = [
  { id: "name", label: "EXPERIMENT NAME", sortable: true, width: "20%" },
  { id: "model", label: "MODEL", sortable: true, align: "center", width: "12%" },
  { id: "judge", label: "JUDGE/SCORER", sortable: true, align: "center", width: "16%" },
  { id: "prompts", label: "# PROMPTS", sortable: true, align: "center", width: "8%" },
  { id: "dataset", label: "DATASET", sortable: true, align: "center", width: "12%" },
  { id: "linkedModel", label: "LINKED MODEL", sortable: false, align: "center", width: "10%" },
  { id: "date", label: "DATE", sortable: true, align: "center", width: "14%" },
  {
    id: "actions",
    label: "ACTION",
    sortable: false,
    align: "center",
    minWidth: "60px",
    width: "60px",
  },
];

const COMPACT_HIDDEN_IDS = new Set<string>(["linkedModel", "actions"]);

const ExperimentTable: React.FC<IExperimentTableProps> = ({
  rows,
  onRowClick,
  onRerun,
  onDownload,
  onCopy,
  onDelete,
  loading = false,
  hidePagination = false,
  compact = false,
}) => {
  const columns = useMemo(
    () => (compact ? ALL_COLUMNS.filter((c) => !COMPACT_HIDDEN_IDS.has(c.id)) : ALL_COLUMNS),
    [compact],
  );

  const sortComparator = useCallback(
    (a: IExperimentRow, b: IExperimentRow, key: string): number => {
      let aValue: string | number;
      let bValue: string | number;

      switch (key) {
        case "name":
          aValue = (a.name || a.id).toLowerCase();
          bValue = (b.name || b.id).toLowerCase();
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
        return aValue.localeCompare(bValue);
      }
      if (aValue < bValue) return -1;
      if (aValue > bValue) return 1;
      return 0;
    },
    [],
  );

  const {
    sortConfig,
    handleSort,
    sortedRows,
    validPage,
    rowsPerPage,
    handleChangePage,
    handleChangeRowsPerPage,
    getRange,
    totalCount,
  } = useStandardTable({
    rows,
    storageKey: "experiments",
    defaultSortColumn: "date",
    sortComparator,
  });

  return (
    <TableContainer>
      <Table sx={{ ...singleTheme.tableStyles.primary.frame }}>
        <StandardTableHead columns={columns} sortConfig={sortConfig} onSort={handleSort} />
        {loading ? (
          <TableBody>
            <TableRow>
              <TableCell colSpan={columns.length} sx={{ textAlign: "center", py: 4 }}>
                <Typography>Loading...</Typography>
              </TableCell>
            </TableRow>
          </TableBody>
        ) : sortedRows.length !== 0 ? (
          <ExperimentTableBody
            rows={sortedRows}
            page={hidePagination ? 0 : validPage}
            rowsPerPage={hidePagination ? sortedRows.length : rowsPerPage}
            onRowClick={onRowClick}
            onRerun={onRerun}
            onDownload={onDownload}
            onCopy={onCopy}
            onDelete={onDelete}
            compact={compact}
          />
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
        {!hidePagination && (
          <StandardTablePagination
            totalCount={totalCount}
            page={validPage}
            rowsPerPage={rowsPerPage}
            onPageChange={handleChangePage}
            onRowsPerPageChange={handleChangeRowsPerPage}
            getRange={getRange}
            entityLabel="experiment"
            colSpan={columns.length}
          />
        )}
      </Table>
    </TableContainer>
  );
};

export default ExperimentTable;
