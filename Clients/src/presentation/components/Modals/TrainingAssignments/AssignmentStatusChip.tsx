import type { FC } from "react";
import Chip from "../../Chip";
import type { ChipVariant } from "../../../types/interfaces/i.chip";
import type { TrainingAssignmentStatus } from "../../../../application/repository/trainingAssignment.repository";

export const TRAINING_ASSIGNMENT_SAVE_ERROR = "The change could not be saved. Please try again.";

const STATUS_CHIPS: Record<TrainingAssignmentStatus, { label: string; variant: ChipVariant }> = {
  pending: { label: "Pending", variant: "warning" },
  overdue: { label: "Overdue", variant: "error" },
  completed: { label: "Completed", variant: "success" },
};

const AssignmentStatusChip: FC<{ status: TrainingAssignmentStatus }> = ({ status }) => (
  <Chip {...STATUS_CHIPS[status]} uppercase={false} />
);

export default AssignmentStatusChip;
