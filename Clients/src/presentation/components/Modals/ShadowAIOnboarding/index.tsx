/**
 * ShadowAIOnboarding — 3-step onboarding wizard for the Shadow AI module.
 *
 * Thin wrapper around OnboardingWizard with Shadow-AI-specific content.
 * Persists dismissal in localStorage so it only shows once per browser.
 */

import React from "react";
import { Stack, Typography } from "@mui/material";
import OnboardingWizard from "../OnboardingWizard";
import { Eye } from "lucide-react";
import { text } from "../../../themes/palette";

const STORAGE_KEY = "vw:shadow-ai-onboarding-dismissed";

const StepContent: React.FC<{ title: string; detail: string }> = ({
  title,
  detail,
}) => (
  <Stack spacing={2.5}>
    <Typography sx={{ fontSize: 15, fontWeight: 600, color: "#1c2130" }}>
      {title}
    </Typography>
    <Typography sx={{ fontSize: 13, color: `${text.tertiary}`, lineHeight: 1.7 }}>
      {detail}
    </Typography>
  </Stack>
);

const STEPS = [
  {
    label: "Connect",
    content: (
      <StepContent
        title="Step 1: Connect"
        detail="Connect your SIEM or web proxy to start detecting AI tool usage across your organization. Use the REST API with an API key, or configure a syslog source such as Zscaler, Netskope, or Squid."
      />
    ),
  },
  {
    label: "Alert",
    content: (
      <StepContent
        title="Step 2: Alert"
        detail="Create alert rules to get notified when new AI tools are detected, usage thresholds are exceeded, or sensitive departments access unauthorized AI tools."
      />
    ),
  },
  {
    label: "Monitor",
    content: (
      <StepContent
        title="Step 3: Monitor"
        detail="Monitor your Insights dashboard for real-time visibility into detected AI tools, user activity by department, risk scores, and adoption trends across your organization."
      />
    ),
  },
];

interface ShadowAIOnboardingProps {
  isOpen: boolean;
  onClose: () => void;
}

const ShadowAIOnboarding: React.FC<ShadowAIOnboardingProps> = ({
  isOpen,
  onClose,
}) => (
  <OnboardingWizard
    isOpen={isOpen}
    onClose={onClose}
    title="Shadow AI"
    subtitle="Detect and monitor unauthorized AI tool usage in your organization"
    badgeIcon={Eye}
    steps={STEPS}
    storageKey={STORAGE_KEY}
  />
);

export default ShadowAIOnboarding;
