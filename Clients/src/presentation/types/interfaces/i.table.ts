/* eslint-disable @typescript-eslint/no-explicit-any */
import { VendorModel } from "../../../domain/models/Common/vendor/vendor.model";
import { RiskModel } from "../../../domain/models/Common/risks/risk.model";
import { FileModel } from "../../../domain/models/Common/file/file.model";
import { User } from "../../../domain/types/User";
import { VendorRisk } from "../../../domain/types/VendorRisk";
import { ITask } from "../../../domain/interfaces/i.task";
import { IUser } from "../../../domain/interfaces/i.user";
import { EventModel } from "../../../domain/models/Common/evenTracker/eventTracker.model";
import { CustomSelectOptionWithIcon } from "../../../domain/types/widget.types";
import { FileColumn } from "../../../application/hooks/useFileColumnVisibility";
import { ApprovalWorkflowModel } from "src/domain/models/Common/approvalWorkflow/approvalWorkflow.model";
import { TrainingRegistarModel } from "src/domain/models/Common/trainingRegistar/trainingRegistar.model";
import { AIIncidentManagementModel } from "src/domain/models/Common/incidentManagement/incidentManagement.model";

export interface IAITrustCenterTableColumn {
  id: string;
  label: string;
}
export interface IAITrustCenterTableProps<T> {
  data: T[];
  columns: IAITrustCenterTableColumn[];
  isLoading?: boolean;
  paginated?: boolean;
  emptyStateText?: string;
  renderRow: (
    item: T,
    sortConfig?: { key: string; direction: "asc" | "desc" | null }
  ) => React.ReactNode;
  onRowClick?: (item: T) => void;
  tableId?: string;
  disabled?: boolean;
  hidePagination?: boolean;
  flashRowId?: number | string | null;
}

export interface IAuditRiskTableProps {
  risks: number[];
  deletedRisks: number[];
  checkedRows: number[];
  setCheckedRows: (checkedRows: number[]) => void;
}

export type ITypeRisk = {
  id: number;
  title: string;
  status: string;
  severity: string;
};

export interface IAuditRiskTableBodyProps {
  rows: ITypeRisk[];
  page: number;
  setCurrentPagingation: (pageNo: number) => void;
  deletedRisks: number[];
  checkedRows: number[];
  setCheckedRows: (checkedRows: number[]) => void;
}

export interface IEvaluationRow {
  id: string;
  name?: string;
  model: string;
  judge?: string;
  dataset: string;
  prompts?: number;
  date?: string;
  status:
  | "In Progress"
  | "Completed"
  | "Failed"
  | "Pending"
  | "Running"
  | "Available";
}

export interface IEvaluationTableBodyProps {
  rows: IEvaluationRow[];
  page: number;
  rowsPerPage: number;
  onShowDetails: (model: IEvaluationRow) => void;
  onRemoveModel?: {
    onConfirm: (id: string) => void;
  };
  onRerun?: (model: IEvaluationRow) => void;
  onDownload?: (model: IEvaluationRow) => void;
  onCopy?: (model: IEvaluationRow) => void;
}

export interface IEvaluationTableProps {
  columns: string[];
  rows: IEvaluationRow[];
  removeModel?: {
    onConfirm: (id: string) => void; // actually deletes
  };
  page: number;
  setCurrentPagingation: (pageNo: number) => void;
  onShowDetails: (model: IEvaluationRow) => void;
  onRerun?: (model: IEvaluationRow) => void;
  onDownload?: (model: IEvaluationRow) => void;
  onCopy?: (model: IEvaluationRow) => void;
  hidePagination?: boolean;
}

export interface IEventsTableProps {
  data: EventModel[];
  users?: IUser[];
  isLoading?: boolean;
  paginated?: boolean;
}

export interface IColumn {
  id: number;
  name: keyof FileModel | string;
  sx?: object;
}

export interface IFileBasicTableProps {
  data: {
    rows: any[];
    cols: IColumn[];
  };
  bodyData: FileModel[];
  paginated?: boolean;
  table: string;
  onFileDeleted?: (fileId: string) => void | Promise<void>;
  hidePagination?: boolean;
  onAssignToFolder?: (fileId: number) => void;
  onPreview?: (fileId: number | string) => void | Promise<void>;
  onEditMetadata?: (fileId: number | string) => void | Promise<void>;
  onViewHistory?: (fileId: number | string) => void;
  /** Column keys that are visible (for conditional cell rendering) */
  visibleColumnKeys?: FileColumn[];
}

export interface IFileTableProps {
  cols: any[];
  files: FileModel[];
  onFileDeleted?: (fileId: string) => void | Promise<void>;
  hidePagination?: boolean;
  onAssignToFolder?: (fileId: number) => void;
  onPreview?: (fileId: number | string) => void | Promise<void>;
  onEditMetadata?: (fileId: number | string) => void | Promise<void>;
  onViewHistory?: (fileId: number | string) => void;
  /** Column keys that are visible (for conditional cell rendering) */
  visibleColumnKeys?: FileColumn[];
}

