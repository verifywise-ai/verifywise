import { useState, useEffect, useCallback, useRef } from "react";
import {
  Box,
  Typography,
  LinearProgress,
  Collapse,
  CircularProgress,
  Alert,
  useTheme,
} from "@mui/material";
import { ChevronDown, ChevronUp, ShieldAlert } from "lucide-react";
import StandardModal from "../../components/Modals/StandardModal";
import Field from "../../components/Inputs/Field";
import Select from "../../components/Inputs/Select";
import Chip from "../../components/Chip";
import HighRiskRolesField from "../../components/Inputs/HighRiskRolesField";
import {
  getSubmissionPreview,
  approveSubmission,
  rejectSubmission,
  retrySubmissionAssessment,
  RiskAssessment,
  RiskAssessmentV2,
  RiskOverride,
  SuggestedRisksBlock,
  FormSchema,
} from "../../../application/repository/intakeForm.repository";
import useUsers from "../../../application/hooks/useUsers";
import { useAuth } from "../../../application/hooks/useAuth";
import { isAssessmentV2 } from "../../../application/utils/intakeScoring/isAssessmentV2";
import {
  asBand,
  bandOfTier,
  isBandAllowed,
  lowestAllowedBand,
  ruleMinimumFor,
  SCORE_BANDS,
  type ClassificationLevel,
  type ScoreBand,
} from "../../../application/utils/intakeScoring/scoreMath";
import ScoreSection from "./assessment/ScoreSection";
import SuggestedRisksSection from "./assessment/SuggestedRisksSection";
import { isRetryable } from "./assessment/scoreView";
import { AnswerLiveChecks, LiveChecksSection } from "./LiveChecksSection";
import type { ILiveChecks } from "../../../domain/types/intakeLiveChecks";
import useFormattedDate from "../../../application/hooks/useFormattedDate";
import { formatAnswer } from "../../../application/utils/intakeAnswerFormat";
import { isEmptyAnswer, sortFields } from "../../../application/utils/intakeFormLogic";
import {
  classificationRoles,
  normalizeHighRiskRoles,
} from "../../../application/utils/highRiskRoles";
import EuAiActClassificationPanel, {
  type EuAiActClassificationData,
} from "./EuAiActClassificationPanel";
import LaneSection from "./routing/LaneSection";
import SecondReviewPanel from "./routing/SecondReviewPanel";
import { serverErrorMessage } from "./routing/serverErrorMessage";
import type { SubmissionRouting } from "./types";

/** The entity mapping for the use case's high-risk roles (the key saved forms use). */
const ROLE_MAPPING = "type_of_high_risk_role";

// ============================================================================
// Types
// ============================================================================

interface SubmissionPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  submissionId: number | null;
  onApproved: () => void;
  onRejected: () => void;
  // A change that is not a decision (escalation, second review): refresh only
  onChanged: () => void;
}

interface PreviewData {
  riskAssessment: RiskAssessment | RiskAssessmentV2 | null;
  entityPreview: Record<string, unknown>;
  formSchema: FormSchema;
  formName: string;
  entityType: string;
  submissionStatus: string;
  euAiActClassification: EuAiActClassificationData | null;
  submissionData: Record<string, unknown>;
  assessment: RiskAssessmentV2 | null;
  suggestedRisks: SuggestedRisksBlock | null;
  assessedLevel: ClassificationLevel | null;
  riskOverride: RiskOverride | null;
  liveChecks: ILiveChecks | null;
  routing: SubmissionRouting | null;
  routingEnabled: boolean;
  canDecide: boolean;
  decideBlockedReason: string | null;
  laneReviewers: Array<{ id: number; name: string }>;
  isSeniorReviewer: boolean;
  reviewedBy: number | null;
}

/** How often, and for how long, the modal re-reads a running assessment. */
const POLL_INTERVAL_MS = 5000;
// A little past the 10 minutes after which a stuck stage can be retried, so
// Retry appears while the modal stays open.
const POLL_LIMIT_MS = 11 * 60 * 1000;

// ============================================================================
// Helpers
// ============================================================================

/**
 * Returns a color for a dimension score bar based on the score value.
 */
function getDimensionBarColor(score: number): string {
  if (score <= 25) return "#16a34a";
  if (score <= 50) return "#d97706";
  if (score <= 75) return "#ea580c";
  return "#dc2626";
}

// ============================================================================
// Sub-components
// ============================================================================

interface RiskSectionProps {
  riskAssessment: RiskAssessment | null;
}

