import React from "react";
import { Box, Typography } from "@mui/material";
import { X } from "lucide-react";
import { ICustomStepProps } from "../../../../domain/interfaces/i.customs";
import { ICustomStepWrapperProps } from "../../../types/customs.types";
import { background } from "../../../themes/palette";
import "./CustomStep.css";

export const CustomStepWrapper: React.FC<ICustomStepWrapperProps> = ({
  content,
  continuous,
  index,
  backProps,
  primaryProps,
  skipProps,
  tooltipProps,
  isLastStep,
  size,
}) => {
  const { header, body } = content;
  const currentIndex = index ?? 0;

  return (
    <Box
      {...tooltipProps}
      sx={{
        background: "linear-gradient(135deg, #1f1f23 0%, #252530 100%)",
        borderRadius: "4px",
        padding: "24px",
        position: "relative",
        overflow: "hidden",
        boxShadow: "0 8px 32px rgba(0, 0, 0, 0.3)",
        border: "1px solid rgba(255, 255, 255, 0.1)",
        maxWidth: "400px",
      }}
    >
      {/* Close button in top right - always show so users can exit */}
      {continuous && (
        <button
          {...skipProps}
          className="tour-close-button"
          aria-label="Close tour"
        >
          <X size={18} />
        </button>
      )}

      {/* Header */}
      {header && (
        <Box>
          <Typography
            variant="h6"
            sx={{
              fontWeight: 600,
              fontSize: "15px",
              color: `${background.main}`,
              letterSpacing: "-0.02em",
              mb: 2,
            }}
          >
            {header}
          </Typography>
          <Box
            sx={{
              height: "1px",
              background: "rgba(255, 255, 255, 0.1)",
              mb: 2,
            }}
          />
        </Box>
      )}

      {/* Body text */}
      <Typography
        variant="body2"
        sx={{
          color: "rgba(255, 255, 255, 0.85)",
          fontSize: "13px",
          lineHeight: 1.6,
        }}
      >
        {body}
      </Typography>

      {/* Progress and buttons */}
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          mt: 4,
        }}
      >
        {/* Progress indicator */}
        <Typography
          variant="caption"
          sx={{
            color: "rgba(255, 255, 255, 0.6)",
            fontSize: "12px",
          }}
        >
          {currentIndex + 1} of {size}
        </Typography>

        {/* Buttons */}
        <Box sx={{ display: "flex", gap: "8px" }}>
          {currentIndex > 0 && (
            <button
              {...backProps}
              className="tour-back-button"
            >
              Back
            </button>
          )}
          <button
            {...primaryProps}
            className="tour-primary-button"
          >
            {isLastStep ? "Finish" : "Next"}
          </button>
        </Box>
      </Box>

      {/* Decorative gradient orb */}
      <Box
        sx={{
          position: "absolute",
          bottom: -30,
          right: -30,
          width: 100,
          height: 100,
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(19, 113, 91, 0.2) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />
    </Box>
  );
};

// Keep the old component for backwards compatibility
const CustomStep: React.FC<ICustomStepProps> = () => (
  <Box>
    {/* This is just a placeholder - the actual rendering is done by CustomStepWrapper */}
    <Box sx={{ display: "none" }} />
  </Box>
);

export default CustomStep;
