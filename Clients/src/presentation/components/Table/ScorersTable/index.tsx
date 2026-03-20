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
import { Gauge, Ruler, Settings2, BarChart3 } from "lucide-react";
import ScorersTableBody from "./ScorersTableBody";
import StandardTableHead from "../StandardTableHead";
import StandardTablePagination from "../StandardTablePagination";
import { EmptyState } from "../../EmptyState";
import EmptyStateTip from "../../EmptyState/EmptyStateTip";
import { useStandardTable } from "../../../../application/hooks/useStandardTable";
import type { StandardColumn } from "../../../../domain/types/standardTable";

export interface ScorerRow {
  id: string;
  name: string;
  type: string;
  metricKey: string;
  enabled: boolean;
  defaultThreshold?: number | null;
  config?: {
    judgeModel?: string | { name?: string; provider?: string; params?: Record<string, unknown> };
    model?: string | { name?: string };
    choiceScores?: Array<{ label: string; score: number }>;
    [key: string]: unknown;
  };
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface ScorersTableProps {
  rows: ScorerRow[];
  onRowClick?: (scorer: ScorerRow) => void;
  onEdit?: (scorer: ScorerRow) => void;
  onDelete?: (scorer: ScorerRow) => void;
  loading?: boolean;
}

const columns: StandardColumn[] = [
  { id: "name", label: "SCORER", sortable: true },
  { id: "model", label: "MODEL", sortable: true },
  { id: "threshold", label: "THRESHOLD", sortable: true },
  { id: "choiceScores", label: "# CHOICE SCORES", sortable: true },
  { id: "createdAt", label: "DATE", sortable: true },
  { id: "actions", label: "ACTION", sortable: false },
];

const getModelName = (scorer: ScorerRow): string => {
  if (typeof scorer.config?.judgeModel === "string") {
    return scorer.config.judgeModel;
  }
  if (typeof scorer.config?.judgeModel === "object" && scorer.config.judgeModel?.name) {
    return scorer.config.judgeModel.name;
  }
  if (typeof scorer.config?.model === "string") {
    return scorer.config.model;
  }
  if (typeof scorer.config?.model === "object" && scorer.config.model?.name) {
    return scorer.config.model.name;
  }
  return scorer.metricKey || "Scorer";
};

const ScorersTable: React.FC<ScorersTableProps> = ({
  rows,
  onRowClick,
  onEdit,
  onDelete,
  loading = false,
}) => {
  const sortComparator = useCallback((a: ScorerRow, b: ScorerRow, key: string): number => {
    let aValue: string | number;
    let bValue: string | number;

    switch (key) {
      case "name":
        aValue = a.name.toLowerCase();
        bValue = b.name.toLowerCase();
        break;
      case "model":
        aValue = getModelName(a).toLowerCase();
        bValue = getModelName(b).toLowerCase();
        break;
      case "threshold":
        aValue = a.defaultThreshold ?? 0;
        bValue = b.defaultThreshold ?? 0;
        break;
      case "choiceScores":
        aValue = a.config?.choiceScores?.length ?? 0;
        bValue = b.config?.choiceScores?.length ?? 0;
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
    storageKey: "scorers",
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
          <ScorersTableBody
            rows={sortedRows}
            page={validPage}
            rowsPerPage={rowsPerPage}
            onRowClick={onRowClick}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ) : (
          <TableBody>
            <TableRow>
              <TableCell colSpan={columns.length} sx={{ border: "none", p: 0 }}>
                <EmptyState icon={Gauge} message="No scorers found. Create a scorer to get started.">
                  <EmptyStateTip
                    icon={Ruler}
                    title="What is a scorer?"
                    description="A scorer defines how model outputs are graded. It can check for accuracy, relevance, tone, safety, or any custom criteria you set."
                  />
                  <EmptyStateTip
                    icon={Settings2}
                    title="Built-in and custom scorers"
                    description="Use pre-built scorers for common checks like exact match or similarity, or write your own scoring logic for domain-specific needs."
                  />
                  <EmptyStateTip
                    icon={BarChart3}
                    title="Compare across runs"
                    description="Apply the same scorers across different experiments to track how model quality changes over time or between configurations."
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
          entityLabel="scorer"
          colSpan={columns.length}
        />
      </Table>
    </TableContainer>
  );
};

export default ScorersTable;
