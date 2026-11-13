/**
 * Monitoring tab for JIRA-imported use cases
 * Shows a message that PMM is not available for JIRA imports
 */

import React from "react";
import { Box, Typography, Stack } from "@mui/material";
import { ClipboardCheck, Info } from "lucide-react";
import { palette, radiusPx } from "../../../themes/palette";

interface JiraUseCaseMonitoringProps {
  project: {
    id: number;
    project_title?: string;
  } | null;
}

export const JiraUseCaseMonitoring: React.FC<JiraUseCaseMonitoringProps> = () => {
  return (
    <Box sx={{ p: 4 }}>
      <Stack alignItems="center" spacing={3}>
        <Box
          sx={{
            width: 80,
            height: 80,
            borderRadius: "50%",
            backgroundColor: palette.background.hover,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <ClipboardCheck size={40} color={palette.text.disabled} />
        </Box>

        <Box sx={{ textAlign: "center" }}>
          <Typography sx={{ fontSize: 18, fontWeight: 600, color: palette.text.secondary, mb: 1 }}>
            Post-Market Monitoring
          </Typography>
          <Typography sx={{ fontSize: 14, color: palette.text.icon, maxWidth: 450 }}>
            Post-market monitoring is managed through your JIRA workflow. This use case was imported
            from JIRA Assets and monitoring data should be tracked in your JIRA instance.
          </Typography>
        </Box>

        <Box
          sx={{
            display: "flex",
            alignItems: "flex-start",
            gap: 1.5,
            backgroundColor: palette.status.info.bg,
            border: `1px solid ${palette.status.info.border}`,
            borderRadius: radiusPx.sm,
            p: 2,
            maxWidth: 450,
          }}
        >
          <Info
            size={18}
            color={palette.status.info.text}
            style={{ flexShrink: 0, marginTop: 2 }}
          />
          <Typography sx={{ fontSize: 13, color: palette.status.info.text }}>
            To configure post-market monitoring for this AI system, update the monitoring attributes
            in JIRA Assets. Changes will sync automatically.
          </Typography>
        </Box>
      </Stack>
    </Box>
  );
};

export default JiraUseCaseMonitoring;
