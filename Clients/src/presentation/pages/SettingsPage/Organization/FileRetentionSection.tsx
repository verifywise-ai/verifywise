import { useEffect, useState } from "react";
import { Box, Typography } from "@mui/material";
import SelectComponent from "../../../components/Inputs/Select";
import { CustomizableButton } from "../../../components/button/customizable-button";
import {
  getFileOrgSettings,
  updateFileOrgSettings,
} from "../../../../application/repository/fileOrgSettings.repository";
import {
  RETENTION_POLICY_OPTIONS,
  type RetentionPolicy,
} from "../../../../domain/enums/retention.enum";

interface FileRetentionSectionProps {
  isDisabled?: boolean;
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
}

const FileRetentionSection = ({ isDisabled, onError, onSuccess }: FileRetentionSectionProps) => {
  const [retentionPolicy, setRetentionPolicy] = useState<RetentionPolicy | "">("");
  const [saving, setSaving] = useState(false);

  // Seed from org settings; missing row resolves to defaults (no default policy).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const settings = await getFileOrgSettings();
        if (cancelled) return;
        setRetentionPolicy(settings.default_retention_policy ?? "");
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
      await updateFileOrgSettings({
        default_retention_policy: (retentionPolicy || null) as RetentionPolicy | null,
      });
      onSuccess("File retention settings saved");
    } catch (error: any) {
      onError(error?.message || "Failed to save file retention settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box sx={{ mt: 6 }}>
      <Typography sx={{ fontSize: 15, fontWeight: 600, mb: 1 }}>File retention</Typography>
      <Typography sx={{ fontSize: 13, color: "text.secondary", mb: 3, maxWidth: 560 }}>
        Applied to every new file upload that doesn't set its own retention or expiry. Uploaders can
        override this per file from the File Manager metadata editor at any time.
      </Typography>

      <Box sx={{ maxWidth: "360px", mb: 3 }}>
        <SelectComponent
          id="file-default-retention"
          label="Default retention policy"
          items={RETENTION_POLICY_OPTIONS}
          value={retentionPolicy}
          onChange={(event: any) => setRetentionPolicy(event.target.value)}
          placeholder="No default"
          disabled={isDisabled}
          sx={{ width: "100%" }}
        />
      </Box>

      <CustomizableButton
        variant="contained"
        text="Save retention settings"
        onClick={handleSave}
        isDisabled={isDisabled || saving}
        testId="file-org-save-retention-btn"
      />
    </Box>
  );
};

export default FileRetentionSection;
