/**
 * @fileoverview LLM-suggested risks section on the Scan Details page: collapsible list,
 * ignore menu, and "add to risk register" modal.
 *
 * What a user does with a suggestion is saved on the scan: an added suggestion keeps
 * the id of the risk it created, an ignored one keeps the reason. On reload, added and
 * ignored suggestions are summarised in one line and can be shown; an ignore can be undone.
 * Saving the "Add to risk register" form creates the risk and links it to the suggestion
 * in one request, so a suggestion can never be added twice. Only users who can edit
 * AI Detection see the actions.
 *
 * @module pages/AIDetection/ScanDetails/SuggestedRisksSection
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { Box, Collapse, Popover, Typography } from "@mui/material";
import { ChevronDown, ChevronRight, Plus, Sparkles } from "lucide-react";
import { CustomizableButton } from "../../../components/button/customizable-button";
import Chip from "../../../components/Chip";
import { VWLink } from "../../../components/Link";
import AddNewRiskForm from "../../../components/AddNewRiskForm";
import StandardModal from "../../../components/Modals/StandardModal";
import useUsers from "../../../../application/hooks/useUsers";
import { useCan } from "../../../../application/hooks/useCan";
import { useTranslation } from "../../../../application/hooks/useTranslation";
import { fill } from "../../../../i18n/fill";
import {
  addSuggestedRiskToRegister,
  getSuggestedRiskActions,
  recordSuggestedRiskAction,
  restoreSuggestedRisk,
} from "../../../../application/repository/aiDetection.repository";
import { SuggestedRisk, DIMENSION_LABELS } from "../../../../domain/ai-detection/riskScoringTypes";
import type {
  SuggestedRiskAction,
  SuggestedRiskIgnoreReason,
} from "../../../../domain/ai-detection/types";
import type { RiskFormValues, MitigationFormValues } from "../../../../domain/types/riskForm.types";
import { palette, radiusPx } from "../../../themes/palette";
import { DIMENSION_CHIP_COLORS } from "./scanDetailsConfig";
import {
  getRiskLevelLabel,
  mapSuggestionToMitigationForm,
  mapSuggestionToRiskForm,
} from "../../../components/AddNewRiskForm/riskSuggestionMappers";

interface SuggestedRisksSectionProps {
  scanId: number;
  repositoryOwner?: string;
  repositoryName?: string;
  suggestions: SuggestedRisk[];
  onSuccess: () => void;
  onError: (message: string) => void;
}

const IGNORE_REASON_LABELS: Record<SuggestedRiskIgnoreReason, string> = {
  already_added: "This has already been added before",
  not_real_risk: "This is not a real risk",
};

/** Same key the backend stores: the risk name, trimmed and lower-cased. */
export function suggestionKey(riskName: string): string {
  return riskName.trim().toLowerCase().slice(0, 255);
}

type SuggestionState = "pending" | "added" | "ignored";

function stateOf(action: SuggestedRiskAction | undefined): SuggestionState {
  if (!action) return "pending";
  if (action.action === "ignored") return "ignored";
  // A suggestion whose risk was deleted can be added again
  return action.risk_deleted ? "pending" : "added";
}

const menuItemSx = {
  "display": "flex",
  "alignItems": "center",
  "gap": "8px",
  "p": "6px 8px",
  "borderRadius": radiusPx.sm,
  "cursor": "pointer",
  "&:hover": { backgroundColor: palette.background.hover },
};

