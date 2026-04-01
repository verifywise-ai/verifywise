import React, { useMemo } from "react";
import { Box, Typography, Stack, Chip } from "@mui/material";
import { IRiskTimelineProps } from "../../types/interfaces/i.risk";
import { ITimelineEvent } from "../../../domain/interfaces/i.widget";

const RiskTimeline: React.FC<IRiskTimelineProps> = ({
  risks,
  onRiskSelect,
}) => {
  const getRiskLevelFromString = (level: string | number): number => {
    if (typeof level === "number") return level;
    const levelStr = level.trim().toLowerCase();
    if (levelStr.includes("very high") || levelStr === "5") return 5;
    if (levelStr.includes("high") || levelStr === "4") return 4;
    if (levelStr.includes("medium") || levelStr === "3") return 3;
    if (levelStr.includes("very low") || levelStr === "1") return 1;
    if (levelStr.includes("low") || levelStr === "2") return 2;
    const n = parseInt(levelStr, 10);
    return Number.isFinite(n) ? n : 0;
  };

  const getRiskLevelColor = (riskLevel: number): string => {
    if (riskLevel >= 16) return "#C63622"; // Very High - Dark Red
    if (riskLevel >= 12) return "#D68B61"; // High - Orange Red
    if (riskLevel >= 8) return "#D6B971"; // Medium - Orange
    if (riskLevel >= 4) return "#52AB43"; // Low - Light Green
    return "#B8D39C"; // Very Low - Very Light Green
  };

  const getRiskLevelLabel = (riskLevel: number): string => {
    if (riskLevel >= 16) return "Very High";
    if (riskLevel >= 12) return "High";
    if (riskLevel >= 8) return "Medium";
    if (riskLevel >= 4) return "Low";
    return "Very Low";
  };

  const timelineEvents = useMemo(() => {
    const events: ITimelineEvent[] = [];

    risks.forEach((risk) => {
      // Add creation event
      const createdDate = risk.date_of_assessment
        ? new Date(risk.date_of_assessment)
        : new Date();
      const riskLevelValue = getRiskLevelFromString(
        risk.current_risk_level || risk.risk_level_autocalculated
      );

      events.push({
        id: `${risk.id}-created`,
        date: createdDate,
        type: "created",
        risk,
        title: `Risk Identified: ${risk.risk_name}`,
        description: `New ${getRiskLevelLabel(
          riskLevelValue
        ).toLowerCase()} risk identified`,
        riskLevel: riskLevelValue,
      });

      // Add mitigation events based on mitigation status
      if (risk.mitigation_status === "Completed" && risk.deadline) {
        const completedDate = new Date(risk.deadline);
        events.push({
          id: `${risk.id}-mitigated`,
          date: completedDate,
          type: "mitigated",
          risk,
          title: `Risk Mitigated: ${risk.risk_name}`,
          description: `Mitigation completed: ${
            risk.mitigation_plan || "Mitigation action"
          }`,
          riskLevel: riskLevelValue,
        });
      }
    });

    // Sort events by date (most recent first)
    return events.sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [risks]);

  const formatTime = (date: Date) => {
    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  };

  // Group events by month for better organization
  const groupedEvents = useMemo(() => {
    const groups: { [key: string]: ITimelineEvent[] } = {};

    timelineEvents.forEach((event) => {
      const monthKey = event.date.toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
      });

      if (!groups[monthKey]) {
        groups[monthKey] = [];
      }
      groups[monthKey].push(event);
    });

    return groups;
  }, [timelineEvents]);

  if (timelineEvents.length === 0) {
    return (
      <Box
        sx={{
          p: 4,
          textAlign: "center",
          backgroundColor: "background.accent",
          borderRadius: 2,
          border: "1px solid status.default.border",
        }}
      >
        <Typography variant="h6" sx={{ color: "status.default.text", mb: 1 }}>
          No Timeline Data Available
        </Typography>
        <Typography variant="body2" sx={{ color: "text.disabled" }}>
          Risk timeline data will appear here as risks are created and resolved.
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <Typography
        variant="h6"
        sx={{ fontWeight: 600, color: "#111827", mb: 3 }}
      >
        Risk Timeline Analysis
      </Typography>

      <Box sx={{ position: "relative" }}>
        {/* Timeline line */}
        <Box
          sx={{
            position: "absolute",
            left: 24,
            top: 0,
            bottom: 0,
            width: 2,
            backgroundColor: "status.default.border",
          }}
        />

        <Stack spacing={0}>
          {Object.entries(groupedEvents).map(([monthKey, events]) => (
            <Box key={monthKey}>
              {/* Month Header */}
              <Box sx={{ mb: 2 }}>
                <Typography
                  variant="subtitle2"
                  sx={{
                    fontWeight: 600,
                    color: "#374151",
                    backgroundColor: "background.hover",
                    px: 2,
                    py: 1,
                    borderRadius: 1,
                    display: "inline-block",
                  }}
                >
                  {monthKey}
                </Typography>
              </Box>

              {/* Events for this month */}
              {events.map((event) => (
                <Box
                  key={event.id}
                  sx={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 2,
                    mb: 3,
                    cursor: onRiskSelect ? "pointer" : "default",
                    "&:hover": onRiskSelect
                      ? {
                          "& .timeline-card": {
                            backgroundColor: "background.accent",
                            transform: "translateX(4px)",
                          },
                        }
                      : {},
                  }}
                  onClick={() => onRiskSelect?.(event.risk)}
                >
                  {/* Timeline dot */}
                  <Box
                    sx={{
                      width: 16,
                      height: 16,
                      borderRadius: "50%",
                      backgroundColor: getRiskLevelColor(event.riskLevel),
                      border: "3px solid background.main",
                      boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
                      position: "relative",
                      zIndex: 1,
                    }}
                  />

                  {/* Event card */}
                  <Box
                    className="timeline-card"
                    sx={{
                      flex: 1,
                      backgroundColor: "background.main",
                      border: "1px solid status.default.border",
                      borderRadius: 2,
                      p: 3,
                      transition: "all 0.2s ease-in-out",
                      borderLeft: `4px solid ${getRiskLevelColor(
                        event.riskLevel
                      )}`,
                    }}
                  >
                    <Box
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 2,
                        mb: 1,
                      }}
                    >
                      <Typography variant="caption" sx={{ color: "status.default.text" }}>
                        {formatTime(event.date)}
                      </Typography>
                    </Box>

                    <Typography
                      variant="subtitle2"
                      sx={{ fontWeight: 600, color: "#111827", mb: 1 }}
                    >
                      {event.title}
                    </Typography>

                    <Typography
                      variant="body2"
                      sx={{ color: "#4B5563", mb: 2 }}
                    >
                      {event.description}
                    </Typography>

                    <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                      <Chip
                        label={getRiskLevelLabel(event.riskLevel)}
                        size="small"
                        sx={{
                          backgroundColor: `${getRiskLevelColor(
                            event.riskLevel
                          )}20`,
                          color: getRiskLevelColor(event.riskLevel),
                          fontWeight: 500,
                          fontSize: 11,
                          borderRadius: "4px",
                          border: `1px solid ${getRiskLevelColor(
                            event.riskLevel
                          )}40`,
                        }}
                      />
                      {event.risk.risk_owner && (
                        <Typography variant="caption" sx={{ color: "status.default.text" }}>
                          Owner: {event.risk.risk_owner}
                        </Typography>
                      )}
                    </Box>
                  </Box>
                </Box>
              ))}
            </Box>
          ))}
        </Stack>
      </Box>
    </Box>
  );
};

export default RiskTimeline;
