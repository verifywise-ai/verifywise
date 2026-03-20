import React from "react";
import { Box, Typography, Stack, FormControl, RadioGroup, FormControlLabel, Radio } from "@mui/material";
import { OnboardingStepProps } from "../../../types/interfaces/i.onboarding";
import { OnboardingUseCase } from "../../../../domain/enums/onboarding.enum";
import onboardingBanner from "../../../assets/onboarding-banner.svg";
import { brand, text, background, border as borderPalette } from "../../../themes/palette";

const PreferencesStep: React.FC<OnboardingStepProps> = ({
  preferences,
  updatePreferences,
}) => {
  const handleUseCaseChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    updatePreferences?.({ primaryUseCase: event.target.value as OnboardingUseCase });
  };

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
          Tell us about yourself
        </Typography>
      </Box>

      <Box>
        <Typography
          sx={{
            fontSize: "14px",
            color: `${text.icon}`,
            marginBottom: 3,
          }}
        >
          Help us personalize your experience by sharing a bit about your focus. This information helps us customize your dashboard. You can skip this step or update these preferences later in settings.
        </Typography>
      </Box>

      <Stack spacing={4}>
        {/* Primary Use Case */}
        <FormControl>
          <Typography
            sx={{
              fontSize: "13px",
              fontWeight: 500,
              color: `${text.secondary}`,
              marginBottom: 2,
            }}
          >
            What's your primary focus?
          </Typography>
          <RadioGroup
            value={preferences?.primaryUseCase || ""}
            onChange={handleUseCaseChange}
          >
            {Object.values(OnboardingUseCase).map((useCase) => (
              <FormControlLabel
                key={useCase}
                value={useCase}
                control={
                  <Radio
                    sx={{
                      color: `${borderPalette.dark}`,
                      "&.Mui-checked": {
                        color: `${brand.primary}`,
                      },
                    }}
                  />
                }
                label={
                  <Typography sx={{ fontSize: "13px", color: `${text.secondary}` }}>
                    {useCase}
                  </Typography>
                }
              />
            ))}
          </RadioGroup>
        </FormControl>
      </Stack>
    </Stack>
  );
};

export default PreferencesStep;
