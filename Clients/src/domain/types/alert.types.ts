/**
 * Alert component types
 * Pure domain types with no framework dependencies
 */

export interface alertState {
  variant: "success" | "info" | "warning" | "error";
  title?: string;
  body: string;
}

export interface AlertCorProps {
  variant: "success" | "info" | "warning" | "error";
  title?: string;
  body: string;
  isToast?: boolean;
  /** Render in the page flow instead of floating top-right. */
  inline?: boolean;
  hasIcon?: boolean;
  onClick?: () => void;
  alertTimeout?: number;
  /** Optional link-style action shown under the body, e.g. "View tools". */
  action?: { label: string; onClick: () => void };
}
