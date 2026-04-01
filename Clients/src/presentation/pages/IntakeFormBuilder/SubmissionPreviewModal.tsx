import { useState, useEffect } from "react";
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
import {
  getSubmissionPreview,
  approveSubmission,
  rejectSubmission,
  RiskAssessment,
  FormSchema,
} from "../../../application/repository/intakeForm.repository";

// ============================================================================
// Types
// ============================================================================

interface SubmissionPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  submissionId: number | null;
  onApproved: () => void;
  onRejected?: () => void;
}

interface PreviewData {
  riskAssessment: RiskAssessment | null;
  entityPreview: Record<string, unknown>;
  formSchema: FormSchema;
  formName: string;
  entityType: string;
  submissionStatus: string;
}

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
          Risk assessment pending...
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
                  <Typography
                    sx={{ fontSize: "12px", color: theme.palette.text.tertiary }}
                  >
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
                    height: 6,
                    borderRadius: "3px",
                    backgroundColor: theme.palette.background.accent,
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
                <Box sx={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: item.color }} />
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
}

function OverrideSection({
  overrideTier,
  overrideJustification,
  onTierChange,
  onJustificationChange,
}: OverrideSectionProps) {
  const tierItems = [
    { _id: "Low", name: "Low / Minimal" },
    { _id: "Medium", name: "Medium / Limited" },
    { _id: "High", name: "High" },
    { _id: "Critical", name: "Critical / Unacceptable" },
  ];

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: "16px", pt: 1 }}>
      <Select
        id="override-tier"
        label="Override tier"
        value={overrideTier}
        onChange={(e) => onTierChange(String(e.target.value))}
        items={tierItems}
      />
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
}: SubmissionPreviewModalProps) {
  const theme = useTheme();
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

  // Approval state
  const [isApproving, setIsApproving] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);

  // Rejection state
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [isRejecting, setIsRejecting] = useState(false);

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
      setApproveError(null);
      setShowRejectForm(false);
      setRejectReason("");
      setIsRejecting(false);

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
        });
        setEditedEntityData({ ...(entityPreview || {}) });
      } catch (err) {
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

  // Handle entity field edits
  function handleFieldChange(fieldKey: string, value: string) {
    setEditedEntityData((prev) => ({ ...prev, [fieldKey]: value }));
  }

  // Handle approve
  async function handleApprove() {
    if (submissionId === null) return;

    // Validate override if expanded — justification is required
    if (overrideExpanded) {
      if (!overrideJustification.trim()) {
        setApproveError("Justification is required when overriding the risk assessment.");
        return;
      }
      if (overrideJustification.trim().length < 10) {
        setApproveError("Override justification must be at least 10 characters.");
        return;
      }
    }

    setIsApproving(true);
    setApproveError(null);

    try {
      const payload: Parameters<typeof approveSubmission>[1] = {
        confirmedEntityData: editedEntityData,
      };

      if (overrideExpanded && overrideTier) {
        payload.riskOverride = {
          tier: overrideTier,
          justification: overrideJustification || `Manual override to ${overrideTier}`,
        };
      }

      await approveSubmission(submissionId, payload);
      onApproved();
      onClose();
    } catch (err) {
      setApproveError("Failed to approve submission. Please try again.");
    } finally {
      setIsApproving(false);
    }
  }

  // Handle reject
  async function handleReject() {
    if (submissionId === null) return;
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
      onRejected?.();
      onApproved(); // Also triggers list refresh
      onClose();
    } catch {
      setApproveError("Failed to reject submission. Please try again.");
    } finally {
      setIsRejecting(false);
    }
  }

  // Derived: mapped fields for entity preview
  const mappedFields =
    previewData?.formSchema?.fields?.filter((field) => Boolean(field.entityFieldMapping)) ?? [];

  // Derived: entity type label
  const entityLabel =
    previewData?.entityType === "model" ? "model inventory" : "use case";

  // ============================================================================
  // Render
  const isPending = previewData?.submissionStatus === "pending";

  // ============================================================================

  return (
    <StandardModal
      isOpen={isOpen}
      onClose={onClose}
      title="Review submission"
      description={
        isPending
          ? "Review risk assessment and entity data before approving or rejecting"
          : `This submission has been ${previewData?.submissionStatus ?? "processed"}`
      }
      onSubmit={isPending ? (showRejectForm ? handleReject : handleApprove) : undefined}
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
              <Typography sx={{ fontSize: "14px", fontWeight: 600, color: theme.palette.text.primary }}>
                Risk assessment
              </Typography>
            </Box>

            <RiskSection riskAssessment={previewData?.riskAssessment ?? null} />

            {/* Override toggle — only for pending submissions */}
            {isPending && (
              <>
                <Box
                  component="button"
                  type="button"
                  onClick={() => setOverrideExpanded((prev) => !prev)}
                  sx={{
                    mt: "16px",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    padding: 0,
                    color: theme.palette.text.tertiary,
                    fontSize: "13px",
                    fontWeight: 500,
                    "&:hover": { color: theme.palette.text.primary },
                  }}
                >
                  {overrideExpanded ? (
                    <ChevronUp size={15} strokeWidth={1.5} />
                  ) : (
                    <ChevronDown size={15} strokeWidth={1.5} />
                  )}
                  Override risk assessment
                </Box>

                <Collapse in={overrideExpanded} timeout="auto" unmountOnExit>
                  <Box sx={{ mt: 2 }}>
                    <OverrideSection
                      overrideTier={overrideTier}
                      overrideJustification={overrideJustification}
                      onTierChange={setOverrideTier}
                      onJustificationChange={setOverrideJustification}
                    />
                  </Box>
                </Collapse>
              </>
            )}
          </Box>

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
              <Typography sx={{ fontSize: "14px", fontWeight: 600, color: theme.palette.text.primary, mb: 2 }}>
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
                    const currentValue = String(editedEntityData[fieldKey] ?? "");

                    return (
                      <Field
                        key={field.id}
                        id={`entity-${field.id}`}
                        label={field.label}
                        value={currentValue}
                        onChange={(e) => handleFieldChange(fieldKey, e.target.value)}
                        rows={field.type === "textarea" ? 2 : undefined}
                        placeholder={field.placeholder ?? ""}
                      />
                    );
                  })}
                </Box>
              )}
            </Box>
          )}

          {/* Reject toggle + reason — only for pending submissions */}
          {isPending && (
            <>
              {!showRejectForm ? (
                <Box
                  component="button"
                  type="button"
                  onClick={() => setShowRejectForm(true)}
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    padding: 0,
                    color: theme.palette.status.error.text,
                    fontSize: "13px",
                    fontWeight: 500,
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
                    <Typography
                      sx={{ fontSize: "14px", fontWeight: 600, color: "#991b1b" }}
                    >
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
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        color: theme.palette.other.icon,
                        fontSize: "12px",
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
