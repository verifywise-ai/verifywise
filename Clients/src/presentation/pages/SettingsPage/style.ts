import { brand } from "../../themes/palette";
export const tabIndicatorStyle = { style: { backgroundColor: `${brand.primary}` } };

export const tabContainerStyle = {
  minHeight: "20px",
  "& .MuiTabs-flexContainer": { columnGap: "34px" },
};

export const settingTabStyle = {
  textTransform: "none",
  fontWeight: 400,
  alignItems: "center",
  justifyContent: "flex-end",
  padding: "16px 0 7px",
  minWidth: "auto",
  minHeight: "20px",
  "&.Mui-selected": {
    color: `${brand.primary}`,
  },
};
