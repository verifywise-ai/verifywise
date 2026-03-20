import type { FC } from "react";
import type { LucideIcon } from "lucide-react";
import { useTheme } from "@mui/material";
import { brand, border as borderPalette } from "../../themes/palette";

interface EmptyIllustrationProps {
  /** Lucide icon to display in the center circle */
  icon: LucideIcon;
  /** Size multiplier (default 1 = 180x120) */
  scale?: number;
}

/**
 * Abstract SVG illustration for empty states.
 * A teal circle with a contextual icon, dashed connector lines,
 * and floating isometric cubes. Adapts to light/dark theme.
 */
const EmptyIllustration: FC<EmptyIllustrationProps> = ({
  icon: Icon,
  scale = 1,
}) => {
  const theme = useTheme();
  const w = 180 * scale;
  const h = 120 * scale;

  // Theme-aware colors
  const primary = theme.palette.mode === "dark" ? "#4ADE80" : `${brand.primary}`;
  const circleFill = theme.palette.mode === "dark" ? "#1a2e24" : "#e8f5f0";
  const circleStroke = theme.palette.mode === "dark" ? "#2d5a44" : "#b8e0d4";
  const lineDash = theme.palette.mode === "dark" ? "#4a5568" : `${borderPalette.dark}`;
  const cubeTop = theme.palette.mode === "dark" ? "#1e2433" : "#f0f4ff";
  const cubeLeft = theme.palette.mode === "dark" ? "#252d3d" : "#e8edf8";
  const cubeRight = theme.palette.mode === "dark" ? "#2a3348" : "#dde4f2";
  const cubeStroke = theme.palette.mode === "dark" ? "#3d4a60" : "#c8d4e8";
  const dotFill = theme.palette.mode === "dark" ? "#4a5568" : `${borderPalette.dark}`;

  return (
    <svg
      width={w}
      height={h}
      viewBox="0 0 180 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Dashed connector lines */}
      <line
        x1="72"
        y1="52"
        x2="115"
        y2="35"
        stroke={lineDash}
        strokeWidth="1.2"
        strokeDasharray="4 3"
      />
      <line
        x1="72"
        y1="62"
        x2="115"
        y2="80"
        stroke={lineDash}
        strokeWidth="1.2"
        strokeDasharray="4 3"
      />

      {/* Main circle with icon */}
      <circle cx="52" cy="58" r="26" fill={circleFill} />
      <circle cx="52" cy="58" r="26" stroke={circleStroke} strokeWidth="1" />

      {/* Icon in center */}
      <foreignObject x="38" y="44" width="28" height="28">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "100%",
            height: "100%",
          }}
        >
          <Icon size={18} style={{ color: primary }} />
        </div>
      </foreignObject>

      {/* Top-right floating cube */}
      <g transform="translate(122, 18)">
        <path
          d="M16 0 L32 9 L16 18 L0 9 Z"
          fill={cubeTop}
          stroke={cubeStroke}
          strokeWidth="1"
        />
        <path
          d="M0 9 L16 18 L16 30 L0 21 Z"
          fill={cubeLeft}
          stroke={cubeStroke}
          strokeWidth="1"
        />
        <path
          d="M32 9 L16 18 L16 30 L32 21 Z"
          fill={cubeRight}
          stroke={cubeStroke}
          strokeWidth="1"
        />
      </g>

      {/* Bottom-right floating cube (smaller, dashed) */}
      <g transform="translate(126, 68)" opacity="0.7">
        <path
          d="M12 0 L24 7 L12 14 L0 7 Z"
          fill={cubeTop}
          stroke={cubeStroke}
          strokeWidth="1"
          strokeDasharray="3 2"
        />
        <path
          d="M0 7 L12 14 L12 24 L0 17 Z"
          fill={cubeLeft}
          stroke={cubeStroke}
          strokeWidth="1"
          strokeDasharray="3 2"
        />
        <path
          d="M24 7 L12 14 L12 24 L24 17 Z"
          fill={cubeRight}
          stroke={cubeStroke}
          strokeWidth="1"
          strokeDasharray="3 2"
        />
      </g>

      {/* Small decorative dot */}
      <circle cx="108" cy="58" r="2" fill={dotFill} />
    </svg>
  );
};

export default EmptyIllustration;
