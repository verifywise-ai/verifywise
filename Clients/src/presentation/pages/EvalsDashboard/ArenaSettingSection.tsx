import { useState } from "react";
import { Box, CircularProgress, Typography } from "@mui/material";
import Toggle from "../../components/Inputs/Toggle";
import Alert from "../../components/Alert";
import { useCan } from "../../../application/hooks/useCan";
import { useArenaSetting, useUpdateArenaSetting } from "../../../application/hooks/useArenaSetting";
import { palette } from "../../themes/palette";

/**
 * LLM Evals settings section that turns Arena on or off for the organization.
 * Everyone sees the current value; only users with "organization.admin" (the
 * permission the server checks on save) can change it.
 */
export default function ArenaSettingSection() {
  const canManage = useCan("organization.admin");
  const { data: setting, isLoading, isError } = useArenaSetting();
  const { mutateAsync: saveSetting, isPending: saving } = useUpdateArenaSetting();
  const [saveError, setSaveError] = useState(false);

  const handleChange = async (_event: unknown, checked: boolean) => {
    setSaveError(false);
    try {
      await saveSetting(checked);
    } catch {
      setSaveError(true);
    }
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      <Typography sx={{ fontWeight: 600, fontSize: 15, color: palette.text.secondary }}>
        Arena
      </Typography>
      <Box
        sx={{
          background: palette.background.main,
          border: `1px solid ${palette.border.dark}`,
          borderRadius: "4px",
          p: "16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "16px",
        }}
      >
        <Box sx={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <Typography sx={{ fontWeight: 600, fontSize: 13, color: palette.text.secondary }}>
            Turn on Arena
          </Typography>
          <Typography sx={{ fontSize: 13, color: palette.text.tertiary }}>
            Compare models side by side on the same prompts.
          </Typography>
          {isError && (
            <Typography sx={{ fontSize: 13, color: palette.status.error.text }}>
              Could not load the Arena setting.
            </Typography>
          )}
          {!canManage && !isError && (
            <Typography sx={{ fontSize: 13, color: palette.text.tertiary }}>
              Only Admins can change this setting.
            </Typography>
          )}
        </Box>
        {isLoading ? (
          <CircularProgress size={20} aria-label="Loading Arena setting" />
        ) : (
          <Toggle
            ariaLabel="Turn on Arena"
            checked={setting?.enabled ?? false}
            onChange={handleChange}
            disabled={!canManage || saving || isError}
          />
        )}
      </Box>
      {saveError && (
        <Alert
          variant="error"
          body="Could not save the Arena setting. Try again."
          isToast={false}
        />
      )}
    </Box>
  );
}
