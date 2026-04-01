import React from "react";
import { Box, Typography, Stack } from "@mui/material";
import { OnboardingStepProps } from "../../../types/interfaces/i.onboarding";
import { UserPlus, Settings, Shield } from "lucide-react";
import onboardingBanner from "../../../assets/onboarding-banner.svg";
import { text, background, status } from "../../../themes/palette";

const AdminSetupStep: React.FC<OnboardingStepProps> = () => {
  const setupTasks = [
    {
      icon: <UserPlus size={24} />,
      title: "Invite team members",
      hint: "Settings → Team",
      description: "Add colleagues to collaborate on compliance and risk management tasks.",
      color: "#3B82F6",
    },
    {
      icon: <Shield size={24} />,
      title: "Enable frameworks",
      hint: "Settings → Frameworks",
      description: "Activate the compliance frameworks relevant to your organization.",
      color: "#8B5CF6",
    },
    {
      icon: <Settings size={24} />,
      title: "Configure organization settings",
      hint: "Settings → Organization",
      description: "Customize branding, notifications, and organizational preferences.",
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
          Set up your organization
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
          Configure your organization settings, invite team members, and enable the frameworks you need.
        </Typography>
      </Box>

      <Stack spacing={3}>
        {setupTasks.map((task, index) => (
          <Box
            key={index}
            sx={{
              padding: 3,
              backgroundColor: "white",
              border: `2px solid ${status.default.border}`,
              borderRadius: "4px",
              transition: "all 0.2s",
              "&:hover": {
                borderColor: task.color,
                boxShadow: `0 4px 12px ${task.color}20`,
              },
            }}
          >
            <Stack direction="row" spacing={2}>
              <Box
                sx={{
                  width: "48px",
                  height: "48px",
                  borderRadius: "4px",
                  backgroundColor: `${task.color}15`,
                  color: task.color,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                {task.icon}
              </Box>
              <Box flex={1}>
                <Stack direction="row" alignItems="center" spacing={1} marginBottom={0.5}>
                  <Typography
                    sx={{
                      fontSize: "15px",
                      fontWeight: 600,
                      color: "#111827",
                    }}
                  >
                    {task.title}
                  </Typography>
                  <Typography
                    sx={{
                      fontSize: "15px",
                      color: "status.default.text",
                    }}
                  >
                    ({task.hint})
                  </Typography>
                </Stack>
                <Typography sx={{ fontSize: "13px", color: "status.default.text" }}>
                  {task.description}
                </Typography>
              </Box>
            </Stack>
          </Box>
        ))}
      </Stack>
    </Stack>
  );
};

export default AdminSetupStep;
