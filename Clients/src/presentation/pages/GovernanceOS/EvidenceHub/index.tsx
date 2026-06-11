import React from "react";
import { Stack, Typography, Box, alpha } from "@mui/material";
import { FileCheck, Clock } from "lucide-react";
import GovernanceLayout from "../shared/GovernanceLayout";
import { text, brand } from "../../../themes/palette";

const EvidenceHub: React.FC = () => {
  return (
    <GovernanceLayout
      title="Evidence Hub"
      subtitle="Centralize and manage compliance evidence across all frameworks and projects."
    >
      <Stack gap="16px" alignItems="center" sx={{ py: "48px" }}>
        <Box
          sx={{
            width: 64,
            height: 64,
            borderRadius: "50%",
            backgroundColor: alpha(brand.primary, 0.08),
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <FileCheck size={24} color={brand.primary} />
        </Box>
        <Typography sx={{ fontSize: 16, fontWeight: 600, color: text.primary }}>
          Evidence Hub
        </Typography>
        <Stack direction="row" gap="8px" alignItems="center">
          <Clock size={16} color={text.muted} />
          <Typography sx={{ fontSize: 14, color: text.muted }}>
            Coming soon — automated evidence collection and centralized storage.
          </Typography>
        </Stack>
        <Typography sx={{ fontSize: 13, color: text.accent, maxWidth: 480, textAlign: "center" }}>
          The Evidence Hub will connect to your existing evidence sources, auto-collect compliance
          artifacts, and provide a unified view of evidence coverage across frameworks.
        </Typography>
      </Stack>
    </GovernanceLayout>
  );
};

export default EvidenceHub;
