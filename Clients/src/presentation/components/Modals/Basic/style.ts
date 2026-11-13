import { radiusPx } from "../../../themes/palette";
import { chartTheme } from "../../../themes/chartTheme";
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
  "backgroundColor": chartTheme.controls.dangerButton.bg,
  "border": `1px solid ${chartTheme.controls.dangerButton.bg}`,
  "boxShadow": "none",
  "borderRadius": radiusPx.sm,
  "padding": "8px 16px",
  "textTransform": "capitalize",
  "&:hover": {
    boxShadow: "none",
    backgroundColor: chartTheme.controls.dangerButton.hover,
    borderColor: chartTheme.controls.dangerButton.hover,
  },
};
