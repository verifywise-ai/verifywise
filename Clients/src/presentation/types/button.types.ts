import React from "react";
import { SxProps, Theme } from "@mui/material";
import {
  CustomizableButtonCoreProps,
  FilterButtonCoreProps,
} from "../../domain/types/button.types";

/**
 * Presentation adapter for CustomizableButton component
 * Extends domain props with MUI-specific styling
 * Overrides unknown types from domain with React.ReactNode
 */
export interface CustomizableButtonProps extends Omit<
  CustomizableButtonCoreProps,
  "icon" | "startIcon" | "endIcon" | "children" | "loadingIndicator" | "onClick"
> {
  /** Icon element (overrides domain unknown type) */
  icon?: React.ReactNode;
  /** Icon to display at the start of the button */
  startIcon?: React.ReactNode;
  /** Icon to display at the end of the button */
  endIcon?: React.ReactNode;
  /** Button content */
  children?: React.ReactNode;
  /** Custom loading indicator */
  loadingIndicator?: React.ReactNode;
  /** Click event handler (overrides domain unknown type) */
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  /** Custom styles using MUI's sx prop */
  sx?: SxProps<Theme>;
}

/**
 * Presentation adapter for FilterButton component
 * Extends domain props with MUI-specific styling
 */
export interface FilterButtonProps extends FilterButtonCoreProps {
  /** Additional MUI styles */
  sx?: SxProps<Theme>;
}
