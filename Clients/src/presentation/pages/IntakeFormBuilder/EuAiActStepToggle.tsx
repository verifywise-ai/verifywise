import { Box, Typography, useTheme } from "@mui/material";
import Checkbox from "../../components/Inputs/Checkbox";

interface EuAiActStepToggleProps {
  entityType: string;
  enabled: boolean;
  hasRiskMapping: boolean;
  onToggle: (enabled: boolean) => void;
}

const DESCRIPTION =
  "Submitters answer the EU AI Act risk questionnaire before the form's questions. Reviewers see the result, and it becomes the use case's risk classification on approval.";
const UNMAP_NOTE =
  "Turning this on unmaps the questions that set the AI risk classification and the high-risk role. They stay on the form; delete them so submitters are not asked twice.";
const OFF_NOTICE =
  "EU AI Act questions are off. Submissions won't get a rule-based EU AI Act classification, so their risk score has no rule-based minimum and is marked \"not rule-checked\". Use cases approved from this form won't get an EU AI Act classification either.";

const EuAiActStepToggle = ({
  entityType,
  enabled,
  hasRiskMapping,
  onToggle,
}: EuAiActStepToggleProps) => {
  const theme = useTheme();
  if (entityType !== "use_case") return null;

  return (
    <Box
      sx={{ display: "flex", alignItems: "flex-start", gap: "4px", cursor: "pointer", mt: "12px" }}
      onClick={() => onToggle(!enabled)}
    >
      <Checkbox
        id="eu-ai-act-risk-step"
        isChecked={enabled}
        value="euAiActRiskStepEnabled"
        onChange={() => {}}
        size="small"
        label=""
        sx={{ p: 0, mt: "1px", flexShrink: 0 }}
      />
      <Box>
        <Typography sx={{ fontSize: "12px", fontWeight: 600, color: theme.palette.text.secondary }}>
          EU AI Act risk classification step
        </Typography>
        <Typography sx={{ fontSize: "11px", color: theme.palette.text.accent }}>
          {DESCRIPTION}
        </Typography>
        {hasRiskMapping && (
          <Typography sx={{ fontSize: "11px", color: theme.palette.text.accent, mt: "4px" }}>
            {UNMAP_NOTE}
          </Typography>
        )}
        {!enabled && (
          <Typography
            data-testid="eu-ai-act-step-off-notice"
            sx={{
              fontSize: "11px",
              color: theme.palette.status.warning.text,
              backgroundColor: theme.palette.status.warning.bg,
              border: `1px solid ${theme.palette.status.warning.border}`,
              borderRadius: "4px",
              p: "8px",
              mt: "8px",
            }}
          >
            {OFF_NOTICE}
          </Typography>
        )}
      </Box>
    </Box>
  );
};

export default EuAiActStepToggle;
