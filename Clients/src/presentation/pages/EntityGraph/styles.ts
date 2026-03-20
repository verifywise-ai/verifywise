import type { CSSProperties } from 'react';
import { SxProps, Theme } from '@mui/material';
import { brand, text, border as borderPalette, status } from "../../themes/palette";

// Design system colors (from CLAUDE.md)
const COLORS = {
  primary: `${brand.primary}`,
  primaryLight: '#f0fdf4',
  border: `${borderPalette.dark}`,
  borderLight: `${status.default.border}`,
  textPrimary: `${text.secondary}`,
  textSecondary: `${text.icon}`,
  textTertiary: `${text.disabled}`,
  background: '#fafafa',
} as const;

// Container styles
export const graphContainerStyle: CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: COLORS.background,
};

// Loading state styles
export const loadingContainerSx: SxProps<Theme> = {
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  alignItems: 'center',
  height: '100vh',
  gap: 2,
};

export const loadingTextSx: SxProps<Theme> = {
  fontSize: 14,
  color: COLORS.textSecondary,
};

export const loadingProgressSx: SxProps<Theme> = {
  width: 300,
  height: 8,
  borderRadius: 4,
  backgroundColor: COLORS.borderLight,
  '& .MuiLinearProgress-bar': {
    backgroundColor: COLORS.primary,
    borderRadius: 4,
  },
};

export const loadingPercentSx: SxProps<Theme> = {
  fontSize: 12,
  color: COLORS.textTertiary,
};

// Error state styles
export const errorContainerSx: SxProps<Theme> = {
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  height: '100vh',
};

// Empty state styles
export const emptyStateContainerSx: SxProps<Theme> = {
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  alignItems: 'center',
  height: 'calc(100vh - 64px)',
  gap: 2,
  backgroundColor: COLORS.background,
};

export const emptyStateTitleSx: SxProps<Theme> = {
  fontSize: 16,
  fontWeight: 600,
  color: COLORS.textPrimary,
};

export const emptyStateDescriptionSx: SxProps<Theme> = {
  fontSize: 13,
  color: COLORS.textSecondary,
  textAlign: 'center',
  maxWidth: 300,
};

// Preparing state styles
export const preparingContainerSx: SxProps<Theme> = {
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  height: 'calc(100vh - 64px)',
  backgroundColor: COLORS.background,
};

export const preparingTextSx: SxProps<Theme> = {
  color: COLORS.textSecondary,
};

// Control panel styles
export const controlPanelSx: SxProps<Theme> = {
  gap: '8px',
  p: '12px',
  backgroundColor: 'white',
  borderRadius: '8px',
  border: `1px solid ${COLORS.border}`,
  boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
  minWidth: 280,
  maxWidth: 320,
};

export const problemsToggleRowSx: SxProps<Theme> = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
};

export const problemsToggleLabelContainerSx: SxProps<Theme> = {
  display: 'flex',
  alignItems: 'center',
  gap: 1,
};

export const problemsToggleLabelSx: SxProps<Theme> = {
  fontSize: 12,
  color: COLORS.textPrimary,
};

export const entityTypesLabelSx: SxProps<Theme> = {
  fontSize: 11,
  fontWeight: 600,
  color: COLORS.textSecondary,
  mb: 1,
};

export const toggleButtonGroupSx: SxProps<Theme> = {
  display: 'flex',
  flexWrap: 'wrap',
  columnGap: '4px',
  rowGap: '8px',
  maxWidth: 220,
  '& .MuiToggleButton-root': {
    border: `1px solid ${COLORS.border}`,
    borderRadius: '4px !important',
    textTransform: 'none',
    fontSize: 11,
    py: 0.5,
    px: 1,
    '&.Mui-selected': {
      backgroundColor: COLORS.primaryLight,
      borderColor: COLORS.primary,
      color: COLORS.primary,
    },
  },
};

export const colorDotSx = (color: string): SxProps<Theme> => ({
  width: 8,
  height: 8,
  borderRadius: '50%',
  backgroundColor: color,
  mr: 0.5,
});

export const statsContainerSx: SxProps<Theme> = {
  pt: '8px',
  borderTop: `1px solid ${COLORS.borderLight}`,
};

export const statsTextSx: SxProps<Theme> = {
  fontSize: 11,
  color: COLORS.textSecondary,
};
