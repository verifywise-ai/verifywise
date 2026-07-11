import { useEffect, useState } from "react";
import { Box, Typography } from "@mui/material";
import { CustomizableButton } from "../../../components/button/customizable-button";
import Field from "../../../components/Inputs/Field";
import { useMrmSettings, useUpdateMrmSettings } from "../../../../application/hooks/useMrm";
import { mrmErrorMessage } from "./constants";
import { mrmSectionIntroStyle } from "./mrmStyles";

interface RetentionSectionProps {
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
}

const MIN_RETENTION_MONTHS = 13;

const RetentionSection = ({ onError, onSuccess }: RetentionSectionProps) => {
  const { data: settings } = useMrmSettings();
  const updateSettings = useUpdateMrmSettings();
  const [months, setMonths] = useState<string>("");

  // Seed the input from the loaded settings; keep user edits afterwards.
  useEffect(() => {
    if (settings) setMonths(String(settings.retention_months));
  }, [settings]);

  const handleSave = async () => {
    const parsed = Number(months);
    if (!Number.isInteger(parsed) || parsed < MIN_RETENTION_MONTHS) {
      onError("Retention must be at least 13 months");
      return;
    }
    try {
      await updateSettings.mutateAsync({ retention_months: parsed });
      onSuccess("Retention saved");
    } catch (error) {
      onError(mrmErrorMessage(error, "Failed to save retention"));
    }
  };

  return (
    <Box>
      <Typography sx={mrmSectionIntroStyle}>
        Benign monitoring points older than the retention window are removed by a daily job. Breach
        and evaluation history is never deleted.
      </Typography>

      <Box sx={{ maxWidth: "360px", marginBottom: "16px" }}>
        <Field
          id="mrm-retention-months"
          type="number"
          label="Monitoring data retention (months)"
          value={months}
          onChange={(e) => setMonths(e.target.value)}
          helperText="Breach and evaluation history is always retained; this only ages out benign monitoring points."
        />
      </Box>

      <CustomizableButton
        variant="contained"
        text="Save retention"
        onClick={handleSave}
        isDisabled={updateSettings.isPending}
        testId="mrm-save-retention-btn"
      />
    </Box>
  );
};

export default RetentionSection;
