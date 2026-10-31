import { Box, Typography } from "@mui/material";
import type { FormField } from "../IntakeFormBuilder/types";
import { formatCalculatedValue } from "../../../application/utils/intakeAnswerFormat";

interface CalculatedFieldDisplayProps {
  field: FormField;
  value: number | null;
  /** Label of the first visible input still missing, or null. */
  missingLabel: string | null;
}

/** A read-only calculated value on the public form, announced as it changes. */
export function CalculatedFieldDisplay({
  field,
  value,
  missingLabel,
}: CalculatedFieldDisplayProps) {
  const labelId = `field-${field.id}-label`;
  return (
    <Box>
      <Typography
        id={labelId}
        sx={{ fontSize: "14px", color: "#334155", fontWeight: 500, mb: "6px" }}
      >
        {field.label}
      </Typography>
      <Box
        role="status"
        aria-live="polite"
        aria-labelledby={labelId}
        data-testid={`calculated-${field.id}`}
        sx={{
          minHeight: "30px",
          display: "flex",
          alignItems: "center",
          px: "12px",
          border: "1px solid #e2e8f0",
          borderRadius: "4px",
          backgroundColor: "#f8fafc",
          fontSize: "14px",
          color: "#0f172a",
        }}
      >
        {formatCalculatedValue(value, field)}
      </Box>
      {value === null && missingLabel && (
        <Typography sx={{ fontSize: "12px", color: "#94a3b8", mt: "4px", lineHeight: 1.4 }}>
          {`Fill in ${missingLabel} to calculate`}
        </Typography>
      )}
      {field.helpText && (
        <Typography sx={{ fontSize: "12px", color: "#94a3b8", mt: "4px", lineHeight: 1.4 }}>
          {field.helpText}
        </Typography>
      )}
    </Box>
  );
}

export default CalculatedFieldDisplay;
