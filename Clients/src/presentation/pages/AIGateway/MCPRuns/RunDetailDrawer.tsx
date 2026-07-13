import { useCallback, useEffect, useState } from "react";
import { Drawer, Box, Stack, Typography, Divider } from "@mui/material";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { apiServices } from "../../../../infrastructure/api/networkServices";
import Chip from "../../../components/Chip";
import { CustomizableButton } from "../../../components/button/customizable-button";
import { EmptyState } from "../../../components/EmptyState";
import palette from "../../../themes/palette";
import CustomizableSkeleton from "../../../components/Skeletons";
import { displayFormattedTime } from "../../../tools/isoDateToString";

interface RunEntry {
  kind: "model" | "tool";
  created_at: string;
  model: string;
  provider: string | null;
  total_tokens: number | null;
  cost_usd: number | null;
  latency_ms: number | null;
  request_messages: any;
  response_text: string | null;
}

interface RunDetailDrawerProps {
  runId: string;
  onClose: () => void;
}

export default function RunDetailDrawer({ runId, onClose }: RunDetailDrawerProps) {
  const [entries, setEntries] = useState<RunEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const loadRun = useCallback(async () => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    try {
      const res = await apiServices.get<Record<string, any>>(
        `/ai-gateway/mcp/runs/${encodeURIComponent(runId)}`,
      );
      if (!cancelled) setEntries(res?.data?.data?.entries ?? []);
    } catch {
      if (!cancelled) setError(true);
    } finally {
      if (!cancelled) setLoading(false);
    }
    return () => {
      cancelled = true;
    };
  }, [runId]);

  useEffect(() => {
    loadRun();
  }, [loadRun]);

  const codeBlockSx = { whiteSpace: "pre-wrap" as const, fontSize: "12px", m: 0 };

  return (
    <Drawer anchor="right" open onClose={onClose} PaperProps={{ sx: { width: 560, p: "16px" } }}>
      <Typography variant="h6" sx={{ mb: "8px" }}>
        Run {runId.slice(0, 12)}…
      </Typography>
      {loading ? (
        <CustomizableSkeleton variant="rectangular" width="100%" height={200} />
      ) : error ? (
        <EmptyState icon={AlertTriangle} message="Could not load this run.">
          <CustomizableButton
            variant="outlined"
            text="Retry"
            icon={<RotateCcw size={16} />}
            onClick={loadRun}
          />
        </EmptyState>
      ) : (
        <Stack sx={{ gap: "12px" }}>
          {entries.map((e, i) => (
            <Box
              key={i}
              sx={{
                border: `1px solid ${palette.border.dark}`,
                borderRadius: "4px",
                p: "12px",
              }}
            >
              <Stack direction="row" alignItems="center" sx={{ gap: "8px", mb: "6px" }}>
                <Chip
                  label={e.kind === "model" ? "Model call" : "Tool call"}
                  variant={e.kind === "model" ? "success" : "info"}
                  uppercase={false}
                />
                <Typography variant="caption">{displayFormattedTime(e.created_at)}</Typography>
                <Typography variant="caption" sx={{ ml: "auto" }}>
                  {e.model}
                </Typography>
              </Stack>
              {e.kind === "model" ? (
                <>
                  <Typography variant="caption" color="text.secondary">
                    Prompt
                  </Typography>
                  <Box component="pre" sx={codeBlockSx}>
                    {e.request_messages
                      ? JSON.stringify(e.request_messages, null, 2)
                      : "(no content captured)"}
                  </Box>
                  <Divider sx={{ my: "6px" }} />
                  <Typography variant="caption" color="text.secondary">
                    Response
                  </Typography>
                  <Box component="pre" sx={codeBlockSx}>
                    {e.response_text ?? "(no content captured)"}
                  </Box>
                </>
              ) : (
                <Box component="pre" sx={codeBlockSx}>
                  {e.request_messages
                    ? JSON.stringify(e.request_messages, null, 2)
                    : "(no content captured)"}
                </Box>
              )}
            </Box>
          ))}
        </Stack>
      )}
    </Drawer>
  );
}
