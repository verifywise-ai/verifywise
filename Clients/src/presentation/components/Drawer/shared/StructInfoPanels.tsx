import React from "react";
import { Stack, Typography } from "@mui/material";

interface StructInfoPanelsProps {
  summary?: string | null;
  summaryLabel?: string;
  questions?: string[] | null;
  evidenceExamples?: string[] | null;
}

/**
 * Three coloured info panels shown at the top of a control's Details tab:
 * Summary / Requirement summary (grey), Key Questions (pink), Evidence
 * Examples (green). Each panel renders only if its data is present.
 */
const StructInfoPanels: React.FC<StructInfoPanelsProps> = ({
  summary,
  summaryLabel = "Summary",
  questions,
  evidenceExamples,
}) => {
  return (
    <>
      {summary && (
        <Stack
          sx={{
            border: "1px solid #eee",
            padding: "12px",
            backgroundColor: "background.accent",
            borderRadius: "4px",
          }}
        >
          <Typography fontSize={13} sx={{ marginBottom: "8px" }}>
            <strong>{summaryLabel}:</strong>
          </Typography>
          <Typography fontSize={13} color="#666">
            {summary}
          </Typography>
        </Stack>
      )}

      {questions && questions.length > 0 && (
        <Stack
          sx={{
            border: "1px solid #e8d5d5",
            padding: "12px",
            backgroundColor: "#fef5f5",
            borderRadius: "4px",
          }}
        >
          <Typography fontSize={13} sx={{ marginBottom: "8px", fontWeight: 600 }}>
            Key Questions:
          </Typography>
          <Stack spacing={1}>
            {questions.map((q, idx) => (
              <Typography key={idx} fontSize={12} color="#666" sx={{ pl: 1, position: "relative" }}>
                • {q}
              </Typography>
            ))}
          </Stack>
        </Stack>
      )}

      {evidenceExamples && evidenceExamples.length > 0 && (
        <Stack
          sx={{
            border: "1px solid #d5e8d5",
            padding: "12px",
            backgroundColor: "#f5fef5",
            borderRadius: "4px",
          }}
        >
          <Typography fontSize={13} sx={{ marginBottom: "8px", fontWeight: 600 }}>
            Evidence Examples:
          </Typography>
          <Stack spacing={1}>
            {evidenceExamples.map((ex, idx) => (
              <Typography key={idx} fontSize={12} color="#666" sx={{ pl: 1, position: "relative" }}>
                • {ex}
              </Typography>
            ))}
          </Stack>
        </Stack>
      )}
    </>
  );
};

export default StructInfoPanels;
