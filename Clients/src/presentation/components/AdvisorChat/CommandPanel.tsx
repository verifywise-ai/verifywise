import { FC, useState, useCallback } from "react";
import {
  Box,
  Stack,
  TextField,
  Button,
  Typography,
  Collapse,
  IconButton,
  CircularProgress,
  useTheme,
} from "@mui/material";
import { ChevronDown, ChevronRight, Terminal } from "lucide-react";
import { useCommandPlane } from "../../../application/hooks/useCommandPlane";
import StepStatusPanel from "./StepStatusPanel";
import { text, border } from "../../themes/palette";

interface CommandPanelProps {
  /** LLM key to plan/execute the command with (mirrors the chat's selected key). */
  selectedLLMKeyId?: number;
}

/**
 * Command-mode section mounted inside the advisor chat. It is a self-contained
 * flow — distinct from the assistant-ui chat runtime — that plans a
 * natural-language command into ordered steps (via `useCommandPlane`) and runs
 * them, surfacing per-step status through `StepStatusPanel`.
 *
 * Collapsed by default so it never disturbs the default conversational UI.
 */
const CommandPanel: FC<CommandPanelProps> = ({ selectedLLMKeyId }) => {
  const theme = useTheme();
  const [open, setOpen] = useState(true);
  const [command, setCommand] = useState("");
  const { steps, statuses, plan, run, isRunning } = useCommandPlane(selectedLLMKeyId);

  const handleRun = useCallback(async () => {
    const trimmed = command.trim();
    if (!trimmed || isRunning) return;
    const planned = await plan(trimmed);
    if (planned.length > 0) {
      await run();
    }
  }, [command, isRunning, plan, run]);

  return (
    <Box
      sx={{
        borderBottom: `1px solid ${theme.palette.border?.light ?? border.light}`,
        backgroundColor: theme.palette.background.main ?? theme.palette.background.default,
        px: "12px",
        py: "8px",
      }}
    >
      {/* Toggle header */}
      <Stack
        direction="row"
        alignItems="center"
        spacing={1}
        onClick={() => setOpen((prev) => !prev)}
        sx={{ cursor: "pointer", userSelect: "none" }}
        data-testid="command-toggle"
      >
        <IconButton size="small" aria-label={open ? "Collapse command mode" : "Expand command mode"}>
          {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </IconButton>
        <Terminal size={14} color={theme.palette.text.secondary} />
        <Typography
          sx={{ fontSize: 13, fontWeight: 600, color: theme.palette.text.primary }}
        >
          Command mode
        </Typography>
        <Typography sx={{ fontSize: 11, color: text.tertiary }}>
          Run a multi-step action
        </Typography>
      </Stack>

      <Collapse in={open} timeout="auto" unmountOnExit>
        <Stack spacing={1} sx={{ mt: 1 }}>
          <Stack direction="row" spacing={1} alignItems="flex-start">
            <TextField
              data-testid="command-input"
              fullWidth
              size="small"
              multiline
              maxRows={3}
              placeholder="Describe a multi-step action, e.g. register a model and flag it for review"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void handleRun();
                }
              }}
              disabled={isRunning}
              InputProps={{
                sx: {
                  fontSize: theme.typography.body2.fontSize,
                  backgroundColor:
                    theme.palette.background.main ?? theme.palette.background.default,
                },
              }}
            />
            <Button
              data-testid="command-run"
              variant="contained"
              onClick={() => void handleRun()}
              disabled={isRunning || command.trim().length === 0}
              startIcon={
                isRunning ? <CircularProgress size={14} color="inherit" /> : undefined
              }
              sx={{
                textTransform: "none",
                fontSize: 13,
                fontWeight: 500,
                boxShadow: "none",
                whiteSpace: "nowrap",
                backgroundColor: theme.palette.primary.main,
                "&:hover": { backgroundColor: theme.palette.primary.dark, boxShadow: "none" },
              }}
            >
              {isRunning ? "Running" : "Run"}
            </Button>
          </Stack>

          {steps.length > 0 && <StepStatusPanel steps={steps} statuses={statuses} />}
        </Stack>
      </Collapse>
    </Box>
  );
};

export default CommandPanel;
