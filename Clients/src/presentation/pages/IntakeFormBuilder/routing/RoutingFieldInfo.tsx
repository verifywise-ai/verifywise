import { Box, Typography, useTheme } from "@mui/material";
import { Info } from "lucide-react";
import VWTooltip from "../../../components/VWTooltip";
import { SCORE_BANDS } from "../../../../application/utils/intakeScoring/scoreMath";

export type RoutingNumberKey = "threshold" | "closeCallMargin" | "secondReviewRate";

// What each number does, as decided by laneFor (Servers/services/intakeRouting/
// routingRules.ts) and the second-review pick in approveSubmission.
const MEANING: Record<RoutingNumberKey, string> = {
  threshold:
    "Scores at or above the threshold go to expert reviewers. Lower scores go to regular reviewers.",
  closeCallMargin:
    "Scores closer to the threshold than this margin also go to expert reviewers, even below it.",
  secondReviewRate:
    "This share of approvals by regular reviewers is picked at random for a second review.",
};

// Whole strings, so the DOM translator can translate the aria-label.
const BUTTON_LABEL: Record<RoutingNumberKey, string> = {
  threshold: "About the threshold",
  closeCallMargin: "About the close-call margin",
  secondReviewRate: "About the second review share",
};

const ALWAYS_EXPERT =
  "Prohibited practices and submissions without a score always go to expert reviewers.";

interface RoutingFieldInfoProps {
  field: RoutingNumberKey;
}

/**
 * Info icon next to a routing number: what the number does and, for the score
 * fields, the 0-100 scale and its bands. Focusable, so the tooltip also opens
 * from the keyboard.
 */
const RoutingFieldInfo = ({ field }: RoutingFieldInfoProps) => {
  const theme = useTheme();
  const isScoreField = field !== "secondReviewRate";

  const content = (
    <Box
      data-testid={`routing-info-${field}`}
      sx={{ display: "flex", flexDirection: "column", gap: "8px", fontSize: "13px" }}
    >
      <Typography sx={{ fontSize: "13px" }}>{MEANING[field]}</Typography>
      {isScoreField && (
        <>
          <Box>
            <Typography sx={{ fontSize: "13px", fontWeight: 600 }}>
              Risk scores run from 0 to 100
            </Typography>
            <Box component="ul" sx={{ m: 0, pl: "16px" }}>
              {SCORE_BANDS.map(({ band, min, max }) => (
                <Box component="li" key={band} sx={{ fontSize: "13px" }}>
                  <span>{band}</span>
                  {`: ${min}–${max}`}
                </Box>
              ))}
            </Box>
          </Box>
          <Typography sx={{ fontSize: "13px" }}>{ALWAYS_EXPERT}</Typography>
        </>
      )}
    </Box>
  );

  return (
    <VWTooltip content={content} placement="right" maxWidth={320} describeChild>
      <Box
        component="span"
        role="button"
        tabIndex={0}
        aria-label={BUTTON_LABEL[field]}
        data-testid={`routing-info-trigger-${field}`}
        sx={{
          "display": "inline-flex",
          "cursor": "help",
          "borderRadius": "4px",
          "&:focus-visible": { outline: `2px solid ${theme.palette.primary.main}` },
        }}
      >
        <Info size={14} strokeWidth={1.5} color={theme.palette.text.accent} aria-hidden />
      </Box>
    </VWTooltip>
  );
};

export default RoutingFieldInfo;
