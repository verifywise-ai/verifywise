/**
 * Monitoring tab for JIRA-imported use cases
 * Shows a message that PMM is not available for JIRA imports
 */

import React from "react";
import { Box, Typography, Stack } from "@mui/material";
import { ClipboardCheck, Info } from "lucide-react";

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
            backgroundColor: "#f3f4f6",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <ClipboardCheck size={40} color="#9ca3af" />
        </Box>

        <Box sx={{ textAlign: "center" }}>
          <Typography sx={{ fontSize: 18, fontWeight: 600, color: "#374151", mb: 1 }}>
            Post-Market Monitoring
          </Typography>
          <Typography sx={{ fontSize: 14, color: "#6b7280", maxWidth: 450 }}>
            Post-market monitoring is managed through your JIRA workflow. This use case was imported
            from JIRA Assets and monitoring data should be tracked in your JIRA instance.
          </Typography>
        </Box>

        <Box
          sx={{
            display: "flex",
            alignItems: "flex-start",
            gap: 1.5,
            backgroundColor: "#EFF6FF",
            border: "1px solid #BFDBFE",
            borderRadius: 2,
            p: 2,
            maxWidth: 450,
          }}
        >
          <Info size={18} color="#3B82F6" style={{ flexShrink: 0, marginTop: 2 }} />
          <Typography sx={{ fontSize: 13, color: "#1E40AF" }}>
            To configure post-market monitoring for this AI system, update the monitoring attributes
            in JIRA Assets. Changes will sync automatically.
          </Typography>
        </Box>
      </Stack>
    </Box>
  );
};

export default JiraUseCaseMonitoring;
