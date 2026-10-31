import { useState } from "react";
import { Box, Typography } from "@mui/material";
import SelectComponent from "../../../components/Inputs/Select";
import { CustomizableButton } from "../../../components/button/customizable-button";
import {
  useLifecycleSettings,
  useUpdateLifecycleSettings,
} from "../../../../application/hooks/useUseCaseLifecycle";
import { useHasPermission } from "../../../../application/hooks/useMyPermissions";
import {
  CONFIRMATION_INTERVAL_OPTIONS,
  ConfirmationIntervalDays,
} from "../../../../domain/enums/lifecycleStage.enum";

interface LifecycleCheckSectionProps {
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
}

const INTERVAL_ITEMS = CONFIRMATION_INTERVAL_OPTIONS.map((days) => ({
  _id: days,
  name: { 30: "Every 30 days", 90: "Every 90 days", 180: "Every 180 days" }[days],
}));

/**
 * Org-wide "still live?" check interval (#5187). Owners of live use cases are
 * emailed when nobody confirmed them within this interval, and the entries are
 * marked stale. Needs organization.admin.
 */
const LifecycleCheckSection = ({ onError, onSuccess }: LifecycleCheckSectionProps) => {
  // The permission the PATCH route checks, from the per-org matrix.
  const canEdit = useHasPermission("organization.admin", { fallbackToAdmin: true });
  const isDisabled = !canEdit;
  const { data: settings } = useLifecycleSettings();
  const update = useUpdateLifecycleSettings();
  // The saved value until the admin picks another one.
  const [draft, setDays] = useState<ConfirmationIntervalDays | null>(null);
  const days = draft ?? settings?.confirmation_interval_days ?? 90;

  const handleSave = async () => {
    try {
      await update.mutateAsync(days);
      onSuccess("Live use case check saved");
    } catch (error) {
      onError((error as { message?: string })?.message || "Failed to save the live use case check");
    }
  };

  return (
    <Box sx={{ mt: "48px" }} data-testid="lifecycle-check-section">
      <Typography sx={{ fontSize: 15, fontWeight: 600, mb: "8px" }}>Live use case check</Typography>
      <Typography sx={{ fontSize: 13, color: "text.secondary", mb: "24px", maxWidth: 560 }}>
        How often owners confirm their live use cases are still in use. Unconfirmed use cases are
        marked stale and their owners get an email.
      </Typography>

      <Box sx={{ maxWidth: "360px", mb: "24px" }}>
        <SelectComponent
          id="lifecycle-confirmation-interval"
          label="Ask owners to confirm"
          items={INTERVAL_ITEMS}
          value={days}
          onChange={(event) => setDays(Number(event.target.value) as ConfirmationIntervalDays)}
          disabled={isDisabled}
          sx={{ width: "100%" }}
        />
      </Box>

      <CustomizableButton
        variant="contained"
        text="Save check interval"
        onClick={handleSave}
        isDisabled={isDisabled || update.isPending}
        testId="lifecycle-save-interval-btn"
      />
    </Box>
  );
};

export default LifecycleCheckSection;
