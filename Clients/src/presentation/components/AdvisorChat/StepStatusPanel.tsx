import { FC } from "react";
import { Box, Typography, Stack, Chip, Button } from "@mui/material";
import { Check, X } from "lucide-react";
import { status as statusColors, brand, text, border } from "../../themes/palette";
import type {
  CommandStep,
  StepStatus,
  StepStatusEvent,
} from "../../../application/repository/commandPlane.repository";

interface StepStatusPanelProps {
  steps: CommandStep[];
  /** Latest status event per step, keyed by step order. */
  statuses: Record<number, StepStatusEvent>;
}

/**
 * Visual config per step status. Pulls from the shared semantic palette so the
 * chips stay coherent with the rest of the app (mirrors ConfirmationToolUI).
 */
const STATUS_CONFIG: Record<StepStatus, { label: string; bg: string; color: string }> = {
  pending: { label: "Pending", bg: statusColors.default.bg, color: statusColors.default.text },
  executing: { label: "Executing", bg: statusColors.info.bg, color: statusColors.info.text },
  awaiting_approval: {
    label: "Awaiting approval",
    bg: statusColors.warning.bg,
    color: statusColors.warning.text,
  },
  completed: { label: "Completed", bg: statusColors.success.bg, color: statusColors.success.text },
  failed: { label: "Failed", bg: statusColors.error.bg, color: statusColors.error.text },
};

const renderResult = (result: unknown): string =>
  typeof result === "object" ? JSON.stringify(result) : String(result);

const StepStatusPanel: FC<StepStatusPanelProps> = ({ steps, statuses }) => {
  if (!steps || steps.length === 0) return null;

  const ordered = [...steps].sort((a, b) => a.order - b.order);

  return (
    <Stack spacing={1} sx={{ my: 1 }} data-testid="step-status-panel">
      {ordered.map((step) => {
        const event = statuses[step.order];
        const status: StepStatus = event?.status ?? "pending";
        const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;

        return (
          <Box
            key={step.order}
            sx={{
              border: `1px solid ${border.light}`,
              borderRadius: "8px",
              backgroundColor: "#FFFFFF",
              p: "12px",
            }}
          >
            {/* Header: order + description + status chip */}
            <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={1}>
              <Stack direction="row" alignItems="flex-start" spacing={1} sx={{ flex: 1 }}>
                <Typography
                  sx={{ fontSize: 12, fontWeight: 600, color: text.tertiary, minWidth: 18 }}
                >
                  {step.order}.
                </Typography>
                <Typography sx={{ fontSize: 13, color: text.secondary, lineHeight: 1.5 }}>
                  {step.description}
                </Typography>
              </Stack>
              <Chip
                label={config.label}
                size="small"
                data-testid={`step-status-${step.order}`}
                sx={{
                  backgroundColor: config.bg,
                  color: config.color,
                  fontSize: 11,
                  fontWeight: 600,
                  height: 22,
                  borderRadius: "6px",
                }}
              />
            </Stack>

            {/* Result (completed) */}
            {status === "completed" && event?.result !== undefined && (
              <Box
                data-testid={`step-result-${step.order}`}
                sx={{
                  backgroundColor: statusColors.success.bg,
                  borderRadius: "4px",
                  p: "8px",
                  mt: 1,
                }}
              >
                <Typography
                  sx={{ fontSize: 11, color: statusColors.success.text, fontFamily: "monospace" }}
                >
                  {renderResult(event.result)}
                </Typography>
              </Box>
            )}

            {/* Error (failed) */}
            {status === "failed" && event?.error && (
              <Typography
                data-testid={`step-error-${step.order}`}
                sx={{ fontSize: 12, color: statusColors.error.text, mt: 1 }}
              >
                {event.error}
              </Typography>
            )}

            {/* Approve/reject affordance placeholder (awaiting approval) */}
            {status === "awaiting_approval" && (
              <Stack
                direction="row"
                spacing={1}
                mt={1}
                data-testid={`step-approval-${step.order}`}
              >
                <Button
                  size="small"
                  variant="contained"
                  disabled
                  startIcon={<Check size={14} />}
                  sx={{
                    "textTransform": "none",
                    "fontSize": 12,
                    "fontWeight": 500,
                    "backgroundColor": brand.primary,
                    "borderRadius": "4px",
                    "boxShadow": "none",
                    "&:hover": { backgroundColor: brand.primaryHover, boxShadow: "none" },
                  }}
                >
                  Approve
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  disabled
                  startIcon={<X size={14} />}
                  sx={{
                    "textTransform": "none",
                    "fontSize": 12,
                    "fontWeight": 500,
                    "borderColor": border.dark,
                    "color": text.tertiary,
                    "borderRadius": "4px",
                    "&:hover": { backgroundColor: "#F9FAFB" },
                  }}
                >
                  Reject
                </Button>
              </Stack>
            )}
          </Box>
        );
      })}
    </Stack>
  );
};

export default StepStatusPanel;
