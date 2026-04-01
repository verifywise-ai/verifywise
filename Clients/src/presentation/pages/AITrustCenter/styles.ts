import { brand, text } from "../../themes/palette";
// Export individual styles for use in components
export const aiTrustCenterHeaderTitle = {
  color: `${text.primary}`,
  fontWeight: 600,
  mb: "6px",
  fontSize: 16,
};

export const aiTrustCenterHeaderDesc = {
  fontSize: 13,
  color: `${text.secondary}`,
};

export const aiTrustCenterTabStyle = {
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

export const aiTrustCenterTabPanelStyle = {
  padding: 0,
  pt: 10,
};

export const aiTrustCenterTabListStyle = {
  minHeight: "20px",
  "& .MuiTabs-flexContainer": { columnGap: "34px" },
}; 

export const aiTrustCenterPreviewButtonStyle = {
  backgroundColor: `${brand.primary}`,
  border: `1px solid ${brand.primary}`,
  gap: 2,
};