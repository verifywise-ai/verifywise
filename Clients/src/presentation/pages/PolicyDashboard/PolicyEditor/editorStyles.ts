import type { GlobalStylesProps } from "@mui/material";
import { palette } from "../../../themes/palette";
import { fontFamily, fontSize, fontWeight } from "../../../themes/typography";

const { text, background, border, brand, accent, editor } = palette;

/**
 * TipTap / ProseMirror styles for the policy editor surface.
 * Module-level constant from static design tokens — no theme, no per-render work.
 */
export const policyEditorStyles: GlobalStylesProps["styles"] = {
  ".policy-tiptap-editor .ProseMirror": {
    "height": "100%",
    "minHeight": 300,
    "overflowY": "auto",
    "padding": "20px 24px",
    "border": "none",
    "borderRadius": "4px",
    "backgroundColor": background.main,
    "fontFamily": fontFamily.sans,
    "fontSize": fontSize.base,
    "color": text.primary,
    "outline": "none",

    "&:focus": {
      outline: "none",
    },
    "& p.is-editor-empty:first-child::before": {
      content: "attr(data-placeholder)",
      float: "left",
      color: text.disabled,
      pointerEvents: "none",
      height: 0,
    },
    "& mark": {
      backgroundColor: editor.highlight,
      padding: "0 2px",
      borderRadius: "2px",
    },
    "& blockquote": {
      borderLeft: `3px solid ${border.dark}`,
      margin: "8px 0",
      padding: "8px 16px",
      color: text.tertiary,
      backgroundColor: background.alt,
      borderRadius: "0 4px 4px 0",
    },
    "& pre": {
      backgroundColor: editor.codeBlockBg,
      color: editor.codeBlockText,
      padding: "12px 16px",
      borderRadius: "6px",
      fontFamily: fontFamily.mono,
      fontSize: fontSize.sm,
      overflowX: "auto",
      margin: "12px 0",
    },
    "& pre code": {
      background: "none",
      color: "inherit",
      padding: 0,
    },
    "& code": {
      backgroundColor: background.surface,
      padding: "2px 4px",
      borderRadius: "3px",
      fontFamily: fontFamily.mono,
      fontSize: fontSize.sm,
    },
    "& hr": {
      border: "none",
      borderTop: `1px solid ${border.dark}`,
      margin: "16px 0",
    },
    "& table": {
      borderCollapse: "collapse",
      width: "100%",
      margin: "12px 0",
      tableLayout: "fixed",
      overflow: "hidden",
    },
    "& th, & td": {
      border: `1px solid ${border.dark}`,
      padding: "8px 12px",
      textAlign: "left",
      verticalAlign: "top",
      minWidth: 80,
      position: "relative",
      boxSizing: "border-box",
      fontSize: fontSize.base,
    },
    "& th": {
      backgroundColor: brand.primaryLight,
      fontWeight: fontWeight.semibold,
    },
    "& .selectedCell": {
      backgroundColor: `${background.selected} !important`,
      borderColor: `${brand.primary} !important`,
    },
    "& .selectedCell::after": {
      content: '""',
      position: "absolute",
      inset: 0,
      background: `${brand.primary}14`,
      pointerEvents: "none",
    },
    "& .column-resize-handle": {
      position: "absolute",
      right: -2,
      top: 0,
      bottom: -2,
      width: 4,
      backgroundColor: brand.primary,
      cursor: "col-resize",
      zIndex: 10,
    },
    "&.resize-cursor": {
      cursor: "col-resize",
    },
    "& td:hover": {
      backgroundColor: background.gradientStop,
    },
    "& img": {
      maxWidth: "100%",
      borderRadius: "8px",
      margin: "12px 0",
    },
    "& a": {
      color: accent.blue.text,
      textDecoration: "underline",
      cursor: "pointer",
    },
    "& ul, & ol": {
      paddingLeft: 24,
    },
    "& h1": {
      fontSize: fontSize["2xl"],
      fontWeight: fontWeight.bold,
      margin: "16px 0 8px",
    },
    "& h2": {
      fontSize: fontSize.xl,
      fontWeight: fontWeight.semibold,
      margin: "12px 0 6px",
    },
    "& h3": {
      fontSize: fontSize.lg,
      fontWeight: fontWeight.semibold,
      margin: "10px 0 4px",
    },
    '& ul[data-type="taskList"]': {
      listStyle: "none",
      paddingLeft: 4,
    },
    '& ul[data-type="taskList"] li': {
      display: "flex",
      alignItems: "flex-start",
      gap: 8,
      margin: "4px 0",
    },
    '& ul[data-type="taskList"] li label': {
      display: "flex",
      alignItems: "center",
      flexShrink: 0,
      marginTop: 2,
    },
    '& ul[data-type="taskList"] li label input[type="checkbox"]': {
      width: 16,
      height: 16,
      cursor: "pointer",
      accentColor: brand.primary,
    },
    '& ul[data-type="taskList"] li > div': {
      flex: 1,
    },
    '& ul[data-type="taskList"] li[data-checked="true"] > div > p': {
      textDecoration: "line-through",
      color: text.disabled,
    },
    "& sup": {
      fontSize: "0.75em",
      verticalAlign: "super",
    },
    "& sub": {
      fontSize: "0.75em",
      verticalAlign: "sub",
    },
    "& .search-highlight": {
      backgroundColor: editor.highlight,
      borderRadius: "2px",
      boxShadow: `0 0 0 1px ${editor.searchRing}`,
    },
  },
};
