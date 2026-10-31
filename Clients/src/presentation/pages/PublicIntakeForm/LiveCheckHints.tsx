import { Box, Typography } from "@mui/material";
import type { LiveCheckHint } from "../../../domain/types/intakeLiveChecks";
import { HINT_KIND_COLORS } from "../../components/IntakeLiveChecks/hintKinds";

/** The field border a set of hints asks for: red for prohibited, amber for regulation or contradiction. */
export function fieldToneFor(hints: LiveCheckHint[]): "error" | "warning" | undefined {
  if (hints.some((h) => h.kind === "prohibited")) return "error";
  if (hints.some((h) => h.kind === "regulation" || h.kind === "contradiction")) return "warning";
  return undefined;
}

/**
 * Hints under one question, most serious first. Rule hint copy is English and
 * translated by the page translator; AI hints arrive in the submitter's
 * language, so they are excluded from translation. An AI hint dims once either
 * question it is about has changed, whichever of the two it is shown under.
 */
export function LiveCheckHints({
  hints,
  staleQuestionIds,
}: {
  hints: LiveCheckHint[];
  staleQuestionIds: Set<string>;
}) {
  if (hints.length === 0) return null;
  return (
    <Box
      component="ul"
      aria-live="polite"
      sx={{
        listStyle: "none",
        m: 0,
        mt: "8px",
        p: 0,
        display: "flex",
        flexDirection: "column",
        gap: "6px",
      }}
    >
      {hints.map((hint) => {
        const colors = HINT_KIND_COLORS[hint.kind];
        const isAi = hint.source === "ai";
        const stale =
          isAi &&
          (staleQuestionIds.has(hint.questionId) ||
            (hint.alsoQuestionId !== undefined && staleQuestionIds.has(hint.alsoQuestionId)));
        return (
          <Box
            component="li"
            key={hint.id}
            data-testid={`live-check-hint-${hint.kind}`}
            data-vw-no-translate={isAi ? "true" : undefined}
            sx={{
              p: "8px 12px",
              borderRadius: "4px",
              borderLeft: `3px solid ${colors.text}`,
              backgroundColor: colors.bg,
              opacity: stale ? 0.5 : 1,
              transition: "opacity 150ms",
            }}
          >
            <Typography sx={{ fontSize: "13px", lineHeight: 1.45, color: "text.primary" }}>
              <Box component="span" sx={{ fontWeight: 600 }}>
                {hint.title}
              </Box>
              {hint.ref && (
                <>
                  <Box component="span" aria-hidden sx={{ color: "text.secondary" }}>
                    {" · "}
                  </Box>
                  <Box component="span" sx={{ color: "text.secondary" }}>
                    {hint.ref}
                  </Box>
                </>
              )}
            </Typography>
            <Typography
              sx={{ fontSize: "13px", lineHeight: 1.45, color: "text.secondary", mt: "2px" }}
            >
              {hint.text}
            </Typography>
          </Box>
        );
      })}
    </Box>
  );
}

export default LiveCheckHints;
