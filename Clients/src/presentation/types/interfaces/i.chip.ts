import React from "react";

/**
 * Chip component variant types
 */
export type ChipVariant =
  // Risk levels
  | "critical"
  | "high"
  | "medium"
  | "low"
  | "very-low"
  // Status
  | "success"
  | "warning"
  | "error"
  | "info"
  | "default"
  // Severity
  | "catastrophic"
  | "major"
  | "moderate"
  | "minor"
  | "negligible"
  // Boolean
  | "yes"
  | "no";

/**
 * Chip component size options
 */
export type ChipSize = "small" | "medium";

/**
 * Props interface for the unified Chip component
 */
export interface IChipProps {
  /** Text to display in the chip */
  label: string;
  /** Predefined color variant */
  variant?: ChipVariant;
  /** Size of the chip: "small" (24px) or "medium" (34px) */
  size?: ChipSize;
  /** Whether to display text in uppercase (default: true) */
  uppercase?: boolean;
  /** Custom background color (overrides variant) */
  backgroundColor?: string;
  /** Custom text color (overrides variant) */
  textColor?: string;
  /** Optional icon to display before the label */
  icon?: React.ReactNode;
}

/**
 * Color configuration for chip variants
 */
export interface ChipColorConfig {
  backgroundColor: string;
  textColor: string;
}
