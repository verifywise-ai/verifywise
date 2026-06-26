/**
 * Core props interface for VWLink component
 * Pure domain types with zero framework dependencies
 */
export interface IVWLinkCoreProps {
  /** The URL to navigate to (optional if onClick is provided) */
  url?: string;
  /** Link text content */
  children: React.ReactNode;
  /** Click handler for button-like behavior (e.g., opening modals) */
  onClick?: (event: React.MouseEvent<HTMLElement>) => void;
  /** If true, opens link in a new tab (default: false) */
  openInNewTab?: boolean;
  /** If true, shows dotted underline (default: true) */
  showUnderline?: boolean;
  /** If true, shows icon on hover for URL links (default: true) */
  showIcon?: boolean;
  /** If true, the external-link icon is always visible (not only on hover) for URL links (default: false) */
  alwaysShowIcon?: boolean;
  /** Custom class name */
  className?: string;
  /** ARIA label for accessibility */
  ariaLabel?: string;
  /** Test identifier for automated testing */
  testId?: string;
}
