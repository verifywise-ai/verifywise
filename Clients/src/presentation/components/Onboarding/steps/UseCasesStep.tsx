import React from "react";
import { Box, Typography, Stack } from "@mui/material";
import { OnboardingStepProps } from "../../../types/interfaces/i.onboarding";
import { FolderPlus, Users, TrendingUp, Shield } from "lucide-react";
import onboardingBanner from "../../../assets/onboarding-banner.svg";
import { text, background } from "../../../themes/palette";

const UseCasesStep: React.FC<OnboardingStepProps> = () => {
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
          Manage your AI use cases
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
          Create and track AI projects, assign teams, and monitor compliance status across all your initiatives.
        </Typography>
      </Box>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 3,
        }}
      >
        {[
          {
            icon: <FolderPlus size={20} />,
            title: "Create use cases",
            description: "Document your AI projects with detailed information about goals, teams, and timelines.",
            color: "#3B82F6",
          },
          {
            icon: <Users size={20} />,
            title: "Assign teams",
            description: "Collaborate with team members by assigning owners and stakeholders to each project.",
            color: "#F59E0B",
          },
          {
            icon: <TrendingUp size={20} />,
            title: "Track status",
            description: "Monitor progress from initiation to completion with real-time status updates.",
            color: "#8B5CF6",
          },
          {
            icon: <Shield size={20} />,
            title: "Ensure compliance",
            description: "Link projects to relevant frameworks and ensure regulatory requirements are met.",
            color: "#10B981",
          },
        ].map((feature, index) => (
          <Box
            key={index}
            sx={{
              padding: 12,
              background: `linear-gradient(135deg, ${feature.color}08 0%, transparent 100%)`,
              border: "1px solid status.default.border",
              borderRadius: "4px",
              display: "flex",
              flexDirection: "column",
              gap: 1.5,
              transition: "all 0.2s",
              "&:hover": {
                borderColor: feature.color,
                boxShadow: `0 0 0 3px ${feature.color}15`,
              },
            }}
          >
            <Box
              sx={{
                width: "40px",
                height: "40px",
                borderRadius: "4px",
                backgroundColor: `${feature.color}15`,
                color: feature.color,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              {feature.icon}
            </Box>
            <Box>
              <Typography
                sx={{
                  fontSize: "14px",
                  fontWeight: 600,
                  color: "#111827",
                  marginBottom: 0.5,
                }}
              >
                {feature.title}
              </Typography>
              <Typography sx={{ fontSize: "13px", color: "status.default.text" }}>
                {feature.description}
              </Typography>
            </Box>
          </Box>
        ))}
      </Box>
    </Stack>
  );
};

export default UseCasesStep;
