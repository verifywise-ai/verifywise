import { useState } from "react";
import { Alert, Box, Typography, useTheme } from "@mui/material";
import Field from "../../../components/Inputs/Field";
import { CustomizableButton } from "../../../components/button/customizable-button";
import {
  recordSecondReview,
  resolveSecondReviewMiss,
} from "../../../../application/repository/intakeForm.repository";
import type { SecondReview, SubmissionRouting } from "../types";
import { serverErrorMessage } from "./serverErrorMessage";

const NOTE_MAX = 2000;

interface SecondReviewPanelProps {
  submissionId: number;
  secondReview: SecondReview | undefined;
  /** A senior reviewer or Admin who didn't make the approval. */
  canReview: boolean;
  /** Preview simulation: the actions show but are turned off. */
  actionsDisabled?: boolean;
  onChange: (routing: SubmissionRouting) => void;
}

const SecondReviewPanel = ({
  submissionId,
  secondReview,
  canReview,
  actionsDisabled = false,
  onChange,
}: SecondReviewPanelProps) => {
  const theme = useTheme();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!secondReview) return null;

  const trimmed = note.trim();
  const noteTooLong = trimmed.length > NOTE_MAX;

  const run = async (action: () => Promise<{ data: SubmissionRouting }>) => {
    if (actionsDisabled) return;
    setBusy(true);
    setError(null);
    try {
      const response = await action();
      setNote("");
      onChange(response.data);
    } catch (err) {
      setError(serverErrorMessage(err) ?? "Failed to save the second review. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const isOpen = secondReview.status === "open";
  const isUnresolvedMiss = secondReview.status === "missed" && !secondReview.resolvedAt;

  const label = (text: string, value?: string) => (
    <Typography sx={{ fontSize: "13px", color: theme.palette.text.secondary }}>
      <span>{text}</span> {value}
    </Typography>
  );

  return (
    <Box
      data-testid="second-review-panel"
      sx={{
        border: `1px solid ${theme.palette.border.dark}`,
        borderRadius: "4px",
        p: "16px",
        display: "flex",
        flexDirection: "column",
        gap: "8px",
      }}
    >
      <Typography sx={{ fontSize: "14px", fontWeight: 600, color: theme.palette.text.primary }}>
        Second review
      </Typography>

      {isOpen && !canReview && (
        <Typography sx={{ fontSize: "13px", color: theme.palette.text.tertiary }}>
          A senior reviewer will check this approval.
        </Typography>
      )}

      {isOpen && canReview && (
        <>
          <Field
            id="second-review-note"
            label="Note"
            placeholder="Required when something was missed"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
          />
          <Box sx={{ display: "flex", gap: "8px" }}>
            <CustomizableButton
              variant="outlined"
              size="small"
              text="Agree"
              isDisabled={actionsDisabled || busy || noteTooLong}
              onClick={() =>
                run(() => recordSecondReview(submissionId, "agreed", trimmed || undefined))
              }
            />
            <CustomizableButton
              variant="outlined"
              size="small"
              text="Missed something"
              isDisabled={actionsDisabled || busy || !trimmed || noteTooLong}
              onClick={() => run(() => recordSecondReview(submissionId, "missed", trimmed))}
            />
          </Box>
        </>
      )}

      {secondReview.status === "agreed" && (
        <>
          <Typography sx={{ fontSize: "13px", color: theme.palette.text.secondary }}>
            Agreed with the approval
          </Typography>
          {secondReview.note && label("Note:", secondReview.note)}
        </>
      )}

      {secondReview.status === "missed" && (
        <>
          <Typography sx={{ fontSize: "13px", color: theme.palette.text.secondary }}>
            Something was missed
          </Typography>
          {secondReview.note && label("Note:", secondReview.note)}
          {secondReview.resolvedAt && (
            <>
              <Typography sx={{ fontSize: "13px", color: theme.palette.text.secondary }}>
                Resolved
              </Typography>
              {secondReview.resolutionNote && label("Resolution:", secondReview.resolutionNote)}
            </>
          )}
        </>
      )}

      {isUnresolvedMiss && canReview && (
        <>
          <Field
            id="second-review-resolution"
            label="Resolution note"
            isRequired
            placeholder="What was done about it?"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
          />
          <Box>
            <CustomizableButton
              variant="outlined"
              size="small"
              text="Mark resolved"
              isDisabled={actionsDisabled || busy || !trimmed || noteTooLong}
              onClick={() => run(() => resolveSecondReviewMiss(submissionId, trimmed))}
            />
          </Box>
        </>
      )}

      {error && (
        <Alert severity="error" sx={{ fontSize: "13px" }}>
          {error}
        </Alert>
      )}
    </Box>
  );
};

export default SecondReviewPanel;
