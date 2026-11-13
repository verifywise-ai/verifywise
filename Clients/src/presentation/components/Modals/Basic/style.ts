import { radiusPx, palette as vwPalette } from "../../../themes/palette";
export const BasicModalCancelButtonStyle = {
  "minWidth": 100,
  "textTransform": "capitalize",
  "fontSize": 13,
  "borderRadius": radiusPx.sm,
  "padding": "8px 16px",
  "&:hover": {
    boxShadow: "none",
    backgroundColor: "rgba(0, 0, 0, 0.04)",
  },
};

export const BasicModalDeleteButtonStyle = {
  "minWidth": 160,
  "fontSize": 13,
  "backgroundColor": vwPalette.riskMark.critical,
  "border": `1px solid ${vwPalette.riskMark.critical}`,
  "boxShadow": "none",
  "borderRadius": radiusPx.sm,
  "padding": "8px 16px",
  "textTransform": "capitalize",
  "&:hover": {
    boxShadow: "none",
    backgroundColor: vwPalette.riskMark.critical,
    borderColor: vwPalette.riskMark.critical,
  },
};
