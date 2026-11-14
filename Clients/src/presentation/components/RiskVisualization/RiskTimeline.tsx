import React, { useMemo } from "react";
import { Box, Typography, Stack, Chip } from "@mui/material";
import { format } from "date-fns";
import { IRiskTimelineProps } from "../../types/interfaces/i.risk";
import { ITimelineEvent } from "../../../domain/interfaces/i.widget";
import useFormattedDate from "../../../application/hooks/useFormattedDate";
import { palette, radiusPx } from "../../themes/palette";
import { riskCalendarDay } from "../../tools/isoDateToString";
import { getEffectiveRiskLevel } from "../../../application/utils/riskLevel";
import { riskLevelBucketLabel, riskLevelColor } from "./riskLevelColor";

const RiskTimeline: React.FC<IRiskTimelineProps> = ({ risks, onRiskSelect }) => {
  const formatDate = useFormattedDate();

  const timelineEvents = useMemo(() => {
    const events: ITimelineEvent[] = [];

    risks.forEach((risk) => {
      // Add creation event
      // Assessment date, else the creation date: a risk without either is
      // placed at render time.
      const createdDate =
        riskCalendarDay(risk.date_of_assessment) ??
        (risk.created_at ? new Date(risk.created_at) : new Date());
      const riskLevelValue = getEffectiveRiskLevel(risk);

      events.push({
        id: `${risk.id}-created`,
        date: createdDate,
        type: "created",
        risk,
        title: `Risk Identified: ${risk.risk_name}`,
        description: `New ${riskLevelBucketLabel(riskLevelValue).toLowerCase()} risk identified`,
        riskLevel: riskLevelValue,
      });

      // Add mitigation events based on mitigation status
      const completedDate = riskCalendarDay(risk.deadline);
      if (risk.mitigation_status === "Completed" && completedDate) {
        events.push({
          id: `${risk.id}-mitigated`,
          date: completedDate,
          type: "mitigated",
          risk,
          title: `Risk Mitigated: ${risk.risk_name}`,
          description: `Mitigation completed: ${risk.mitigation_plan || "Mitigation action"}`,
          riskLevel: riskLevelValue,
        });
      }
    });

    // Sort events by date (most recent first)
    return events.sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [risks]);

  const formatTime = (date: Date) => {
    return formatDate(date);
  };

  // Group events by month for better organization
  const groupedEvents = useMemo(() => {
    const groups: { [key: string]: ITimelineEvent[] } = {};

    timelineEvents.forEach((event) => {
      const monthKey = format(event.date, "MMMM yyyy");

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
          borderRadius: radiusPx.sm,
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
      <Typography variant="h6" sx={{ fontWeight: 600, color: palette.text.primary, mb: 3 }}>
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
                    color: palette.text.secondary,
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
                    "display": "flex",
                    "alignItems": "flex-start",
                    "gap": 2,
                    "mb": 3,
                    "cursor": onRiskSelect ? "pointer" : "default",
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
                      backgroundColor: riskLevelColor(event.riskLevel),
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
                      borderRadius: radiusPx.sm,
                      p: 3,
                      transition: "all 0.2s ease-in-out",
                      borderLeft: `4px solid ${riskLevelColor(event.riskLevel)}`,
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
                      sx={{ fontWeight: 600, color: palette.text.primary, mb: 1 }}
                    >
                      {event.title}
                    </Typography>

                    <Typography variant="body2" sx={{ color: palette.text.tertiary, mb: 2 }}>
                      {event.description}
                    </Typography>

                    <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                      <Chip
                        label={riskLevelBucketLabel(event.riskLevel)}
                        size="small"
                        sx={{
                          backgroundColor: `${riskLevelColor(event.riskLevel)}20`,
                          color: riskLevelColor(event.riskLevel),
                          fontWeight: 500,
                          fontSize: 11,
                          borderRadius: radiusPx.sm,
                          border: `1px solid ${riskLevelColor(event.riskLevel)}40`,
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
