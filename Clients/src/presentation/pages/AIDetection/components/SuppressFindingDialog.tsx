/**
 * SuppressFindingDialog
 *
 * Modal that captures a suppression-rule scope, reason, and optional expiry
 * for an AI detection finding. On submit, creates an org-scoped rule that
 * flags matching findings on future scans.
 */

import { useState } from "react";
import { Stack, Typography } from "@mui/material";
import dayjs, { Dayjs } from "dayjs";
import StandardModal from "../../../components/Modals/StandardModal";
import Field from "../../../components/Inputs/Field";
import Radio from "../../../components/Inputs/Radio";
import DatePicker from "../../../components/Inputs/Datepicker";
import { createSuppression } from "../../../../application/repository/aiDetection.repository";
import { CreateSuppressionRequest, Finding } from "../../../../domain/ai-detection/types";

type SuppressionScope = "by_name" | "by_type";

interface SuppressFindingDialogProps {
  isOpen: boolean;
  finding: Finding | null;
  onClose: () => void;
  onSuccess?: (message: string) => void;
  onError?: (message: string) => void;
}

function buildPayload(
  finding: Finding,
  scope: SuppressionScope,
  reason: string,
  expiresAt: Dayjs | null,
): CreateSuppressionRequest {
  const expires_at = expiresAt ? expiresAt.toISOString() : null;
  const trimmedReason = reason.trim() || null;

  if (scope === "by_type") {
    return {
      match_type: "exact",
      field: "finding_type",
      value: finding.finding_type,
      reason: trimmedReason,
      expires_at,
    };
  }

  return {
    match_type: "exact",
    field: "name",
    value: finding.name,
    reason: trimmedReason,
    expires_at,
  };
}

function SuppressFindingDialog({
  isOpen,
  finding,
  onClose,
  onSuccess,
  onError,
}: SuppressFindingDialogProps) {
  const [scope, setScope] = useState<SuppressionScope>("by_name");
  const [reason, setReason] = useState("");
  const [expiresAt, setExpiresAt] = useState<Dayjs | null>(null);
  const [reasonError, setReasonError] = useState<string | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const resetState = () => {
    setScope("by_name");
    setReason("");
    setExpiresAt(null);
    setReasonError(undefined);
    setIsSubmitting(false);
  };

  const handleClose = () => {
    if (isSubmitting) return;
    resetState();
    onClose();
  };

  const handleSubmit = async () => {
    if (!finding) return;

    if (!reason.trim()) {
      setReasonError("Reason is required");
      return;
    }
    if (expiresAt && !expiresAt.isAfter(dayjs())) {
      onError?.("Expiry date must be in the future");
      return;
    }

    setReasonError(undefined);
    setIsSubmitting(true);
    try {
      await createSuppression(buildPayload(finding, scope, reason, expiresAt));
      onSuccess?.(`Suppression rule created for "${finding.name}"`);
      resetState();
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create suppression rule";
      onError?.(message);
      setIsSubmitting(false);
    }
  };

  if (!finding) return null;

  return (
    <StandardModal
      isOpen={isOpen}
      onClose={handleClose}
      title="Suppress finding"
      description="Create a rule that hides matching findings from future scans and excludes them from risk scores."
      onSubmit={handleSubmit}
      submitButtonText="Suppress"
      isSubmitting={isSubmitting}
    >
      <Stack spacing={6}>
        <Stack spacing={2}>
          <Typography sx={{ fontSize: 13, fontWeight: 500, color: "text.secondary" }}>
            Finding
          </Typography>
          <Typography sx={{ fontSize: 13, color: "text.tertiary" }}>
            {finding.name}
            {finding.provider ? ` (${finding.provider})` : ""} —{" "}
            <em>{finding.finding_type.replace(/_/g, " ")}</em>
          </Typography>
        </Stack>

        <Stack spacing={2}>
          <Typography sx={{ fontSize: 13, fontWeight: 500, color: "text.secondary" }}>
            Scope <span style={{ color: "#d32f2f" }}>*</span>
          </Typography>
          <Stack spacing={4}>
            <Radio
              id="scope-by-name"
              size="small"
              value="by_name"
              checked={scope === "by_name"}
              onChange={() => setScope("by_name")}
              title="All findings with this name"
              desc={`Suppress every finding named "${finding.name}", on any future scan.`}
            />
            <Radio
              id="scope-by-type"
              size="small"
              value="by_type"
              checked={scope === "by_type"}
              onChange={() => setScope("by_type")}
              title="All findings of this type"
              desc={`Suppress every "${finding.finding_type.replace(/_/g, " ")}" finding.`}
            />
          </Stack>
        </Stack>

        <Field
          id="suppression-reason"
          label="Reason"
          isRequired
          placeholder="e.g. confirmed false positive — internal mock library"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          error={reasonError}
          multiline
          minRows={2}
        />

        <DatePicker
          label="Expires"
          isOptional
          optionalLabel="(optional)"
          date={expiresAt}
          handleDateChange={(value) => setExpiresAt(value)}
        />
      </Stack>
    </StandardModal>
  );
}

export default SuppressFindingDialog;
