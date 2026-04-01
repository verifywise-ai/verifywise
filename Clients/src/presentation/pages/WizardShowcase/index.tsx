/**
 * WizardShowcase - Temporary dev page to preview the AI Detection onboarding modal.
 * Access at /wizard-showcase (dev only).
 */

import React, { useState } from "react";
import { Box, Stack, Typography } from "@mui/material";
import AIDetectionOnboarding from "../../components/Modals/AIDetectionOnboarding";
import { CustomizableButton } from "../../components/button/customizable-button";
import { brand, status } from "../../themes/palette";

const WizardShowcase: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Box sx={{ padding: "40px", maxWidth: 800, margin: "0 auto" }}>
      <Stack spacing={2} sx={{ mb: 4 }}>
        <Typography sx={{ fontSize: 24, fontWeight: 700, color: "#111827" }}>
          AI Detection onboarding wizard
        </Typography>
        <Typography sx={{ fontSize: 14, color: `${status.default.text}` }}>
          Preview the onboarding modal for the AI Detection module.
        </Typography>
      </Stack>

      <CustomizableButton
        variant="contained"
        text="Open onboarding wizard"
        onClick={() => setIsOpen(true)}
        sx={{
          height: 40,
          fontSize: 14,
          bgcolor: `${brand.primary}`,
          "&:hover": { bgcolor: `${brand.primaryHover}` },
        }}
      />

      <AIDetectionOnboarding
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
      />
    </Box>
  );
};

export default WizardShowcase;
