import React from "react";
import { Stack, Typography, Box, alpha } from "@mui/material";
import { Radio, Clock } from "lucide-react";
import GovernanceLayout from "../shared/GovernanceLayout";
import { text, accent } from "../../../themes/palette";

const RegulatoryRadar: React.FC = () => {
  return (
    <GovernanceLayout
      title="Regulatory Radar"
      subtitle="Monitor regulatory changes, track compliance deadlines, and receive alerts."
    >
      <Stack gap="16px" alignItems="center" sx={{ py: "48px" }}>
        <Box
          sx={{
            width: 64,
            height: 64,
            borderRadius: "50%",
            backgroundColor: alpha(accent.orange.text, 0.08),
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Radio size={24} color={accent.orange.text} />
        </Box>
        <Typography sx={{ fontSize: 16, fontWeight: 600, color: text.primary }}>
          Regulatory Radar
        </Typography>
        <Stack direction="row" gap="8px" alignItems="center">
          <Clock size={16} color={text.muted} />
          <Typography sx={{ fontSize: 14, color: text.muted }}>
            Coming soon — automated regulatory change monitoring.
          </Typography>
        </Stack>
        <Typography sx={{ fontSize: 13, color: text.accent, maxWidth: 480, textAlign: "center" }}>
          The Regulatory Radar will track changes to EU AI Act, ISO standards, and NIST guidelines —
          alerting you to new requirements, deadlines, and gaps in your compliance posture.
        </Typography>
      </Stack>
    </GovernanceLayout>
  );
};

export default RegulatoryRadar;
