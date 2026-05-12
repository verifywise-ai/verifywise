import React, { useState, useEffect } from "react";
import { Box, Typography, Stack, FormControl, Checkbox, SelectChangeEvent } from "@mui/material";
import { OnboardingStepProps } from "../../../types/interfaces/i.onboarding";
import { DEMO_PROJECT_BANNER } from "../onboardingConstants";
import Select from "../../../components/Inputs/Select";
import useFrameworks from "../../../../application/hooks/useFrameworks";
import { Framework } from "../../../../domain/types/Framework";
import onboardingBanner from "../../../assets/onboarding-banner.svg";
import { brand, text, background, border as borderPalette, status } from "../../../themes/palette";

const USE_CASE_TEMPLATES = [
  { _id: "demo-chatbot", name: "AI Chatbot for Customer Support" },
  { _id: "demo-analytics", name: "Predictive Analytics System" },
  { _id: "demo-cv", name: "Computer Vision for Quality Control" },
  { _id: "demo-nlp", name: "Document Processing with NLP" },
  { _id: "demo-recommendation", name: "Recommendation Engine" },
];

const SampleProjectStep: React.FC<OnboardingStepProps> = ({
  sampleProject,
  updateSampleProject,
}) => {
  const { allFrameworks } = useFrameworks({ listOfFrameworks: [] });
  const [selectedFrameworks, setSelectedFrameworks] = useState<number[]>(
    sampleProject?.selectedFrameworks || [],
  );

  const hasFrameworks = allFrameworks && allFrameworks.length > 0;

  // Handle use case selection
  const handleUseCaseChange = (event: SelectChangeEvent<string | number>) => {
    updateSampleProject?.({ useCaseName: String(event.target.value) });
  };

  // Handle framework checkbox changes
  const handleFrameworkToggle = (frameworkId: number) => {
    const newSelectedFrameworks = selectedFrameworks.includes(frameworkId)
      ? selectedFrameworks.filter((id) => id !== frameworkId)
      : [...selectedFrameworks, frameworkId];

    setSelectedFrameworks(newSelectedFrameworks);
    updateSampleProject?.({ selectedFrameworks: newSelectedFrameworks });
  };

  useEffect(() => {
    if (sampleProject?.selectedFrameworks) {
      setSelectedFrameworks(sampleProject.selectedFrameworks);
    }
  }, [sampleProject?.selectedFrameworks]);

  const hasRequiredSelections = sampleProject?.useCaseName && selectedFrameworks.length > 0;

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
          Create your first demo project
        </Typography>
      </Box>

      <Box>
        <Typography
          sx={{
            fontSize: "14px",
            color: `${text.icon}`,
            marginBottom: 2,
            lineHeight: 1.6,
          }}
        >
          Let's create a sample project to explore VerifyWise features hands-on.
        </Typography>

        {/* Demo Project Banner */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1.5,
            padding: 2,
            backgroundColor: "#FEF3C7",
            border: "1px solid #FDE68A",
            borderRadius: "4px",
          }}
        >
          <Typography sx={{ fontSize: "18px" }}>{DEMO_PROJECT_BANNER.icon}</Typography>
          <Typography sx={{ fontSize: "13px", color: "#92400E", fontWeight: 500 }}>
            {DEMO_PROJECT_BANNER.message}
          </Typography>
        </Box>
      </Box>

      <Stack spacing={4}>
        {/* Use Case Selection */}
        <FormControl fullWidth required>
          <Typography
            sx={{
              fontSize: "13px",
              fontWeight: 500,
              color: `${text.secondary}`,
              marginBottom: 1,
            }}
          >
            Demo use case <span style={{ color: "#DC2626" }}>*</span>
          </Typography>
          <Select
            id="use-case-select"
            label=""
            placeholder="Select a use case template"
            value={sampleProject?.useCaseName || ""}
            onChange={handleUseCaseChange}
            items={USE_CASE_TEMPLATES}
            sx={{ width: "100%" }}
          />
        </FormControl>

        {/* Framework Selection */}
        <FormControl required>
          <Typography
            sx={{
              fontSize: "13px",
              fontWeight: 500,
              color: `${text.secondary}`,
              marginBottom: 2,
            }}
          >
            Select regulations/frameworks to apply <span style={{ color: "#DC2626" }}>*</span>
          </Typography>

          {hasFrameworks ? (
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: "repeat(4, 1fr)",
                gap: 2,
              }}
            >
              {allFrameworks.map((framework: Framework) => (
                <Box
                  key={framework.id}
                  onClick={() => handleFrameworkToggle(Number(framework.id))}
                  sx={{
                    "padding": 2,
                    "border": "1px solid",
                    "borderColor": selectedFrameworks.includes(Number(framework.id))
                      ? `${brand.primary}`
                      : `${status.default.border}`,
                    "borderRadius": "4px",
                    "cursor": "pointer",
                    "display": "flex",
                    "flexDirection": "column",
                    "alignItems": "center",
                    "justifyContent": "center",
                    "gap": 1,
                    "backgroundColor": selectedFrameworks.includes(Number(framework.id))
                      ? "#F0FDF4"
                      : "white",
                    "transition": "all 0.2s",
                    "&:hover": {
                      backgroundColor: selectedFrameworks.includes(Number(framework.id))
                        ? "#F0FDF4"
                        : `${background.accent}`,
                      borderColor: `${brand.primary}`,
                    },
                  }}
                >
                  <Checkbox
                    checked={selectedFrameworks.includes(Number(framework.id))}
                    onChange={() => handleFrameworkToggle(Number(framework.id))}
                    sx={{
                      "padding": 0,
                      "color": `${borderPalette.dark}`,
                      "&.Mui-checked": {
                        color: `${brand.primary}`,
                      },
                    }}
                  />
                  <Typography
                    sx={{
                      fontSize: "12px",
                      color: "#111827",
                      fontWeight: 500,
                      textAlign: "center",
                    }}
                  >
                    {framework.name}
                  </Typography>
                </Box>
              ))}
            </Box>
          ) : (
            <Box
              sx={{
                padding: 2,
                backgroundColor: "#FEF2F2",
                border: "1px solid #FECACA",
                borderRadius: "4px",
              }}
            >
              <Typography sx={{ fontSize: "12px", color: "#991B1B" }}>
                No frameworks available. Please contact support if this issue persists.
              </Typography>
            </Box>
          )}
        </FormControl>

        {/* Validation Message */}
        {!hasRequiredSelections && (
          <Box
            sx={{
              padding: 2,
              backgroundColor: "#FEF2F2",
              border: "1px solid #FECACA",
              borderRadius: "4px",
            }}
          >
            <Typography sx={{ fontSize: "12px", color: "#991B1B" }}>
              Please select both a use case and at least one framework to continue.
            </Typography>
          </Box>
        )}
      </Stack>
    </Stack>
  );
};

export default SampleProjectStep;
