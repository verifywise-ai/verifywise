import { FC, useState } from "react";
import { Box, Typography, Stack, Button, CircularProgress } from "@mui/material";
import { ShieldCheck, ShieldAlert, ShieldX, Check, X } from "lucide-react";
import {
  approveConfirmation,
  rejectConfirmation,
} from "../../../application/repository/aiConfirmation.repository";
import { dispatchAiActionCompleted } from "../../../application/events/aiActionEvents";
import { status as statusColors, brand } from "../../themes/palette";

interface ConfirmationResult {
  confirmation_required: true;
  confirmation_id: string;
  warning_level: "info" | "warning" | "danger";
  description: string;
  tool_name: string;
  params_summary: Record<string, unknown>;
}

type Resolution = "idle" | "approving" | "rejecting" | "approved" | "rejected" | "error";

const LEVEL_CONFIG = {
  info: {
    Icon: ShieldCheck,
    bg: statusColors.info.bg,
    border: statusColors.info.border,
    text: statusColors.info.text,
    label: "Low risk",
  },
  warning: {
    Icon: ShieldAlert,
    bg: statusColors.warning.bg,
    border: statusColors.warning.border,
    text: statusColors.warning.text,
    label: "Reversible action",
  },
  danger: {
    Icon: ShieldX,
    bg: statusColors.error.bg,
    border: statusColors.error.border,
    text: statusColors.error.text,
    label: "Irreversible action",
  },
} as const;

const ConfirmationToolUI: FC<{ result?: unknown }> = ({ result }) => {
  const [resolution, setResolution] = useState<Resolution>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!result || typeof result !== "object" || !(result as any).confirmation_required) {
    return null;
  }

  const data = result as ConfirmationResult;
  const config = LEVEL_CONFIG[data.warning_level] || LEVEL_CONFIG.warning;
  const { Icon } = config;

  const handleApprove = async () => {
    setResolution("approving");
    setErrorMsg(null);
    try {
      await approveConfirmation(data.confirmation_id);
      setResolution("approved");
      // Same event the dedicated Pending Approvals modal uses, so any
      // background page (Model Inventory, Risk Management, Tasks, ...)
      // that listens via `onAiActionCompleted` refetches when the user
      // approves an inline chat-card too. We pass the tool_name so
      // listeners can scope by the action type.
      dispatchAiActionCompleted({ toolName: data.tool_name, status: "approved" });
    } catch (err: any) {
      setErrorMsg(err?.response?.data?.message || err?.message || "Failed to approve");
      setResolution("error");
    }
  };

  const handleReject = async () => {
    setResolution("rejecting");
    setErrorMsg(null);
    try {
      await rejectConfirmation(data.confirmation_id);
      setResolution("rejected");
      dispatchAiActionCompleted({ toolName: data.tool_name, status: "rejected" });
    } catch (err: any) {
      setErrorMsg(err?.response?.data?.message || err?.message || "Failed to reject");
      setResolution("error");
    }
  };

  const isLoading = resolution === "approving" || resolution === "rejecting";
  const isResolved = resolution === "approved" || resolution === "rejected";

  return (
    <Box
      sx={{
        border: `1px solid ${config.border}`,
        borderRadius: "8px",
        backgroundColor: config.bg,
        p: "12px",
        my: 1,
      }}
    >
      {/* Header */}
      <Stack direction="row" alignItems="center" spacing={1} mb={1}>
        <Icon size={16} style={{ color: config.text }} />
        <Typography
          sx={{
            fontSize: 12,
            fontWeight: 600,
            color: config.text,
            textTransform: "uppercase",
            letterSpacing: 0.5,
          }}
        >
          {config.label}
        </Typography>
      </Stack>

      {/* Description */}
      <Typography sx={{ fontSize: 13, color: "#344054", mb: 1, lineHeight: 1.5 }}>
        {data.description}
      </Typography>

      {/* Params summary */}
      {Object.keys(data.params_summary).length > 0 && (
        <Box
          sx={{
            backgroundColor: "rgba(255,255,255,0.6)",
            borderRadius: "4px",
            p: "8px",
            mb: 1,
          }}
        >
          {Object.entries(data.params_summary).map(([key, value]) => (
            <Typography key={key} sx={{ fontSize: 11, color: "#475467", fontFamily: "monospace" }}>
              <Box component="span" sx={{ fontWeight: 600 }}>
                {key}:
              </Box>{" "}
              {typeof value === "object" ? JSON.stringify(value) : String(value)}
            </Typography>
          ))}
        </Box>
      )}

      {/* Actions */}
      {!isResolved && (
        <Stack direction="row" spacing={1} mt={1}>
          <Button
            size="small"
            variant="contained"
            onClick={handleApprove}
            disabled={isLoading}
            startIcon={
              resolution === "approving" ? (
                <CircularProgress size={12} color="inherit" />
              ) : (
                <Check size={14} />
              )
            }
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
            onClick={handleReject}
            disabled={isLoading}
            startIcon={
              resolution === "rejecting" ? (
                <CircularProgress size={12} color="inherit" />
              ) : (
                <X size={14} />
              )
            }
            sx={{
              "textTransform": "none",
              "fontSize": 12,
              "fontWeight": 500,
              "borderColor": "#D0D5DD",
              "color": "#475467",
              "borderRadius": "4px",
              "&:hover": { backgroundColor: "#F9FAFB" },
            }}
          >
            Reject
          </Button>
        </Stack>
      )}

      {/* Resolution state */}
      {resolution === "approved" && (
        <Stack direction="row" alignItems="center" spacing={0.5} mt={1}>
          <Check size={14} style={{ color: statusColors.success.text }} />
          <Typography sx={{ fontSize: 12, fontWeight: 500, color: statusColors.success.text }}>
            Approved and executed
          </Typography>
        </Stack>
      )}
      {resolution === "rejected" && (
        <Stack direction="row" alignItems="center" spacing={0.5} mt={1}>
          <X size={14} style={{ color: "#475467" }} />
          <Typography sx={{ fontSize: 12, fontWeight: 500, color: "#475467" }}>Rejected</Typography>
        </Stack>
      )}
      {resolution === "error" && errorMsg && (
        <Typography sx={{ fontSize: 12, color: statusColors.error.text, mt: 1 }}>
          {errorMsg}
        </Typography>
      )}
    </Box>
  );
};

export default ConfirmationToolUI;
