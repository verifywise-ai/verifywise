import React from "react";
import { Box, Stack, Typography } from "@mui/material";
import { Check, X, Clock, CircleDot } from "lucide-react";
import { LifecycleStep } from "../agentLifecycle";
import { palette } from "../../../themes/palette";

interface LifecycleStepperProps {
  steps: LifecycleStep[];
}

/**
 * Horizontal read-only lifecycle stepper for a single agent. Renders the
 * derived stages (Added → Under review → Confirmed → Active, or the Rejected
 * branch) with the current stage highlighted, and — below each stage — who is
 * in charge of it and when it happened.
 */
const LifecycleStepper: React.FC<LifecycleStepperProps> = ({ steps }) => {
  return (
    <Stack direction="row" alignItems="flex-start" sx={{ width: "100%" }}>
      {steps.map((step, idx) => {
        const isLast = idx === steps.length - 1;
        const { circleColor, iconColor } = nodeVisual(step.state);
        const connectorColor = step.state === "done" ? palette.brand.primary : palette.border.light;

        return (
          <React.Fragment key={step.key}>
            <Stack alignItems="center" spacing={0.75} sx={{ flexShrink: 0, minWidth: 96 }}>
              <Box
                sx={{
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: circleColor,
                  border: step.state === "upcoming" ? `1px solid ${palette.border.light}` : "none",
                }}
              >
                {renderNodeIcon(step.state, iconColor)}
              </Box>
              <Typography
                sx={{
                  fontSize: 12,
                  fontWeight: step.state === "current" ? 600 : 500,
                  textAlign: "center",
                  color:
                    step.state === "rejected"
                      ? palette.status.error.text
                      : step.state === "upcoming"
                        ? palette.text.accent
                        : palette.text.primary,
                }}
              >
                {step.label}
              </Typography>
              {(step.owner || step.timestamp) && (
                <Stack alignItems="center" spacing={0}>
                  {step.owner && (
                    <Typography
                      sx={{ fontSize: 11, fontWeight: 500, color: palette.text.secondary }}
                      textAlign="center"
                    >
                      {step.owner}
                    </Typography>
                  )}
                  {step.timestamp && (
                    <Typography
                      sx={{ fontSize: 11, color: palette.text.accent }}
                      textAlign="center"
                    >
                      {step.timestamp}
                    </Typography>
                  )}
                </Stack>
              )}
            </Stack>

            {!isLast && (
              <Box
                sx={{
                  flex: 1,
                  height: 2,
                  backgroundColor: connectorColor,
                  mt: "15px",
                  minWidth: 24,
                }}
              />
            )}
          </React.Fragment>
        );
      })}
    </Stack>
  );
};

function nodeVisual(state: LifecycleStep["state"]): {
  circleColor: string;
  iconColor: string;
} {
  switch (state) {
    case "done":
      return { circleColor: palette.brand.primary, iconColor: "#FFFFFF" };
    case "current":
      return { circleColor: palette.brand.primaryLight, iconColor: palette.brand.primary };
    case "rejected":
      return { circleColor: palette.status.error.text, iconColor: "#FFFFFF" };
    case "upcoming":
    default:
      return { circleColor: palette.background.main, iconColor: palette.text.accent };
  }
}

function renderNodeIcon(state: LifecycleStep["state"], color: string): React.ReactElement {
  const props = { size: 16, strokeWidth: 2, color };
  switch (state) {
    case "done":
      return <Check {...props} />;
    case "current":
      return <CircleDot {...props} />;
    case "rejected":
      return <X {...props} />;
    case "upcoming":
    default:
      return <Clock {...props} />;
  }
}

export default LifecycleStepper;
