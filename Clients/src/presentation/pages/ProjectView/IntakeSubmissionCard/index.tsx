import { useState } from "react";
import { Box, Typography, Stack, Collapse, useTheme } from "@mui/material";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useEntityIntakeSubmission } from "../../../../application/hooks/useEntityIntakeSubmission";
import type { IntakeSubmissionField } from "../../../../application/repository/intakeForm.repository";
import useFormattedDate from "../../../../application/hooks/useFormattedDate";
import { formatAnswer } from "../../../../application/utils/intakeAnswerFormat";
import { isEmptyAnswer } from "../../../../application/utils/intakeFormLogic";

interface IntakeSubmissionCardProps {
  projectId: number;
}

function FieldRow({ field }: { field: IntakeSubmissionField }) {
  const theme = useTheme();
  const formatDate = useFormattedDate();

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
        {formatAnswer(field, field.value, formatDate)}
      </Typography>
    </Box>
  );
}

export default function IntakeSubmissionCard({ projectId }: IntakeSubmissionCardProps) {
  const theme = useTheme();
  const formatDate = useFormattedDate();
  const { data: submission, isLoading } = useEntityIntakeSubmission("use_case", projectId);
  const [showAdditional, setShowAdditional] = useState(false);

  if (isLoading || !submission) return null;

  // Calculated fields count when the submission stored them (null shows "—");
  // submissions from before a field existed have no key and show nothing.
  const hasAnswer = (f: IntakeSubmissionField) =>
    f.type === "calculated" ? Boolean(f.answered) : !isEmptyAnswer(f.value);
  const mappedFields = submission.fields.filter((f) => f.isMapped && hasAnswer(f));
  const unmappedFields = submission.fields.filter((f) => !f.isMapped && hasAnswer(f));

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
        {submission.submittedAt && <> &middot; {formatDate(submission.submittedAt)}</>}
        {(submission.submitterName || submission.submitterEmail) && (
          <> &middot; {submission.submitterName || submission.submitterEmail}</>
        )}
        {submission.riskScore && submission.riskScore.finalScore !== null ? (
          <>
            {" "}
            &middot; <span>Risk score:</span>{" "}
            {submission.riskScore.rulesOnly ? (
              <>
                <span>at least</span> {submission.riskScore.finalScore} <span>(rules only)</span>
              </>
            ) : (
              <>
                {submission.riskScore.finalScore} (
                <span>{submission.riskScore.band ?? submission.riskTier}</span>)
              </>
            )}
            {/* A reviewer's band override, shown apart so number and band agree */}
            {submission.riskOverrideTier &&
              submission.riskOverrideTier !== submission.riskScore.band && (
                <>
                  {" "}
                  &middot; <span>band set to</span> <span>{submission.riskOverrideTier}</span>
                </>
              )}
          </>
        ) : (
          !submission.riskScore && submission.riskTier && <> &middot; Risk: {submission.riskTier}</>
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
              "display": "flex",
              "alignItems": "center",
              "gap": "6px",
              "mt": "12px",
              "background": "none",
              "border": "none",
              "cursor": "pointer",
              "padding": 0,
              "color": theme.palette.text.tertiary,
              "fontSize": "13px",
              "fontWeight": 500,
              "fontFamily": "inherit",
              "&:hover": { color: theme.palette.text.primary },
            }}
          >
            {showAdditional ? (
              <ChevronUp size={15} strokeWidth={1.5} />
            ) : (
              <ChevronDown size={15} strokeWidth={1.5} />
            )}
            {/* The label is its own text node so the DOM translator can match it. */}
            <span>
              <span>Additional answers</span> ({unmappedFields.length})
            </span>
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
