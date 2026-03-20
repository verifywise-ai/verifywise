import React from "react";
import { Box, Typography, Stack } from "@mui/material";
import { OnboardingStepProps } from "../../../types/interfaces/i.onboarding";
import { AlertTriangle, CheckCircle, Clock, Users } from "lucide-react";
import onboardingBanner from "../../../assets/onboarding-banner.svg";
import { text, background } from "../../../themes/palette";

const RiskManagementStep: React.FC<OnboardingStepProps> = () => {
  const capabilities = [
    {
      icon: <AlertTriangle size={18} />,
      title: "Identify risks",
      description: "Catalog potential risks across your AI systems",
      color: "#EF4444",
    },
    {
      icon: <Users size={18} />,
      title: "Assign ownership",
      description: "Delegate risk mitigation to responsible teams",
      color: "#F59E0B",
    },
    {
      icon: <Clock size={18} />,
      title: "Track progress",
      description: "Monitor mitigation efforts in real-time",
      color: "#3B82F6",
    },
    {
      icon: <CheckCircle size={18} />,
      title: "Close risks",
      description: "Mark risks as resolved when mitigation is complete",
      color: "#10B981",
    },
  ];

  return (
    <Stack spacing={4}>
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
          variant="h5"
          sx={{
            position: "absolute",
            top: "40px",
            left: "50px",
            fontWeight: 600,
            fontSize: "24px",
            color: `${background.main}`,
          }}
        >
          Identify and mitigate risks
        </Typography>
      </Box>

      <Box>
        <Typography
          sx={{
            fontSize: "14px",
            color: `${text.icon}`,
            marginBottom: 3,
            lineHeight: 1.6,
          }}
        >
          Track risks, assign mitigation tasks, and monitor progress to maintain control over your AI systems.
        </Typography>
      </Box>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 3,
        }}
      >
        {capabilities.map((capability, index) => (
          <Box
            key={index}
            sx={{
              padding: 10,
              background: `linear-gradient(135deg, ${capability.color}08 0%, transparent 100%)`,
              border: "1px solid status.default.border",
              borderRadius: "4px",
              display: "flex",
              flexDirection: "column",
              gap: 1,
            }}
          >
            <Box
              sx={{
                width: "32px",
                height: "32px",
                borderRadius: "6px",
                backgroundColor: `${capability.color}15`,
                color: capability.color,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {capability.icon}
            </Box>
            <Typography
              sx={{
                fontSize: "13px",
                fontWeight: 600,
                color: "#111827",
              }}
            >
              {capability.title}
            </Typography>
            <Typography sx={{ fontSize: "12px", color: "status.default.text" }}>
              {capability.description}
            </Typography>
          </Box>
        ))}
      </Box>
    </Stack>
  );
};

export default RiskManagementStep;
