import { useState } from "react";
import { Alert, Box, CircularProgress, Typography, useTheme } from "@mui/material";
import Chip from "../../../components/Chip";
import { CustomizableButton } from "../../../components/button/customizable-button";
import {
  acceptAllSuggestedRisks,
  updateSuggestedRisk,
  type IntakeSuggestedRisk,
  type SuggestedRiskPatch,
  type SuggestedRisksBlock,
} from "../../../../application/repository/intakeForm.repository";
import SuggestedRiskEditor from "./SuggestedRiskEditor";

export interface SuggestedRisksSectionProps {
  submissionId: number;
  block: SuggestedRisksBlock | null;
  isModel: boolean;
  /** True once the submission is approved or rejected. */
  readOnly: boolean;
  /** Applied to the latest block, so actions that overlap don't undo each other. */
  onChange(update: (block: SuggestedRisksBlock) => SuggestedRisksBlock): void;
}

const hasMitigation = (r: IntakeSuggestedRisk) => r.mitigationPlan.trim().length > 0;
const ACCEPT_ALL = "accept-all";

/** The risks suggested for a submission, each to accept, dismiss or edit before approval. */
function SuggestedRisksSection({
  submissionId,
  block,
  isModel,
  readOnly,
  onChange,
}: SuggestedRisksSectionProps) {
  const theme = useTheme();
  // Several risks can be saving at once.
  const [busyIds, setBusyIds] = useState<ReadonlySet<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [acceptingAll, setAcceptingAll] = useState(false);
  // The last failure and what it was for (a risk id, or ACCEPT_ALL); another
  // action starting or succeeding leaves it showing.
  const [error, setError] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [skippedNote, setSkippedNote] = useState<number>(0);

  const muted = { fontSize: "13px", color: theme.palette.text.tertiary } as const;

  // No block: the suggestions stage never started (Retry starts it).
  if (!block) {
    return (
      <Typography sx={muted}>
        {readOnly
          ? "No risks were suggested for this submission."
          : "Risk suggestions haven't started. Use Retry in the score section to start them."}
      </Typography>
    );
  }
  if (block.status === "pending") {
    return (
      <Box sx={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <CircularProgress size={14} sx={{ color: theme.palette.text.tertiary }} />
        <Typography sx={muted}>Suggesting risks…</Typography>
      </Box>
    );
  }
  if (block.status === "ai_not_configured") {
    return (
      <Typography sx={muted}>
        AI scoring isn't set up for this form, so no risks are suggested.
      </Typography>
    );
  }
  if (block.status === "ai_failed") {
    return (
      <Typography sx={{ fontSize: "13px", color: theme.palette.status.error.text }}>
        Risk suggestions failed. Use Retry in the score section to try again.
      </Typography>
    );
  }
  if (block.items.length === 0) {
    return <Typography sx={muted}>No risks were suggested for this submission.</Typography>;
  }

  const current = block;
  const accepted = current.items.filter((i) => i.state === "accepted").length;
  const dismissed = current.items.filter((i) => i.state === "dismissed").length;
  const canAcceptAll = current.items.some((i) => i.state === "suggested" && hasMitigation(i));

  function replaceItem(item: IntakeSuggestedRisk) {
    onChange((latest) => ({
      ...latest,
      items: latest.items.map((i) => (i.id === item.id ? item : i)),
    }));
  }

  const clearErrorFor = (key: string) => {
    if (errorKey === key) setError(null);
  };

  async function act(risk: IntakeSuggestedRisk, patch: SuggestedRiskPatch) {
    setBusyIds((prev) => new Set(prev).add(risk.id));
    clearErrorFor(risk.id);
    try {
      const response = await updateSuggestedRisk(submissionId, risk.id, patch);
      replaceItem(response.data);
      setEditingId((prev) => (prev === risk.id ? null : prev));
    } catch {
      setErrorKey(risk.id);
      setError("Couldn't save the change. Please try again.");
    } finally {
      setBusyIds((prev) => {
        const next = new Set(prev);
        next.delete(risk.id);
        return next;
      });
    }
  }

  async function acceptAll() {
    setAcceptingAll(true);
    clearErrorFor(ACCEPT_ALL);
    try {
      const response = await acceptAllSuggestedRisks(submissionId);
      // The items as the server stored them.
      const stored = response.data.items;
      onChange((latest) => ({ ...latest, items: stored }));
      setSkippedNote(response.data.skipped);
    } catch {
      setErrorKey(ACCEPT_ALL);
      setError("Couldn't accept the suggestions. Please try again.");
    } finally {
      setAcceptingAll(false);
    }
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Typography sx={muted}>
          <span>{accepted}</span> <span>accepted</span> · <span>{dismissed}</span>{" "}
          <span>dismissed</span>
        </Typography>
        {!readOnly && (
          <CustomizableButton
            variant="outlined"
            size="small"
            text="Accept all"
            isDisabled={!canAcceptAll || acceptingAll || busyIds.size > 0}
            loading={acceptingAll}
            onClick={acceptAll}
            testId="suggested-risks-accept-all"
          />
        )}
      </Box>

      {current.items.map((risk) => {
        // Accept all and single-risk saves never overlap: one would overwrite
        // the other's result.
        const busy = busyIds.has(risk.id) || acceptingAll;
        return (
          <Box
            key={risk.id}
            data-testid={`suggested-risk-${risk.id}`}
            sx={{
              border: `1px solid ${theme.palette.border.dark}`,
              borderRadius: "4px",
              p: "12px",
              opacity: risk.state === "dismissed" ? 0.6 : 1,
            }}
          >
            <Box sx={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
              <Box sx={{ display: "flex", flexDirection: "column", gap: "4px", minWidth: 0 }}>
                <Typography sx={{ fontSize: "12px", color: theme.palette.text.tertiary }}>
                  {risk.source === "ai" ? "AI-suggested" : "From the risk catalog"}
                </Typography>
                <Typography
                  sx={{ fontSize: "13px", fontWeight: 600, color: theme.palette.text.primary }}
                >
                  {risk.name}
                </Typography>
                <Typography sx={{ fontSize: "12px", color: theme.palette.text.secondary }}>
                  <span>Likelihood:</span> <span>{risk.likelihood}</span> · <span>Severity:</span>{" "}
                  <span>{risk.severity}</span>
                  {isModel && risk.modelRiskCategory && (
                    <>
                      {" · "}
                      <span>{risk.modelRiskCategory}</span> · <span>{risk.modelRiskLevel}</span>
                    </>
                  )}
                </Typography>
                {!hasMitigation(risk) && (
                  <Typography sx={{ fontSize: "12px", color: theme.palette.status.error.text }}>
                    Add a mitigation plan before accepting this risk.
                  </Typography>
                )}
              </Box>
              <Box sx={{ display: "flex", alignItems: "flex-start", gap: "8px", flexShrink: 0 }}>
                {risk.state !== "suggested" && (
                  <Chip label={risk.state === "accepted" ? "Accepted" : "Dismissed"} />
                )}
              </Box>
            </Box>

            {!readOnly && editingId !== risk.id && (
              <Box sx={{ display: "flex", gap: "8px", mt: "8px", flexWrap: "wrap" }}>
                {risk.state === "suggested" ? (
                  <>
                    <CustomizableButton
                      variant="contained"
                      size="small"
                      text="Accept"
                      isDisabled={busy || !hasMitigation(risk)}
                      onClick={() => act(risk, { state: "accepted" })}
                      testId={`suggested-risk-${risk.id}-accept`}
                    />
                    <CustomizableButton
                      variant="outlined"
                      size="small"
                      text="Dismiss"
                      isDisabled={busy}
                      onClick={() => act(risk, { state: "dismissed" })}
                      testId={`suggested-risk-${risk.id}-dismiss`}
                    />
                  </>
                ) : (
                  <CustomizableButton
                    variant="outlined"
                    size="small"
                    text="Undo"
                    isDisabled={busy}
                    onClick={() => act(risk, { state: "suggested" })}
                    testId={`suggested-risk-${risk.id}-undo`}
                  />
                )}
                <CustomizableButton
                  variant="text"
                  size="small"
                  text="Edit"
                  isDisabled={busy}
                  onClick={() => setEditingId(risk.id)}
                  testId={`suggested-risk-${risk.id}-edit`}
                />
              </Box>
            )}

            {!readOnly && editingId === risk.id && (
              <SuggestedRiskEditor
                risk={risk}
                isModel={isModel}
                saving={busy}
                onSave={(patch) => act(risk, patch)}
                onCancel={() => setEditingId(null)}
              />
            )}
          </Box>
        );
      })}

      {current.droppedCount > 0 && (
        <Typography sx={muted}>
          <span>{current.droppedCount}</span> <span>lower-rated suggestions not shown</span>
        </Typography>
      )}
      {skippedNote > 0 && (
        <Typography sx={muted}>
          <span>{skippedNote}</span> <span>not accepted: they need a mitigation plan first</span>
        </Typography>
      )}
      {error && (
        <Alert severity="error" sx={{ fontSize: "13px" }}>
          {error}
        </Alert>
      )}
      {!readOnly && (
        <Typography sx={muted}>
          Accepted risks are added to the register when you approve.
        </Typography>
      )}
    </Box>
  );
}

export default SuggestedRisksSection;
