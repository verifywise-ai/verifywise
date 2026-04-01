import { SxProps, Theme } from "@mui/material";
import { brand, text, background, border as borderPalette } from "../../../themes/palette";

// Back button
export const backButton: SxProps<Theme> = {
  color: `${text.secondary}`,
  fontSize: "13px",
  textTransform: "none",
  "&:hover": {
    backgroundColor: "rgba(0, 0, 0, 0.04)",
  },
};

// Plugin icon placeholder
export const pluginIconPlaceholder = (pluginKey: string, category?: string): SxProps<Theme> => ({
  width: 64,
  height: 64,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  backgroundColor:
    pluginKey === "risk-import"
      ? "rgba(16, 185, 129, 0.1)"
      : category === "data_management"
      ? "rgba(139, 92, 246, 0.1)"
      : "rgba(99, 102, 241, 0.1)",
  borderRadius: "12px",
});

// Status chip
export const installedStatusChip: SxProps<Theme> = {
  fontSize: "11px",
  height: 24,
  borderRadius: "4px",
  backgroundColor: "rgba(34, 197, 94, 0.1)",
  color: "#16a34a",
  border: "1px solid rgba(34, 197, 94, 0.2)",
  fontWeight: 500,
};

// Install button
export const installButton: SxProps<Theme> = {
  backgroundColor: `${brand.primary}`,
  textTransform: "none",
  fontSize: "13px",
  fontWeight: 500,
  "&:hover": {
    backgroundColor: `${brand.primaryHover}`,
  },
};

// Uninstall button
export const uninstallButton: SxProps<Theme> = {
  textTransform: "none",
  fontSize: "13px",
  fontWeight: 500,
  borderColor: "#dc2626",
  color: "#dc2626",
  "&:hover": {
    backgroundColor: "rgba(220, 38, 38, 0.04)",
    borderColor: "#dc2626",
  },
};

// Form field label
export const formFieldLabel: SxProps<Theme> = {
  mb: 0.75,
  color: `${text.secondary}`,
};

// Test connection button
export const testConnectionButton: SxProps<Theme> = {
  borderColor: `${brand.primary}`,
  color: `${brand.primary}`,
  textTransform: "none",
  fontSize: "13px",
  fontWeight: 500,
  "&:hover": {
    borderColor: `${brand.primaryHover}`,
    backgroundColor: "rgba(19, 113, 91, 0.04)",
  },
  "&:disabled": {
    borderColor: `${borderPalette.dark}`,
    color: `${text.muted}`,
  },
};

// Save configuration button
export const saveConfigButton: SxProps<Theme> = {
  backgroundColor: `${brand.primary}`,
  textTransform: "none",
  fontSize: "13px",
  fontWeight: 500,
  "&:hover": {
    backgroundColor: `${brand.primaryHover}`,
  },
  "&:disabled": {
    backgroundColor: `${borderPalette.dark}`,
  },
};

// Text field styling
export const configTextField: SxProps<Theme> = {
  "& .MuiOutlinedInput-root": {
    fontSize: "13px",
    backgroundColor: "white",
  },
};

// Select field styling
export const configSelect: SxProps<Theme> = {
  fontSize: "13px",
  backgroundColor: "white",
};

// Checkbox styling
export const configCheckbox: SxProps<Theme> = {
  color: `${brand.primary}`,
  "&.Mui-checked": {
    color: `${brand.primary}`,
  },
};

// Framework details section styles
export const frameworkDetailsGrid: SxProps<Theme> = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
  gap: 2,
};

export const frameworkDetailItem: SxProps<Theme> = {
  display: "flex",
  flexDirection: "column",
  gap: 0.5,
  p: "16px",
  backgroundColor: `${background.accent}`,
  borderRadius: "8px",
  border: `1px solid ${borderPalette.light}`,
};

export const frameworkDetailLabel: SxProps<Theme> = {
  fontSize: "11px",
  fontWeight: 600,
  color: `${text.icon}`,
  textTransform: "uppercase",
  letterSpacing: "0.5px",
};

export const frameworkDetailValue: SxProps<Theme> = {
  fontSize: "14px",
  fontWeight: 500,
  color: `${text.secondary}`,
  display: "flex",
  alignItems: "center",
  gap: 1,
};

export const frameworkTypeChip = (isOrganizational: boolean): SxProps<Theme> => ({
  fontSize: "12px",
  fontWeight: 500,
  height: 26,
  borderRadius: "6px",
  backgroundColor: isOrganizational ? "rgba(139, 92, 246, 0.1)" : "rgba(16, 185, 129, 0.1)",
  color: isOrganizational ? "#7c3aed" : "#059669",
  border: `1px solid ${isOrganizational ? "rgba(139, 92, 246, 0.2)" : "rgba(16, 185, 129, 0.2)"}`,
});

export const frameworkTypeDescription: SxProps<Theme> = {
  fontSize: "12px",
  color: "text.icon",
  mt: 1,
  lineHeight: 1.5,
};
