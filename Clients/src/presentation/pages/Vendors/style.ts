import { brand } from "../../themes/palette";
export const tabStyle = {
  "textTransform": "none",
  "fontWeight": 400,
  "alignItems": "center",
  "justifyContent": "flex-end",
  "padding": "16px 0 7px",
  "minHeight": "20px",
  "minWidth": "auto",
  "&.Mui-selected": {
    color: `${brand.primary}`,
  },
};

export const tabPanelStyle = {
  padding: 0,
  pt: 0,
};

/**
 * Toolbar (both tabs): filters, Columns and Search on the left take the room
 * that's left and wrap inside it; the actions on the right keep their width
 * and stay at the top right. On a narrow screen the actions move to their own
 * line, still right-aligned, instead of being squeezed.
 */
export const vendorToolbarStyle = {
  flexWrap: "wrap",
  alignItems: "flex-start",
  justifyContent: "space-between",
  columnGap: "16px",
  rowGap: "8px",
};

export const vendorFilterRowStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: "8px",
  alignItems: "center",
  flex: "1 1 0",
  minWidth: "min(320px, 100%)",
};

/** Columns and Search wrap to the next line together, never apart. */
export const vendorViewControlsStyle = {
  display: "flex",
  gap: "8px",
  alignItems: "center",
};

export const vendorActionsStyle = {
  gap: "8px",
  alignItems: "center",
  flexShrink: 0,
  marginLeft: "auto",
};

export const addNewButtonStyle = {
  backgroundColor: "brand.primary",
  border: "1px solid brand.primary",
  gap: "4px",
};