export interface IProjectRiskTableBodyProps {
  rows: RiskModel[];
  page: number;
  setCurrentPagingation: (pageNo: number) => void;
  currentRisks: number[];
  checkedRows: number[];
  setCheckedRows: (checkedRows: number[]) => void;
  deletedRisks: number[];
  setDeletedRisks: (deletedRisks: number[]) => void;
}

export interface ILinkedRisksTableProps {
  projectRisksGroup: RiskModel[];
  filteredRisksGroup: RiskModel[];
  currentRisks: number[];
  checkedRows: number[];
  setCheckedRows: (checkedRows: number[]) => void;
  deletedRisks: number[];
  setDeletedRisks: (deletedRisks: number[]) => void;
}

export interface LinkedRisksModalProps {
  onClose: () => void;
  currentRisks: number[];
  setSelectecRisks: (selectedRisks: number[]) => void;
  _setDeletedRisks: (deletedRisks: number[]) => void;
  projectId?: number; // Optional project ID to override URL search params
  frameworkId?: number; // Optional framework ID for organizational projects
  isOrganizational?: boolean; // Flag to determine which endpoint to use
}

export interface ITableProps {
  data: {
    rows: any[];
    cols: { id: string; name: string }[];
  };
  bodyData?: any[];
  paginated?: boolean;
  reversed?: boolean;
  table?: string;
  onRowClick?: (id: string) => void;
  label?: string;
  setSelectedRow: (row: any) => void;
  setAnchorEl: (element: HTMLElement | null) => void;
  renderRow?: (
    row: any,
    sortConfig?: { key: string; direction: "asc" | "desc" | null }
  ) => React.ReactNode;
  hidePagination?: boolean;
  flashRowId?: number | string | null;
}

export interface IReportTableProps {
  rows: any[];
  onRemoveReport: (id: number) => void;
  page: number;
  rowsPerPage: number;
  sortConfig?: {
    key: string;
    direction: "asc" | "desc" | null;
  };
  visibleColumns?: Set<string>;
}

export interface IReportTablePropsExtended {
  columns: any[];
  rows: any[];
  removeReport: (id: number) => void;
  page: number;
  setCurrentPagingation: (pageNo: number) => void;
  hidePagination?: boolean;
  visibleColumns?: Set<string>;
}

export interface IRiskTableProps {
  users: User[];
  vendors: VendorModel[];
  vendorRisks: VendorRisk[];
  onDelete: (riskId: number) => void;
  onEdit: (riskId: number) => void;
  isDeletingAllowed?: boolean;
  hidePagination?: boolean;
  visibleColumns?: Set<string>;
}

export interface ITasksTableProps {
  tasks: ITask[];
  users: User[];
  onArchive: (taskId: number) => void;
  onEdit: (task: ITask) => void;
  onStatusChange: (taskId: number) => (newStatus: string) => Promise<boolean>;
  statusOptions: string[];
  isUpdateDisabled?: boolean;
  onRowClick?: (task: ITask) => void;
  hidePagination?: boolean;
  flashRowId?: number | string | null;
  // Task archive/restore/hard delete props
  onRestore?: (taskId: number) => void;
  onHardDelete?: (taskId: number) => void;
  // Priority change props
  onPriorityChange: (taskId: number) => (newPriority: string) => Promise<boolean>;
  priorityOptions: Array<string | CustomSelectOptionWithIcon>;
  /** Optional set of visible column keys, controls which columns are shown */
  visibleColumns?: Set<string>;
}

export interface ITableWithPlaceholderProps {
  vendors: VendorModel[];
  users: User[];
  onDelete: (vendorId?: number) => void;
  onEdit: (vendorId?: number) => void;
  hidePagination?: boolean;
  vendorRisks?: VendorRisk[];
  visibleColumns?: Set<string>;
}

export interface TrainingTableProps {
  data: TrainingRegistarModel[];
  isLoading?: boolean;
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
  paginated?: boolean;
  hidePagination?: boolean;
  visibleColumns?: Set<string>;
}

export interface TrainingTableProps {
  data: TrainingRegistarModel[];
  isLoading?: boolean;
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
  paginated?: boolean;
  hidePagination?: boolean;
  visibleColumns?: Set<string>;
}

export interface IncidentTableProps {
  data: AIIncidentManagementModel[];
  isLoading?: boolean;
  onEdit?: (id: string, mode: string) => void;
  onView?: (id: string, mode: string) => void;
  onArchive?: (id: string, mode: string) => void;
  paginated?: boolean;
  archivedId?: string | null;
  hidePagination?: boolean;
  visibleColumns?: Set<string>;
}
export interface ApprovalWorkflowTableProps {
  data: ApprovalWorkflowModel[];
  isLoading?: boolean;
  onEdit?: (id: string) => void;
  onArchive?: (id: string) => void;
  archivedId?: string | null;
  visibleColumns?: Set<string>;
}