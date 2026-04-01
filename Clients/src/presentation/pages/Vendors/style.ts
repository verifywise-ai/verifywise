import { brand } from "../../themes/palette";
export const tabStyle = {
    textTransform: "none",
    fontWeight: 400,
    alignItems: "center",
    justifyContent: "flex-end",
    padding: "16px 0 7px",
    minHeight: "20px",
    minWidth: "auto",
    "&.Mui-selected": {
      color: `${brand.primary}`,
    },
  };
  
  export const tabPanelStyle = {
    padding: 0,
    pt: 0,
  }