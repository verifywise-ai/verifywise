import { SxProps, Theme } from "@mui/material";

/**
 * Shared styles for the Model risk management sub-tabs. Uses design tokens
 * (theme.palette.border.dark = #d0d5dd, theme.palette.border.light = #eaecf0,
 * radius 4px, 13px text, pixel-string spacing) per Clients/CLAUDE.md.
 *
 * Note: sx object literals in style files cannot call useTheme(). The border
 * tokens are accessed via theme callback form `(theme) => ({ ... })` using the
 * SxProps<Theme> signature so MUI resolves them at render time.
 */

export const mrmTableContainerStyle: SxProps<Theme> = (theme) => ({
  border: `1px solid ${theme.palette.border.dark}`,
  borderRadius: "4px",
  overflow: "hidden",
});

export const mrmTableHeadCellStyle: SxProps<Theme> = (theme) => ({
  fontSize: "13px",
  fontWeight: 600,
  color: "text.secondary",
  backgroundColor: "background.accent",
  borderBottom: `1px solid ${theme.palette.border.dark}`,
  padding: "10px 16px",
  whiteSpace: "nowrap",
});

export const mrmTableCellStyle: SxProps<Theme> = (theme) => ({
  fontSize: "13px",
  color: "text.primary",
  borderBottom: `1px solid ${theme.palette.border.light}`,
  padding: "10px 16px",
  verticalAlign: "top",
});

export const mrmSectionIntroStyle: SxProps<Theme> = {
  fontSize: "13px",
  color: "text.secondary",
  lineHeight: 1.6,
  marginBottom: "16px",
};

export const mrmPipelineStyle: SxProps<Theme> = {
  display: "flex",
  flexWrap: "wrap",
  gap: "8px",
  marginBottom: "16px",
};

export const mrmPipelineItemStyle: SxProps<Theme> = (theme) => ({
  display: "flex",
  alignItems: "center",
  gap: "8px",
  border: `1px solid ${theme.palette.border.dark}`,
  borderRadius: "4px",
  padding: "8px 12px",
  fontSize: "13px",
  color: "text.secondary",
});

export const mrmPipelineCountStyle: SxProps<Theme> = {
  fontSize: "15px",
  fontWeight: 600,
  color: "text.primary",
};

export const mrmToolbarStyle: SxProps<Theme> = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "8px",
  marginBottom: "16px",
  flexWrap: "wrap",
};

/** Section heading inside a Settings section (e.g. "Ingestion tokens"). */
export const mrmSubHeadingStyle: SxProps<Theme> = {
  fontSize: "15px",
  fontWeight: 600,
  color: "text.primary",
  marginBottom: "8px",
};

/** Monospaced code block for endpoint URLs and example requests. */
export const mrmCodeBlockStyle: SxProps<Theme> = (theme) => ({
  border: `1px solid ${theme.palette.border.dark}`,
  borderRadius: "4px",
  backgroundColor: "background.accent",
  padding: "12px 16px",
  fontFamily: "monospace",
  fontSize: "12px",
  color: "text.primary",
  lineHeight: 1.7,
  overflowX: "auto",
  whiteSpace: "pre",
  marginBottom: "16px",
});

/** A caption line under a code block or note. */
export const mrmCaptionStyle: SxProps<Theme> = {
  fontSize: "12px",
  color: "text.tertiary",
  lineHeight: 1.6,
  marginBottom: "16px",
};
