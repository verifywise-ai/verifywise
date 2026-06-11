import React from "react";
import { SxProps, Theme } from "@mui/material";
import {
  CustomizableButtonCoreProps,
  FilterButtonCoreProps,
} from "../../domain/types/button.types";

type CustomizableButtonSharedProps = Omit<
  CustomizableButtonCoreProps,
  | "icon"
  | "startIcon"
  | "endIcon"
  | "children"
  | "loadingIndicator"
  | "onClick"
  | "iconOnly"
  | "ariaLabel"
> & {
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
};

/**
 * Presentation adapter for CustomizableButton component.
 * When iconOnly is true, ariaLabel is required for accessibility.
 */
export type CustomizableButtonProps =
  | (CustomizableButtonSharedProps & {
      iconOnly: true;
      ariaLabel: string;
    })
  | (CustomizableButtonSharedProps & {
      iconOnly?: false;
      ariaLabel?: string;
    });

/**
 * Presentation adapter for FilterButton component
 * Extends domain props with MUI-specific styling
 */
export interface FilterButtonProps extends FilterButtonCoreProps {
  /** Additional MUI styles */
  sx?: SxProps<Theme>;
}
