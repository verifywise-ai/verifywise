/* eslint-disable @typescript-eslint/no-explicit-any */
import React from "react";
import { SelectChangeEvent, SxProps, TextFieldProps, Theme } from "@mui/material";
import {
  AutoCompleteFieldCoreProps,
  DatePickerCoreProps,
  SelectCorProps,
} from "../../domain/types/widget.types";

// Re-export domain types for convenience
export type {
  CloseIconProps,
  AutoCompleteOption,
  AutoCompleteFieldCoreProps,
  DatePickerCoreProps,
  DropDownsProps,
  SelectCorProps,
  IBannerProps,
  IStatusDropdownProps,
  ISearchBoxCorePropsBase,
  IHeatMapCell,
  ITimelineEvent,
  IGenerateReportProps,
  ReportFormat,
  IInputProps,
  IHeaderProps,
} from "../../domain/types/widget.types";

/**
 * Presentation Widget Types
 * Contains UI-specific widget interfaces with React dependencies
 */

// ============================================
// React-dependent interfaces (moved from domain)
// ============================================

/**
 * Settings icon button props for dropdown menu actions
 * Used by IconButton component for edit/delete/download menus
 */
export interface IconButtonProps {
  id: string | number;
  onDelete: () => Promise<boolean> | boolean | void;
  onEdit: () => void;
  warningTitle?: string;
  warningMessage?: string | React.ReactNode;
  type?: string;
  onMouseEvent?: (e: React.SyntheticEvent) => void;
  onMakeVisible?: () => void;
  onDownload?: () => void | Promise<void>;
  isVisible?: boolean;
  canDelete?: boolean;
  checkForRisks?: () => Promise<boolean>;
  onDeleteWithRisks?: (deleteRisks: boolean) => void;
  onView?: () => void;
  openLinkedPolicies?: () => void;
  entityId?: number | string;
  onSendTest?: () => Promise<void>;
  onToggleEnable?: () => Promise<void>;
  // Task-specific props
  isArchived?: boolean;
  onRestore?: () => void;
  onHardDelete?: () => void;
  onLinkedObjects?: () => void;
  hardDeleteWarningTitle?: string;
  hardDeleteWarningMessage?: string | React.ReactNode;
  onDownloadPDF?: () => void | Promise<void>;
  onDownloadDOCX?: () => void | Promise<void>;
  // Virtual folder props
  onAssignToFolder?: () => void;
  // File metadata props
  onPreview?: () => void | Promise<void>;
  onEditMetadata?: () => void | Promise<void>;
  onViewHistory?: () => void;
}

/**
 * Checkbox props matching the actual Checkbox component
 * Uses isChecked/isDisabled naming convention
 */
export interface CheckboxProps {
  id: string;
  label?: string;
  size?: "small" | "medium" | "large";
  isChecked: boolean;
  value: string;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onClick?: (event: React.MouseEvent) => void;
  isDisabled?: boolean;
  sx?: SxProps<Theme>;
}

/**
 * Field props matching the actual Field component
 * All props optional to support flexible component usage
 */
export interface FieldProps {
  id?: string;
  label?: string;
  type?: string;
  value?: string | number;
  onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onInput?: (event: React.FormEvent<HTMLInputElement>) => void;
  onFocus?: (event: React.FocusEvent<HTMLInputElement>) => void;
  onBlur?: (event: React.FocusEvent<HTMLInputElement>) => void;
  onKeyDown?: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  placeholder?: string;
  disabled?: boolean;
  error?: string;
  isRequired?: boolean;
  isOptional?: boolean;
  optionalLabel?: string;
  autoComplete?: string;
  https?: boolean;
  width?: number | string;
  rows?: number;
  helperText?: string;
  InputProps?: TextFieldProps["InputProps"];
  formHelperTextProps?: TextFieldProps["FormHelperTextProps"];
  min?: number;
  max?: number;
  multiline?: boolean;
  minRows?: number;
  sx?: SxProps<Theme>;
}

/**
 * Image field props for file upload with preview
 */
export interface ImageFieldProps {
  id: string;
  src?: string;
  loading?: boolean;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
}

/**
 * Radio button props with React.ChangeEvent
 */
export interface RadioProps {
  id: string;
  label?: string;
  value: string;
  selectedValue: string;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  disabled?: boolean;
}

/**
 * SearchBox props matching the actual SearchBox component
 */
export interface ISearchBoxProps {
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  fullWidth?: boolean;
  inputProps?: Record<string, any>;
  sx?: SxProps<Theme>;
}

/**
 * Protected route props
 * Uses Component prop pattern for route protection
 */
export interface IProtectedRouteProps {
  Component: React.ComponentType<any>;
  [key: string]: any; // Allow rest props to be passed through
}

/**
 * Popup props for modal-like popup component
 */
export interface IPopupProps {
  popupId: string;
  popupContent: React.ReactNode;
  openPopupButtonName: string;
  popupTitle: string;
  popupSubtitle?: string;
  handleOpenOrClose: (event: any) => void;
  anchor: HTMLElement | null;
}

// ============================================
// MUI-extended presentation props
// ============================================

export interface AutoCompleteFieldProps extends AutoCompleteFieldCoreProps {
  sx?: SxProps<Theme>;
}

export interface DatePickerProps extends DatePickerCoreProps {
  sx?: object;
}

export interface SelectProps extends SelectCorProps {
  onChange: (
    event: SelectChangeEvent<string | number>,
    child: React.ReactNode
  ) => void;
  sx?: object;
}