function RiskSection({ riskAssessment }: RiskSectionProps) {
  const theme = useTheme();
  if (!riskAssessment) {
    return (
      <Box
        sx={{
          p: 3,
          border: `1px solid ${theme.palette.border.dark}`,
          borderRadius: "4px",
          backgroundColor: theme.palette.background.accent,
          display: "flex",
          alignItems: "center",
          gap: "12px",
        }}
      >
        <ShieldAlert size={18} color={theme.palette.text.accent} />
        <Typography sx={{ fontSize: "13px", color: theme.palette.other.icon }}>
          Intake risk score pending...
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {/* Tier + score row */}
      <Box sx={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
        <Chip label={riskAssessment.tier} />
        <Typography sx={{ fontSize: "13px", color: theme.palette.text.tertiary }}>
          Overall score:{" "}
          <Box component="span" sx={{ fontWeight: 600, color: theme.palette.text.primary }}>
            {riskAssessment.overallScore}/100
          </Box>
        </Typography>
        {riskAssessment.llmEnhanced && (
          <Chip label="AI-enhanced" backgroundColor="#ede9fe" textColor="#7c3aed" />
        )}
      </Box>

      {/* Dimension bars */}
      {riskAssessment.dimensions && riskAssessment.dimensions.length > 0 && (
        <Box sx={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {riskAssessment.dimensions.map((dim, idx) => {
            const barColor = getDimensionBarColor(dim.score);
            const dimLabel = dim.label || dim.name || dim.key || `Dimension ${idx + 1}`;
            return (
              <Box key={`${dimLabel}-${idx}`}>
                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    mb: 0.5,
                  }}
                >
                  <Typography sx={{ fontSize: "12px", color: theme.palette.text.tertiary }}>
                    {dimLabel}
                  </Typography>
                  <Typography sx={{ fontSize: "12px", fontWeight: 600, color: barColor }}>
                    {dim.score}/100
                  </Typography>
                </Box>
                <LinearProgress
                  variant="determinate"
                  value={dim.score}
                  sx={{
                    "height": 6,
                    "borderRadius": "3px",
                    "backgroundColor": theme.palette.background.accent,
                    "& .MuiLinearProgress-bar": {
                      backgroundColor: barColor,
                      borderRadius: "3px",
                    },
                  }}
                />
              </Box>
            );
          })}

          {/* Color legend */}
          <Box sx={{ display: "flex", gap: "12px", mt: "4px", flexWrap: "wrap" }}>
            {[
              { color: "#16a34a", label: "Low (0-25)" },
              { color: "#d97706", label: "Medium (26-50)" },
              { color: "#ea580c", label: "High (51-75)" },
              { color: "#dc2626", label: "Critical (76-100)" },
            ].map((item) => (
              <Box key={item.label} sx={{ display: "flex", alignItems: "center", gap: "4px" }}>
                <Box
                  sx={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: item.color }}
                />
                <Typography sx={{ fontSize: "11px", color: theme.palette.text.accent }}>
                  {item.label}
                </Typography>
              </Box>
            ))}
          </Box>
        </Box>
      )}
    </Box>
  );
}

interface OverrideSectionProps {
  overrideTier: string;
  overrideJustification: string;
  onTierChange: (tier: string) => void;
  onJustificationChange: (value: string) => void;
  /**
   * Set for AI-scored (v2) submissions: the score bands, with those below the
   * band of this rule minimum disabled. Undefined keeps the v1 tier list.
   */
  bandFloor?: { ruleMinimum: number | null };
}

function OverrideSection({
  overrideTier,
  overrideJustification,
  onTierChange,
  onJustificationChange,
  bandFloor,
}: OverrideSectionProps) {
  const theme = useTheme();
  const tierItems = bandFloor
    ? SCORE_BANDS.map(({ band }) => ({
        _id: band,
        name: band,
        disabled: !isBandAllowed(band, bandFloor.ruleMinimum),
      }))
    : [
        { _id: "Low", name: "Low / Minimal" },
        { _id: "Medium", name: "Medium / Limited" },
        { _id: "High", name: "High" },
        { _id: "Critical", name: "Critical / Unacceptable" },
      ];
  const floorApplies = !!bandFloor && lowestAllowedBand(bandFloor.ruleMinimum) !== "Low";

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: "16px", pt: 1 }}>
      <Box sx={{ display: "flex", flexDirection: "column", gap: "4px" }}>
        <Select
          id="override-tier"
          label={bandFloor ? "Override band" : "Override tier"}
          value={overrideTier}
          onChange={(e) => onTierChange(String(e.target.value))}
          items={tierItems}
        />
        {floorApplies && (
          <Typography sx={{ fontSize: "12px", color: theme.palette.text.tertiary }}>
            Can't be lower than the rule minimum allows
          </Typography>
        )}
      </Box>
      <Box>
        <Field
          id="override-justification"
          label="Justification"
          placeholder="Explain why you are overriding the assessed risk tier (min. 10 characters)"
          value={overrideJustification}
          onChange={(e) => onJustificationChange(e.target.value)}
          rows={2}
          error={
            overrideJustification.length > 0 && overrideJustification.length < 10
              ? "Justification must be at least 10 characters"
              : undefined
          }
        />
      </Box>
    </Box>
  );
}

