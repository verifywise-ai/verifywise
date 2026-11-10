import { useMemo, useState, type FC } from "react";
import { Stack, Table, TableBody, TableCell, TableContainer, TableRow } from "@mui/material";
import dayjs, { type Dayjs } from "dayjs";
import Alert from "../../Alert";
import { CustomizableButton } from "../../button/customizable-button";
import ConfirmationModal from "../../Dialogs/ConfirmationModal";
import AutoCompleteField from "../../Inputs/Autocomplete";
import DatePicker from "../../Inputs/Datepicker";
import ListStateWrapper from "../../ListStateWrapper";
import StandardModal from "../StandardModal";
import StandardTableHead from "../../Table/StandardTableHead";
import singleTheme from "../../../themes/v1SingleTheme";
import allowedRoles from "../../../../application/constants/permissions";
import { useAuth } from "../../../../application/hooks/useAuth";
import useFormattedDate from "../../../../application/hooks/useFormattedDate";
import { useTranslation } from "../../../../application/hooks/useTranslation";
import {
  useCompleteAllTrainingAssignments,
  useCompleteTrainingAssignment,
  useCreateTrainingAssignments,
  useDeleteTrainingAssignment,
  useReopenTrainingAssignment,
  useTrainingAssignments,
  useUpdateTrainingAssignmentDueDate,
} from "../../../../application/hooks/useTrainingAssignments";
import useUsers from "../../../../application/hooks/useUsers";
import type { TrainingAssignment } from "../../../../application/repository/trainingAssignment.repository";
import type { User } from "../../../../domain/types/User";
import type { StandardColumn } from "../../../../domain/types/standardTable";
import AssignmentStatusChip, { TRAINING_ASSIGNMENT_SAVE_ERROR } from "./AssignmentStatusChip";

const API_DATE_FORMAT = "YYYY-MM-DD";
const MAX_PEOPLE_PER_ASSIGNMENT = 500;
const PAST_DATE_ERROR = "Choose today or a later date.";
const TOO_MANY_PEOPLE_ERROR = "You can assign up to 500 people at a time.";

const NO_SORT = { key: "", direction: null };
const ignoreSort = () => undefined;

const BASE_COLUMNS: StandardColumn[] = [
  { id: "name", label: "NAME", sortable: false },
  { id: "due_date", label: "DUE DATE", sortable: false },
  { id: "status", label: "STATUS", sortable: false },
  { id: "completed", label: "COMPLETED", sortable: false },
];
const ACTIONS_COLUMN: StandardColumn = { id: "actions", label: "", sortable: false };

const CONTROL_SX = { height: "30px", minHeight: "30px" };
const CELL_SX = { ...singleTheme.tableStyles.primary.body.cell, textTransform: "none" };

interface AssignmentDueDateProps {
  assignment: TrainingAssignment;
  today: Dayjs;
  isBusy: boolean;
  onSave: (assignment: TrainingAssignment, dueDate: string) => void;
}

const ignoreChange = () => undefined;

/**
 * Changed from the calendar only, so each pick is one final date. The field
 * always shows the stored value, which also covers a failed save.
 */
const AssignmentDueDate: FC<AssignmentDueDateProps> = ({ assignment, today, isBusy, onSave }) => {
  const saved = useMemo(() => dayjs(assignment.due_date), [assignment.due_date]);

  const handleAccept = (value: Dayjs | null) => {
    if (!value?.isValid()) return;
    const dueDate = value.format(API_DATE_FORMAT);
    if (dueDate !== assignment.due_date) onSave(assignment, dueDate);
  };

  return (
    <DatePicker
      id={`training-assignment-due-date-${assignment.id}`}
      date={saved}
      handleDateChange={ignoreChange}
      onAccept={handleAccept}
      isFieldReadOnly
      // A completed row can hold a past date, which is not an error to flag.
      minDate={assignment.status === "completed" ? undefined : today}
      disabled={isBusy}
      sx={{ "width": "150px", "& .MuiPickersOutlinedInput-root": { height: "30px" } }}
    />
  );
};

interface TrainingAssignmentsModalProps {
  isOpen: boolean;
  onClose: () => void;
  trainingId: number;
  trainingName: string;
}

