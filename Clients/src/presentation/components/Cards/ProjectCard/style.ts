import { brand, text, background, border as borderPalette } from "../../../themes/palette";
export const projectCardStyle = {
  border: `1px solid ${borderPalette.dark}`,
  borderRadius: "4px",
  padding: "16px",
  minWidth: 300,
  width: "100%",
  maxWidth: "100&",
  background: "linear-gradient(135deg, #FEFFFE 0%, #F8F9FA 100%)",
};

export const projectCardTitleStyle = {
  fontSize: 13,
  color: "#2D3748",
  fontWeight: 600,
};

export const frameworkLogo = {
  width: 20,
  height: 20,
  borderRadius: "50%",
};

export const progressStyle = {
  color: "#8594AC",
  fontSize: 11,
  fontWeight: 400,
};

export const projectCardSpecsStyle = {
  display: "flex",
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "center",
};

export const projectCardSpecKeyStyle = { fontSize: 11, color: "#8594AC" };

export const projectCardSpecValueStyle = { fontSize: 13, color: `${text.secondary}` };

export const viewProjectButtonStyle = {
  backgroundColor: `${brand.primary}`,
  color: `${background.main}`,
  fontSize: 13,
  fontWeight: 600,
  px: 3,
  mt: 1,
  height: 34,
  "&:hover": {
    backgroundColor: "#0e5c47",
  },
  border: "none",
};

export const euAiActChipStyle = {
  backgroundColor: '#014576',
  color: `${background.main}`,
  fontWeight: 600,
  fontSize: 11,
  height: 28,
  borderRadius: "4px",
  mb: 1,
  textTransform: 'none',
  minWidth: 'auto',
  padding: '0 6px 0 10px',
  boxShadow: 'none',
  '&:hover': {
    backgroundColor: '#014576',
    boxShadow: 'none',
  },
  '&:active': {
    backgroundColor: '#014576',
    boxShadow: 'none',
  },
  '&:focus': {
    backgroundColor: '#014576',
    boxShadow: 'none',
  },
  '& .MuiButton-endIcon': {
    marginLeft: '4px',
  },
};

export const iso42001ChipStyle = {
  backgroundColor: '#0ca5af',
  color: `${background.main}`,
  fontWeight: 600,
  fontSize: 11,
  height: 28,
  borderRadius: "4px",
  mb: 1,
  textTransform: 'none',
  minWidth: 'auto',
  padding: '0 6px 0 10px',
  boxShadow: 'none',
  '&:hover': {
    backgroundColor: '#0ca5af',
    boxShadow: 'none',
  },
  '&:active': {
    backgroundColor: '#0ca5af',
    boxShadow: 'none',
  },
  '&:focus': {
    backgroundColor: '#0ca5af',
    boxShadow: 'none',
  },
  '& .MuiButton-endIcon': {
    marginLeft: '4px',
  },
};
