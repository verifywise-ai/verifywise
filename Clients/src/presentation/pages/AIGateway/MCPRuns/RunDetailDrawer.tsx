import { useEffect, useState } from "react";
import { Drawer, Box, Stack, Typography, Divider, CircularProgress } from "@mui/material";
import { apiServices } from "../../../../infrastructure/api/networkServices";
import Chip from "../../../components/Chip";
import palette from "../../../themes/palette";

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

  useEffect(() => {
    let cancelled = false;
    (async () => {
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
    })();
    return () => {
      cancelled = true;
    };
  }, [runId]);

  const codeBlockSx = { whiteSpace: "pre-wrap" as const, fontSize: "12px", m: 0 };

  return (
    <Drawer anchor="right" open onClose={onClose} PaperProps={{ sx: { width: 560, p: "16px" } }}>
      <Typography variant="h6" sx={{ mb: "8px" }}>
        Run {runId.slice(0, 12)}…
      </Typography>
      {loading ? (
        <Stack alignItems="center" sx={{ py: "32px" }}>
          <CircularProgress size={24} />
        </Stack>
      ) : error ? (
        <Typography sx={{ fontSize: "13px", color: palette.text.tertiary }}>
          Couldn't load this run.
        </Typography>
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
                <Typography variant="caption">
                  {new Date(e.created_at).toLocaleTimeString()}
                </Typography>
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
