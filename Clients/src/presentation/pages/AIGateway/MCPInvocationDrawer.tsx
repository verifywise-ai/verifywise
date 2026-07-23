import { Box, Drawer, Typography, Stack, IconButton, Divider } from "@mui/material";
import { X, AlertTriangle, RotateCcw } from "lucide-react";
import { useState, useEffect } from "react";
import Chip from "../../components/Chip";
import { CustomizableButton } from "../../components/button/customizable-button";
import { EmptyState } from "../../components/EmptyState";
import { apiServices } from "../../../infrastructure/api/networkServices";
import palette from "../../themes/palette";
import CustomizableSkeleton from "../../components/Skeletons";
import {
  MCP_STATUS_COLORS,
  MCP_STATUS_FALLBACK,
  KEY_DISPLAY_BG,
  CODE_BLOCK_BG,
  CODE_BLOCK_TEXT,
} from "./shared";
import { displayFormattedDate } from "../../tools/isoDateToString";

interface InvocationDrawerProps {
  logId: number | null;
  open: boolean;
  onClose: () => void;
}

interface InvocationEvent {
  type: string;
  at: string;
  detail?: string;
}

interface AuditLogDetail {
  id: number;
  tool_name: string;
  agent_key_name?: string | null;
  result_status: string;
  result_summary: string | null;
  tool_use_id: string | null;
  session_id: string | null;
  arguments: Record<string, unknown> | null;
  result_response: Record<string, unknown> | null;
  result_truncated: boolean;
  events: InvocationEvent[];
  created_at: string;
}

export default function MCPInvocationDrawer({ logId, open, onClose }: InvocationDrawerProps) {
  const [row, setRow] = useState<AuditLogDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [showRaw, setShowRaw] = useState(false);

  useEffect(() => {
    if (!open || !logId) return;
    setRow(null);
    setError(false);
    setLoading(true);
    setShowRaw(false);
    apiServices
      .get<Record<string, any>>(`/ai-gateway/mcp/audit/logs/${logId}`)
      .then((res) => setRow((res?.data?.data as AuditLogDetail) || null))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [open, logId]);

  const colors = row
    ? MCP_STATUS_COLORS[row.result_status] || MCP_STATUS_FALLBACK
    : MCP_STATUS_FALLBACK;
  const labelSx = {
    fontSize: 11,
    fontWeight: 600,
    color: palette.text.tertiary,
    letterSpacing: "0.5px",
    mb: "6px",
  };
  const codeBlockSx = {
    fontSize: 12,
    fontFamily: "monospace",
    whiteSpace: "pre-wrap" as const,
    bgcolor: KEY_DISPLAY_BG,
    p: "12px",
    borderRadius: "4px",
    overflow: "auto",
    m: 0,
  };

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      sx={{ "& .MuiDrawer-paper": { width: 520, px: "16px", py: "20px" } }}
    >
      {loading ? (
        <CustomizableSkeleton variant="rectangular" width="100%" height={200} />
      ) : error ? (
        <EmptyState icon={AlertTriangle} message="Failed to load invocation details.">
          <CustomizableButton
            variant="outlined"
            text="Retry"
            icon={<RotateCcw size={16} />}
            onClick={() => {
              if (logId) {
                setError(false);
                setLoading(true);
                apiServices
                  .get<Record<string, any>>(`/ai-gateway/mcp/audit/logs/${logId}`)
                  .then((res) => setRow((res?.data?.data as AuditLogDetail) || null))
                  .catch(() => setError(true))
                  .finally(() => setLoading(false));
              }
            }}
          />
        </EmptyState>
      ) : row ? (
        <Stack gap="20px">
          {/* Header */}
          <Stack direction="row" justifyContent="space-between" alignItems="flex-start" gap="8px">
            <Stack gap="6px" sx={{ minWidth: 0 }}>
              <Stack direction="row" alignItems="center" gap="8px" flexWrap="wrap">
                <Typography sx={{ fontSize: 16, fontWeight: 600, fontFamily: "monospace" }}>
                  {row.tool_name}
                </Typography>
                <Chip
                  label={row.result_status}
                  backgroundColor={colors.bg}
                  textColor={colors.text}
                />
              </Stack>
              <Typography sx={{ fontSize: 12, color: palette.text.tertiary }}>
                {displayFormattedDate(row.created_at)}
              </Typography>
              <Typography sx={{ fontSize: 12, color: palette.text.tertiary }}>
                {(row.agent_key_name || "—") + " · " + (row.session_id || "—")}
              </Typography>
            </Stack>
            <IconButton size="small" onClick={onClose} aria-label="Close" sx={{ flexShrink: 0 }}>
              <X size={16} />
            </IconButton>
          </Stack>

          <Divider />

          <Box>
            <Typography sx={labelSx}>TOOL USE ID</Typography>
            <Typography sx={{ fontSize: 12, fontFamily: "monospace", wordBreak: "break-all" }}>
              {row.tool_use_id || "—"}
            </Typography>
          </Box>

          <Divider />

          <Box>
            <Typography sx={labelSx}>ARGUMENTS</Typography>
            <Box component="pre" sx={{ ...codeBlockSx, maxHeight: 200 }}>
              {JSON.stringify(row.arguments ?? {}, null, 2)}
            </Box>
          </Box>

          <Divider />

          <Box>
            <Typography sx={labelSx}>RESULT</Typography>
            {row.result_response ? (
              <Box component="pre" sx={{ ...codeBlockSx, maxHeight: 280 }}>
                {JSON.stringify(row.result_response, null, 2)}
                {row.result_truncated ? "\n… (truncated)" : ""}
              </Box>
            ) : (
              <Typography sx={{ fontSize: 12, color: palette.text.tertiary }}>
                No result captured (older adapter, or the tool did not report back).
              </Typography>
            )}
          </Box>

          <Divider />

          <Box>
            <Typography sx={labelSx}>EVENTS</Typography>
            <Stack gap="6px">
              {(row.events || []).map((e: InvocationEvent, i: number) => (
                <Stack key={i} direction="row" justifyContent="space-between" gap="12px">
                  <Typography sx={{ fontSize: 12 }}>
                    {e.type}
                    {e.detail ? ` · ${e.detail}` : ""}
                  </Typography>
                  <Typography
                    sx={{ fontSize: 12, color: palette.text.tertiary, whiteSpace: "nowrap" }}
                  >
                    {displayFormattedDate(e.at)}
                  </Typography>
                </Stack>
              ))}
            </Stack>
          </Box>

          <Divider />

          <Box>
            <Box
              component="button"
              onClick={() => setShowRaw((v) => !v)}
              sx={{
                fontSize: 12,
                color: palette.brand.primary,
                cursor: "pointer",
                background: "none",
                border: "none",
                p: 0,
                textAlign: "left",
              }}
            >
              {showRaw ? "Hide raw JSON" : "Show raw JSON"}
            </Box>
            {showRaw && (
              <Box
                component="pre"
                sx={{
                  ...codeBlockSx,
                  mt: "8px",
                  bgcolor: CODE_BLOCK_BG,
                  color: CODE_BLOCK_TEXT,
                  maxHeight: 320,
                }}
              >
                {JSON.stringify(row, null, 2)}
              </Box>
            )}
          </Box>
        </Stack>
      ) : (
        <Typography sx={{ fontSize: 13, color: palette.text.tertiary }}>
          Select a log to view details.
        </Typography>
      )}
    </Drawer>
  );
}
