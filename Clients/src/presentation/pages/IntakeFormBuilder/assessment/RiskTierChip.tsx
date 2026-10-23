import { Box, CircularProgress, Typography, useTheme } from "@mui/material";
import Chip from "../../../components/Chip";
import type { IntakeSubmission } from "../../../../application/repository/intakeForm.repository";
import { isAssessmentV2 } from "../../../../application/utils/intakeScoring/isAssessmentV2";

/**
 * A submission's risk in the submissions list. AI-scored (v2): the number next
 * to its own band ("64 High"), "≥70" when it is the rule minimum alone, a
 * spinner while scoring runs, nothing without a score. A reviewer's band
 * override follows as "set to Critical", so number and band never disagree.
 * Older (v1) scores keep their tier chip.
 */
function RiskTierChip({ submission }: { submission: IntakeSubmission }) {
  const theme = useTheme();
  const assessment = submission.riskAssessment;

  if (isAssessmentV2(assessment)) {
    if (assessment.status === "pending") {
      return <CircularProgress size={14} sx={{ color: theme.palette.text.accent }} />;
    }
    if (assessment.finalScore === null) return null;
    const override = submission.riskOverride?.tier;
    const overrideNote =
      override && override !== assessment.tier ? (
        <Typography sx={{ fontSize: "12px", color: theme.palette.text.tertiary }}>
          <span>set to</span> <span>{override}</span>
        </Typography>
      ) : null;
    return (
      <Box sx={{ display: "flex", alignItems: "center", gap: "6px" }}>
        {assessment.rulesOnly ? (
          <Typography sx={{ fontSize: "13px", color: theme.palette.text.primary }}>
            ≥{assessment.finalScore}
          </Typography>
        ) : (
          <>
            <Typography
              sx={{ fontSize: "13px", fontWeight: 600, color: theme.palette.text.primary }}
            >
              {assessment.finalScore}
            </Typography>
            <Chip label={assessment.tier ?? ""} />
          </>
        )}
        {overrideNote}
      </Box>
    );
  }

  if (!submission.riskTier && !assessment) {
    return <CircularProgress size={14} sx={{ color: theme.palette.text.accent }} />;
  }
  const tier = (submission.riskTier || assessment?.tier || "").toLowerCase();
  if (!tier) return <Chip label="Pending" />;
  const label = tier.charAt(0).toUpperCase() + tier.slice(1);
  return <Chip label={label} />;
}

export default RiskTierChip;
