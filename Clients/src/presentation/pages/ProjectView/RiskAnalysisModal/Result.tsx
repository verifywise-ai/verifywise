import React from "react";
import { Stack, Typography, Box, useTheme } from "@mui/material";
import { AlertCircle, AlertTriangle, Info, CheckCircle, RotateCcw, Save } from "lucide-react";
import type { ClassificationResult } from "../../../../domain/types/euAiActClassification";
import ReasonList from "../../../components/EuAiActQuestionnaire/ReasonList";
import { CustomizableButton } from "../../../components/button/customizable-button";
import { brand, status } from "../../../themes/palette";

interface ResultProps {
  result: ClassificationResult;
  onRestart?: () => void;
  onSave?: () => void;
  isSaving?: boolean;
}

const Results: React.FC<ResultProps> = ({ result, onRestart, onSave, isSaving }) => {
  const theme = useTheme();

  // Get styling based on risk level
  const getLevelConfig = () => {
    switch (result.level) {
      case "Prohibited":
        return {
          color: `${status.error.text}`,
          bgColor: "#FFEBEE",
          icon: <AlertCircle size={32} />,
          title: "Prohibited AI system",
          description:
            "This system falls under a prohibited practice and cannot be placed on the market or used in the EU.",
        };
      case "High risk":
        return {
          color: "#F57C00",
          bgColor: "#FFF3E0",
          icon: <AlertTriangle size={32} />,
          title: "High-risk AI system",
          description:
            "This system is high risk and must meet the EU AI Act's requirements for high-risk systems.",
        };
      case "Limited risk":
        return {
          color: "#FBC02D",
          bgColor: "#FFFDE7",
          icon: <Info size={32} />,
          title: "Limited risk",
          description: "This system has transparency obligations under Article 50.",
        };
      case "Minimal risk":
        return {
          color: "#388E3C",
          bgColor: "#E8F5E9",
          icon: <CheckCircle size={32} />,
          title: "Minimal risk",
          description: "No specific EU AI Act obligations apply beyond AI literacy.",
        };
      case "Out of scope":
        return {
          color: theme.palette.text.secondary,
          bgColor: theme.palette.background.accent,
          icon: <Info size={32} />,
          title: "Outside the EU AI Act",
          description:
            "Research and development systems not placed on the market or used are outside the EU AI Act.",
        };
    }
  };

  const config = getLevelConfig();

  return (
    <Stack spacing={10}>
      {/* Classification Header */}
      <Box
        sx={{
          bgcolor: config.bgColor,
          border: 2,
          borderColor: config.color,
          borderRadius: 2,
          p: 3,
        }}
      >
        <Stack direction="row" spacing={2} alignItems="center">
          <Box sx={{ color: config.color }}>{config.icon}</Box>
          <Stack flex={1}>
            <Typography fontSize={15} fontWeight={700} color={config.color} mb={0.5}>
              {config.title}
            </Typography>
            <Typography fontSize={13} color="text.primary">
              {config.description}
            </Typography>
          </Stack>
        </Stack>
      </Box>

      {result.reasons.length > 0 && <ReasonList heading="Why" items={result.reasons} />}
      {result.obligations.length > 0 && (
        <ReasonList heading="Obligations" items={result.obligations} />
      )}

      {/* Action Buttons */}
      <Stack direction="row" spacing={2} justifyContent="flex-end">
        {onRestart && (
          <CustomizableButton
            variant="outlined"
            text="Start new assessment"
            icon={<RotateCcw size={16} />}
            onClick={onRestart}
          />
        )}
        {onSave && (
          <CustomizableButton
            variant="contained"
            text="Save results"
            icon={<Save size={16} />}
            onClick={onSave}
            isDisabled={isSaving}
            sx={{
              "backgroundColor": `${brand.primary}`,
              "border": `1px solid ${brand.primary}`,
              "&:hover": {
                backgroundColor: "#0F5A48",
              },
            }}
          />
        )}
      </Stack>
    </Stack>
  );
};

export default Results;
