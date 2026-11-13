import { Box, Typography } from "@mui/material";
import type { FormField } from "../IntakeFormBuilder/types";
import { formatCalculatedValue } from "../../../application/utils/intakeAnswerFormat";
import { radiusPx, palette as vwPalette } from "../../themes/palette";

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
        sx={{ fontSize: "14px", color: vwPalette.text.secondary, fontWeight: 500, mb: "6px" }}
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
          border: `1px solid ${vwPalette.border.light}`,
          borderRadius: radiusPx.sm,
          backgroundColor: vwPalette.background.alt,
          fontSize: "14px",
          color: vwPalette.text.primary,
        }}
      >
        {formatCalculatedValue(value, field)}
      </Box>
      {value === null && missingLabel && (
        <Typography
          sx={{ fontSize: "12px", color: vwPalette.text.disabled, mt: "4px", lineHeight: 1.4 }}
        >
          {`Fill in ${missingLabel} to calculate`}
        </Typography>
      )}
      {field.helpText && (
        <Typography
          sx={{ fontSize: "12px", color: vwPalette.text.disabled, mt: "4px", lineHeight: 1.4 }}
        >
          {field.helpText}
        </Typography>
      )}
    </Box>
  );
}

export default CalculatedFieldDisplay;
