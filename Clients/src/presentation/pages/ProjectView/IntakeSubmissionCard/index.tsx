import { useState } from "react";
import {
  Box,
  Typography,
  Stack,
  Collapse,
  useTheme,
} from "@mui/material";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useEntityIntakeSubmission } from "../../../../application/hooks/useEntityIntakeSubmission";
import type { IntakeSubmissionField } from "../../../../application/repository/intakeForm.repository";
import dayjs from "dayjs";

interface IntakeSubmissionCardProps {
  projectId: number;
}

function renderFieldValue(field: IntakeSubmissionField): string {
  const { value, type, options } = field;
  if (value === null || value === undefined || value === "") return "\u2014";

  if (type === "checkbox") return value ? "Yes" : "No";

  if (type === "date") {
    return dayjs(value as string).isValid()
      ? dayjs(value as string).format("MMMM D, YYYY")
      : String(value);
  }

  if (type === "select" && options) {
    const match = options.find((o) => o.value === value);
    return match ? match.label : String(value);
  }

  if (type === "multiselect" && Array.isArray(value) && options) {
    return value
      .map((v) => options.find((o) => o.value === v)?.label || v)
      .join(", ");
  }

  return String(value);
}

function FieldRow({ field }: { field: IntakeSubmissionField }) {
  const theme = useTheme();

  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: "200px 1fr",
        columnGap: "16px",
        py: "8px",
      }}
    >
      <Typography
        sx={{
          fontSize: 13,
          fontWeight: 500,
          color: theme.palette.text.secondary,
        }}
      >
        {field.label}
      </Typography>
      <Typography
        sx={{
          fontSize: 13,
          color: theme.palette.text.primary,
          wordBreak: "break-word",
        }}
      >
        {renderFieldValue(field)}
      </Typography>
    </Box>
  );
}

export default function IntakeSubmissionCard({
  projectId,
}: IntakeSubmissionCardProps) {
  const theme = useTheme();
  const { data: submission, isLoading } = useEntityIntakeSubmission(
    "use_case",
    projectId
  );
  const [showAdditional, setShowAdditional] = useState(false);

  if (isLoading || !submission) return null;

  const mappedFields = submission.fields.filter(
    (f) => f.isMapped && f.value !== null && f.value !== undefined && f.value !== ""
  );
  const unmappedFields = submission.fields.filter(
    (f) => !f.isMapped && f.value !== null && f.value !== undefined && f.value !== ""
  );

  if (mappedFields.length === 0 && unmappedFields.length === 0) return null;

  const allFields = [...mappedFields, ...unmappedFields];
  const hasAdditional = unmappedFields.length > 0;

  return (
    <Box
      sx={{
        background: theme.palette.background.paper,
        border: `1.5px solid ${theme.palette.border.light}`,
        borderRadius: theme.shape.borderRadius,
        padding: theme.spacing(5, 6),
        marginBottom: theme.spacing(4),
        boxShadow: "none",
        width: "100%",
      }}
    >
      {/* Section title */}
      <Typography
        sx={{
          fontWeight: 600,
          fontSize: 16,
          color: theme.palette.text.primary,
          mb: "8px",
        }}
      >
        Intake form submission
      </Typography>

      {/* Meta line */}
      <Typography sx={{ fontSize: 12, color: theme.palette.text.accent, mb: 3 }}>
        {submission.formName}
        {submission.submittedAt && (
          <> &middot; {dayjs(submission.submittedAt).format("MMM D, YYYY")}</>
        )}
        {(submission.submitterName || submission.submitterEmail) && (
          <> &middot; {submission.submitterName || submission.submitterEmail}</>
        )}
        {submission.riskTier && (
          <> &middot; Risk: {submission.riskTier}</>
        )}
      </Typography>

      {/* Mapped fields — always visible */}
      <Stack
        sx={{
          borderTop: `1px solid ${theme.palette.border.light}`,
        }}
      >
        {mappedFields.map((field) => (
          <FieldRow key={field.fieldId} field={field} />
        ))}
      </Stack>

      {/* Additional answers toggle */}
      {hasAdditional && (
        <>
          <Box
            component="button"
            type="button"
            onClick={() => setShowAdditional((prev) => !prev)}
            sx={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              mt: "12px",
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 0,
              color: theme.palette.text.tertiary,
              fontSize: "13px",
              fontWeight: 500,
              fontFamily: "inherit",
              "&:hover": { color: theme.palette.text.primary },
            }}
          >
            {showAdditional ? (
              <ChevronUp size={15} strokeWidth={1.5} />
            ) : (
              <ChevronDown size={15} strokeWidth={1.5} />
            )}
            Additional answers ({unmappedFields.length})
          </Box>
          <Collapse in={showAdditional} timeout="auto" unmountOnExit>
            <Stack
              sx={{
                mt: "8px",
                borderTop: `1px solid ${theme.palette.border.light}`,
              }}
            >
              {unmappedFields.map((field) => (
                <FieldRow key={field.fieldId} field={field} />
              ))}
            </Stack>
          </Collapse>
        </>
      )}

      {/* If no mapped fields, show all as flat list */}
      {mappedFields.length === 0 && unmappedFields.length > 0 && !hasAdditional && (
        <Stack
          sx={{
            borderTop: `1px solid ${theme.palette.border.light}`,
          }}
        >
          {allFields.map((field) => (
            <FieldRow key={field.fieldId} field={field} />
          ))}
        </Stack>
      )}
    </Box>
  );
}
