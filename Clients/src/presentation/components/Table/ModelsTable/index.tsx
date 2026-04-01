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
import { Cpu, Zap, RefreshCw, Key } from "lucide-react";
import ModelsTableBody from "./ModelsTableBody";
import StandardTableHead from "../StandardTableHead";
import StandardTablePagination from "../StandardTablePagination";
import { EmptyState } from "../../EmptyState";
import EmptyStateTip from "../../EmptyState/EmptyStateTip";
import { useStandardTable } from "../../../../application/hooks/useStandardTable";
import type { StandardColumn } from "../../../../domain/types/standardTable";

export interface ModelRow {
  id: string;
  modelName: string;
  modelProvider: string;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface ModelsTableProps {
  rows: ModelRow[];
  onRowClick?: (model: ModelRow) => void;
  onDelete?: (model: ModelRow) => void;
  loading?: boolean;
}

const columns: StandardColumn[] = [
  { id: "modelName", label: "NAME", sortable: true },
  { id: "modelProvider", label: "PROVIDER", sortable: true },
  { id: "updatedAt", label: "DATE", sortable: true },
  { id: "actions", label: "ACTION", sortable: false },
];

const ModelsTable: React.FC<ModelsTableProps> = ({
  rows,
  onRowClick,
  onDelete,
  loading = false,
}) => {
  const sortComparator = useCallback((a: ModelRow, b: ModelRow, key: string): number => {
    let aValue: string | number;
    let bValue: string | number;

    switch (key) {
      case "modelName":
        aValue = a.modelName.toLowerCase();
        bValue = b.modelName.toLowerCase();
        break;
      case "modelProvider":
        aValue = a.modelProvider.toLowerCase();
        bValue = b.modelProvider.toLowerCase();
        break;
      case "updatedAt":
        aValue = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
        bValue = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
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
    storageKey: "models",
    defaultSortColumn: "updatedAt",
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
          <ModelsTableBody
            rows={sortedRows}
            page={validPage}
            rowsPerPage={rowsPerPage}
            onRowClick={onRowClick}
            onDelete={onDelete}
          />
        ) : (
          <TableBody>
            <TableRow>
              <TableCell colSpan={columns.length} sx={{ border: "none", p: 0 }}>
                <EmptyState icon={Cpu} message="No models found. Model preferences are automatically saved when you run an experiment.">
                  <EmptyStateTip
                    icon={Zap}
                    title="How models get added"
                    description="Models appear here automatically after you run an experiment. Each model's provider, name, and parameters are saved for reuse."
                  />
                  <EmptyStateTip
                    icon={Key}
                    title="Configure API keys first"
                    description="Make sure your API keys are set up in settings before running experiments. Models need valid credentials to generate responses."
                  />
                  <EmptyStateTip
                    icon={RefreshCw}
                    title="Reuse model configurations"
                    description="Once a model appears here, you can select it again in future experiments without re-entering the configuration."
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
          entityLabel="model"
          colSpan={columns.length}
        />
      </Table>
    </TableContainer>
  );
};

export default ModelsTable;
