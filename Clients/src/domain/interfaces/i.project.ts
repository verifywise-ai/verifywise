import { Assessments, Controls } from "../types/projectStatus.types";
import { Project } from "../types/Project";
import { ProjectRiskMitigation } from "../types/ProjectRisk";

/**
 * Props for project list component
 * Pure domain type with no framework dependencies
 *
 * Note: newProjectButton type uses 'unknown' to avoid React dependencies.
 * Presentation layer will handle React-specific type casting.
 */
export interface IProjectListProps {
  projects: Project[];
  newProjectButton?: unknown;
  isLoading?: boolean;
  onFilterChange?: (filteredProjects: Project[], filters: any) => void;
  onProjectDeleted?: () => void;
  /** Live use cases nobody confirmed within the "still live?" interval (#5187). */
  staleIds?: Set<number>;
  /** Shown when `projects` is empty but use cases exist in other lifecycle tabs. */
  emptyMessage?: string;
  /** Rendered between the toolbar and the list, e.g. lifecycle tabs. */
  header?: unknown;
}

export interface IProjectTableViewProps {
  projects: Project[];
  hidePagination?: boolean;
  onProjectDeleted?: () => void;
  visibleColumns?: Set<string>;
  /**
   * Shown instead of the "no use cases yet" guidance when the list is empty
   * because a search or filter hid every row, not because none exist.
   */
  emptyMessage?: string;
  /** Live use cases nobody confirmed within the "still live?" interval (#5187). */
  staleIds?: Set<number>;
}

export interface IProjectRiskMitigationProps {
  onClose: () => void;
  annexCategories: ProjectRiskMitigation[];
  subClauses: ProjectRiskMitigation[];
  assessments: ProjectRiskMitigation[];
  controls: ProjectRiskMitigation[];
  annexControls_27001: ProjectRiskMitigation[];
  subClauses_27001: ProjectRiskMitigation[];
}

export interface IProjectCardProps {
  id: number;
  uc_id?: string;
  project_title: string;
  owner: string;
  assessments: Assessments;
  controls: Controls;
  last_updated: string;
}
