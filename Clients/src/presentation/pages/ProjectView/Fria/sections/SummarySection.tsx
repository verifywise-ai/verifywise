import { useState } from "react";
import { Box, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { SelectChangeEvent } from "@mui/material/Select";
import Field from "../../../../components/Inputs/Field";
import Select from "../../../../components/Inputs/Select";
import Chip from "../../../../components/Chip";
import { FriaAssessment, FriaRight } from "../../../../../application/hooks/useFria";
import FriaEvidenceButton from "../FriaEvidenceButton";
import FriaSectionCard from "../FriaSectionCard";
import { EU_ACT_LINK } from "../friaConstants";
import { brand } from "../../../../themes/palette";

interface SummarySectionProps {
  assessment: FriaAssessment;
  rights: FriaRight[];
  onUpdate: (data: Partial<FriaAssessment>) => void;
  isSaving: boolean;
}

const DEPLOYMENT_DECISION_OPTIONS = [
  { _id: "Proceed", name: "Proceed" },
  { _id: "Proceed with conditions", name: "Proceed with conditions" },
  { _id: "Do not proceed", name: "Do not proceed" },
  { _id: "Pending", name: "Pending" },
];

function SummarySection({ assessment, rights, onUpdate, isSaving }: SummarySectionProps) {
  const theme = useTheme();

  const [decisionConditions, setDecisionConditions] = useState(
    assessment.decision_conditions ?? "",
  );

  const flaggedRights = rights.filter((r) => r.flagged);

  const handleDeploymentDecisionChange = (e: SelectChangeEvent<string | number>) => {
    onUpdate({ deployment_decision: e.target.value as string });
  };

  const handleDecisionConditionsBlur = () => {
    if (decisionConditions !== (assessment.decision_conditions ?? "")) {
      onUpdate({ decision_conditions: decisionConditions });
    }
  };

  return (
    <FriaSectionCard
      title="8. Summary & recommendation"
      subtitle="Review the overall assessment and record the deployment decision."
      euActContent={
        <>
          <strong>EU AI Act reference:</strong>{" "}
          <a
            href={`${EU_ACT_LINK}#art_27`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: brand.primary }}
          >
            Article 27(5)
          </a>{" "}
          requires deployers to inform the market surveillance authority of the outcome of the
          assessment, and to use the results as input when notifying authorities under{" "}
          <a
            href={`${EU_ACT_LINK}#art_49`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: brand.primary }}
          >
            Article 49(1)
          </a>
          . The FRIA must be kept up to date and repeated when circumstances materially change.
        </>
      }
    >
      <Box
        sx={{
          padding: "16px",
          border: "1px solid #d0d5dd",
          borderRadius: "4px",
          backgroundColor: theme.palette.background.default,
          display: "flex",
          flexDirection: "column",
          gap: "12px",
        }}
        aria-label="Assessment summary"
      >
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "8px",
          }}
        >
          <Box>
            <Typography
              sx={{ fontSize: 11, color: theme.palette.text.secondary, marginBottom: "4px" }}
            >
              Completion
            </Typography>
            <Typography sx={{ fontSize: 13, fontWeight: 600, color: theme.palette.text.primary }}>
              {assessment.completion_pct}%
            </Typography>
          </Box>
          <Box>
            <Typography
              sx={{ fontSize: 11, color: theme.palette.text.secondary, marginBottom: "4px" }}
            >
              Risk score
            </Typography>
            <Box sx={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Typography sx={{ fontSize: 13, fontWeight: 600, color: theme.palette.text.primary }}>
                {assessment.risk_score}/100
              </Typography>
              <Chip label={assessment.risk_level} size="small" />
            </Box>
          </Box>
          <Box>
            <Typography
              sx={{ fontSize: 11, color: theme.palette.text.secondary, marginBottom: "4px" }}
            >
              Rights flagged
            </Typography>
            <Typography sx={{ fontSize: 13, fontWeight: 600, color: theme.palette.text.primary }}>
              {assessment.rights_flagged} of {rights.length}
            </Typography>
          </Box>
          <Box>
            <Typography
              sx={{ fontSize: 11, color: theme.palette.text.secondary, marginBottom: "4px" }}
            >
              Status
            </Typography>
            <Chip label={assessment.status} size="small" />
          </Box>
        </Box>

        {flaggedRights.length > 0 && (
          <Box>
            <Typography
              sx={{ fontSize: 11, color: theme.palette.text.secondary, marginBottom: "8px" }}
            >
              Flagged rights
            </Typography>
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              {flaggedRights.map((right) => (
                <Chip key={right.id} label={right.right_title} variant="warning" size="small" />
              ))}
            </Box>
          </Box>
        )}
      </Box>

      <Select
        id="deployment-decision"
        label="Deployment decision"
        placeholder="Select..."
        value={assessment.deployment_decision ?? ""}
        items={DEPLOYMENT_DECISION_OPTIONS}
        onChange={handleDeploymentDecisionChange}
        disabled={isSaving}
      />

      <Field
        id="decision-conditions"
        label="Decision conditions / rationale"
        placeholder="Describe any conditions that must be met before deployment, or explain the rationale behind the deployment decision..."
        type="description"
        rows={4}
        value={decisionConditions}
        onChange={(e) => setDecisionConditions(e.target.value)}
        onBlur={handleDecisionConditionsBlur}
        disabled={isSaving}
      />

      <FriaEvidenceButton friaId={assessment.id} entityType="section_8" />
    </FriaSectionCard>
  );
}

export default SummarySection;
