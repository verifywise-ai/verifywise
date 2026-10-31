import { useState } from "react";
import { Box } from "@mui/material";
import Field from "../../components/Inputs/Field";
import { MAX_REVIEW_DAYS, MIN_REVIEW_DAYS } from "../../../domain/intake/reviewTime";

const REVIEW_DAYS_ERROR = `Use a whole number from ${MIN_REVIEW_DAYS} to ${MAX_REVIEW_DAYS}`;

/** The inline error for a review time, or undefined when it can be saved. */
export function getReviewDaysError(value: number): string | undefined {
  if (!Number.isInteger(value) || value < MIN_REVIEW_DAYS || value > MAX_REVIEW_DAYS) {
    return REVIEW_DAYS_ERROR;
  }
  return undefined;
}

/** The number a typed text stands for; NaN when empty. */
const parseDraft = (text: string): number => (text.trim() === "" ? NaN : Number(text));

interface ReviewTimeFieldProps {
  value: number;
  onChange: (value: number) => void;
}

/** Per-form review time, named with its due date in the submitter's confirmation email. */
const ReviewTimeField = ({ value, onChange }: ReviewTimeFieldProps) => {
  // Text being typed, so the field can be emptied (or show "05") without
  // snapping back. It is shown only while it still stands for the current
  // value, so a value loaded or reset from outside replaces it.
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft !== null && Object.is(parseDraft(draft), value) ? draft : String(value);

  return (
    <Box data-testid="review-time-field">
      <Field
        id="review-days"
        type="number"
        label="Review time (business days)"
        value={Number.isNaN(value) && draft === null ? "" : shown}
        onChange={(e) => {
          const text = e.target.value;
          setDraft(text);
          onChange(parseDraft(text));
        }}
        min={MIN_REVIEW_DAYS}
        max={MAX_REVIEW_DAYS}
        error={getReviewDaysError(value)}
        helperText="Sets the due date named in the confirmation email to the submitter"
      />
    </Box>
  );
};

export default ReviewTimeField;
