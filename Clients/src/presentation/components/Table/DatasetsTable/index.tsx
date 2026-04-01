import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableRow,
  Typography,
} from "@mui/material";
import singleTheme from "../../../themes/v1SingleTheme";
import { useCallback } from "react";
import { Database, Upload, FileText, ClipboardCheck } from "lucide-react";
import DatasetsTableBody from "./DatasetsTableBody";
import StandardTableHead from "../StandardTableHead";
import StandardTablePagination from "../StandardTablePagination";
import { EmptyState } from "../../EmptyState";
import EmptyStateTip from "../../EmptyState/EmptyStateTip";
import { useStandardTable } from "../../../../application/hooks/useStandardTable";
import type { StandardColumn } from "../../../../domain/types/standardTable";

export interface DatasetRow {
  key: string;
  name: string;
  path: string;
  useCase?: string;
  type?: "single-turn" | "multi-turn" | "simulated";
  createdAt?: string | null;
  updatedAt?: string | null;
  metadata?: {
    promptCount?: number;
    avgDifficulty?: string;
    loading?: boolean;
  };
}

export interface DatasetsTableProps {
  rows: DatasetRow[];
  onRowClick?: (dataset: DatasetRow) => void;
  onView?: (dataset: DatasetRow) => void;
  onEdit?: (dataset: DatasetRow) => void;
  onDelete?: (dataset: DatasetRow) => void;
  onDownload?: (dataset: DatasetRow) => void;
  loading?: boolean;
  emptyMessage?: string;
  hidePagination?: boolean;
}

const columns: StandardColumn[] = [
  { id: "name", label: "NAME", sortable: true },
  { id: "type", label: "TYPE", sortable: true },
  { id: "useCase", label: "USE CASE", sortable: true },
  { id: "promptCount", label: "# PROMPTS", sortable: true },
  { id: "difficulty", label: "DIFFICULTY", sortable: true },
  { id: "createdAt", label: "DATE", sortable: true },
  { id: "actions", label: "ACTION", sortable: false },
];

const DatasetsTable: React.FC<DatasetsTableProps> = ({
  rows,
  onRowClick,
  onView,
  onEdit,
  onDelete,
  onDownload,
  loading = false,
  emptyMessage = "No datasets found. Upload a dataset or copy from templates.",
  hidePagination = false,
}) => {
  const sortComparator = useCallback((a: DatasetRow, b: DatasetRow, key: string): number => {
    let aValue: string | number;
    let bValue: string | number;

    switch (key) {
      case "name":
        aValue = a.name.toLowerCase();
        bValue = b.name.toLowerCase();
        break;
      case "promptCount":
        aValue = a.metadata?.promptCount ?? 0;
        bValue = b.metadata?.promptCount ?? 0;
        break;
      case "useCase":
        aValue = (a.useCase || "").toLowerCase();
        bValue = (b.useCase || "").toLowerCase();
        break;
      case "type":
        aValue = (a.type || "").toLowerCase();
        bValue = (b.type || "").toLowerCase();
        break;
      case "difficulty": {
        const getDifficultyValue = (diff?: string) => {
          if (!diff) return 0;
          const lower = diff.toLowerCase();
          if (lower.includes("hard")) return 3;
          if (lower.includes("medium")) return 2;
          if (lower.includes("easy")) return 1;
          return 0;
        };
        aValue = getDifficultyValue(a.metadata?.avgDifficulty);
        bValue = getDifficultyValue(b.metadata?.avgDifficulty);
        break;
      }
      case "createdAt":
        aValue = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        bValue = b.createdAt ? new Date(b.createdAt).getTime() : 0;
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
  }, []);

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
    storageKey: "datasets",
    defaultSortColumn: "createdAt",
    sortComparator,
  });

  return (
    <TableContainer>
      <Table sx={{ ...singleTheme.tableStyles.primary.frame }}>
        <StandardTableHead
          columns={columns}
          sortConfig={sortConfig}
          onSort={handleSort}
        />
        {loading ? (
          <TableBody>
            <TableRow>
              <TableCell colSpan={columns.length} sx={{ textAlign: "center", py: 4 }}>
                <Typography>Loading...</Typography>
              </TableCell>
            </TableRow>
          </TableBody>
        ) : sortedRows.length !== 0 ? (
          <DatasetsTableBody
            rows={sortedRows}
            page={hidePagination ? 0 : validPage}
            rowsPerPage={hidePagination ? sortedRows.length : rowsPerPage}
            onRowClick={onRowClick}
            onView={onView}
            onEdit={onEdit}
            onDelete={onDelete}
            onDownload={onDownload}
          />
        ) : (
          <TableBody>
            <TableRow>
              <TableCell colSpan={columns.length} sx={{ border: "none", p: 0 }}>
                <EmptyState icon={Database} message={emptyMessage}>
                  <EmptyStateTip
                    icon={Upload}
                    title="Upload evaluation data"
                    description="Upload CSV or JSONL files containing prompts and expected responses. These are used to evaluate model performance across experiments."
                  />
                  <EmptyStateTip
                    icon={FileText}
                    title="Structure your datasets"
                    description="Each dataset should have a clear prompt column and an expected output column. Add metadata columns for filtering results later."
                  />
                  <EmptyStateTip
                    icon={ClipboardCheck}
                    title="Reuse across experiments"
                    description="Once uploaded, datasets can be used across multiple evaluation runs to compare different models or prompt strategies."
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
            entityLabel="dataset"
            colSpan={columns.length}
          />
        )}
      </Table>
    </TableContainer>
  );
};

export default DatasetsTable;
