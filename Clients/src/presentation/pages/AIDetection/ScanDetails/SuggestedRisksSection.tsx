/**
 * @fileoverview LLM-suggested risks section on the Scan Details page: collapsible list,
 * ignore menu, and "add to risk register" modal.
 *
 * @module pages/AIDetection/ScanDetails/SuggestedRisksSection
 */

import { useCallback, useRef, useState } from "react";
import { Box, Collapse, Popover, Typography } from "@mui/material";
import { ChevronDown, ChevronRight, Plus, Sparkles } from "lucide-react";
import { CustomizableButton } from "../../../components/button/customizable-button";
import Chip from "../../../components/Chip";
import AddNewRiskForm from "../../../components/AddNewRiskForm";
import StandardModal from "../../../components/Modals/StandardModal";
import useUsers from "../../../../application/hooks/useUsers";
import { SuggestedRisk, DIMENSION_LABELS } from "../../../../domain/ai-detection/riskScoringTypes";
import type { RiskFormValues, MitigationFormValues } from "../../../../domain/types/riskForm.types";
import { palette } from "../../../themes/palette";
import { DIMENSION_CHIP_COLORS } from "./scanDetailsConfig";
import {
  getRiskLevelLabel,
  mapSuggestionToMitigationForm,
  mapSuggestionToRiskForm,
} from "./suggestedRiskMappers";

interface SuggestedRisksSectionProps {
  suggestions: SuggestedRisk[];
  onSuccess: () => void;
  onError: (message: string) => void;
}

export function SuggestedRisksSection({
  suggestions,
  onSuccess,
  onError,
}: SuggestedRisksSectionProps) {
  const [isSuggestedRiskModalOpen, setIsSuggestedRiskModalOpen] = useState(false);
  const [selectedSuggestedRisk, setSelectedSuggestedRisk] = useState<RiskFormValues | null>(null);
  const [selectedSuggestedMitigation, setSelectedSuggestedMitigation] =
    useState<Partial<MitigationFormValues> | null>(null);
  const suggestedRiskSubmitRef = useRef<(() => void) | null>(null);
  const { users, loading: usersLoading } = useUsers();
  const [dismissedSuggestions, setDismissedSuggestions] = useState<Set<number>>(new Set());
  const [removingSuggestions, setRemovingSuggestions] = useState<Set<number>>(new Set());
  const [ignoreMenuAnchor, setIgnoreMenuAnchor] = useState<{
    el: HTMLElement;
    index: number;
  } | null>(null);
  const [showSuggestedRisks, setShowSuggestedRisks] = useState(false);
  const addedSuggestionIndexRef = useRef<number | null>(null);

  const smoothRemoveSuggestion = useCallback((index: number) => {
    setRemovingSuggestions((prev) => new Set(prev).add(index));
    setTimeout(() => {
      setDismissedSuggestions((prev) => new Set(prev).add(index));
      setRemovingSuggestions((prev) => {
        const next = new Set(prev);
        next.delete(index);
        return next;
      });
    }, 300);
  }, []);

  const handleAddSuggestedRisk = (suggestion: SuggestedRisk, index: number) => {
    addedSuggestionIndexRef.current = index;
    setSelectedSuggestedRisk(mapSuggestionToRiskForm(suggestion));
    setSelectedSuggestedMitigation(mapSuggestionToMitigationForm(suggestion));
    setIsSuggestedRiskModalOpen(true);
  };

  const handleSuggestedRiskModalClose = () => {
    setIsSuggestedRiskModalOpen(false);
    setSelectedSuggestedRisk(null);
    setSelectedSuggestedMitigation(null);
    addedSuggestionIndexRef.current = null;
  };

  const handleSuggestedRiskSubmit = () => {
    if (suggestedRiskSubmitRef.current) {
      suggestedRiskSubmitRef.current();
    }
  };

  const handleSuggestedRiskSuccess = () => {
    onSuccess();
    const idx = addedSuggestionIndexRef.current;
    handleSuggestedRiskModalClose();
    if (idx !== null) {
      smoothRemoveSuggestion(idx);
    }
  };

  const handleSuggestedRiskError = (message: string) => {
    onError(message || "Failed to add risk");
  };

  const handleIgnoreSuggestion = (_reason: string) => {
    if (ignoreMenuAnchor) {
      smoothRemoveSuggestion(ignoreMenuAnchor.index);
      setIgnoreMenuAnchor(null);
    }
  };

  if (!suggestions.some((_, i) => !dismissedSuggestions.has(i))) {
    return null;
  }

  return (
    <>
      <Box
        sx={{
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
        </Box>
        <Collapse in={showSuggestedRisks}>
          <Box sx={{ mt: "12px", display: "flex", flexDirection: "column", gap: "8px" }}>
            {suggestions.map((suggestion, index) => {
              if (dismissedSuggestions.has(index)) return null;

              const isRemoving = removingSuggestions.has(index);
              const riskLevel = getRiskLevelLabel(suggestion.likelihood, suggestion.severity);
              const dimColors =
                DIMENSION_CHIP_COLORS[suggestion.dimension] || DIMENSION_CHIP_COLORS.security;
              const dimLabel = DIMENSION_LABELS[suggestion.dimension] || suggestion.dimension;

              return (
                <Box
                  key={index}
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
                          {suggestion.risk_name}
                        </Typography>
                        <Chip
                          label={dimLabel}
                          backgroundColor={dimColors.bg}
                          textColor={dimColors.text}
                          uppercase={false}
                          size="small"
                        />
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
                        {suggestion.risk_description}
                      </Typography>
                      <Box sx={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                        {suggestion.risk_category.map((cat) => (
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
                        onClick={(e: React.MouseEvent<HTMLElement>) =>
                          setIgnoreMenuAnchor({ el: e.currentTarget, index })
                        }
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
                        onClick={() => handleAddSuggestedRisk(suggestion, index)}
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
                mt: 0.5,
                borderRadius: "4px",
                boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                border: `1px solid ${palette.border.light}`,
              },
            },
          }}
        >
          <Box sx={{ p: 1, minWidth: 200 }}>
            <Box
              onClick={() => handleIgnoreSuggestion("already_added")}
              sx={{
                "display": "flex",
                "alignItems": "center",
                "gap": "8px",
                "p": "6px 8px",
                "borderRadius": "4px",
                "cursor": "pointer",
                "&:hover": { backgroundColor: palette.background.hover },
              }}
            >
              <Typography sx={{ fontSize: "13px", color: palette.text.primary }}>
                This has already been added before
              </Typography>
            </Box>
            <Box
              onClick={() => handleIgnoreSuggestion("not_real_risk")}
              sx={{
                "display": "flex",
                "alignItems": "center",
                "gap": "8px",
                "p": "6px 8px",
                "borderRadius": "4px",
                "cursor": "pointer",
                "&:hover": { backgroundColor: palette.background.hover },
              }}
            >
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
                  recommendations: "",
                }
              : undefined
          }
          users={users}
          usersLoading={usersLoading}
          onSubmitRef={suggestedRiskSubmitRef}
        />
      </StandardModal>
    </>
  );
}
