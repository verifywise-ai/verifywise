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
import { Swords, GitCompare, ListChecks, Trophy } from "lucide-react";
import ArenaTableBody from "./ArenaTableBody";
import StandardTableHead from "../StandardTableHead";
import StandardTablePagination from "../StandardTablePagination";
import { EmptyState } from "../../EmptyState";
import EmptyStateTip from "../../EmptyState/EmptyStateTip";
import { useStandardTable } from "../../../../application/hooks/useStandardTable";
import type { StandardColumn } from "../../../../domain/types/standardTable";

export interface ArenaRow {
  id: string;
  name: string;
  description?: string;
  status: "pending" | "running" | "completed" | "failed";
  contestants: string[] | { name?: string }[];
  winner?: string;
  dataset?: string;
  createdAt: string;
  completedAt?: string;
}

export interface ArenaTableProps {
  rows: ArenaRow[];
  onRowClick?: (row: ArenaRow) => void;
  onViewResults?: (row: ArenaRow) => void;
  onDownload?: (row: ArenaRow) => void;
  onCopy?: (row: ArenaRow) => void;
  onDelete?: (row: ArenaRow) => void;
  loading?: boolean;
  deleting?: string | null;
}

const columns: StandardColumn[] = [
  { id: "name", label: "BATTLE NAME", sortable: true },
  { id: "contestants", label: "CONTESTANTS", sortable: false },
  { id: "dataset", label: "DATASET", sortable: true },
  { id: "winner", label: "WINNER", sortable: true },
  { id: "createdAt", label: "DATE", sortable: true },
  { id: "actions", label: "ACTION", sortable: false },
];

const ArenaTable: React.FC<ArenaTableProps> = ({
  rows,
  onRowClick,
  onViewResults,
  onDownload,
  onCopy,
  onDelete,
  loading = false,
  deleting,
}) => {
  const sortComparator = useCallback((a: ArenaRow, b: ArenaRow, key: string): number => {
    let aValue: string | number;
    let bValue: string | number;

    switch (key) {
      case "name":
        aValue = a.name.toLowerCase();
        bValue = b.name.toLowerCase();
        break;
      case "winner":
        aValue = a.winner || "";
        bValue = b.winner || "";
        break;
      case "dataset":
        aValue = (a.dataset || "").toLowerCase();
        bValue = (b.dataset || "").toLowerCase();
        break;
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
    storageKey: "arena",
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
                <Typography>Loading battles...</Typography>
              </TableCell>
            </TableRow>
          </TableBody>
        ) : sortedRows.length !== 0 ? (
          <ArenaTableBody
            rows={sortedRows}
            page={validPage}
            rowsPerPage={rowsPerPage}
            onRowClick={onRowClick}
            onViewResults={onViewResults}
            onDownload={onDownload}
            onCopy={onCopy}
            onDelete={onDelete}
            deleting={deleting}
          />
        ) : (
          <TableBody>
            <TableRow>
              <TableCell colSpan={columns.length} sx={{ border: "none", p: 0 }}>
                <EmptyState icon={Swords} message="No arena battles found. Create a new battle to get started.">
                  <EmptyStateTip
                    icon={GitCompare}
                    title="What is an arena battle?"
                    description="An arena battle runs the same prompts through two or more models side by side, so you can compare outputs directly."
                  />
                  <EmptyStateTip
                    icon={ListChecks}
                    title="Pick models and scorers"
                    description="Select which models to pit against each other and which scorers to use for grading. Results are shown in a head-to-head view."
                  />
                  <EmptyStateTip
                    icon={Trophy}
                    title="Review and rank"
                    description="After a battle completes, review scored outputs to decide which model performs best for your use case."
                  />
                </EmptyState>
              </TableCell>
            </TableRow>
          </TableBody>
        )}
        <StandardTablePagination
          totalCount={totalCount}
          page={validPage}
          rowsPerPage={rowsPerPage}
          onPageChange={handleChangePage}
          onRowsPerPageChange={handleChangeRowsPerPage}
          getRange={getRange}
          entityLabel="battle"
          colSpan={columns.length}
        />
      </Table>
    </TableContainer>
  );
};

export default ArenaTable;
