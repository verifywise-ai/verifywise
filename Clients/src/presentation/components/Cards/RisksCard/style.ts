import { background, status, border as borderPalette } from "../../../themes/palette";
export const projectRisksCard = {
  width: "100%",
  height: "100%",
  display: "flex",
  flexDirection: { xs: "column", sm: "row" },
  flexWrap: "wrap",
  gap: "16px",
};

export const projectRisksTileCard = {
  paddingY: { xs: "10px", sm: "15px" },
  paddingX: { xs: "15px", sm: "20px" },
  textAlign: "center" as const,
  fontWeight: 600,
  gap: 5,
  position: "relative" as const,
  flex: { xs: "1 1 120px", sm: "0 0 140px" },
  width: { sm: "140px" },
  height: { sm: "100px" },
  justifyContent: "center",
  background: `linear-gradient(135deg, ${background.main} 0%, ${background.gradientStop} 100%)`,
  border: `1px solid ${borderPalette.dark}`,
  borderRadius: 2,
  transition: "all 0.2s ease",
};

export const projectRisksTileCardKey = {
  fontSize: 13,
};

export const projectRisksTileCardvalue = {
  fontSize: 28,
  fontWeight: 800,
};

// Enhanced styles for trends and metrics
export const trendIndicator = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 12,
  fontWeight: 600,
  gap: 0.5,
  marginTop: 1,
};

export const trendIconUp = {
  color: "#EF4444", // Red for increasing risks
  fontSize: 14,
};

export const trendIconDown = {
  color: "#10B981", // Green for decreasing risks
  fontSize: 14,
};

export const trendIconStable = {
  color: `${status.default.text}`, // Gray for stable risks
  fontSize: 14,
};

export const riskMetricsContainer = {
  display: "flex",
  flexDirection: "column",
  gap: 2,
  padding: "16px 24px",
  backgroundColor: `${background.accent}`,
  border: `1px solid #E5E7EB`,
  borderRadius: 2,
  minWidth: "200px",
};

export const riskMetricItem = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  fontSize: 14,
};

export const riskMetricLabel = {
  color: "status.default.text",
  fontWeight: 500,
};

export const riskMetricValue = {
  fontWeight: 600,
  color: "#111827",
};
