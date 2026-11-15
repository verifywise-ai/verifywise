import React from "react";
import { Stack, Typography } from "@mui/material";
import { radiusPx, palette as vwPalette } from "../../../themes/palette";

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
            border: `1px solid ${vwPalette.border.light}`,
            padding: "12px",
            backgroundColor: "background.accent",
            borderRadius: radiusPx.sm,
          }}
        >
          <Typography fontSize={13} sx={{ marginBottom: "8px" }}>
            <strong>{summaryLabel}:</strong>
          </Typography>
          <Typography fontSize={13} color={vwPalette.text.tertiary}>
            {summary}
          </Typography>
        </Stack>
      )}

      {questions && questions.length > 0 && (
        <Stack
          sx={{
            border: `1px solid ${vwPalette.accent.red.border}`,
            padding: "12px",
            backgroundColor: vwPalette.accent.red.bg,
            borderRadius: radiusPx.sm,
          }}
        >
          <Typography fontSize={13} sx={{ marginBottom: "8px", fontWeight: 600 }}>
            Key Questions:
          </Typography>
          <Stack spacing={1}>
            {questions.map((q, idx) => (
              <Typography
                key={idx}
                fontSize={12}
                color={vwPalette.text.tertiary}
                sx={{ pl: 1, position: "relative" }}
              >
                • {q}
              </Typography>
            ))}
          </Stack>
        </Stack>
      )}

      {evidenceExamples && evidenceExamples.length > 0 && (
        <Stack
          sx={{
            border: `1px solid ${vwPalette.status.success.border}`,
            padding: "12px",
            backgroundColor: vwPalette.status.success.bg,
            borderRadius: radiusPx.sm,
          }}
        >
          <Typography fontSize={13} sx={{ marginBottom: "8px", fontWeight: 600 }}>
            Evidence Examples:
          </Typography>
          <Stack spacing={1}>
            {evidenceExamples.map((ex, idx) => (
              <Typography
                key={idx}
                fontSize={12}
                color={vwPalette.text.tertiary}
                sx={{ pl: 1, position: "relative" }}
              >
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
