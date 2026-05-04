import React from "react";
import { SxProps, Theme } from "@mui/material";
import {
  BreadcrumbsCoreProps,
  PageBreadcrumbsCoreProps,
} from "../../domain/types/breadcrumbs.types";

/**
 * Presentation adapter for Breadcrumbs component
 * Extends domain props with MUI-specific styling
 * Overrides unknown types from domain with React.ReactNode
 */
export interface BreadcrumbsProps extends Omit<BreadcrumbsCoreProps, "separator"> {
  /** Custom separator icon (overrides domain unknown type) */
  separator?: React.ReactNode;
  /** Custom styles using MUI's sx prop */
  sx?: SxProps<Theme>;
}

/**
 * Presentation adapter for PageBreadcrumbs component
 * Extends domain props with MUI-specific styling
 */
export interface PageBreadcrumbsProps extends PageBreadcrumbsCoreProps {
  /** Additional styling with proper MUI typing */
  sx?: SxProps<Theme>;
}

/**
 * Presentation adapter for BreadcrumbItem
 * Overrides unknown types from domain with React.ReactNode
 */
export interface BreadcrumbItemPresentation extends Omit<
  import("../../domain/types/breadcrumbs.types").BreadcrumbItem,
  "icon"
> {
  /** Icon to display (overrides domain unknown type) */
  icon?: React.ReactNode;
}
