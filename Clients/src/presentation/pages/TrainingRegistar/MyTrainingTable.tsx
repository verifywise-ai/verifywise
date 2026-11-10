import type { FC } from "react";
import { Stack, Table, TableBody, TableCell, TableContainer, TableRow } from "@mui/material";
import { GraduationCap } from "lucide-react";
import Alert from "../../components/Alert";
import { CustomizableButton } from "../../components/button/customizable-button";
import { EmptyState } from "../../components/EmptyState";
import ListStateWrapper from "../../components/ListStateWrapper";
import AssignmentStatusChip, {
  TRAINING_ASSIGNMENT_SAVE_ERROR,
} from "../../components/Modals/TrainingAssignments/AssignmentStatusChip";
import StandardTableHead from "../../components/Table/StandardTableHead";
import StandardTablePagination from "../../components/Table/StandardTablePagination";
import { TableEmptyStateLayout } from "../../components/Table/TableEmptyStateLayout";
import singleTheme from "../../themes/v1SingleTheme";
import useFormattedDate from "../../../application/hooks/useFormattedDate";
import { useStandardTable } from "../../../application/hooks/useStandardTable";
import {
  useCompleteTrainingAssignment,
  useMyTrainingAssignments,
  useReopenTrainingAssignment,
} from "../../../application/hooks/useTrainingAssignments";
import type { MyTrainingAssignment } from "../../../application/repository/trainingAssignment.repository";
import type { StandardColumn } from "../../../domain/types/standardTable";

const COLUMNS: StandardColumn[] = [
  { id: "training", label: "TRAINING", sortable: false },
  { id: "provider", label: "PROVIDER", sortable: false },
  { id: "duration", label: "DURATION", sortable: false },
  { id: "due_date", label: "DUE DATE", sortable: false },
  { id: "status", label: "STATUS", sortable: false },
  { id: "action", label: "", sortable: false },
];

const CELL_SX = { ...singleTheme.tableStyles.primary.body.cell, textTransform: "none" };
const NO_ASSIGNMENTS: MyTrainingAssignment[] = [];

// The server already orders the list: open first by due date, then completed.
const keepServerOrder = () => 0;

const MyTrainingTable: FC = () => {
  const formatDate = useFormattedDate();
  const { data, isLoading, isError } = useMyTrainingAssignments();
  const assignments = data ?? NO_ASSIGNMENTS;

  const complete = useCompleteTrainingAssignment();
  const reopen = useReopenTrainingAssignment();
  const isBusy = complete.isPending || reopen.isPending;

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
  } = useStandardTable<MyTrainingAssignment>({
    rows: assignments,
    storageKey: "my-training",
    defaultSortColumn: "",
    defaultSortDirection: null,
    sortComparator: keepServerOrder,
  });

  const handleToggle = (assignment: MyTrainingAssignment) => {
    complete.reset();
    reopen.reset();
    const mutation = assignment.completed_at === null ? complete : reopen;
    mutation.mutate(assignment.id);
  };

  const header = (
    <StandardTableHead columns={COLUMNS} sortConfig={sortConfig} onSort={handleSort} />
  );

  return (
    <Stack sx={{ gap: "16px" }}>
      {(complete.isError || reopen.isError) && (
        <Alert variant="error" body={TRAINING_ASSIGNMENT_SAVE_ERROR} inline />
      )}
      <ListStateWrapper
        items={assignments}
        isLoading={isLoading}
        loadingLabel="Loading your training"
        errorMessage={isError ? "Your training could not be loaded. Please try again." : null}
        emptyState={
          <TableEmptyStateLayout header={header}>
            <EmptyState icon={GraduationCap} message="No training has been assigned to you yet." />
          </TableEmptyStateLayout>
        }
      >
        <TableContainer sx={{ overflowX: "auto" }}>
          <Table sx={singleTheme.tableStyles.primary.frame}>
            {header}
            <TableBody>
              {sortedRows
                .slice(validPage * rowsPerPage, validPage * rowsPerPage + rowsPerPage)
                .map((assignment) => (
                  <TableRow key={assignment.id} data-testid={`my-training-row-${assignment.id}`}>
                    <TableCell sx={CELL_SX}>{assignment.training_name}</TableCell>
                    <TableCell sx={CELL_SX}>{assignment.training_provider}</TableCell>
                    <TableCell sx={CELL_SX}>{assignment.training_duration}</TableCell>
                    <TableCell sx={CELL_SX}>{formatDate(assignment.due_date)}</TableCell>
                    <TableCell sx={CELL_SX}>
                      <AssignmentStatusChip status={assignment.status} />
                    </TableCell>
                    <TableCell sx={CELL_SX}>
                      <CustomizableButton
                        variant="outlined"
                        size="small"
                        text={assignment.completed_at === null ? "Mark complete" : "Reopen"}
                        onClick={() => handleToggle(assignment)}
                        isDisabled={isBusy}
                        testId={`button-my-training-toggle-${assignment.id}`}
                        sx={{ height: "30px", minHeight: "30px" }}
                      />
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
            <StandardTablePagination
              totalCount={totalCount}
              page={validPage}
              rowsPerPage={rowsPerPage}
              onPageChange={handleChangePage}
              onRowsPerPageChange={handleChangeRowsPerPage}
              getRange={getRange}
              entityLabel="training"
              colSpan={COLUMNS.length}
            />
          </Table>
        </TableContainer>
      </ListStateWrapper>
    </Stack>
  );
};

export default MyTrainingTable;
