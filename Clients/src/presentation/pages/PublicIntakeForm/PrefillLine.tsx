import { Box, Typography } from "@mui/material";
import StatusBadge from "../../components/StatusBadge";
import { CustomizableButton } from "../../components/button/customizable-button";
import type { PrefillSuggestion } from "../../../domain/types/intakeLiveChecks";

/**
 * Shown under an answer filled from the vendor document: who wrote it, where
 * it was read from, and a way to confirm it. File name and location are kept
 * out of translation; the fixed words around them are translated on their own.
 */
export function PrefillLine({
  suggestion,
  fileName,
  confirmed,
  onConfirm,
}: {
  suggestion: PrefillSuggestion;
  fileName: string;
  confirmed: boolean;
  onConfirm: () => void;
}) {
  return (
    <Box
      data-testid={`prefill-line-${suggestion.questionId}`}
      sx={{ mt: "8px", display: "flex", alignItems: "center", flexWrap: "wrap", gap: "8px" }}
    >
      <StatusBadge
        label={confirmed ? "Confirmed by submitter" : "AI-suggested"}
        variant={confirmed ? "success" : "info"}
        size="small"
        uppercase={false}
      />
      <Typography component="span" sx={{ fontSize: "12px", color: "text.secondary" }}>
        <span>Read from</span>{" "}
        <Box component="span" data-vw-no-translate="true" sx={{ fontWeight: 500 }}>
          {fileName}
        </Box>
        {suggestion.location && (
          <>
            <span aria-hidden>, </span>
            <Box component="span" data-vw-no-translate="true">
              {suggestion.location}
            </Box>
          </>
        )}
      </Typography>
      {!confirmed && (
        <CustomizableButton
          variant="text"
          text="Confirm"
          onClick={onConfirm}
          testId={`prefill-confirm-${suggestion.questionId}`}
          sx={{ height: 30, minWidth: 0, px: "8px", fontSize: "12px" }}
        />
      )}
    </Box>
  );
}

export default PrefillLine;
