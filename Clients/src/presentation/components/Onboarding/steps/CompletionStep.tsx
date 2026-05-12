import React, { useEffect } from "react";
import { Box, Typography, Stack } from "@mui/material";
import { CheckCircle2, Check } from "lucide-react";
import confetti from "canvas-confetti";
import { OnboardingStepProps } from "../../../types/interfaces/i.onboarding";
import { CustomizableButton } from "../../button/customizable-button";
import { brand, text } from "../../../themes/palette";

const CompletionStep: React.FC<OnboardingStepProps> = ({ onNext }) => {
  useEffect(() => {
    // Fire confetti when component mounts
    const duration = 3000;
    const animationEnd = Date.now() + duration;
    const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 10000 };

    const randomInRange = (min: number, max: number) => {
      return Math.random() * (max - min) + min;
    };

    const interval = setInterval(() => {
      const timeLeft = animationEnd - Date.now();

      if (timeLeft <= 0) {
        clearInterval(interval);
        return;
      }

      const particleCount = 50 * (timeLeft / duration);

      // Fire confetti from two sides
      confetti({
        ...defaults,
        particleCount,
        origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 },
        colors: [`${brand.primary}`, "#10B981", "#D1FAE5", "#34D399", "#6EE7B7"],
      });
      confetti({
        ...defaults,
        particleCount,
        origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 },
        colors: [`${brand.primary}`, "#10B981", "#D1FAE5", "#34D399", "#6EE7B7"],
      });
    }, 250);

    return () => clearInterval(interval);
  }, []);
  return (
    <Stack spacing={4} alignItems="center" justifyContent="center" sx={{ minHeight: "400px" }}>
      <Box
        sx={{
          "animation": "scaleIn 0.5s ease-out",
          "@keyframes scaleIn": {
            from: {
              transform: "scale(0)",
              opacity: 0,
            },
            to: {
              transform: "scale(1)",
              opacity: 1,
            },
          },
        }}
      >
        <CheckCircle2 size={56} color={brand.primary} strokeWidth={1.5} />
      </Box>

      <Stack spacing={2} alignItems="center">
        <Typography
          variant="h4"
          sx={{
            fontWeight: 600,
            fontSize: "28px",
            color: "#111827",
            textAlign: "center",
          }}
        >
          Congratulations!
        </Typography>

        <Typography
          sx={{
            fontSize: "16px",
            color: `${text.icon}`,
            textAlign: "center",
            maxWidth: "500px",
            lineHeight: 1.6,
          }}
        >
          You are ready to work with VerifyWise and manage your AI governance process
        </Typography>
      </Stack>

      <Stack alignItems="center" sx={{ width: "100%" }}>
        <CustomizableButton
          variant="contained"
          text="Finish"
          onClick={onNext}
          endIcon={<Check size={16} />}
          sx={{
            "backgroundColor": `${brand.primary}`,
            "fontSize": "14px",
            "padding": "10px 24px",
            "&:hover": {
              backgroundColor: `${brand.primaryHover}`,
            },
          }}
        />
      </Stack>
    </Stack>
  );
};

export default CompletionStep;
