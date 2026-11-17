import { SxProps, Theme } from "@mui/material";
import {
  text,
  background,
  border as borderPalette,
  radiusPx,
  palette as vwPalette,
} from "../../../themes/palette";

/**
 * Shared styles for Framework Dashboard cards
 * Used across: FrameworkProgressCard, AssignmentStatusCard, StatusBreakdownCard,
 * AnnexOverviewCard, ControlCategoriesCard
 */

export const frameworkDashboardCardStyles = {
  /**
   * Main card container style
   */
  cardContainer: {
    border: `1px solid ${borderPalette.dark}`,
    borderRadius: radiusPx.sm,
    overflow: "hidden",
  } as SxProps<Theme>,

  /**
   * Card header section style
   */
  cardHeader: {
    backgroundColor: vwPalette.background.hover,
    p: "10px 16px",
    borderBottom: `1px solid ${borderPalette.dark}`,
  } as SxProps<Theme>,

  /**
   * Card header title style
   */
  cardHeaderTitle: {
    fontSize: 15,
    fontWeight: 600,
    color: `${text.black}`,
    lineHeight: "16px",
    m: 0,
  } as SxProps<Theme>,

  /**
   * Card content section with gradient background
   */
  cardContentWithGradient: {
    background: `linear-gradient(135deg, ${vwPalette.background.main} 0%, ${vwPalette.background.alt} 100%)`,
    p: "16px",
  } as SxProps<Theme>,

  /**
   * Individual category/item box within cards (for Annex and Control Categories)
   */
  categoryBox: {
    border: `1px solid ${borderPalette.dark}`,
    borderRadius: radiusPx.sm,
    overflow: "hidden",
  } as SxProps<Theme>,

  /**
   * Category box header
   */
  categoryBoxHeader: {
    backgroundColor: vwPalette.background.hover,
    p: "10px 16px",
    borderBottom: `1px solid ${borderPalette.dark}`,
  } as SxProps<Theme>,

  /**
   * Empty state container
   */
  emptyStateContainer: {
    px: 4,
    py: 4,
    backgroundColor: `${background.accent}`,
    borderRadius: 2,
    border: `1px solid ${borderPalette.dark}`,
  } as SxProps<Theme>,
};
