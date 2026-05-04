import React from "react";
import { Box, Typography, Stack } from "@mui/material";
import { OnboardingStepProps } from "../../../types/interfaces/i.onboarding";
import onboardingBanner from "../../../assets/onboarding-banner.svg";
import { brand, text, background } from "../../../themes/palette";

const WELCOME_FEATURES = [
  "How to manage AI use cases and projects",
  "Applying compliance frameworks like EU AI Act",
  "Tracking and mitigating AI risks",
  "Setting up your organization for success",
] as const;

const WelcomeStep: React.FC<OnboardingStepProps> = () => {
  return (
    <Stack spacing={4} alignItems="center">
      <Box
        sx={{
          position: "relative",
          width: "100%",
        }}
      >
        <Box
          component="img"
          src={onboardingBanner}
          alt="Onboarding"
          sx={{
            width: "100%",
            height: "auto",
            maxHeight: "140px",
            borderRadius: "4px",
            objectFit: "cover",
            display: "block",
          }}
        />
        <Typography
          variant="h4"
          sx={{
            position: "absolute",
            top: "40px",
            left: "50px",
            fontWeight: 600,
            fontSize: "28px",
            color: `${background.main}`,
          }}
        >
          Welcome to VerifyWise
        </Typography>
      </Box>

      <Box
        sx={{
          width: "100%",
        }}
      >
        <Typography
          sx={{
            fontSize: "14px",
            color: `${text.icon}`,
            marginBottom: 4,
            lineHeight: 1.6,
          }}
        >
          VerifyWise is your AI governance and compliance platform. In 3 minutes, we'll help you get
          started with managing AI risks, compliance frameworks, and building trust.
        </Typography>
        <Typography
          sx={{
            fontSize: "14px",
            color: `${text.icon}`,
            fontWeight: 500,
            marginBottom: 4,
          }}
        >
          What you'll learn:
        </Typography>
        <Stack spacing={1} sx={{ paddingLeft: 2 }}>
          {WELCOME_FEATURES.map((item, index) => (
            <Box key={index} sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Box
                sx={{
                  width: "6px",
                  height: "6px",
                  borderRadius: "50%",
                  backgroundColor: `${brand.primary}`,
                }}
              />
              <Typography sx={{ fontSize: "14px", color: `${text.icon}` }}>{item}</Typography>
            </Box>
          ))}
        </Stack>
      </Box>
    </Stack>
  );
};

export default WelcomeStep;