// ============================================================================
// Main component
// ============================================================================

function SubmissionPreviewModal({
  isOpen,
  onClose,
  submissionId,
  onApproved,
  onRejected,
  onChanged,
}: SubmissionPreviewModalProps) {
  const theme = useTheme();
  const formatDate = useFormattedDate();
  const { users } = useUsers();
  const { userId, userRoleName } = useAuth();
  // Fetch state
  const [isLoading, setIsLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);

  // Editable entity fields
  const [editedEntityData, setEditedEntityData] = useState<Record<string, unknown>>({});

  // Override section
  const [overrideExpanded, setOverrideExpanded] = useState(false);
  const [overrideTier, setOverrideTier] = useState("High");
  const [overrideJustification, setOverrideJustification] = useState("");

  // EU AI Act classification override
  const [euAiActLevel, setEuAiActLevel] = useState<string>("");
  const [euAiActJustification, setEuAiActJustification] = useState("");

  // Approval state
  const [isApproving, setIsApproving] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);

  // Rejection state
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [showOtherAnswers, setShowOtherAnswers] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [isRejecting, setIsRejecting] = useState(false);

  // Stage start times seen at Retry: polling runs until one changes (the job
  // started), then follows the stage status.
  const [retryMarker, setRetryMarker] = useState<string | null>(null);

  // The submission on screen, so a late refresh for another one is dropped.
  const openIdRef = useRef(submissionId);
  useEffect(() => {
    openIdRef.current = submissionId;
  }, [submissionId]);

  // Fetch preview when submissionId changes
  useEffect(() => {
    if (!isOpen || submissionId === null) {
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    async function fetchPreview() {
      setIsLoading(true);
      setFetchError(null);
      setPreviewData(null);
      setEditedEntityData({});
      setOverrideExpanded(false);
      setOverrideTier("High");
      setOverrideJustification("");
      setEuAiActLevel("");
      setEuAiActJustification("");
      setApproveError(null);
      setShowRejectForm(false);
      setShowOtherAnswers(false);
      setRejectReason("");
      setIsRejecting(false);
      setRetryMarker(null);

      try {
        const response = await getSubmissionPreview(submissionId as number, controller.signal);
        if (cancelled) return;

        const { riskAssessment, entityPreview, form, submission: sub } = response.data;

        setPreviewData({
          riskAssessment,
          entityPreview,
          formSchema: form?.schema ?? { version: "1.0", fields: [] },
          formName: form?.name ?? "Unknown form",
          entityType: form?.entityType ?? "use_case",
          submissionStatus: sub?.status ?? "pending",
          euAiActClassification: response.data.euAiActClassification ?? null,
          submissionData: sub?.data ?? {},
          assessment: response.data.assessment ?? null,
          suggestedRisks: response.data.suggestedRisks ?? null,
          assessedLevel: response.data.assessedLevel ?? null,
          riskOverride: response.data.riskOverride ?? null,
          liveChecks: response.data.liveChecks ?? null,
          routing: response.data.routing ?? null,
          routingEnabled: response.data.routingEnabled ?? false,
          canDecide: response.data.canDecide ?? true,
          decideBlockedReason: response.data.decideBlockedReason ?? null,
          laneReviewers: response.data.laneReviewers ?? [],
          isSeniorReviewer: response.data.isSeniorReviewer ?? false,
          reviewedBy: sub?.reviewedBy ?? null,
        });
        setEuAiActLevel(response.data.euAiActClassification?.current.level ?? "");
        // A band override saved earlier opens in the override panel, so a
        // conflict with the rule minimum shows before approving.
        // A pre-v2 tier opens as the band covering the same scores.
        const storedOverride = response.data.riskOverride;
        if (storedOverride?.tier) {
          setOverrideExpanded(true);
          setOverrideTier(bandOfTier(storedOverride.tier) ?? "High");
          setOverrideJustification(storedOverride.justification ?? "");
        }
        setEditedEntityData({ ...(entityPreview || {}) });
      } catch {
        if (cancelled) return;
        setFetchError("Failed to load submission preview. Please try again.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    fetchPreview();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [isOpen, submissionId]);

  // Re-read only the AI assessment parts, so the reviewer's edits stay. Once
  // suggestions are complete only the reviewer's own (server-confirmed)
  // actions change them, so a poll read before an action can't undo it.
  const refreshAssessment = useCallback(async () => {
    if (submissionId === null) return;
    const response = await getSubmissionPreview(submissionId);
    if (openIdRef.current !== submissionId) return;
    setPreviewData((prev) =>
      prev
        ? {
            ...prev,
            riskAssessment: response.data.riskAssessment,
            assessment: response.data.assessment ?? null,
            suggestedRisks:
              prev.suggestedRisks?.status === "complete"
                ? prev.suggestedRisks
                : (response.data.suggestedRisks ?? null),
            assessedLevel: response.data.assessedLevel ?? null,
          }
        : prev,
    );
  }, [submissionId]);

  // While a stage runs, or a retried job hasn't started yet, poll every 5 s
  // for up to 11 minutes.
  const stageStamp = `${previewData?.assessment?.stageStartedAt ?? ""}|${
    previewData?.suggestedRisks?.stageStartedAt ?? ""
  }`;
  const stageRunning =
    previewData?.assessment?.status === "pending" ||
    previewData?.suggestedRisks?.status === "pending" ||
    retryMarker === stageStamp;
  useEffect(() => {
    if (!isOpen || !stageRunning) return;
    const startedAt = Date.now();
    const timer = setInterval(() => {
      if (Date.now() - startedAt > POLL_LIMIT_MS) {
        clearInterval(timer);
        return;
      }
      refreshAssessment().catch(() => undefined);
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [isOpen, stageRunning, refreshAssessment]);

  async function handleRetry() {
    if (submissionId === null) return;
    try {
      await retrySubmissionAssessment(submissionId);
      setRetryMarker(stageStamp);
      await refreshAssessment();
    } catch (err) {
      setApproveError(
        serverErrorMessage(err) ?? "Couldn't retry the assessment. Please try again.",
      );
    }
  }

  // Handle entity field edits
  function handleFieldChange(fieldKey: string, value: string) {
    setEditedEntityData((prev) => ({ ...prev, [fieldKey]: value }));
  }

  // Handle approve
  async function handleApprove() {
    if (submissionId === null || isApproving || isRejecting) return;

    // Validate override if expanded — justification is required
    if (overrideExpanded) {
      if (!overrideJustification.trim()) {
        setApproveError("Justification is required when overriding the intake risk score.");
        return;
      }
      if (overrideJustification.trim().length < 10) {
        setApproveError("Override justification must be at least 10 characters.");
        return;
      }
    }

    const euAi = previewData?.euAiActClassification;
    const changedLevel = euAi && euAiActLevel !== euAi.current.level;
    if (changedLevel && euAiActJustification.trim().length < 10) {
      setApproveError(
        "A justification of at least 10 characters is required when changing the EU AI Act classification.",
      );
      return;
    }

    setIsApproving(true);
    setApproveError(null);

    try {
      const payload: Parameters<typeof approveSubmission>[1] = {
        confirmedEntityData: editedEntityData,
      };

      // A saved override sent back unchanged would credit it to the approver.
      const saved = previewData?.riskOverride;
      const overrideUnchanged =
        !!saved &&
        asBand(saved.tier) === effectiveOverrideTier &&
        (saved.justification ?? "") === overrideJustification;
      if (overrideExpanded && effectiveOverrideTier && !overrideUnchanged) {
        payload.riskOverride = {
          tier: effectiveOverrideTier,
          justification: overrideJustification || `Manual override to ${effectiveOverrideTier}`,
        };
      }

      if (changedLevel) {
        payload.euAiActOverride = {
          level: euAiActLevel,
          justification: euAiActJustification.trim(),
        };
      }

      await approveSubmission(submissionId, payload);
      onApproved();
      onClose();
    } catch (err) {
      setApproveError(serverErrorMessage(err) ?? "Failed to approve submission. Please try again.");
    } finally {
      setIsApproving(false);
    }
  }

  // Handle reject
  async function handleReject() {
    if (submissionId === null || isApproving || isRejecting) return;
    if (!rejectReason.trim()) {
      setApproveError("Please provide a reason for rejection.");
      return;
    }
    if (rejectReason.trim().length < 10) {
      setApproveError("Rejection reason must be at least 10 characters.");
      return;
    }

    setIsRejecting(true);
    setApproveError(null);

    try {
      await rejectSubmission(submissionId, rejectReason.trim());
      onRejected();
      onClose();
    } catch {
      setApproveError("Failed to reject submission. Please try again.");
    } finally {
      setIsRejecting(false);
    }
  }

  // Derived: mapped fields for entity preview
  // Approval overwrites the classification (and role) with the computed values, so
  // fields mapped to them are hidden while the EU AI Act panel is shown.
  const euAiAct = previewData?.euAiActClassification ?? null;
  const mappedFields =
    previewData?.formSchema?.fields?.filter((field) => {
      if (!field.entityFieldMapping) return false;
      if (euAiAct && field.entityFieldMapping === "ai_risk_classification") return false;
      if (
        euAiAct &&
        classificationRoles(euAiAct.current).length > 0 &&
        field.entityFieldMapping === ROLE_MAPPING
      ) {
        return false;
      }
      return true;
    }) ?? [];

  // Answers not mapped to the entity, including calculated values, so
  // reviewers see everything the submitter saw before approving.
  const submissionData = previewData?.submissionData ?? {};
  const otherAnswers = sortFields(previewData?.formSchema?.fields ?? []).filter((field) => {
    if (field.entityFieldMapping) return false;
    if (!Object.prototype.hasOwnProperty.call(submissionData, field.id)) return false;
    const value = submissionData[field.id];
    return field.type === "calculated" || !isEmptyAnswer(value);
  });

  // Derived: entity type label
  const entityLabel = previewData?.entityType === "model" ? "model inventory" : "use case";

  // ============================================================================
  // Render
  const isPending = previewData?.submissionStatus === "pending";

  // Lane and second review. A form with routing off keeps any stored lane as a
  // record only, so the lane section and Send to senior review stay hidden.
  const isAdmin = userRoleName === "Admin";
  const canDecide = previewData?.canDecide ?? true;
  const lane = previewData?.routing ?? null;
  const laneReviewers = previewData?.laneReviewers ?? [];
  const routingEnabled = previewData?.routingEnabled ?? false;
  const showLane = routingEnabled;
  // Mirrors the server: pending and in the standard lane, for the form's reviewers or an Admin.
  const canEscalate =
    isPending &&
    routingEnabled &&
    lane?.lane === "standard" &&
    (isAdmin || (userId !== null && laneReviewers.some((r) => r.id === userId)));
  const canSecondReview =
    (!!previewData?.isSeniorReviewer || isAdmin) &&
    (userId === null || previewData?.reviewedBy !== userId);

  // AI-scored (v2) submissions: the score follows the level the reviewer has
  // selected, and so does the lowest band an override may set.
  const isModel = previewData?.entityType === "model";
  const assessmentV2 = previewData?.assessment ?? null;
  const selectedLevel = (
    !isModel && euAiActLevel ? euAiActLevel : null
  ) as ClassificationLevel | null;
  // A submission not scored yet is scored as v2, so the server holds the
  // override to the floor already.
  const bandsApply = !!previewData && (!previewData.riskAssessment || !!assessmentV2);
  const bandFloor = bandsApply ? { ruleMinimum: ruleMinimumFor(selectedLevel) } : undefined;
  const effectiveOverrideTier =
    bandFloor && !isBandAllowed(overrideTier as ScoreBand, bandFloor.ruleMinimum)
      ? lowestAllowedBand(bandFloor.ruleMinimum)
      : overrideTier;
  // No stored assessment (or no suggestions block) means the job never ran,
  // e.g. the queue was down at submit; the server retries those too.
  const neverQueued =
    !previewData?.riskAssessment || (!!assessmentV2 && !previewData?.suggestedRisks);
  const retryAvailable =
    isPending &&
    (isRetryable(assessmentV2) || isRetryable(previewData?.suggestedRisks ?? null) || neverQueued);
  const questionLabels = Object.fromEntries(
    (previewData?.formSchema?.fields ?? []).map((f) => [f.id, f.label]),
  );
  const storedOverride = previewData?.riskOverride ?? null;
  const overrider = storedOverride
    ? users.find((u) => u.id === storedOverride.overriddenBy)
    : undefined;
  const overrideView = storedOverride
    ? {
        tier: asBand(storedOverride.tier),
        justification: storedOverride.justification,
        byName: overrider ? `${overrider.name} ${overrider.surname ?? ""}`.trim() : null,
      }
    : null;

  // ============================================================================

  return (
    <StandardModal
      isOpen={isOpen}
      onClose={onClose}
      title="Review submission"
      description={
        isPending
          ? euAiAct
            ? "Review the intake risk score, EU AI Act classification and entity data before approving or rejecting"
            : "Review the intake risk score and entity data before approving or rejecting"
          : `This submission has been ${previewData?.submissionStatus ?? "processed"}`
      }
      onSubmit={
        isPending && canDecide ? (showRejectForm ? handleReject : handleApprove) : undefined
      }
      submitButtonText={
        !isPending
          ? undefined
          : showRejectForm
            ? "Reject submission"
            : `Approve and create ${entityLabel}`
      }
      submitButtonColor={showRejectForm ? "#c62828" : undefined}
      isSubmitting={isApproving || isRejecting}
      maxWidth="800px"
      expandedHeight
    >
      {isLoading ? (
        <Box
          sx={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            minHeight: 240,
          }}
        >
          <CircularProgress size={32} sx={{ color: theme.palette.primary.main }} />
        </Box>
      ) : fetchError ? (
        <Alert severity="error" sx={{ fontSize: "13px" }}>
          {fetchError}
        </Alert>
      ) : (
        <Box sx={{ display: "flex", flexDirection: "column", gap: "24px", p: 1 }}>
          {showLane && submissionId !== null && (
            <LaneSection
              submissionId={submissionId}
              routing={lane}
              canDecide={canDecide || !isPending}
              decideBlockedReason={previewData?.decideBlockedReason}
              laneReviewers={laneReviewers}
              canEscalate={canEscalate}
              onEscalated={() => {
                onChanged();
                onClose();
              }}
            />
          )}
          {lane?.secondReview && submissionId !== null && (
            <SecondReviewPanel
              submissionId={submissionId}
              secondReview={lane.secondReview}
              canReview={canSecondReview}
              onChange={(next) => {
                setPreviewData((prev) => (prev ? { ...prev, routing: next } : prev));
                // The list chip and the oversight figures read this routing too
                onChanged();
              }}
            />
          )}
          {/* ------------------------------------------------------------------ */}
          {/* Section 1: Risk assessment                                          */}
          {/* ------------------------------------------------------------------ */}
          <Box
            sx={{
              border: `1px solid ${theme.palette.border.dark}`,
              borderRadius: "4px",
              p: 2.5,
              backgroundColor: theme.palette.background.accent,
            }}
          >
            <Box sx={{ display: "flex", alignItems: "center", gap: "8px", mb: 2 }}>
              <ShieldAlert size={16} color={theme.palette.text.tertiary} strokeWidth={1.5} />
              <Typography
                sx={{ fontSize: "14px", fontWeight: 600, color: theme.palette.text.primary }}
              >
                Intake risk score
              </Typography>
            </Box>

            {!assessmentV2 && !previewData?.riskAssessment && !isPending ? (
              // Decided before any assessment was stored: nothing will run now.
              <Typography sx={{ fontSize: "13px", color: theme.palette.text.tertiary }}>
                No risk score was recorded for this submission.
              </Typography>
            ) : assessmentV2 || !previewData?.riskAssessment ? (
              <ScoreSection
                assessment={assessmentV2}
                selectedLevel={selectedLevel}
                rulesLevel={
                  isModel ? null : ((euAiAct?.current.level ?? null) as ClassificationLevel | null)
                }
                assessedLevel={previewData?.assessedLevel ?? null}
                levelReasons={euAiAct?.current.reasons ?? []}
                isModel={isModel}
                questionLabels={questionLabels}
                override={overrideView}
                onRetry={handleRetry}
                retryAvailable={retryAvailable}
              />
            ) : (
              <RiskSection
                riskAssessment={
                  isAssessmentV2(previewData?.riskAssessment)
                    ? null
                    : (previewData?.riskAssessment ?? null)
                }
              />
            )}

            <Box sx={{ mt: "16px" }}>
              <LiveChecksSection liveChecks={previewData?.liveChecks ?? null} />
            </Box>

            {/* Override toggle — only for pending submissions */}
            {isPending && (
              <>
                <Box
                  component="button"
                  type="button"
                  onClick={() => setOverrideExpanded((prev) => !prev)}
                  sx={{
                    "mt": "16px",
                    "display": "flex",
                    "alignItems": "center",
                    "gap": "6px",
                    "background": "none",
                    "border": "none",
                    "cursor": "pointer",
                    "padding": 0,
                    "color": theme.palette.text.tertiary,
                    "fontSize": "13px",
                    "fontWeight": 500,
                    "&:hover": { color: theme.palette.text.primary },
                  }}
                >
                  {overrideExpanded ? (
                    <ChevronUp size={15} strokeWidth={1.5} />
                  ) : (
                    <ChevronDown size={15} strokeWidth={1.5} />
                  )}
                  Override intake risk score
                </Box>

                <Collapse in={overrideExpanded} timeout="auto" unmountOnExit>
                  <Box sx={{ mt: 2 }}>
                    <OverrideSection
                      overrideTier={effectiveOverrideTier}
                      overrideJustification={overrideJustification}
                      onTierChange={setOverrideTier}
                      onJustificationChange={setOverrideJustification}
                      bandFloor={bandFloor}
                    />
                  </Box>
                </Collapse>
              </>
            )}
          </Box>

          {euAiAct && (
            <EuAiActClassificationPanel
              classification={euAiAct}
              isPending={Boolean(isPending)}
              selectedLevel={euAiActLevel}
              onLevelChange={setEuAiActLevel}
              justification={euAiActJustification}
              onJustificationChange={setEuAiActJustification}
            />
          )}

          {submissionId !== null && (assessmentV2 || previewData?.suggestedRisks) && (
            <Box
              sx={{
                border: `1px solid ${theme.palette.border.dark}`,
                borderRadius: "4px",
                p: "20px",
              }}
            >
              <Typography
                sx={{
                  fontSize: "14px",
                  fontWeight: 600,
                  color: theme.palette.text.primary,
                  mb: "12px",
                }}
              >
                Suggested risks
              </Typography>
              <SuggestedRisksSection
                submissionId={submissionId}
                block={previewData?.suggestedRisks ?? null}
                isModel={isModel}
                readOnly={!isPending}
                onChange={(update) =>
                  setPreviewData((prev) =>
                    prev?.suggestedRisks
                      ? { ...prev, suggestedRisks: update(prev.suggestedRisks) }
                      : prev,
                  )
                }
              />
            </Box>
          )}

          {/* ------------------------------------------------------------------ */}
          {/* Section 2: Entity preview (editable for pending, read-only otherwise) */}
          {/* ------------------------------------------------------------------ */}
          {isPending && (
            <Box
              sx={{
                border: `1px solid ${theme.palette.border.dark}`,
                borderRadius: "4px",
                p: 2.5,
              }}
            >
              <Typography
                sx={{ fontSize: "14px", fontWeight: 600, color: theme.palette.text.primary, mb: 2 }}
              >
                {previewData?.entityType === "model"
                  ? "Model inventory preview"
                  : "Use case preview"}
              </Typography>

              {mappedFields.length === 0 ? (
                <Typography sx={{ fontSize: "13px", color: theme.palette.text.accent }}>
                  No entity field mappings defined for this form.
                </Typography>
              ) : (
                <Box sx={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                  {mappedFields.map((field) => {
                    const fieldKey = field.entityFieldMapping as string;
                    if (fieldKey === ROLE_MAPPING) {
                      // The server matched the answer to roles; options that are
                      // not roles are listed so the reviewer can fix them.
                      const unmatched = previewData?.entityPreview?.high_risk_roles_unmatched;
                      return (
                        <Box
                          key={field.id}
                          sx={{ display: "flex", flexDirection: "column", gap: "4px" }}
                        >
                          <HighRiskRolesField
                            id={`entity-${field.id}`}
                            value={normalizeHighRiskRoles(editedEntityData.high_risk_roles)}
                            onChange={(roles) =>
                              setEditedEntityData((prev) => ({ ...prev, high_risk_roles: roles }))
                            }
                          />
                          {Array.isArray(unmatched) &&
                            unmatched.map((label) => (
                              <Typography
                                key={String(label)}
                                sx={{ fontSize: "12px", color: theme.palette.text.tertiary }}
                              >
                                <span>Not a high-risk role:</span> <span>{String(label)}</span>
                              </Typography>
                            ))}
                        </Box>
                      );
                    }
                    const currentValue = String(editedEntityData[fieldKey] ?? "");

                    return (
                      <Box key={field.id}>
                        <Field
                          id={`entity-${field.id}`}
                          label={field.label}
                          value={currentValue}
                          onChange={(e) => handleFieldChange(fieldKey, e.target.value)}
                          rows={field.type === "textarea" ? 2 : undefined}
                          placeholder={field.placeholder ?? ""}
                        />
                        <AnswerLiveChecks
                          liveChecks={previewData?.liveChecks ?? null}
                          questionId={field.id}
                        />
                      </Box>
                    );
                  })}
                </Box>
              )}
            </Box>
          )}

          {otherAnswers.length > 0 && (
            <Box>
              <Box
                component="button"
                type="button"
                aria-expanded={showOtherAnswers}
                onClick={() => setShowOtherAnswers((prev) => !prev)}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: 0,
                  color: theme.palette.text.secondary,
                  fontSize: "13px",
                  fontWeight: 500,
                }}
              >
                {/* The label is its own text node so the DOM translator can match it. */}
                <span>
                  <span>Other answers</span> ({otherAnswers.length})
                </span>
                {showOtherAnswers ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </Box>
              {showOtherAnswers && (
                <Box sx={{ mt: "8px", borderTop: `1px solid ${theme.palette.border.light}` }}>
                  {otherAnswers.map((field) => (
                    <Box
                      key={field.id}
                      sx={{
                        display: "grid",
                        gridTemplateColumns: "200px 1fr",
                        columnGap: "16px",
                        py: "8px",
                      }}
                    >
                      <Typography
                        sx={{
                          fontSize: "13px",
                          fontWeight: 500,
                          color: theme.palette.text.secondary,
                        }}
                      >
                        {field.label}
                      </Typography>
                      <Box>
                        <Typography
                          sx={{
                            fontSize: "13px",
                            color: theme.palette.text.primary,
                            wordBreak: "break-word",
                          }}
                        >
                          {formatAnswer(field, submissionData[field.id], formatDate)}
                        </Typography>
                        <AnswerLiveChecks
                          liveChecks={previewData?.liveChecks ?? null}
                          questionId={field.id}
                        />
                      </Box>
                    </Box>
                  ))}
                </Box>
              )}
            </Box>
          )}

          {/* Reject toggle + reason — only for pending submissions */}
          {isPending && canDecide && (
            <>
              {!showRejectForm ? (
                <Box
                  component="button"
                  type="button"
                  onClick={() => setShowRejectForm(true)}
                  sx={{
                    "display": "flex",
                    "alignItems": "center",
                    "gap": "6px",
                    "background": "none",
                    "border": "none",
                    "cursor": "pointer",
                    "padding": 0,
                    "color": theme.palette.status.error.text,
                    "fontSize": "13px",
                    "fontWeight": 500,
                    "&:hover": { textDecoration: "underline" },
                  }}
                >
                  Reject this submission instead
                </Box>
              ) : (
                <Box
                  sx={{
                    border: "1px solid #fecaca",
                    borderRadius: "4px",
                    p: 2.5,
                    backgroundColor: "#fef2f2",
                  }}
                >
                  <Box
                    sx={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      mb: 2,
                    }}
                  >
                    <Typography sx={{ fontSize: "14px", fontWeight: 600, color: "#991b1b" }}>
                      Reject submission
                    </Typography>
                    <Box
                      component="button"
                      type="button"
                      onClick={() => {
                        setShowRejectForm(false);
                        setRejectReason("");
                        setApproveError(null);
                      }}
                      sx={{
                        "background": "none",
                        "border": "none",
                        "cursor": "pointer",
                        "color": theme.palette.other.icon,
                        "fontSize": "12px",
                        "&:hover": { color: theme.palette.text.primary },
                      }}
                    >
                      Cancel
                    </Box>
                  </Box>
                  <Field
                    id="reject-reason"
                    label="Reason for rejection"
                    placeholder="Explain why this submission is being rejected (min. 10 characters)"
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    rows={3}
                  />
                </Box>
              )}
            </>
          )}

          {/* Action error */}
          {approveError && (
            <Alert severity="error" sx={{ fontSize: "13px" }}>
              {approveError}
            </Alert>
          )}
        </Box>
      )}
    </StandardModal>
  );
}

export { SubmissionPreviewModal };
export default SubmissionPreviewModal;
