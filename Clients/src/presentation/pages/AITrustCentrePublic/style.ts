import { brand, text } from "../../themes/palette";
// Export individual styles for use in components
const primaryColor = `${brand.primary}`;

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
      color: primaryColor,
    },
  };
  
  export const aiTrustCenterTabPanelStyle = {
    padding: 0,
    pt: 5,
    width: "100%",
  };
  
  export const aiTrustCenterTabListStyle = {
    minHeight: "20px",
    "& .MuiTabs-flexContainer": { columnGap: "34px" },
  }; 
  
  export const aiTrustCenterPreviewButtonStyle = {
    backgroundColor: primaryColor,
    border: `1px solid ${primaryColor}`,
    gap: 2,
    marginLeft: "auto",
    marginRight: "0",
  };

export const aiTrustCenterTableCell = {
  px: 4,
};