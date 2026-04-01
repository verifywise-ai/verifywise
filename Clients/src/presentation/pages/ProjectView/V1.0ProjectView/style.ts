import { brand, text } from "../../../themes/palette";
export const projectViewHeaderTitle = {
  color: `${text.primary}`,
  fontWeight: 600,
  mb: "6px",
  fontSize: 16,
};

export const projectViewHeaderDesc = {
  fontSize: 13,
  color: `${text.secondary}`,
};

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
  pt: 10,
};

export const projectRiskSection = {
  color: `${text.primary}`,
  fontWeight: 600,
  mt: 10,
  fontSize: 16,
};
