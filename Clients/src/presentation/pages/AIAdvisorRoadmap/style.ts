import { palette } from "../../themes/palette";

export const mainStackStyle = {
  display: "flex",
  flexDirection: "column",
  gap: "16px",
  padding: "0 8px 8px 8px",
  width: "100%",
  minHeight: "calc(100vh - 200px)",
};

export const toolbarStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "12px",
  flexWrap: "wrap",
};

export const filterRowStyle = {
  display: "flex",
  alignItems: "center",
  gap: "12px",
  flexWrap: "wrap",
};

export const summaryCardsStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: "16px",
  width: "100%",
};

export const sectionStyle = {
  border: `1px solid ${palette.border.light}`,
  borderRadius: "8px",
  padding: "16px",
  display: "flex",
  flexDirection: "column",
  gap: "12px",
};

export const sectionTitleStyle = {
  fontSize: 15,
  fontWeight: 600,
  color: palette.text.primary,
};

export const progressRowStyle = {
  display: "grid",
  gridTemplateColumns: "minmax(160px, 240px) 1fr minmax(90px, auto)",
  alignItems: "center",
  gap: "12px",
};

export const toolGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
  gap: "16px",
};

export const toolCardStyle = {
  border: `1px solid ${palette.border.light}`,
  borderRadius: "8px",
  padding: "14px 16px",
  display: "flex",
  flexDirection: "column",
  gap: "8px",
  backgroundColor: palette.background.main,
};

export const toolNameStyle = {
  fontFamily: "monospace",
  fontSize: 12,
  color: palette.text.secondary,
  wordBreak: "break-all" as const,
};

export const toolDescriptionStyle = {
  fontSize: 13,
  color: palette.text.secondary,
};

export const extraToolsStyle = {
  display: "flex",
  flexWrap: "wrap" as const,
  gap: "8px",
};
