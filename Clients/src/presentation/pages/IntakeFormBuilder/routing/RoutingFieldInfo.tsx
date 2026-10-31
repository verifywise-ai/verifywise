import { useState, type KeyboardEvent } from "react";
import { Box, useTheme } from "@mui/material";
import { Info } from "lucide-react";
import VWTooltip from "../../../components/VWTooltip";
import { SCORE_BANDS } from "../../../../application/utils/intakeScoring/scoreMath";
import type { NumberKey } from "./RoutingSettingsSection";

// What each number does, as decided by laneFor (Servers/services/intakeRouting/
// routingRules.ts) and the second-review pick in approveSubmission.
const MEANING: Record<NumberKey, string> = {
  threshold:
    "Scores at or above the threshold go to expert reviewers. Lower scores go to regular reviewers, unless they are within the close-call margin.",
  closeCallMargin:
    "Scores closer to the threshold than this margin also go to expert reviewers, even below it.",
  secondReviewRate:
    "Approvals in the regular lane by anyone who isn't an expert reviewer are picked at random at this rate for a second review. Rejections aren't picked.",
};

// Whole strings, so the DOM translator can translate the aria-label.
const BUTTON_LABEL: Record<NumberKey, string> = {
  threshold: "About the threshold",
  closeCallMargin: "About the close-call margin",
  secondReviewRate: "About the second review share",
};

const ALWAYS_EXPERT =
  "Prohibited practices, and submissions without a score or whose AI scoring failed, always go to expert reviewers.";

interface RoutingFieldInfoProps {
  field: NumberKey;
}

/**
 * Info button next to a routing number: what the number does and, for the
 * score fields, the 0-100 scale and its bands. Opens on hover and focus, and
 * toggles on click, tap, Enter or Space.
 */
const RoutingFieldInfo = ({ field }: RoutingFieldInfoProps) => {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const isScoreField = field !== "secondReviewRate";

  // Paragraphs and a list pick up VWTooltip's spacing and font size.
  const content = (
    <Box data-testid={`routing-info-${field}`}>
      <p>{MEANING[field]}</p>
      {isScoreField && (
        <>
          <p>{ALWAYS_EXPERT}</p>
          <p>
            <strong>Risk scores run from 0 to 100</strong>
          </p>
          <ul>
            {SCORE_BANDS.map(({ band, min, max }) => (
              <li key={band}>
                <span>{band}</span>
                {`: ${min}–${max}`}
              </li>
            ))}
          </ul>
        </>
      )}
    </Box>
  );

  return (
    <VWTooltip
      content={content}
      placement="right"
      maxWidth={320}
      describeChild
      open={open}
      onOpen={() => setOpen(true)}
      onClose={() => setOpen(false)}
    >
      <Box
        component="button"
        type="button"
        aria-label={BUTTON_LABEL[field]}
        aria-expanded={open}
        data-testid={`routing-info-trigger-${field}`}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e: KeyboardEvent) => {
          if (e.key === "Escape") setOpen(false);
        }}
        sx={{
          "display": "inline-flex",
          "p": 0,
          "border": "none",
          "background": "none",
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
