import { DatasetStatus, DatasetType, DataClassification } from "../enums/dataset.enum";
import { IModelInventory } from "./i.modelInventory";

export interface IDataset {
  id?: number;
  name: string;
  description: string;
  version: string;
  owner: string;
  /** Nullable in the datasets table — a row can be saved without a type. */
  type: DatasetType | null;
  function: string;
  source: string;
  license?: string;
  format?: string;
  /** Nullable in the datasets table — a row can be saved without one. */
  classification: DataClassification | null;
  contains_pii: boolean;
  pii_types?: string;
  status: DatasetStatus;
  status_date: Date | string;
  known_biases?: string;
  bias_mitigation?: string;
  collection_method?: string;
  preprocessing_steps?: string;
  documentation_data?: DocumentationFile[];
  is_demo?: boolean;
  models?: number[];
  projects?: number[];
  created_at?: Date | string;
  updated_at?: Date | string;
}

export interface DocumentationFile {
  id: number;
  filename: string;
  size: number;
  mimetype: string;
  upload_date: string;
  uploaded_by: number;
}

export interface DatasetSummary {
  draft: number;
  active: number;
  deprecated: number;
  archived: number;
  total: number;
}

export interface DatasetTableProps {
  data: IDataset[];
  isLoading?: boolean;
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
  paginated?: boolean;
  deletingId?: string | null;
  hidePagination?: boolean;
  flashRowId?: number | string | null;
  visibleColumns?: Set<string>;
}

export interface NewDatasetFormValues {
  name: string;
  description: string;
  version: string;
  owner: string;
  /** Null until the user picks one — the column is nullable. */
  type: DatasetType | null;
  function: string;
  source: string;
  license: string;
  format: string;
  /** Null until the user picks one — the column is nullable. */
  classification: DataClassification | null;
  contains_pii: boolean;
  pii_types: string;
  status: DatasetStatus;
  status_date: string;
  known_biases: string;
  bias_mitigation: string;
  collection_method: string;
  preprocessing_steps: string;
  models: number[];
  projects: number[];
}

export interface NewDatasetFormErrors {
  name?: string;
  description?: string;
  version?: string;
  owner?: string;
  type?: string;
  function?: string;
  source?: string;
  classification?: string;
  status?: string;
  status_date?: string;
}

export interface NewDatasetProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  onSuccess?: (data: NewDatasetFormValues) => void;
  onError?: (error: unknown) => void;
  initialData?: NewDatasetFormValues;
  isEdit?: boolean;
  modelInventoryData?: IModelInventory[];
  /** Entity ID for change history tracking (edit mode only) */
  entityId?: number;
}
