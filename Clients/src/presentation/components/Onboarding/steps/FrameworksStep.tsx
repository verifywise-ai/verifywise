import React from "react";
import { Box, Typography, Stack } from "@mui/material";
import { OnboardingStepProps } from "../../../types/interfaces/i.onboarding";
import { Shield, FileText, Scale, Activity } from "lucide-react";
import onboardingBanner from "../../../assets/onboarding-banner.svg";
import { text, background } from "../../../themes/palette";

const FrameworksStep: React.FC<OnboardingStepProps> = () => {
  const frameworks = [
    {
      name: "EU AI Act",
      icon: <Scale size={20} />,
      description: "Comply with the European Union's comprehensive AI regulation framework.",
      color: "#3B82F6",
    },
    {
      name: "NIST AI RMF",
      icon: <Activity size={20} />,
      description: "Follow NIST's AI Risk Management Framework for trustworthy AI systems.",
      color: "#F59E0B",
    },
    {
      name: "ISO 42001",
      icon: <Shield size={20} />,
      description: "Meet international standards for AI management systems and best practices.",
      color: "#8B5CF6",
    },
    {
      name: "ISO 27001",
      icon: <FileText size={20} />,
      description: "Ensure information security management for your AI systems and data.",
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
          Apply compliance frameworks
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
          Map your projects to regulations like EU AI Act, ISO 42001, and ISO 27001 to ensure comprehensive compliance.
        </Typography>
      </Box>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 3,
        }}
      >
        {frameworks.map((framework, index) => (
          <Box
            key={index}
            sx={{
              padding: 12,
              background: `linear-gradient(135deg, ${framework.color}08 0%, transparent 100%)`,
              border: "1px solid status.default.border",
              borderRadius: "4px",
              display: "flex",
              flexDirection: "column",
              gap: 1.5,
              transition: "all 0.2s",
              "&:hover": {
                borderColor: framework.color,
                boxShadow: `0 0 0 3px ${framework.color}15`,
              },
            }}
          >
            <Box
              sx={{
                width: "40px",
                height: "40px",
                borderRadius: "4px",
                backgroundColor: `${framework.color}15`,
                color: framework.color,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              {framework.icon}
            </Box>
            <Box sx={{ padding: 1 }}>
              <Typography
                sx={{
                  fontSize: "14px",
                  fontWeight: 600,
                  color: "#111827",
                  marginBottom: 0.5,
                }}
              >
                {framework.name}
              </Typography>
              <Typography sx={{ fontSize: "13px", color: "status.default.text" }}>
                {framework.description}
              </Typography>
            </Box>
          </Box>
        ))}
      </Box>
    </Stack>
  );
};

export default FrameworksStep;