export function SuggestedRisksSection({
  scanId,
  repositoryOwner,
  repositoryName,
  suggestions,
  onSuccess,
  onError,
}: SuggestedRisksSectionProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  // Same keys the endpoints authorize on; adding also creates a risk
  const canEdit = useCan("aiDetection.edit");
  const canAddRisks = useCan("risks.edit");
  const [isSuggestedRiskModalOpen, setIsSuggestedRiskModalOpen] = useState(false);
  const [selectedSuggestedRisk, setSelectedSuggestedRisk] = useState<RiskFormValues | null>(null);
  const [selectedSuggestedMitigation, setSelectedSuggestedMitigation] =
    useState<Partial<MitigationFormValues> | null>(null);
  const suggestedRiskSubmitRef = useRef<(() => void) | null>(null);
  const { users, loading: usersLoading } = useUsers();
  const [actions, setActions] = useState<SuggestedRiskAction[]>([]);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [ignoreMenuAnchor, setIgnoreMenuAnchor] = useState<{
    el: HTMLElement;
    suggestion: SuggestedRisk;
  } | null>(null);
  const [showSuggestedRisks, setShowSuggestedRisks] = useState(false);
  const [showAdded, setShowAdded] = useState(false);
  const [showIgnored, setShowIgnored] = useState(false);
  const addingSuggestionRef = useRef<SuggestedRisk | null>(null);

  const loadActions = useCallback(
    async (signal?: AbortSignal) => {
      const latest = await getSuggestedRiskActions(scanId, signal);
      setActions(latest);
      return latest;
    },
    [scanId],
  );

  useEffect(() => {
    const controller = new AbortController();
    loadActions(controller.signal).catch(() => {
      if (!controller.signal.aborted) {
        onError("Failed to load what was done with the suggested risks");
      }
    });
    return () => controller.abort();
    // onError is a fresh closure on every parent render; load once per scan
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadActions]);

  const actionsByKey = useMemo(() => {
    const map = new Map<string, SuggestedRiskAction>();
    for (const action of actions) map.set(action.suggestion_key, action);
    return map;
  }, [actions]);

  const grouped = useMemo(() => {
    const pending: SuggestedRisk[] = [];
    const added: SuggestedRisk[] = [];
    const ignored: SuggestedRisk[] = [];
    const seen = new Set<string>();
    for (const suggestion of suggestions) {
      const key = suggestionKey(suggestion.risk_name);
      if (seen.has(key)) continue; // the same suggestion listed twice is shown once
      seen.add(key);
      const state = stateOf(actionsByKey.get(key));
      if (state === "added") added.push(suggestion);
      else if (state === "ignored") ignored.push(suggestion);
      else pending.push(suggestion);
    }
    return { pending, added, ignored };
  }, [suggestions, actionsByKey]);

  const handleAddSuggestedRisk = async (suggestion: SuggestedRisk) => {
    const key = suggestionKey(suggestion.risk_name);
    setBusyKey(key);
    try {
      // Someone may have added it from another tab or session since this page loaded
      const latest = await loadActions();
      const current = latest.find((a) => a.suggestion_key === key);
      if (stateOf(current) === "added") {
        onError("This suggestion is already in the risk register");
        return;
      }
    } catch {
      onError("Failed to check the suggested risk. Try again.");
      return;
    } finally {
      setBusyKey(null);
    }

    const scanReference =
      repositoryOwner && repositoryName
        ? `AI Detection scan #${scanId} (${repositoryOwner}/${repositoryName})`
        : `AI Detection scan #${scanId}`;
    addingSuggestionRef.current = suggestion;
    setSelectedSuggestedRisk(mapSuggestionToRiskForm(suggestion, { sourceLabel: scanReference }));
    setSelectedSuggestedMitigation(mapSuggestionToMitigationForm(suggestion));
    setIsSuggestedRiskModalOpen(true);
  };

  const handleSuggestedRiskModalClose = () => {
    setIsSuggestedRiskModalOpen(false);
    setSelectedSuggestedRisk(null);
    setSelectedSuggestedMitigation(null);
    addingSuggestionRef.current = null;
  };

  const handleSuggestedRiskSubmit = () => {
    if (suggestedRiskSubmitRef.current) {
      suggestedRiskSubmitRef.current();
    }
  };

  /** Create the risk and link it to the suggestion being added, in one request. */
  const createRiskFromSuggestion = useCallback(
    (body: Record<string, unknown>) => {
      const suggestion = addingSuggestionRef.current;
      if (!suggestion) {
        return Promise.reject(new Error("No suggestion is being added"));
      }
      return addSuggestedRiskToRegister(scanId, suggestion.risk_name, body);
    },
    [scanId],
  );

  const refreshActions = () => {
    loadActions().catch(() => {
      // The list keeps its last state; the next load shows the change
    });
  };

  const handleSuggestedRiskSuccess = () => {
    onSuccess();
    handleSuggestedRiskModalClose();
    refreshActions();
  };

  const handleSuggestedRiskError = (message: string) => {
    onError(message || "Failed to add risk");
    // Someone may have added the suggestion meanwhile; show it as added
    refreshActions();
  };

  const handleIgnoreSuggestion = async (reason: SuggestedRiskIgnoreReason) => {
    if (!ignoreMenuAnchor) return;
    const { suggestion } = ignoreMenuAnchor;
    setIgnoreMenuAnchor(null);
    const key = suggestionKey(suggestion.risk_name);
    setBusyKey(key);
    try {
      setActions(
        await recordSuggestedRiskAction(scanId, {
          risk_name: suggestion.risk_name,
          action: "ignored",
          reason,
        }),
      );
    } catch {
      onError("Failed to ignore the suggestion");
    } finally {
      setBusyKey(null);
    }
  };

  const handleRestore = async (action: SuggestedRiskAction) => {
    setBusyKey(action.suggestion_key);
    try {
      setActions(await restoreSuggestedRisk(scanId, action.id));
    } catch {
      onError("Failed to restore the suggestion");
    } finally {
      setBusyKey(null);
    }
  };

  if (suggestions.length === 0) {
    return null;
  }

  const renderSuggestion = (suggestion: SuggestedRisk) => {
    const key = suggestionKey(suggestion.risk_name);
    const action = actionsByKey.get(key);
    const state = stateOf(action);
    const riskLevel = getRiskLevelLabel(suggestion.likelihood, suggestion.severity);
    const dimColors = DIMENSION_CHIP_COLORS[suggestion.dimension] || DIMENSION_CHIP_COLORS.security;
    const dimLabel = DIMENSION_LABELS[suggestion.dimension] || suggestion.dimension;
    const isBusy = busyKey === key;

    return (
      <Box
        key={key}
        data-testid={`suggested-risk-${state}`}
        sx={{
          "border": `1px solid ${palette.border.light}`,
          "borderRadius": radiusPx.sm,
          "p": "8px",
          "backgroundColor": palette.background.main,
          "opacity": state === "ignored" ? 0.7 : 1,
          "&:hover": { borderColor: palette.border.dark },
        }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: "8px",
          }}
        >
          <Box
            sx={{
              flex: 1,
              minWidth: 0,
              display: "flex",
              flexDirection: "column",
              gap: "8px",
            }}
          >
            <Box sx={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
              <Typography sx={{ fontSize: "14px", fontWeight: 600, color: palette.text.primary }}>
                {suggestion.risk_name}
              </Typography>
              <Chip
                label={dimLabel}
                backgroundColor={dimColors.bg}
                textColor={dimColors.text}
                uppercase={false}
                size="small"
              />
              <Chip label={riskLevel.text} size="small" uppercase={false} />
              {state === "added" && (
                <Chip
                  label="Added to risk register"
                  variant="success"
                  size="small"
                  uppercase={false}
                />
              )}
            </Box>
            <Typography
              sx={{
                fontSize: "13px",
                color: palette.text.secondary,
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
            >
              {suggestion.risk_description}
            </Typography>
            {state === "pending" && (
              <Box sx={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                {suggestion.risk_category.map((cat) => (
                  <Chip key={cat} label={cat} variant="default" uppercase={false} size="small" />
                ))}
              </Box>
            )}
            {state === "ignored" && action?.ignore_reason && (
              <Typography sx={{ fontSize: "13px", color: palette.text.tertiary }}>
                {fill(t("Ignored: {reason}"), {
                  reason: t(IGNORE_REASON_LABELS[action.ignore_reason]),
                })}
              </Typography>
            )}
          </Box>
          <Box sx={{ display: "flex", gap: "8px", flexShrink: 0, alignItems: "center" }}>
            {state === "pending" && canEdit && (
              <>
                <CustomizableButton
                  text="Ignore"
                  variant="text"
                  isDisabled={isBusy}
                  onClick={(e: React.MouseEvent<HTMLElement>) =>
                    setIgnoreMenuAnchor({ el: e.currentTarget, suggestion })
                  }
                  sx={{ whiteSpace: "nowrap", color: palette.text.tertiary }}
                />
                {canAddRisks && (
                  <CustomizableButton
                    text="Add to risk register"
                    variant="outlined"
                    isDisabled={isBusy}
                    startIcon={<Plus size={14} strokeWidth={1.5} />}
                    onClick={() => handleAddSuggestedRisk(suggestion)}
                    sx={{ whiteSpace: "nowrap" }}
                  />
                )}
              </>
            )}
            {state === "added" && action?.risk_id && (
              <VWLink
                onClick={() => navigate(`/risk-management?riskId=${action.risk_id}`)}
                showUnderline={false}
              >
                View risk
              </VWLink>
            )}
            {state === "ignored" && action && canEdit && (
              <CustomizableButton
                text="Restore"
                variant="text"
                isDisabled={isBusy}
                onClick={() => handleRestore(action)}
                sx={{ whiteSpace: "nowrap" }}
              />
            )}
          </Box>
        </Box>
      </Box>
    );
  };

  const { pending, added, ignored } = grouped;

  return (
    <>
      <Box
        sx={{
          backgroundColor: palette.background.main,
          border: `1px solid ${palette.border.light}`,
          borderRadius: radiusPx.sm,
          p: "14px 16px",
        }}
      >
        <Box
          sx={{
            "display": "flex",
            "alignItems": "center",
            "gap": "8px",
            "cursor": "pointer",
            "&:hover": { opacity: 0.8 },
          }}
          onClick={() => setShowSuggestedRisks(!showSuggestedRisks)}
        >
          {showSuggestedRisks ? (
            <ChevronDown size={14} strokeWidth={1.5} color={palette.text.accent} />
          ) : (
            <ChevronRight size={14} strokeWidth={1.5} color={palette.text.accent} />
          )}
          <Sparkles size={12} color={palette.accent.purple.text} strokeWidth={1.5} />
          <Typography sx={{ fontSize: 13, color: palette.text.secondary, fontWeight: 500 }}>
            Suggested risks
          </Typography>
          {pending.length > 0 && (
            <Chip label={String(pending.length)} size="small" variant="default" />
          )}
        </Box>
        <Collapse in={showSuggestedRisks}>
          <Box sx={{ mt: "12px", display: "flex", flexDirection: "column", gap: "8px" }}>
            {pending.length === 0 && (
              <Typography sx={{ fontSize: "13px", color: palette.text.tertiary }}>
                All suggested risks for this scan have been handled.
              </Typography>
            )}
            {pending.map(renderSuggestion)}

            {(added.length > 0 || ignored.length > 0) && (
              <Box
                sx={{ display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" }}
                data-testid="suggested-risks-summary"
              >
                <Typography sx={{ fontSize: "13px", color: palette.text.tertiary }}>
                  {fill(t("{added} added to the risk register, {ignored} ignored"), {
                    added: added.length,
                    ignored: ignored.length,
                  })}
                </Typography>
                {added.length > 0 && (
                  <VWLink
                    onClick={() => setShowAdded(!showAdded)}
                    showUnderline={false}
                    showIcon={false}
                  >
                    {showAdded ? "Hide added" : "Show added"}
                  </VWLink>
                )}
                {ignored.length > 0 && (
                  <VWLink
                    onClick={() => setShowIgnored(!showIgnored)}
                    showUnderline={false}
                    showIcon={false}
                  >
                    {showIgnored ? "Hide ignored" : "Show ignored"}
                  </VWLink>
                )}
              </Box>
            )}
            {showAdded && added.map(renderSuggestion)}
            {showIgnored && ignored.map(renderSuggestion)}
          </Box>
        </Collapse>

        {/* Ignore reason popover */}
        <Popover
          open={Boolean(ignoreMenuAnchor)}
          anchorEl={ignoreMenuAnchor?.el}
          onClose={() => setIgnoreMenuAnchor(null)}
          anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
          transformOrigin={{ vertical: "top", horizontal: "left" }}
          slotProps={{
            paper: {
              sx: {
                mt: "4px",
                borderRadius: radiusPx.sm,
                boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                border: `1px solid ${palette.border.light}`,
              },
            },
          }}
        >
          <Box sx={{ p: "8px", minWidth: 200 }}>
            <Box onClick={() => handleIgnoreSuggestion("already_added")} sx={menuItemSx}>
              <Typography sx={{ fontSize: "13px", color: palette.text.primary }}>
                This has already been added before
              </Typography>
            </Box>
            <Box onClick={() => handleIgnoreSuggestion("not_real_risk")} sx={menuItemSx}>
              <Typography sx={{ fontSize: "13px", color: palette.text.primary }}>
                This is not a real risk
              </Typography>
            </Box>
          </Box>
        </Popover>
      </Box>

      {/* Suggested Risk Modal */}
      <StandardModal
        isOpen={isSuggestedRiskModalOpen && !!selectedSuggestedRisk}
        onClose={handleSuggestedRiskModalClose}
        title="Add suggested risk to register"
        description="Review and edit the AI-suggested risk before saving."
        onSubmit={handleSuggestedRiskSubmit}
        submitButtonText="Save"
        maxWidth="1039px"
      >
        <AddNewRiskForm
          closePopup={handleSuggestedRiskModalClose}
          popupStatus="new"
          onSuccess={handleSuggestedRiskSuccess}
          onError={handleSuggestedRiskError}
          initialRiskValues={selectedSuggestedRisk || undefined}
          initialMitigationValues={
            selectedSuggestedMitigation
              ? {
                  mitigationStatus: 1,
                  mitigationPlan: selectedSuggestedMitigation.mitigationPlan || "",
                  currentRiskLevel: 0,
                  implementationStrategy: "",
                  deadline: "",
                  doc: "",
                  likelihood: selectedSuggestedRisk?.likelihood || 0,
                  riskSeverity: selectedSuggestedRisk?.riskSeverity || 0,
                  approver: 0,
                  approvalStatus: 0,
                  dateOfAssessment: "",
                }
              : undefined
          }
          users={users}
          usersLoading={usersLoading}
          onSubmitRef={suggestedRiskSubmitRef}
          createRisk={createRiskFromSuggestion}
        />
      </StandardModal>
    </>
  );
}
