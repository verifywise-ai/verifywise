/**
 * Risk Presentation Types
 * Contains UI-specific risk interfaces with React dependencies
 */
import { ReactNode } from "react";
import { RiskModel } from "../../../domain/models/Common/risks/risk.model";
import type { IFilterState } from "../../../domain/interfaces/i.filterState";

// Re-export domain types for convenience
export type { IRisk, IRiskLoadingStatus, IFrameworkRisksProps } from "../../../domain/interfaces/i.risk";

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
  onFilterChange: (
    filteredRisks: RiskModel[],
    activeFilters: IFilterState
  ) => void;
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
}
