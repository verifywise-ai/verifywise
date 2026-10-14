/**
 * @fileoverview "Suggest risks with AI" button + suggestions panel for the
 * use-case risks tab. Clicking the button calls POST /api/projectRisks/suggest-ai
 * and shows matched catalog entries (MIT/IBM) and free-form LLM suggestions;
 * each can be ignored locally or opened in a prefilled AddNewRiskForm.
 *
 * @module pages/ProjectView/V1.0ProjectView/ProjectRisks/AiRiskSuggestions
 */

import { useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { Box, Collapse, Typography } from "@mui/material";
import { ChevronDown, ChevronRight, Plus, Sparkles } from "lucide-react";
import { CustomizableButton } from "../../../../components/button/customizable-button";
import Chip from "../../../../components/Chip";
import AddNewRiskForm from "../../../../components/AddNewRiskForm";
import StandardModal from "../../../../components/Modals/StandardModal";
import Alert from "../../../../components/Alert";
import useUsers from "../../../../../application/hooks/useUsers";
import { useAuth } from "../../../../../application/hooks/useAuth";
import allowedRoles from "../../../../../application/constants/permissions";
import { handleAlert } from "../../../../../application/tools/alertUtils";
import { suggestRisksWithAI } from "../../../../../application/repository/projectRisk.repository";
import type {
  RiskFormValues,
  MitigationFormValues,
} from "../../../../../domain/types/riskForm.types";
import type {
  MatchedCatalogRisk,
  SuggestedFreeformRisk,
  SuggestRisksResponse,
} from "../../../../../domain/types/riskSuggestion.types";
import {
  getRiskLevelLabel,
  mapMatchedCatalogEntryToRiskForm,
  mapFreeformSuggestionToRiskForm,
  mapFreeformSuggestionToMitigationForm,
  RISK_SUGGESTION_SOURCE_LABELS,
} from "../../../../components/AddNewRiskForm/riskSuggestionMappers";
import { palette } from "../../../../themes/palette";

type SuggestionItem =
  | { kind: "matched"; key: string; entry: MatchedCatalogRisk }
  | { kind: "freeform"; key: string; suggestion: SuggestedFreeformRisk };

function toSuggestionItems(data: SuggestRisksResponse): SuggestionItem[] {
  return [
    ...data.matched.map((entry) => ({
      kind: "matched" as const,
      key: `matched-${entry.source}-${entry.id}`,
      entry,
    })),
    ...data.suggested.map((suggestion, index) => ({
      kind: "freeform" as const,
      key: `freeform-${index}-${suggestion.risk_name}`,
      suggestion,
    })),
  ];
}

interface AiRiskSuggestionsProps {
  /** Called after a suggested risk is saved so the parent can refresh the table. */
  onRiskSaved: () => void;
}

export function AiRiskSuggestions({ onRiskSaved }: AiRiskSuggestionsProps) {
  const [searchParams] = useSearchParams();
  const projectId = parseInt(searchParams.get("projectId") ?? "", 10);
  const { userRoleName } = useAuth();
  const canCreateRisks = allowedRoles.projectRisks.create.includes(userRoleName);
  const { users, loading: usersLoading } = useUsers();

  const [isSuggesting, setIsSuggesting] = useState(false);
  const [items, setItems] = useState<SuggestionItem[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [dismissedKeys, setDismissedKeys] = useState<Set<string>>(new Set());
  const [removingKeys, setRemovingKeys] = useState<Set<string>>(new Set());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedRisk, setSelectedRisk] = useState<RiskFormValues | null>(null);
  const [selectedMitigation, setSelectedMitigation] = useState<MitigationFormValues | null>(null);
  const [alert, setAlert] = useState<{
    variant: "success" | "info" | "warning" | "error";
    title?: string;
    body: string;
  } | null>(null);
  const submitRef = useRef<(() => void) | null>(null);
  const addedKeyRef = useRef<string | null>(null);

  const smoothRemove = (key: string) => {
    setRemovingKeys((prev) => new Set(prev).add(key));
    setTimeout(() => {
      setDismissedKeys((prev) => new Set(prev).add(key));
      setRemovingKeys((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }, 300);
  };

  const handleSuggest = async () => {
    if (Number.isNaN(projectId)) {
      handleAlert({
        variant: "error",
        title: "AI risk suggestions",
        body: "No use case selected. Open a use case before asking for risk suggestions.",
        setAlert,
      });
      return;
    }
    setIsSuggesting(true);
    try {
      const data = await suggestRisksWithAI({ body: { projectId } });
      const nextItems = toSuggestionItems(data);
      if (nextItems.length === 0) {
        handleAlert({
          variant: "info",
          title: "AI risk suggestions",
          body:
            data.suppressed_count > 0
              ? "No new risks to suggest — the matching risks are already in your risk register."
              : "No risk suggestions were generated for this use case.",
          setAlert,
        });
        return;
      }
      setItems(nextItems);
      setDismissedKeys(new Set());
      setRemovingKeys(new Set());
      setShowSuggestions(true);
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : "Failed to generate risk suggestions. Please try again.";
      handleAlert({ variant: "error", title: "AI risk suggestions", body: message, setAlert });
    } finally {
      setIsSuggesting(false);
    }
  };

  const handleAdd = (item: SuggestionItem) => {
    addedKeyRef.current = item.key;
    if (item.kind === "matched") {
      const form = mapMatchedCatalogEntryToRiskForm(item.entry);
      setSelectedRisk(form);
      setSelectedMitigation({
        mitigationStatus: 1,
        mitigationPlan: "",
        currentRiskLevel: 0,
        implementationStrategy: "",
        deadline: "",
        doc: "",
        likelihood: form.likelihood,
        riskSeverity: form.riskSeverity,
        approver: 0,
        approvalStatus: 0,
        dateOfAssessment: "",
      });
    } else {
      const form = mapFreeformSuggestionToRiskForm(item.suggestion);
      const mitigation = mapFreeformSuggestionToMitigationForm(item.suggestion);
      setSelectedRisk(form);
      setSelectedMitigation({
        mitigationStatus: 1,
        mitigationPlan: mitigation.mitigationPlan || "",
        currentRiskLevel: 0,
        implementationStrategy: "",
        deadline: "",
        doc: "",
        likelihood: mitigation.likelihood ?? form.likelihood,
        riskSeverity: mitigation.riskSeverity ?? form.riskSeverity,
        approver: 0,
        approvalStatus: 0,
        dateOfAssessment: "",
      });
    }
    setIsModalOpen(true);
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    setSelectedRisk(null);
    setSelectedMitigation(null);
    addedKeyRef.current = null;
  };

  const handleSuccess = () => {
    const key = addedKeyRef.current;
    handleAlert({
      variant: "success",
      title: "Risk added",
      body: "Risk added to risk register",
      setAlert,
    });
    handleModalClose();
    if (key) {
      smoothRemove(key);
    }
    onRiskSaved();
  };

  const handleError = (message: string) => {
    handleAlert({
      variant: "error",
      title: "AI risk suggestions",
      body: message || "Failed to add risk",
      setAlert,
    });
  };

  if (!canCreateRisks) {
    return null;
  }

  const visibleItems = items.filter((item) => !dismissedKeys.has(item.key));

  return (
    <Box sx={{ display: "flex", flexDirection: "column", alignItems: "flex-end", flex: 1 }}>
      {alert && (
        <Alert
          variant={alert.variant}
          title={alert.title}
          body={alert.body}
          isToast={true}
          onClick={() => setAlert(null)}
        />
      )}
      <CustomizableButton
        text={isSuggesting ? "Suggesting risks..." : "Suggest risks with AI"}
        variant="outlined"
        startIcon={<Sparkles size={14} strokeWidth={1.5} />}
        onClick={handleSuggest}
        loading={isSuggesting}
        isDisabled={isSuggesting}
        sx={{ whiteSpace: "nowrap", height: "34px", fontSize: "13px" }}
      />

      {visibleItems.length > 0 && (
        <Box
          sx={{
            width: "100%",
            mt: 2,
            background: "linear-gradient(135deg, #FEFFFE 0%, #F8F9FA 100%)",
            border: `1px solid ${palette.border.light}`,
            borderRadius: "8px",
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
            onClick={() => setShowSuggestions(!showSuggestions)}
          >
            {showSuggestions ? (
              <ChevronDown size={14} strokeWidth={1.5} color={palette.text.accent} />
            ) : (
              <ChevronRight size={14} strokeWidth={1.5} color={palette.text.accent} />
            )}
            <Sparkles size={12} color={palette.accent.purple.text} strokeWidth={1.5} />
            <Typography sx={{ fontSize: 13, color: palette.text.secondary, fontWeight: 500 }}>
              Suggested risks
            </Typography>
          </Box>
          <Collapse in={showSuggestions}>
            <Box sx={{ mt: "12px", display: "flex", flexDirection: "column", gap: "8px" }}>
              {visibleItems.map((item) => {
                const isRemoving = removingKeys.has(item.key);
                const name =
                  item.kind === "matched" ? item.entry.summary : item.suggestion.risk_name;
                const description =
                  item.kind === "matched"
                    ? item.entry.description
                    : item.suggestion.risk_description;
                const categories =
                  item.kind === "matched"
                    ? item.entry.risk_category
                    : item.suggestion.risk_category;
                const riskLevel =
                  item.kind === "matched"
                    ? (() => {
                        const form = mapMatchedCatalogEntryToRiskForm(item.entry);
                        return getRiskLevelLabel(form.likelihood, form.riskSeverity);
                      })()
                    : getRiskLevelLabel(item.suggestion.likelihood, item.suggestion.severity);

                return (
                  <Box
                    key={item.key}
                    sx={{
                      "border": `1px solid ${palette.border.light}`,
                      "borderRadius": "4px",
                      "p": "8px",
                      "backgroundColor": palette.background.main,
                      "&:hover": { borderColor: palette.border.dark },
                      "transition":
                        "opacity 300ms ease, max-height 300ms ease, padding 300ms ease, margin 300ms ease",
                      "opacity": isRemoving ? 0 : 1,
                      "maxHeight": isRemoving ? 0 : 300,
                      "overflow": "hidden",
                      ...(isRemoving && { p: 0, border: "none", mb: 0 }),
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
                        <Box
                          sx={{
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                            flexWrap: "wrap",
                          }}
                        >
                          <Typography
                            sx={{
                              fontSize: "14px",
                              fontWeight: 600,
                              color: palette.text.primary,
                            }}
                          >
                            {name}
                          </Typography>
                          {item.kind === "matched" && (
                            <Chip
                              label={RISK_SUGGESTION_SOURCE_LABELS[item.entry.source]}
                              uppercase={false}
                              size="small"
                            />
                          )}
                          <Chip label={riskLevel.text} size="small" />
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
                          {description}
                        </Typography>
                        <Typography sx={{ fontSize: "12px", color: palette.text.tertiary }}>
                          {item.kind === "matched"
                            ? `Why this matches: ${item.entry.reason}`
                            : `Impact: ${item.suggestion.impact}`}
                        </Typography>
                        <Box sx={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                          {categories.map((cat) => (
                            <Chip
                              key={cat}
                              label={cat}
                              variant="default"
                              uppercase={false}
                              size="small"
                            />
                          ))}
                        </Box>
                      </Box>
                      <Box sx={{ display: "flex", gap: "8px", flexShrink: 0 }}>
                        <CustomizableButton
                          text="Ignore"
                          variant="text"
                          onClick={() => smoothRemove(item.key)}
                          sx={{
                            whiteSpace: "nowrap",
                            height: "34px",
                            fontSize: "13px",
                            color: palette.text.tertiary,
                          }}
                        />
                        <CustomizableButton
                          text="Add to risk register"
                          variant="outlined"
                          startIcon={<Plus size={14} strokeWidth={1.5} />}
                          onClick={() => handleAdd(item)}
                          sx={{
                            whiteSpace: "nowrap",
                            height: "34px",
                            fontSize: "13px",
                          }}
                        />
                      </Box>
                    </Box>
                  </Box>
                );
              })}
            </Box>
          </Collapse>
        </Box>
      )}

      {/* Suggested Risk Modal */}
      <StandardModal
        isOpen={isModalOpen && !!selectedRisk}
        onClose={handleModalClose}
        title="Add suggested risk to register"
        description="Review and edit the AI-suggested risk before saving."
        onSubmit={() => submitRef.current?.()}
        submitButtonText="Save"
        maxWidth="1039px"
      >
        <AddNewRiskForm
          closePopup={handleModalClose}
          popupStatus="new"
          onSuccess={handleSuccess}
          onError={handleError}
          initialRiskValues={selectedRisk || undefined}
          initialMitigationValues={selectedMitigation || undefined}
          users={users}
          usersLoading={usersLoading}
          onSubmitRef={submitRef}
        />
      </StandardModal>
    </Box>
  );
}

export default AiRiskSuggestions;