const TrainingAssignmentsModal: FC<TrainingAssignmentsModalProps> = ({
  isOpen,
  onClose,
  trainingId,
  trainingName,
}) => {
  const { userRoleName } = useAuth();
  const { t } = useTranslation();
  const formatDate = useFormattedDate();
  const canEdit = allowedRoles.training.edit.includes(userRoleName);

  const { users, loading: usersLoading, error: usersError } = useUsers();
  const { data, isLoading, isError } = useTrainingAssignments(trainingId);
  const assignments = useMemo(() => data ?? [], [data]);

  const createAssignments = useCreateTrainingAssignments();
  const completeAll = useCompleteAllTrainingAssignments();
  const updateDueDate = useUpdateTrainingAssignmentDueDate();
  const complete = useCompleteTrainingAssignment();
  const reopen = useReopenTrainingAssignment();
  const remove = useDeleteTrainingAssignment();
  const isBusy =
    createAssignments.isPending ||
    completeAll.isPending ||
    updateDueDate.isPending ||
    complete.isPending ||
    reopen.isPending ||
    remove.isPending;

  const today = useMemo(() => dayjs().startOf("day"), []);
  const [people, setPeople] = useState<User[]>([]);
  const [dueDate, setDueDate] = useState<Dayjs | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [skippedNames, setSkippedNames] = useState<string[]>([]);
  const [isConfirmingCompleteAll, setIsConfirmingCompleteAll] = useState(false);
  const [assignmentToRemove, setAssignmentToRemove] = useState<TrainingAssignment | null>(null);

  const options = useMemo(() => {
    const assignedIds = new Set(assignments.map((assignment) => assignment.user_id));
    return users.filter((user) => !assignedIds.has(Number(user.id)));
  }, [users, assignments]);

  let noOptionsText = "Everyone is already assigned";
  if (usersLoading) noOptionsText = "Loading people...";
  else if (usersError) noOptionsText = "People could not be loaded.";
  else if (users.length === 0) noOptionsText = "No people found.";

  const isPastDueDate = Boolean(dueDate?.isValid() && dueDate.isBefore(today, "day"));
  const isDueDateUsable = Boolean(dueDate?.isValid()) && !isPastDueDate;
  const hasTooManyPeople = people.length > MAX_PEOPLE_PER_ASSIGNMENT;
  const canAssign = people.length > 0 && isDueDateUsable && !hasTooManyPeople && !isBusy;
  const hasOpenAssignments = assignments.some((assignment) => assignment.completed_at === null);

  const showSaveError = () => setErrorMessage(TRAINING_ASSIGNMENT_SAVE_ERROR);
  const clearMessages = () => {
    setErrorMessage(null);
    setSkippedNames([]);
  };

  const handleAssign = () => {
    if (!canAssign || !dueDate) return;
    clearMessages();
    createAssignments.mutate(
      {
        training_id: trainingId,
        user_ids: people.map((person) => Number(person.id)),
        due_date: dueDate.format(API_DATE_FORMAT),
      },
      {
        onSuccess: ({ skipped_user_ids: skippedIds }) => {
          setSkippedNames(
            people
              .filter((person) => skippedIds.includes(Number(person.id)))
              .map((person) => `${person.name} ${person.surname}`),
          );
          setPeople([]);
          setDueDate(null);
        },
        onError: showSaveError,
      },
    );
  };

  const handleSaveDueDate = (assignment: TrainingAssignment, nextDueDate: string) => {
    clearMessages();
    updateDueDate.mutate({ id: assignment.id, dueDate: nextDueDate }, { onError: showSaveError });
  };

  const handleToggleComplete = (assignment: TrainingAssignment) => {
    clearMessages();
    const mutation = assignment.completed_at === null ? complete : reopen;
    mutation.mutate(assignment.id, { onError: showSaveError });
  };

  const handleConfirmRemove = () => {
    if (!assignmentToRemove) return;
    clearMessages();
    remove.mutate(assignmentToRemove.id, {
      onError: showSaveError,
      onSettled: () => setAssignmentToRemove(null),
    });
  };

  const handleConfirmCompleteAll = () => {
    clearMessages();
    completeAll.mutate(trainingId, {
      onError: showSaveError,
      onSettled: () => setIsConfirmingCompleteAll(false),
    });
  };

  const columns = canEdit ? [...BASE_COLUMNS, ACTIONS_COLUMN] : BASE_COLUMNS;

  return (
    <StandardModal
      isOpen={isOpen}
      onClose={onClose}
      title={trainingName}
      description={
        canEdit
          ? "Assign this training to people and track who has completed it."
          : "See who this training is assigned to and who has completed it."
      }
      cancelButtonText="Close"
      hideSubmitButton
      maxWidth="1000px"
      expandedHeight
    >
      <Stack sx={{ gap: "16px" }}>
        {errorMessage && <Alert variant="error" body={errorMessage} inline />}
        {skippedNames.length > 0 && (
          <Alert
            variant="info"
            body={t("Already assigned, so skipped: {names}").replace("{names}", () =>
              skippedNames.join(", "),
            )}
            inline
          />
        )}

        {canEdit && (
          <Stack sx={{ gap: "16px" }}>
            <AutoCompleteField<User, true>
              id="training-assignment-people"
              data-testid="autocomplete-training-assignment-people"
              label="People"
              placeholder="Select people"
              isRequired
              multiple
              disableCloseOnSelect
              options={options}
              value={people}
              onChange={(_event, value) => setPeople(value)}
              getOptionLabel={(user) => `${user.name} ${user.surname}`}
              isOptionEqualToValue={(option, value) => option.id === value.id}
              noOptionsText={noOptionsText}
              error={hasTooManyPeople ? TOO_MANY_PEOPLE_ERROR : undefined}
            />
            <Stack direction="row" sx={{ gap: "8px", alignItems: "flex-start" }}>
              <DatePicker
                id="training-assignment-due-date"
                label="Due date"
                isRequired
                date={dueDate}
                handleDateChange={setDueDate}
                minDate={today}
                error={isPastDueDate ? PAST_DATE_ERROR : undefined}
                sx={{ width: "200px" }}
              />
              <CustomizableButton
                variant="contained"
                text="Assign"
                onClick={handleAssign}
                isDisabled={!canAssign}
                loading={createAssignments.isPending}
                testId="button-training-assignment-assign"
                // Lines the button up with the date field, below its 22px label and gap.
                sx={{ ...CONTROL_SX, marginTop: "30px" }}
              />
            </Stack>
          </Stack>
        )}

        {canEdit && hasOpenAssignments && (
          <Stack direction="row" sx={{ justifyContent: "flex-end" }}>
            <CustomizableButton
              variant="outlined"
              text="Mark all complete"
              onClick={() => setIsConfirmingCompleteAll(true)}
              isDisabled={isBusy}
              testId="button-training-assignment-complete-all"
              sx={CONTROL_SX}
            />
          </Stack>
        )}

        <ListStateWrapper
          items={assignments}
          isLoading={isLoading}
          loadingHeight={120}
          loadingLabel="Loading assignments"
          errorMessage={isError ? "Assignments could not be loaded. Please try again." : null}
          emptyState={
            <Alert variant="info" body="Nobody is assigned to this training yet." inline />
          }
        >
          <TableContainer sx={{ overflowX: "auto" }}>
            <Table sx={singleTheme.tableStyles.primary.frame}>
              <StandardTableHead columns={columns} sortConfig={NO_SORT} onSort={ignoreSort} />
              <TableBody>
                {assignments.map((assignment) => {
                  const isCompleted = assignment.completed_at !== null;
                  return (
                    <TableRow
                      key={assignment.id}
                      data-testid={`training-assignment-row-${assignment.id}`}
                    >
                      <TableCell sx={CELL_SX}>
                        {assignment.user_name} {assignment.user_surname}
                      </TableCell>
                      <TableCell sx={CELL_SX}>
                        {canEdit ? (
                          <AssignmentDueDate
                            // A new saved date remounts the field with a fresh draft.
                            key={assignment.due_date}
                            assignment={assignment}
                            today={today}
                            isBusy={isBusy}
                            onSave={handleSaveDueDate}
                          />
                        ) : (
                          formatDate(assignment.due_date)
                        )}
                      </TableCell>
                      <TableCell sx={CELL_SX}>
                        <AssignmentStatusChip status={assignment.status} />
                      </TableCell>
                      <TableCell sx={CELL_SX}>
                        {assignment.completed_at ? formatDate(assignment.completed_at) : "-"}
                      </TableCell>
                      {canEdit && (
                        <TableCell sx={CELL_SX}>
                          <Stack direction="row" sx={{ gap: "8px" }}>
                            <CustomizableButton
                              variant="outlined"
                              size="small"
                              text={isCompleted ? "Reopen" : "Mark complete"}
                              onClick={() => handleToggleComplete(assignment)}
                              isDisabled={isBusy}
                              testId={`button-training-assignment-toggle-${assignment.id}`}
                              sx={CONTROL_SX}
                            />
                            <CustomizableButton
                              variant="text"
                              size="small"
                              text="Remove"
                              onClick={() => setAssignmentToRemove(assignment)}
                              isDisabled={isBusy}
                              testId={`button-training-assignment-remove-${assignment.id}`}
                              sx={CONTROL_SX}
                            />
                          </Stack>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </ListStateWrapper>
      </Stack>

      <ConfirmationModal
        isOpen={isConfirmingCompleteAll}
        title="Mark all complete?"
        body="Every open assignment for this training will be marked complete."
        cancelText="Cancel"
        proceedText="Mark all complete"
        proceedButtonVariant="contained"
        onCancel={() => setIsConfirmingCompleteAll(false)}
        onProceed={handleConfirmCompleteAll}
        isLoading={completeAll.isPending}
      />

      <ConfirmationModal
        isOpen={assignmentToRemove !== null}
        title="Remove this assignment?"
        body="The assignment and its completion record will be deleted."
        cancelText="Cancel"
        proceedText="Remove"
        proceedButtonVariant="contained"
        onCancel={() => setAssignmentToRemove(null)}
        onProceed={handleConfirmRemove}
        isLoading={remove.isPending}
      />
    </StandardModal>
  );
};

export default TrainingAssignmentsModal;
