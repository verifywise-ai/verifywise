/**
 * Interface for individual breadcrumb item
 * Pure domain type with no framework dependencies
 *
 * Note: Icon type uses 'unknown' to avoid React dependencies.
 * Presentation layer will handle React-specific type casting.
 */
export interface BreadcrumbItem {
  /** Display label for the breadcrumb */
  label: string;
  /** Navigation path for the breadcrumb */
  path?: string;
  /** Custom click handler */
  onClick?: () => void;
  /** Whether the breadcrumb is disabled */
  disabled?: boolean;
  /** Unique identifier for the breadcrumb */
  id?: string;
  /** Tooltip text for additional context */
  tooltip?: string;
  /** Icon to display next to the breadcrumb label */
  icon?: unknown;
}

/**
 * Props for the Breadcrumbs component
 * Pure domain type with no framework dependencies
 *
 * Note: Separator type uses 'unknown' to avoid React dependencies.
 * Presentation layer will handle React-specific type casting.
 */
export interface BreadcrumbsCoreProps {
  /** Array of breadcrumb items */
  items?: BreadcrumbItem[];
  /** Custom separator icon */
  separator?: unknown;
  /** Maximum number of items to show (collapses middle items) */
  maxItems?: number;
  /** Whether to auto-generate breadcrumbs from current route */
  autoGenerate?: boolean;
  /** Whether to show the current page as the last item */
  showCurrentPage?: boolean;
  /** Custom home label */
  homeLabel?: string;
  /** Custom home path */
  homePath?: string;
  /** Whether to truncate long labels */
  truncateLabels?: boolean;
  /** Maximum length for truncated labels */
  maxLabelLength?: number;
  /** Custom click handler for breadcrumb items */
  onItemClick?: (item: BreadcrumbItem, index: number) => void;
}

/**
 * Props for the PageBreadcrumbs component
 * Pure domain type with no framework dependencies
 */
export interface PageBreadcrumbsCoreProps {
  /** Custom breadcrumb items (overrides auto-generation) */
  items?: BreadcrumbItem[];
  /** Whether to auto-generate breadcrumbs from current route */
  autoGenerate?: boolean;
  /** Custom route mapping (extends the default mapping) */
  customRouteMapping?: Record<string, string>;
  /** Whether to show the current page as the last item */
  showCurrentPage?: boolean;
  /** Custom home label */
  homeLabel?: string;
  /** Custom home path */
  homePath?: string;
  /** Whether to truncate long labels */
  truncateLabels?: boolean;
  /** Maximum length for truncated labels */
  maxLabelLength?: number;
  /** Custom click handler for breadcrumb items */
  onItemClick?: (item: BreadcrumbItem, index: number) => void;
  /** Additional className for custom styling */
  className?: string;
  /** Test identifier for automated testing */
  testId?: string;
  /** Whether to show the divider below breadcrumbs */
  showDivider?: boolean;
}
