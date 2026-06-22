import React from "react";
import { Stack, Typography, Box, alpha } from "@mui/material";
import { Network, Clock } from "lucide-react";
import GovernanceLayout from "../shared/GovernanceLayout";
import GovernanceTooltip from "../../../components/GovernanceOS/GovernanceTooltip";
import { text, accent } from "../../../themes/palette";

const KnowledgeGraph: React.FC = () => {
  return (
    <GovernanceLayout
      title="Knowledge Graph"
      subtitle="Visual exploration of governance relationships, controls, and compliance dependencies."
    >
      <Stack gap="16px" alignItems="center" sx={{ py: "48px" }}>
        <GovernanceTooltip
          header="Knowledge Graph"
          description="Visual exploration of governance relationships, controls, and compliance dependencies. This module is coming soon."
        >
          <span>
            <Box
              sx={{
                width: 64,
                height: 64,
                borderRadius: "50%",
                backgroundColor: alpha(accent.purple.text, 0.08),
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Network size={24} color={accent.purple.text} />
            </Box>
          </span>
        </GovernanceTooltip>
        <Typography sx={{ fontSize: 16, fontWeight: 600, color: text.primary }}>
          Knowledge Graph
        </Typography>
        <Stack direction="row" gap="8px" alignItems="center">
          <Clock size={16} color={text.muted} />
          <Typography sx={{ fontSize: 14, color: text.muted }}>
            Coming soon — interactive visual graph of governance entities.
          </Typography>
        </Stack>
        <Typography sx={{ fontSize: 13, color: text.accent, maxWidth: 480, textAlign: "center" }}>
          The Knowledge Graph will render an interactive visualization of frameworks, controls,
          mappings, risks, and evidence — making complex governance relationships explorable at a
          glance.
        </Typography>
      </Stack>
    </GovernanceLayout>
  );
};

export default KnowledgeGraph;
