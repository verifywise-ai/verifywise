import { Box, Tooltip, Typography, useTheme } from "@mui/material";
import StatusBadge from "../../components/StatusBadge";
import {
  HINT_KIND_ORDER,
  type ILiveChecks,
  type LiveCheckHint,
  type PrefillProvenance,
} from "../../../domain/types/intakeLiveChecks";
import {
  HINT_KIND_COLORS,
  HINT_KIND_LABELS,
  hintsForQuestion,
} from "../../components/IntakeLiveChecks/hintKinds";

/** Every hint stored on the submission: the server's rule hints plus the job's AI hints. */
export const allLiveCheckHints = (liveChecks: ILiveChecks | null): LiveCheckHint[] =>
  liveChecks ? [...(liveChecks.rules ?? []), ...(liveChecks.ai?.hints ?? [])] : [];

/**
 * "Intake checks": counts by hint kind and the state of the AI checks. Shown
 * beside the risk section; nothing when the submission has no live checks.
 */
export function LiveChecksSection({ liveChecks }: { liveChecks: ILiveChecks | null }) {
  const theme = useTheme();
  if (!liveChecks) return null;
  const hints = allLiveCheckHints(liveChecks);
  const counts = HINT_KIND_ORDER.map((kind) => ({
    kind,
    count: hints.filter((h) => h.kind === kind).length,
  })).filter((c) => c.count > 0);
  const aiStatus = liveChecks.ai?.status;

  return (
    <Box
      data-testid="live-checks-section"
      sx={{
        p: "16px",
        border: `1px solid ${theme.palette.border.dark}`,
        borderRadius: "4px",
        display: "flex",
        flexDirection: "column",
        gap: "8px",
      }}
    >
      <Typography sx={{ fontSize: "14px", fontWeight: 600, color: theme.palette.text.primary }}>
        Intake checks
      </Typography>
      {counts.length === 0 ? (
        <Typography sx={{ fontSize: "13px", color: theme.palette.text.secondary }}>
          No answers were flagged.
        </Typography>
      ) : (
        counts.map(({ kind, count }) => (
          <Box
            key={kind}
            data-testid={`live-checks-count-${kind}`}
            sx={{ display: "flex", alignItems: "center", gap: "8px" }}
          >
            <Box
              sx={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                backgroundColor: HINT_KIND_COLORS[kind].text,
                flexShrink: 0,
              }}
            />
            <Typography sx={{ fontSize: "13px", color: theme.palette.text.primary, flex: 1 }}>
              {HINT_KIND_LABELS[kind]}
            </Typography>
            <Typography sx={{ fontSize: "13px", fontWeight: 600 }}>{count}</Typography>
          </Box>
        ))
      )}
      {aiStatus === "pending" && (
        <Typography sx={{ fontSize: "12px", color: theme.palette.text.tertiary }}>
          AI checks still running
        </Typography>
      )}
      {aiStatus === "failed" && (
        <Typography sx={{ fontSize: "12px", color: theme.palette.text.tertiary }}>
          AI checks unavailable
        </Typography>
      )}
    </Box>
  );
}

/** Compact chips for the hints on one answer: kind label and reference, text on hover. */
export function LiveCheckChips({ hints }: { hints: LiveCheckHint[] }) {
  if (hints.length === 0) return null;
  return (
    <Box sx={{ display: "flex", flexWrap: "wrap", gap: "4px", mt: "4px" }}>
      {hints.map((hint) => {
        const colors = HINT_KIND_COLORS[hint.kind];
        return (
          <Tooltip
            key={hint.id}
            title={
              <span data-vw-no-translate={hint.source === "ai" ? "true" : undefined}>
                {hint.text}
              </span>
            }
            arrow
          >
            <Box
              component="span"
              tabIndex={0}
              data-testid={`live-check-chip-${hint.kind}`}
              sx={{
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                px: "8px",
                height: 22,
                borderRadius: "4px",
                fontSize: "12px",
                color: colors.text,
                backgroundColor: colors.bg,
                border: `1px solid ${colors.border}`,
                cursor: "help",
              }}
            >
              <span>{HINT_KIND_LABELS[hint.kind]}</span>
              {hint.ref && (
                <>
                  <span aria-hidden>·</span>
                  <span>{hint.ref}</span>
                </>
              )}
            </Box>
          </Tooltip>
        );
      })}
    </Box>
  );
}

/** "AI-suggested from <file>, <location>" plus whether the submitter confirmed it. */
export function PrefillProvenanceLabel({ provenance }: { provenance: PrefillProvenance }) {
  const theme = useTheme();
  return (
    <Box
      data-testid="prefill-provenance"
      sx={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "8px", mt: "4px" }}
    >
      <Typography component="span" sx={{ fontSize: "12px", color: theme.palette.text.secondary }}>
        <span>AI-suggested from</span>{" "}
        <Box component="span" data-vw-no-translate="true" sx={{ fontWeight: 500 }}>
          {provenance.fileName}
        </Box>
        {provenance.location && (
          <>
            <span aria-hidden>, </span>
            <Box component="span" data-vw-no-translate="true">
              {provenance.location}
            </Box>
          </>
        )}
      </Typography>
      <StatusBadge
        label={provenance.confirmed ? "Confirmed by submitter" : "Not confirmed"}
        variant={provenance.confirmed ? "success" : "warning"}
        size="small"
        uppercase={false}
      />
    </Box>
  );
}

/** Chips and prefill label for one answer in the review modal; nothing when there is neither. */
export function AnswerLiveChecks({
  liveChecks,
  questionId,
}: {
  liveChecks: ILiveChecks | null;
  questionId: string;
}) {
  if (!liveChecks) return null;
  const hints = hintsForQuestion(allLiveCheckHints(liveChecks), questionId);
  const provenance = liveChecks.prefill?.[questionId];
  if (hints.length === 0 && !provenance) return null;
  return (
    <Box data-testid={`answer-live-checks-${questionId}`}>
      <LiveCheckChips hints={hints} />
      {provenance && <PrefillProvenanceLabel provenance={provenance} />}
    </Box>
  );
}

export default LiveChecksSection;
