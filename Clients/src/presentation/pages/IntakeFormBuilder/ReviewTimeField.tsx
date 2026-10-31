import { useState } from "react";
import { Box } from "@mui/material";
import Field from "../../components/Inputs/Field";

export const DEFAULT_REVIEW_DAYS = 3;
export const MIN_REVIEW_DAYS = 1;
export const MAX_REVIEW_DAYS = 30;

const REVIEW_DAYS_ERROR = "Use a whole number from 1 to 30";

/** The inline error for a review time, or undefined when it can be saved. */
export function getReviewDaysError(value: number | undefined): string | undefined {
  if (value === undefined) return undefined; // the server keeps its default
  if (!Number.isInteger(value) || value < MIN_REVIEW_DAYS || value > MAX_REVIEW_DAYS) {
    return REVIEW_DAYS_ERROR;
  }
  return undefined;
}

interface ReviewTimeFieldProps {
  value: number | undefined;
  onChange: (value: number) => void;
}

/** Per-form review time, named with its due date in the submitter's confirmation email. */
const ReviewTimeField = ({ value, onChange }: ReviewTimeFieldProps) => {
  // Text being typed, so the field can be emptied without snapping back to a number.
  const [draft, setDraft] = useState<string | null>(null);
  const shown = value ?? DEFAULT_REVIEW_DAYS;

  return (
    <Box data-testid="review-time-field">
      <Field
        id="review-days"
        type="number"
        label="Review time (business days)"
        value={draft ?? String(shown)}
        onChange={(e) => {
          const text = e.target.value;
          setDraft(text);
          onChange(text.trim() === "" ? NaN : Number(text));
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
