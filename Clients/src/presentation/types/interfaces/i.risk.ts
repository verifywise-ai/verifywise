/**
 * Risk Presentation Types
 * Contains UI-specific risk interfaces with React dependencies
 */
import { ReactNode } from "react";
import { RiskModel } from "../../../domain/models/Common/risks/risk.model";
import type { IFilterState } from "../../../domain/interfaces/i.filterState";

// Re-export domain types for convenience
export type {
  IRisk,
  IRiskLoadingStatus,
  IFrameworkRisksProps,
} from "../../../domain/interfaces/i.risk";

/**
 * Props for risk categories component
 */
export interface IRiskCategoriesProps {
  risks: RiskModel[];
  selectedRisk?: RiskModel | null;
  onRiskSelect?: (risk: RiskModel) => void;
}

/**
 * Props for risk filters component
 */
export interface IRiskFiltersProps {
  risks: RiskModel[];
  onFilterChange: (filteredRisks: RiskModel[], activeFilters: IFilterState) => void;
}

/**
 * Props for risk heat map component
 */
export interface IRiskHeatMapProps {
  risks: RiskModel[];
  onRiskSelect?: (risk: RiskModel) => void;
  selectedRisk?: RiskModel | null;
}

/**
 * Props for risk timeline component
 */
export interface IRiskTimelineProps {
  risks: RiskModel[];
  selectedRisk?: RiskModel | null;
  onRiskSelect?: (risk: RiskModel) => void;
}

/**
 * Props for risk visualization tabs component
 */
export interface IRiskVisualizationTabsProps {
  risks: RiskModel[];
  selectedRisk?: RiskModel | null;
  onRiskSelect?: (risk: RiskModel) => void;
}

/**
 * Props for project risks table component
 * Contains React.Dispatch for state management
 */
export interface IVWProjectRisksTable {
  rows: RiskModel[];
  setSelectedRow: (risk: RiskModel) => void;
  setAnchor: React.Dispatch<React.SetStateAction<HTMLElement | null>>;
  onDeleteRisk: (id: number) => void;
  setPage: (pageNo: number) => void;
  page: number;
  flashRow: number | null;
  hidePagination?: boolean;
  visibleColumns?: Set<string>;
  /** Whether the current user can run bulk actions (Admin/Editor). Defaults to false. */
  canRunBulkActions?: boolean;
  /** Called after a successful bulk action so the parent can refetch and surface a notification. */
  onBulkActionSuccess?: (action: "set_owner" | "set_category" | "archive", count: number) => void;
}

/**
 * Props for project risks table row component
 * Contains React.Dispatch for state management
 */
export interface IVWProjectRisksTableRow {
  rows: RiskModel[];
  page: number;
  rowsPerPage: number;
  setSelectedRow: (risk: RiskModel) => void;
  setAnchor: React.Dispatch<React.SetStateAction<HTMLElement | null>>;
  onDeleteRisk: (id: number) => void;
  flashRow: number | null;
  sortConfig: {
    key: string;
    direction: "asc" | "desc" | null;
  };
  visibleColumns?: Set<string>;
  /** Custom field definitions to render as extra columns. */
  customFieldDefs?: Array<{
    id: number;
    label: string;
    field_type: string;
  }>;
  /** When provided, renders a leading checkbox cell on each row. */
  selection?: {
    isSelected: (id: number) => boolean;
    onToggle: (id: number) => void;
  };
}

/**
 * Props for risks view component
 */
export interface IRisksViewProps {
  // Function to fetch risks - should return Promise<RiskModel[]>
  fetchRisks: (filter?: string) => Promise<RiskModel[]>;
  // Title to display above the risks table
  title: string;
  // Optional header content (e.g., framework toggle)
  headerContent?: ReactNode;
  // Refresh key for forcing re-fetches
  refreshTrigger?: number;
  // When true, hides edit/delete actions and shows guidance to use centralized risk management
  readOnly?: boolean;
}
