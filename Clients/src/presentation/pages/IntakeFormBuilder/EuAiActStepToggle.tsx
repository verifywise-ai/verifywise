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
  "Turning this on unmaps the question that sets the AI risk classification. The question stays on the form.";

const EuAiActStepToggle = ({
  entityType,
  enabled,
  hasRiskMapping,
  onToggle,
}: EuAiActStepToggleProps) => {
  const theme = useTheme();
  if (entityType !== "use_case") return null;

  const description = hasRiskMapping ? `${DESCRIPTION} ${UNMAP_NOTE}` : DESCRIPTION;

  return (
    <Box
      sx={{ display: "flex", alignItems: "flex-start", gap: "4px", cursor: "pointer", mt: "12px" }}
      onClick={() => onToggle(!enabled)}
    >
      <Checkbox
        id="eu-ai-act-risk-step"
        isChecked={enabled}
        value="euAiActRiskStepEnabled"
        onChange={() => onToggle(!enabled)}
        size="small"
        label=""
        sx={{ p: 0, mt: "1px", flexShrink: 0 }}
      />
      <Box>
        <Typography sx={{ fontSize: "12px", fontWeight: 600, color: theme.palette.text.secondary }}>
          EU AI Act risk classification step
        </Typography>
        <Typography sx={{ fontSize: "11px", color: theme.palette.text.accent }}>
          {description}
        </Typography>
      </Box>
    </Box>
  );
};

export default EuAiActStepToggle;
