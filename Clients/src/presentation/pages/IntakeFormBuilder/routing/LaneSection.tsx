import { useState } from "react";
import { Alert, Box, Typography, useTheme } from "@mui/material";
import Chip from "../../../components/Chip";
import Field from "../../../components/Inputs/Field";
import StandardModal from "../../../components/Modals/StandardModal";
import { CustomizableButton } from "../../../components/button/customizable-button";
import { escalateSubmission } from "../../../../application/repository/intakeForm.repository";
import type { SubmissionRouting } from "../types";
import { serverErrorMessage } from "./serverErrorMessage";

const REASON_MAX = 1000;

interface LaneChipProps {
  routing: SubmissionRouting | null | undefined;
  /** False when the form doesn't route by risk score; a stored lane is then only a record. */
  routingEnabled?: boolean;
}

/** The lane a submission sits in. */
export const LaneChip = ({ routing, routingEnabled = true }: LaneChipProps) => {
  if (!routingEnabled) return <Chip label="Routing off" uppercase={false} />;
  if (!routing) return <Chip label="Not routed yet" uppercase={false} />;
  return routing.lane === "senior" ? (
    <Chip label="Senior review" uppercase={false} variant="warning" />
  ) : (
    <Chip label="Standard review" uppercase={false} variant="success" />
  );
};

/** Why the submission is in its lane. Sentences with values are static text around the values. */
const ReasonLine = ({ routing }: { routing: SubmissionRouting }) => {
  switch (routing.reason) {
    case "close_call":
      return (
        <>
          <span>Within</span> {routing.closeCallMargin} <span>points of the threshold</span>
        </>
      );
    case "prohibited":
      return <span>Prohibited practice</span>;
    case "no_score":
      return <span>No usable score</span>;
    case "at_or_above_threshold":
      return (
        <>
          <span>Score</span> {routing.score}, <span>threshold</span> {routing.threshold}
        </>
      );
    case "below_threshold":
      return (
        <>
          <span>Score</span> {routing.score}, <span>below</span> {routing.threshold}
        </>
      );
    case "override_raised":
      return <span>Band raised by a reviewer</span>;
    case "escalated":
      return (
        <>
          <span>Sent to senior review:</span> {routing.escalation?.reason ?? ""}
        </>
      );
    default:
      return null;
  }
};

interface LaneSectionProps {
  submissionId: number;
  routing: SubmissionRouting | null;
  canDecide: boolean;
  decideBlockedReason?: string | null;
  laneReviewers: Array<{ id: number; name: string }>;
  canEscalate: boolean;
  onEscalated: (routing: SubmissionRouting) => void;
}

const LaneSection = ({
  submissionId,
  routing,
  canDecide,
  decideBlockedReason,
  laneReviewers,
  canEscalate,
  onEscalated,
}: LaneSectionProps) => {
  const theme = useTheme();
  const [escalateOpen, setEscalateOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = reason.trim();
  const reasonValid = trimmed.length > 0 && trimmed.length <= REASON_MAX;

  const closeEscalate = () => {
    setEscalateOpen(false);
    setReason("");
    setError(null);
  };

  const handleEscalate = async () => {
    if (!reasonValid || isSending) return;
    setIsSending(true);
    setError(null);
    try {
      const response = await escalateSubmission(submissionId, trimmed);
      closeEscalate();
      onEscalated(response.data);
    } catch (err) {
      setError(serverErrorMessage(err) ?? "Failed to send to senior review. Please try again.");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Box
      data-testid="lane-section"
      sx={{
        border: `1px solid ${theme.palette.border.dark}`,
        borderRadius: "4px",
        p: "16px",
        display: "flex",
        flexDirection: "column",
        gap: "8px",
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
        <LaneChip routing={routing} />
        {routing && (
          <Typography
            data-testid="lane-reason"
            sx={{ fontSize: "13px", color: theme.palette.text.tertiary }}
          >
            <ReasonLine routing={routing} />
          </Typography>
        )}
        {canEscalate && (
          <Box sx={{ ml: "auto" }}>
            <CustomizableButton
              variant="outlined"
              size="small"
              text="Send to senior review"
              onClick={() => setEscalateOpen(true)}
            />
          </Box>
        )}
      </Box>

      {!canDecide && (
        <Typography
          data-testid="lane-blocked"
          sx={{ fontSize: "13px", color: theme.palette.text.secondary }}
        >
          {laneReviewers.length > 0 ? (
            <>
              <span>Only</span> {laneReviewers.map((r) => r.name).join(", ")}{" "}
              <span>can decide this submission.</span>
            </>
          ) : (
            (decideBlockedReason ?? "")
          )}
        </Typography>
      )}

      <StandardModal
        isOpen={escalateOpen}
        onClose={closeEscalate}
        title="Send to senior review"
        description="Senior reviewers will decide this submission. Say why it needs a closer look."
        onSubmit={handleEscalate}
        submitButtonText="Send to senior review"
        isSubmitDisabled={!reasonValid}
        isSubmitting={isSending}
        maxWidth="480px"
      >
        <Box sx={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <Field
            id="escalate-reason"
            label="Reason"
            isRequired
            placeholder="Why does this need a senior reviewer?"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
          />
          {error && (
            <Alert severity="error" sx={{ fontSize: "13px" }}>
              {error}
            </Alert>
          )}
        </Box>
      </StandardModal>
    </Box>
  );
};

export default LaneSection;
