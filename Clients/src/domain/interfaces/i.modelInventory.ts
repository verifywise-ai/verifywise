import { ModelInventoryStatus } from "../enums/modelInventory.enum";
import { IModelRisk } from "./i.modelRisk";
import { User } from "../types/User";
import { EvidenceHubModel } from "../models/Common/evidenceHub/evidenceHub.model";

export interface IModelInventory {
  id?: number;
  provider_model?: string; // Keep for backward compatibility during transition
  provider: string;
  model: string;
  version?: string;
  approver?: number;
  capabilities: string[];
  security_assessment: boolean;
  status: ModelInventoryStatus;
  status_date: Date;
  reference_link?: string;
  biases?: string;
  limitations?: string;
  hosting_provider?: string;
  projects: number[];
  frameworks: number[];
  is_demo?: boolean;
  created_at?: Date;
  updated_at?: Date;
  // New field for file uploads
  security_assessment_data?: FileResponse[]; // optional array to store multiple files
}

export interface FileResponse {
    id: number;
    filename: string;
    size: number;
    mimetype: string;
    upload_date: string;
    uploaded_by: number;
    modelId?: string; // optional
}

export interface ModelInventorySummary {
  approved: number;
  restricted: number;
  pending: number;
  blocked: number;
  total: number;
}

export interface MLFlowModel {
  id: string;
  model_name: string;
  version: string;
  lifecycle_stage: string;
  creation_timestamp: number;
  last_updated_timestamp: number;
  description?: string;
  run_id?: string;
  source?: string;
  status?: string;
  tags?: Record<string, string>;
  metrics?: Record<string, number>;
  parameters?: Record<string, string>;
  experiment_id?: string;
  experiment_name?: string;
  artifact_location?: string;
}

export interface ModelInventoryTableProps {
  data: IModelInventory[];
  isLoading?: boolean;
  onEdit?: (id: string) => void;
  onDelete?: (id: string, deleteRisks?: boolean) => void;
  onCheckModelHasRisks?: (id: string) => Promise<boolean>;
  onViewDetails?: (id: string) => void;
  paginated?: boolean;
  deletingId?: string | null;
  hidePagination?: boolean;
  modelRisks?: IModelRisk[];
  flashRowId?: number | string | null;
  visibleColumns?: Set<string>;
}

export interface ModelRisksTableProps {
  data: IModelRisk[];
  isLoading: boolean;
  onEdit: (riskId: number) => void;
  onDelete: (riskId: number) => void;
  deletingId?: number | null;
  users?: User[];
  models?: IModelInventory[];
  hidePagination?: boolean;
  visibleColumns?: Set<string>;
}

export interface EvidenceHubTableProps {
  data: EvidenceHubModel[];
  isLoading?: boolean;
  onEdit?: (id: number) => void;
  onDelete?: (id: number) => void;
  paginated?: boolean;
  deletingId?: number | null;
  modelInventoryData: IModelInventory[];
  hidePagination?: boolean;
  visibleColumns?: Set<string>;
}

export interface ModelRiskSummaryProps {
  modelRisks: IModelRisk[];
  onCardClick?: (riskLevelKey: string) => void;
  selectedRiskLevel?: string | null;
}