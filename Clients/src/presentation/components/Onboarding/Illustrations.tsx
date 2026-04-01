import React from "react";
import { Box } from "@mui/material";
import { IllustrationType } from "../../../domain/enums/onboarding.enum";
import { brand, background } from "../../themes/palette";

interface IllustrationProps {
  type: IllustrationType;
}

const GradientCircles: React.FC = () => (
  <Box
    sx={{
      width: "100%",
      height: "200px",
      position: "relative",
      overflow: "hidden",
      borderRadius: "8px",
    }}
  >
    <Box
      sx={{
        position: "absolute",
        width: "150px",
        height: "150px",
        borderRadius: "50%",
        background: `linear-gradient(135deg, ${brand.primary} 0%, ${brand.primaryHover} 100%)`,
        top: "-30px",
        left: "-30px",
        opacity: 0.8,
      }}
    />
    <Box
      sx={{
        position: "absolute",
        width: "120px",
        height: "120px",
        borderRadius: "50%",
        background: `linear-gradient(135deg, ${brand.primaryHover} 0%, ${brand.primary} 100%)`,
        bottom: "-20px",
        right: "20px",
        opacity: 0.6,
      }}
    />
    <Box
      sx={{
        position: "absolute",
        width: "100px",
        height: "100px",
        borderRadius: "50%",
        background: `linear-gradient(135deg, ${brand.primary} 0%, #2D9B7F 100%)`,
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        opacity: 0.4,
      }}
    />
  </Box>
);

const GeometricShapes: React.FC = () => (
  <Box
    sx={{
      width: "100%",
      height: "200px",
      position: "relative",
      overflow: "hidden",
      borderRadius: "8px",
      backgroundColor: `${background.accent}`,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    }}
  >
    <Box
      sx={{
        width: "100px",
        height: "100px",
        background: `linear-gradient(135deg, ${brand.primary} 0%, ${brand.primaryHover} 100%)`,
        transform: "rotate(45deg)",
        opacity: 0.8,
      }}
    />
    <Box
      sx={{
        position: "absolute",
        width: "0",
        height: "0",
        borderLeft: "60px solid transparent",
        borderRight: "60px solid transparent",
        borderBottom: "100px solid #2D9B7F",
        top: "20px",
        right: "40px",
        opacity: 0.5,
      }}
    />
    <Box
      sx={{
        position: "absolute",
        width: "80px",
        height: "80px",
        borderRadius: "50%",
        backgroundColor: `${brand.primary}`,
        bottom: "30px",
        left: "30px",
        opacity: 0.3,
      }}
    />
  </Box>
);

const AbstractWaves: React.FC = () => (
  <Box
    sx={{
      width: "100%",
      height: "200px",
      position: "relative",
      overflow: "hidden",
      borderRadius: "8px",
      background: `linear-gradient(180deg, ${background.accent} 0%, ${background.main} 100%)`,
    }}
  >
    <svg
      width="100%"
      height="100%"
      viewBox="0 0 400 200"
      preserveAspectRatio="none"
      style={{ position: "absolute", bottom: 0 }}
    >
      <path
        d="M0,100 Q100,50 200,100 T400,100 L400,200 L0,200 Z"
        fill="url(#wave-gradient1)"
        opacity="0.3"
      />
      <path
        d="M0,120 Q100,70 200,120 T400,120 L400,200 L0,200 Z"
        fill="url(#wave-gradient2)"
        opacity="0.4"
      />
      <path
        d="M0,140 Q100,90 200,140 T400,140 L400,200 L0,200 Z"
        fill="url(#wave-gradient3)"
        opacity="0.5"
      />
      <defs>
        <linearGradient id="wave-gradient1" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={brand.primary} />
          <stop offset="100%" stopColor={brand.primaryHover} />
        </linearGradient>
        <linearGradient id="wave-gradient2" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={brand.primaryHover} />
          <stop offset="100%" stopColor={brand.primary} />
        </linearGradient>
        <linearGradient id="wave-gradient3" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#2D9B7F" />
          <stop offset="100%" stopColor={brand.primary} />
        </linearGradient>
      </defs>
    </svg>
  </Box>
);

const IconGrid: React.FC = () => (
  <Box
    sx={{
      width: "100%",
      height: "200px",
      display: "grid",
      gridTemplateColumns: "repeat(3, 1fr)",
      gap: 2,
      padding: 3,
      backgroundColor: `${background.accent}`,
      borderRadius: "8px",
    }}
  >
    {[...Array(6)].map((_, i) => (
      <Box
        key={i}
        sx={{
          backgroundColor: "white",
          borderRadius: "8px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
          position: "relative",
          overflow: "hidden",
          "&::before": {
            content: '""',
            position: "absolute",
            width: "100%",
            height: "4px",
            top: 0,
            left: 0,
            background: `linear-gradient(90deg, #13715B ${i * 15}%, #0F5A47 100%)`,
          },
        }}
      />
    ))}
  </Box>
);

const FlowDiagram: React.FC = () => (
  <Box
    sx={{
      width: "100%",
      height: "200px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 2,
      padding: 3,
      backgroundColor: "background.accent",
      borderRadius: "8px",
    }}
  >
    {[1, 2, 3].map((step) => (
      <React.Fragment key={step}>
        <Box
          sx={{
            width: "80px",
            height: "80px",
            borderRadius: "8px",
            background: `linear-gradient(135deg, #13715B ${step * 20}%, #0F5A47 100%)`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "white",
            fontSize: "24px",
            fontWeight: 600,
            boxShadow: "0 4px 6px rgba(19, 113, 91, 0.3)",
          }}
        >
          {step}
        </Box>
        {step < 3 && (
          <Box
            sx={{
              width: "30px",
              height: "2px",
              backgroundColor: "brand.primary",
              position: "relative",
              "&::after": {
                content: '""',
                position: "absolute",
                right: "-6px",
                top: "-4px",
                width: "0",
                height: "0",
                borderLeft: "6px solid brand.primary",
                borderTop: "5px solid transparent",
                borderBottom: "5px solid transparent",
              },
            }}
          />
        )}
      </React.Fragment>
    ))}
  </Box>
);

const Illustration: React.FC<IllustrationProps> = ({ type }) => {
  switch (type) {
    case IllustrationType.GRADIENT_CIRCLES:
      return <GradientCircles />;
    case IllustrationType.GEOMETRIC_SHAPES:
      return <GeometricShapes />;
    case IllustrationType.ABSTRACT_WAVES:
      return <AbstractWaves />;
    case IllustrationType.ICON_GRID:
      return <IconGrid />;
    case IllustrationType.FLOW_DIAGRAM:
      return <FlowDiagram />;
    default:
      return <GradientCircles />;
  }
};

export default Illustration;
