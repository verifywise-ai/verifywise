import { Box, Typography, useTheme } from "@mui/material";
import Checkbox from "../../components/Inputs/Checkbox";

interface LiveChecksToggleProps {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
}

const HELP =
  "AI checks and vendor document prefill need the form's LLM key. Rule checks match English answers.";

/** Per-form switch for live checks: rule hints, AI hints and vendor document prefill. */
const LiveChecksToggle = ({ enabled, onToggle }: LiveChecksToggleProps) => {
  const theme = useTheme();
  return (
    <Box
      data-testid="live-checks-toggle"
      sx={{ display: "flex", alignItems: "flex-start", gap: "4px", cursor: "pointer", mt: "12px" }}
      onClick={() => onToggle(!enabled)}
    >
      <Checkbox
        id="live-checks-enabled"
        isChecked={enabled}
        value="liveChecksEnabled"
        onChange={() => {}}
        size="small"
        label=""
        sx={{ p: 0, mt: "1px", flexShrink: 0 }}
      />
      <Box>
        <Typography sx={{ fontSize: "12px", fontWeight: 600, color: theme.palette.text.secondary }}>
          Check answers while the submitter types
        </Typography>
        <Typography sx={{ fontSize: "11px", color: theme.palette.text.accent }}>{HELP}</Typography>
      </Box>
    </Box>
  );
};

export default LiveChecksToggle;
