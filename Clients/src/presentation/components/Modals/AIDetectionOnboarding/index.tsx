/**
 * AIDetectionOnboarding — 3-step onboarding wizard for the AI Detection module.
 *
 * Thin wrapper around OnboardingWizard with AI-Detection-specific content.
 * Persists dismissal in localStorage so it only shows once per browser.
 */

import React from "react";
import { Stack, Typography } from "@mui/material";
import OnboardingWizard from "../OnboardingWizard";
import { text } from "../../../themes/palette";

const STORAGE_KEY = "vw:ai-detection-onboarding-dismissed";

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
    label: "Scan",
    content: (
      <StepContent
        title="Step 1: Scan"
        detail="Enter a public GitHub repository URL to scan for AI and ML components. The scanner detects libraries, frameworks, model files, API integrations, and potential security issues."
      />
    ),
  },
  {
    label: "Review",
    content: (
      <StepContent
        title="Step 2: Review"
        detail="Review scan results across six categories: libraries, security vulnerabilities, API calls, hardcoded secrets, model files, and RAG components. Each finding includes file paths and severity levels."
      />
    ),
  },
  {
    label: "Track",
    content: (
      <StepContent
        title="Step 3: Track"
        detail="View your scan history to track findings over time. Compare results across repositories and monitor how AI usage evolves in your codebase."
      />
    ),
  },
];

interface AIDetectionOnboardingProps {
  isOpen: boolean;
  onClose: () => void;
}

const AIDetectionOnboarding: React.FC<AIDetectionOnboardingProps> = ({
  isOpen,
  onClose,
}) => (
  <OnboardingWizard
    isOpen={isOpen}
    onClose={onClose}
    title="AI Detection"
    subtitle="Scan repositories to detect AI libraries, models, and security risks"
    steps={STEPS}
    storageKey={STORAGE_KEY}
  />
);

export default AIDetectionOnboarding;
