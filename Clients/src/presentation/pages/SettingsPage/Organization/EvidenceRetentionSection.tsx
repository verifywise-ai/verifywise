import { useEffect, useState } from "react";
import { Box, Stack, Typography } from "@mui/material";
import SelectComponent from "../../../components/Inputs/Select";
import Toggle from "../../../components/Inputs/Toggle";
import { CustomizableButton } from "../../../components/button/customizable-button";
import {
  getEvidenceHubSettings,
  updateEvidenceHubSettings,
} from "../../../../application/repository/evidenceHub.repository";

// Mirrors RETENTION_OPTIONS in components/Modals/EvidenceHub/index.tsx and
// EVIDENCE_RETENTION_PERIODS on the server (utils/evidenceRetention.utils.ts).
const RETENTION_OPTIONS = [
  { _id: "30_days", name: "30 days" },
  { _id: "90_days", name: "90 days" },
  { _id: "6_months", name: "6 months" },
  { _id: "1_year", name: "1 year" },
  { _id: "3_years", name: "3 years" },
  { _id: "5_years", name: "5 years" },
  { _id: "7_years", name: "7 years" },
  { _id: "indefinite", name: "Indefinite" },
];

interface EvidenceRetentionSectionProps {
  isDisabled?: boolean;
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
}

const EvidenceRetentionSection = ({
  isDisabled,
  onError,
  onSuccess,
}: EvidenceRetentionSectionProps) => {
  const [retentionPeriod, setRetentionPeriod] = useState<string>("");
  const [archiveOnExpiry, setArchiveOnExpiry] = useState(false);
  const [saving, setSaving] = useState(false);

  // Seed from the org settings; a missing row resolves to server defaults
  // (no default retention, archival off).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const settings = await getEvidenceHubSettings();
        if (cancelled) return;
        setRetentionPeriod(settings.default_retention_period ?? "");
        setArchiveOnExpiry(settings.archive_on_expiry);
      } catch {
        // Leave the section at defaults if settings cannot be loaded.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateEvidenceHubSettings({
        default_retention_period: retentionPeriod || null,
        archive_on_expiry: archiveOnExpiry,
      });
      onSuccess("Evidence retention settings saved");
    } catch (error: any) {
      onError(error?.message || "Failed to save evidence retention settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box sx={{ mt: 6 }}>
      <Typography sx={{ fontSize: 15, fontWeight: 600, mb: 1 }}>Evidence Hub retention</Typography>
      <Typography sx={{ fontSize: 13, color: "text.secondary", mb: 3, maxWidth: 560 }}>
        Applied to new evidence that has no explicit expiry date or retention policy of its own. A
        daily job flags records past their expiry date and notifies the reviewer or organization
        admins.
      </Typography>

      <Box sx={{ maxWidth: "360px", mb: 3 }}>
        <SelectComponent
          id="evidence-default-retention"
          label="Default retention period"
          items={RETENTION_OPTIONS}
          value={retentionPeriod}
          onChange={(event: any) => setRetentionPeriod(event.target.value)}
          placeholder="No default"
          disabled={isDisabled}
          sx={{ width: "100%" }}
        />
      </Box>

      <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 1 }}>
        <Toggle
          ariaLabel="Archive expired evidence"
          checked={archiveOnExpiry}
          onChange={(_, checked) => setArchiveOnExpiry(checked)}
          disabled={isDisabled}
        />
        <Typography sx={{ fontSize: 13 }}>Archive expired evidence</Typography>
      </Stack>
      <Typography sx={{ fontSize: 12, color: "text.secondary", mb: 3, maxWidth: 560 }}>
        Archived evidence is hidden from the Evidence Hub list but never deleted. Archival also
        requires the server flag EVIDENCE_RETENTION_ARCHIVE_ENABLED.
      </Typography>

      <CustomizableButton
        variant="contained"
        text="Save retention settings"
        onClick={handleSave}
        isDisabled={isDisabled || saving}
        testId="evidence-hub-save-retention-btn"
      />
    </Box>
  );
};

export default EvidenceRetentionSection;
