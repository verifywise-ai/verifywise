import { Box, Typography, Stack, LinearProgress } from "@mui/material";
import { CircleDashed, CircleDot, CircleDotDashed, CircleCheck } from "lucide-react";
import { frameworkDashboardCardStyles } from "./styles";
import { brand, text, background, status } from "../../../themes/palette";

interface FrameworkData {
  frameworkId: number;
  frameworkName: string;
  projectFrameworkId: number;
  clauseProgress?: {
    totalSubclauses: number;
    doneSubclauses: number;
  };
  annexProgress?: {
    // ISO 27001 uses these fields
    totalAnnexControls?: number;
    doneAnnexControls?: number;
    // ISO 42001 uses these fields
    totalAnnexcategories?: number;
    doneAnnexcategories?: number;
  };
  // NIST AI RMF specific
  nistProgress?: {
    totalSubcategories: number;
    doneSubcategories: number;
  };
  nistProgressByFunction?: {
    govern: { total: number; done: number };
    map: { total: number; done: number };
    measure: { total: number; done: number };
    manage: { total: number; done: number };
  };
}

interface FrameworkProgressCardProps {
  frameworksData: FrameworkData[];
}

const FrameworkProgressCard = ({ frameworksData }: FrameworkProgressCardProps) => {
  const calculateProgress = (done: number, total: number) => {
    if (total === 0) return 0;
    return Math.round((done / total) * 100);
  };

  const getProgressColor = (percentage: number) => {
    if (percentage < 30) return "#DC2626"; // Red
    if (percentage < 60) return "#EA580C"; // Orange
    if (percentage < 85) return "#F59E0B"; // Yellow
    return `${brand.primary}`; // Green
  };

  const getProgressIcon = (percentage: number) => {
    if (percentage === 0) return <CircleDashed size={14} style={{ color: `${text.disabled}` }} />;
    if (percentage < 30) return <CircleDashed size={14} style={{ color: "#DC2626" }} />;
    if (percentage < 60) return <CircleDot size={14} style={{ color: "#EA580C" }} />;
    if (percentage < 85) return <CircleDotDashed size={14} style={{ color: "#F59E0B" }} />;
    if (percentage < 100) return <CircleDotDashed size={14} style={{ color: `${brand.primary}` }} />;
    return <CircleCheck size={14} style={{ color: `${brand.primary}` }} />;
  };

  return (
    <Box sx={frameworkDashboardCardStyles.cardContainer}>
      {/* Header Section */}
      <Box sx={frameworkDashboardCardStyles.cardHeader}>
        <Typography sx={frameworkDashboardCardStyles.cardHeaderTitle}>
          Framework progress
        </Typography>
      </Box>

      {/* Content Section */}
      <Box sx={frameworkDashboardCardStyles.cardContentWithGradient}>
        <Typography
          sx={{
            fontSize: 12,
            color: "#666666",
            mb: 6,
            lineHeight: "16px"
          }}
        >
          Track implementation progress across clauses and annexes. Shows completion percentage and progress bars for each framework component.
        </Typography>

      <Stack spacing={0}>
        {frameworksData.map((framework, index) => {
          const isISO27001 = framework.frameworkName.toLowerCase().includes("iso 27001");
          const isISO42001 = framework.frameworkName.toLowerCase().includes("iso 42001");
          const isNISTAIRMF = framework.frameworkName.toLowerCase().includes("nist ai rmf");

          // For NIST AI RMF, show progress by function (Govern, Map, Measure, Manage)
          if (isNISTAIRMF) {
            const progressByFunction = framework.nistProgressByFunction;

            // Function display order and labels
            const functions = [
              { key: 'govern' as const, label: 'Govern' },
              { key: 'map' as const, label: 'Map' },
              { key: 'measure' as const, label: 'Measure' },
              { key: 'manage' as const, label: 'Manage' },
            ];

            return (
              <Box key={framework.frameworkId}>
                {/* Divider between framework sections */}
                {index > 0 && (
                  <Box
                    sx={{
                      height: "1px",
                      backgroundColor: `${status.default.border}`,
                      mx: "-16px", // Extend to card edges
                      mb: 4,
                      mt: 1,
                    }}
                  />
                )}
                <Typography
                  sx={{
                    fontSize: 13,
                    fontWeight: 500,
                    mb: 2,
                    color: `${text.black}`,
                  }}
                >
                  {framework.frameworkName}
                </Typography>

                <Stack spacing={2}>
                  {functions.map((func) => {
                    const data = progressByFunction?.[func.key] || { total: 0, done: 0 };
                    const percent = calculateProgress(data.done, data.total);

                    return (
                      <Box key={func.key}>
                        <Box
                          sx={{
                            display: "grid",
                            gridTemplateColumns: "1fr auto 1fr",
                            alignItems: "center",
                            mb: 1,
                          }}
                        >
                          <Typography sx={{ fontSize: 12, color: "#666666" }}>
                            {func.label}
                          </Typography>
                          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, justifyContent: "flex-end" }}>
                            <Typography sx={{ fontSize: 12, color: `${text.black}`, fontWeight: 500 }}>
                              {data.done}
                            </Typography>
                            <Typography sx={{ fontSize: 12, color: `${text.black}`, fontWeight: 500 }}>
                              /
                            </Typography>
                            <Typography sx={{ fontSize: 12, color: "#999999", fontWeight: 500 }}>
                              {data.total}
                            </Typography>
                          </Box>
                          <Box sx={{ display: "flex", alignItems: "center", gap: 1, justifyContent: "flex-end" }}>
                            {getProgressIcon(percent)}
                            <Typography
                              sx={{
                                fontSize: 12,
                                color: percent === 100 ? `${brand.primary}` : "#666666",
                                fontWeight: 500,
                              }}
                            >
                              {percent}%
                            </Typography>
                          </Box>
                        </Box>
                        <LinearProgress
                          variant="determinate"
                          value={percent}
                          sx={{
                            height: 6,
                            borderRadius: 3,
                            backgroundColor: `${background.hover}`,
                            "& .MuiLinearProgress-bar": {
                              backgroundColor: getProgressColor(percent),
                              borderRadius: 3,
                            },
                          }}
                        />
                      </Box>
                    );
                  })}
                </Stack>

                {/* Add bottom margin for spacing before next section */}
                {index < frameworksData.length - 1 && <Box sx={{ mb: 4 }} />}
              </Box>
            );
          }

          // For ISO frameworks
          const clauseDone = framework.clauseProgress?.doneSubclauses || 0;
          const clauseTotal = framework.clauseProgress?.totalSubclauses || 0;
          const clausePercent = calculateProgress(clauseDone, clauseTotal);

          // Get annex data based on framework type
          const annexDone = isISO27001
            ? (framework.annexProgress?.doneAnnexControls || 0)
            : (framework.annexProgress?.doneAnnexcategories || 0);
          const annexTotal = isISO27001
            ? (framework.annexProgress?.totalAnnexControls || 0)
            : (framework.annexProgress?.totalAnnexcategories || 0);
          const annexPercent = calculateProgress(annexDone, annexTotal);

          return (
            <Box key={framework.frameworkId}>
              {/* Divider between framework sections */}
              {index > 0 && (
                <Box
                  sx={{
                    height: "1px",
                    backgroundColor: `${status.default.border}`,
                    mx: "-16px", // Extend to card edges
                    mb: 4,
                    mt: 1,
                  }}
                />
              )}

              <Typography
                sx={{
                  fontSize: 13,
                  fontWeight: 500,
                  mb: 2,
                  color: `${text.black}`,
                }}
              >
                {framework.frameworkName}
              </Typography>

              {/* Controls/Clauses Progress */}
              <Box sx={{ mb: 2 }}>
                <Box
                  sx={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto 1fr",
                    alignItems: "center",
                    mb: 1,
                  }}
                >
                  <Typography sx={{ fontSize: 12, color: "#666666" }}>
                    {isISO27001 || isISO42001 ? "Clauses" : "Controls"}
                  </Typography>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, justifyContent: "flex-end" }}>
                    <Typography sx={{ fontSize: 12, color: `${text.black}`, fontWeight: 500 }}>
                      {clauseDone}
                    </Typography>
                    <Typography sx={{ fontSize: 12, color: `${text.black}`, fontWeight: 500 }}>
                      /
                    </Typography>
                    <Typography sx={{ fontSize: 12, color: "#999999", fontWeight: 500 }}>
                      {clauseTotal}
                    </Typography>
                  </Box>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1, justifyContent: "flex-end" }}>
                    {getProgressIcon(clausePercent)}
                    <Typography
                      sx={{
                        fontSize: 12,
                        color: clausePercent === 100 ? `${brand.primary}` : "#666666",
                        fontWeight: 500,
                      }}
                    >
                      {clausePercent}%
                    </Typography>
                  </Box>
                </Box>
                <LinearProgress
                  variant="determinate"
                  value={clausePercent}
                  sx={{
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: `${background.hover}`,
                    "& .MuiLinearProgress-bar": {
                      backgroundColor: getProgressColor(clausePercent),
                      borderRadius: 3,
                    },
                  }}
                />
              </Box>

              {/* Annexes Progress */}
              <Box>
                <Box
                  sx={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto 1fr",
                    alignItems: "center",
                    mb: 1,
                  }}
                >
                  <Typography sx={{ fontSize: 12, color: "#666666" }}>
                    Annexes
                  </Typography>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, justifyContent: "flex-end" }}>
                    <Typography sx={{ fontSize: 12, color: `${text.black}`, fontWeight: 500 }}>
                      {annexDone}
                    </Typography>
                    <Typography sx={{ fontSize: 12, color: `${text.black}`, fontWeight: 500 }}>
                      /
                    </Typography>
                    <Typography sx={{ fontSize: 12, color: "#999999", fontWeight: 500 }}>
                      {annexTotal}
                    </Typography>
                  </Box>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1, justifyContent: "flex-end" }}>
                    {getProgressIcon(annexPercent)}
                    <Typography
                      sx={{
                        fontSize: 12,
                        color: annexPercent === 100 ? `${brand.primary}` : "#666666",
                        fontWeight: 500,
                      }}
                    >
                      {annexPercent}%
                    </Typography>
                  </Box>
                </Box>
                <LinearProgress
                  variant="determinate"
                  value={annexPercent}
                  sx={{
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: `${background.hover}`,
                    "& .MuiLinearProgress-bar": {
                      backgroundColor: getProgressColor(annexPercent),
                      borderRadius: 3,
                    },
                  }}
                />
              </Box>

              {/* Add bottom margin for spacing before next section */}
              {index < frameworksData.length - 1 && <Box sx={{ mb: 4 }} />}
            </Box>
          );
        })}
      </Stack>
      </Box>
    </Box>
  );
};

export default FrameworkProgressCard;
