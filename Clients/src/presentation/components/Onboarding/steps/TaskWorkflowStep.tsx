import React from "react";
import { Box, Typography, Stack } from "@mui/material";
import { OnboardingStepProps } from "../../../types/interfaces/i.onboarding";
import { CheckSquare, MessageSquare, BarChart3, Bell } from "lucide-react";
import Alert from "../../Alert";
import onboardingBanner from "../../../assets/onboarding-banner.svg";
import { brand, text, background, status } from "../../../themes/palette";

const TaskWorkflowStep: React.FC<OnboardingStepProps> = () => {
  const workflowSteps = [
    {
      icon: <Bell size={20} />,
      title: "Receive notifications",
      description: "Get alerted when tasks are assigned to you or when updates are made to your projects.",
    },
    {
      icon: <CheckSquare size={20} />,
      title: "Complete tasks",
      description: "Review assigned compliance and risk mitigation tasks from your dashboard.",
    },
    {
      icon: <MessageSquare size={20} />,
      title: "Collaborate",
      description: "Comment on risks, tag team members, and share updates across projects.",
    },
    {
      icon: <BarChart3 size={20} />,
      title: "Track progress",
      description: "Monitor your task completion and contribution to organizational compliance.",
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
          Your daily workflow
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
          Complete compliance tasks, update risk status, and collaborate with your team efficiently.
        </Typography>
      </Box>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 3,
        }}
      >
        {workflowSteps.map((step, index) => (
          <Box
            key={index}
            sx={{
              padding: 10,
              background: "linear-gradient(135deg, #13715B08 0%, transparent 100%)",
              border: `1px solid ${status.default.border}`,
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
                backgroundColor: "#13715B15",
                color: `${brand.primary}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {step.icon}
            </Box>
            <Typography
              sx={{
                fontSize: "13px",
                fontWeight: 600,
                color: "#111827",
              }}
            >
              {step.title}
            </Typography>
            <Typography sx={{ fontSize: "12px", color: `${status.default.text}` }}>
              {step.description}
            </Typography>
          </Box>
        ))}
      </Box>

      <Alert
        variant="success"
        body="Use the dashboard to get a quick overview of all your pending tasks, upcoming deadlines, and recent activity across your projects."
        hasIcon={false}
        sx={{
          position: "static",
          padding: "12px 16px",
        }}
      />
    </Stack>
  );
};

export default TaskWorkflowStep;
