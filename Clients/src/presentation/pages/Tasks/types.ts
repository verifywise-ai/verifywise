import { TaskModel } from "../../../domain/models/Common/task/task.model";
import { IUser } from "../../../domain/interfaces/i.user";

// Interface for upcoming task display in dashboard cards
export interface UpcomingTask {
  id: number;
  title: string;
  status: string;
  priority: string;
  due_date: string;
}

// Props for the UpcomingDeadlinesCard component
export interface UpcomingDeadlinesCardProps {
  tasks: UpcomingTask[];
}

// Priority option type for CustomSelect
export interface PriorityOption {
  value: string;
  label: string;
  icon?: React.ComponentType<any>;
  color?: string;
}

// Props for the DeadlineView component
export interface DeadlineViewProps {
  tasks: TaskModel[];
  users: IUser[];
  onArchive: (taskId: number) => void;
  onEdit: (task: TaskModel) => void;
  onStatusChange: (taskId: number) => (newStatus: string) => Promise<boolean>;
  statusOptions: string[];
  onPriorityChange: (taskId: number) => (newPriority: string) => Promise<boolean>;
  priorityOptions: PriorityOption[];
  isUpdateDisabled?: boolean;
  onRowClick?: (task: TaskModel) => void;
  onRestore?: (taskId: number) => void;
  onHardDelete?: (taskId: number) => void;
  flashRowId?: number | null;
}

// Interface for deadline group configuration
export interface DeadlineGroup {
  key: string;
  label: string;
  /** Title colour: red for overdue, amber for due today, primary text otherwise. */
  color: string;
  icon: React.ReactNode;
  tasks: TaskModel[];
}

// Countdown info returned by getCountdownInfo
export interface CountdownInfo {
  label: string;
  variant: "error" | "warning" | "info" | "default";
}
