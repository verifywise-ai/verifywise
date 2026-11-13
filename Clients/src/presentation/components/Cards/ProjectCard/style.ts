import {
  brand,
  text,
  background,
  border as borderPalette,
  palette as vwPalette,
  radiusPx,
} from "../../../themes/palette";
export const projectCardStyle = {
  border: `1px solid ${borderPalette.dark}`,
  borderRadius: radiusPx.sm,
  padding: "16px",
  minWidth: 300,
  width: "100%",
  maxWidth: "100&",
  background: `linear-gradient(135deg, ${vwPalette.background.main} 0%, ${vwPalette.background.alt} 100%)`,
};

export const projectCardTitleStyle = {
  fontSize: 13,
  color: vwPalette.text.secondary,
  fontWeight: 600,
};

export const frameworkLogo = {
  width: 20,
  height: 20,
  borderRadius: "50%",
};

export const progressStyle = {
  color: vwPalette.text.accent,
  fontSize: 11,
  fontWeight: 400,
};

export const projectCardSpecsStyle = {
  display: "flex",
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "center",
};

export const projectCardSpecKeyStyle = { fontSize: 11, color: vwPalette.text.accent };

export const projectCardSpecValueStyle = { fontSize: 13, color: `${text.secondary}` };

export const viewProjectButtonStyle = {
  "backgroundColor": `${brand.primary}`,
  "color": `${background.main}`,
  "fontSize": 13,
  "fontWeight": 600,
  "px": 3,
  "mt": 1,
  "height": 34,
  "&:hover": {
    backgroundColor: vwPalette.brand.primaryHover,
  },
  "border": "none",
};

export const euAiActChipStyle = {
  "backgroundColor": vwPalette.status.info.text,
  "color": `${background.main}`,
  "fontWeight": 600,
  "fontSize": 11,
  "height": 28,
  "borderRadius": radiusPx.sm,
  "mb": 1,
  "textTransform": "none",
  "minWidth": "auto",
  "padding": "0 6px 0 10px",
  "boxShadow": "none",
  "&:hover": {
    backgroundColor: vwPalette.status.info.text,
    boxShadow: "none",
  },
  "&:active": {
    backgroundColor: vwPalette.status.info.text,
    boxShadow: "none",
  },
  "&:focus": {
    backgroundColor: vwPalette.status.info.text,
    boxShadow: "none",
  },
  "& .MuiButton-endIcon": {
    marginLeft: "4px",
  },
};

export const iso42001ChipStyle = {
  "backgroundColor": vwPalette.chart[3],
  "color": `${background.main}`,
  "fontWeight": 600,
  "fontSize": 11,
  "height": 28,
  "borderRadius": radiusPx.sm,
  "mb": 1,
  "textTransform": "none",
  "minWidth": "auto",
  "padding": "0 6px 0 10px",
  "boxShadow": "none",
  "&:hover": {
    backgroundColor: vwPalette.chart[3],
    boxShadow: "none",
  },
  "&:active": {
    backgroundColor: vwPalette.chart[3],
    boxShadow: "none",
  },
  "&:focus": {
    backgroundColor: vwPalette.chart[3],
    boxShadow: "none",
  },
  "& .MuiButton-endIcon": {
    marginLeft: "4px",
  },
};
