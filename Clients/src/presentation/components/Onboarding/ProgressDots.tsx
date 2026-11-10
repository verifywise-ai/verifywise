import React from "react";
import { Box } from "@mui/material";
import { green } from "@design-tokens/primitives";

interface ProgressDotsProps {
  totalSteps: number;
  currentStep: number;
}

const ProgressDots: React.FC<ProgressDotsProps> = ({ totalSteps, currentStep }) => {
  return (
    <Box
      sx={{
        display: "flex",
        gap: 1,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {Array.from({ length: totalSteps }).map((_, index) => (
        <Box
          key={index}
          sx={{
            width: currentStep === index ? 48 : 16,
            height: 8,
            borderRadius: 4,
            backgroundColor: currentStep === index ? green[500] : "rgba(0, 0, 0, 0.15)",
            transition: "all 0.3s ease",
          }}
        />
      ))}
    </Box>
  );
};

export default ProgressDots;
