import type { FC } from "react";
import { useEffect, useState } from "react";
import { Box } from "@mui/material";
import { keyframes } from "@mui/system";

// Keyframe animation for hearts flying from bottom to top
const flyUp = keyframes`
  0% {
    transform: translateY(0) scale(0);
    opacity: 0;
  }
  5% {
    transform: translateY(-50px) scale(1);
    opacity: 1;
  }
  30% {
    opacity: 0.7;
  }
  50% {
    opacity: 0.4;
  }
  70% {
    opacity: 0.1;
  }
  100% {
    transform: translateY(-80vh) scale(0.5);
    opacity: 0;
  }
`;

interface Heart {
  id: number;
  left: number;
  delay: number;
  duration: number;
  color: string;
  size: number;
}

const colors = [
  "#FF1493", // Deep Pink
  "#FF69B4", // Hot Pink
  "#9D4EDD", // Purple
  "#06FFA5", // Mint Green
  "#FFD60A", // Yellow
  "#FF006E", // Pink
  "#FB5607", // Orange
  "#3A86FF", // Blue
  "#8338EC", // Purple
  "#FFBE0B", // Gold
  "#FF006E", // Magenta
  "#06FFA5", // Cyan
];

interface FlyingHeartsProps {
  onComplete?: () => void;
}

export const FlyingHearts: FC<FlyingHeartsProps> = ({ onComplete }) => {
  const [hearts] = useState<Heart[]>(() => {
    // Generate 30 hearts with random properties only once on mount
    const generatedHearts: Heart[] = [];
    for (let i = 0; i < 30; i++) {
      generatedHearts.push({
        id: i,
        left: Math.random() * 100, // Random horizontal position (0-100%)
        delay: Math.random() * 2, // Random delay (0-2s)
        duration: 3 + Math.random() * 2, // Random duration (3-5s)
        color: colors[Math.floor(Math.random() * colors.length)],
        size: 20 + Math.random() * 20, // Random size (20-40px)
      });
    }
    return generatedHearts;
  });

  useEffect(() => {
    // Call onComplete after animation finishes (max duration + max delay)
    const timer = setTimeout(() => {
      if (onComplete) {
        onComplete();
      }
    }, 7000); // 5s max duration + 2s max delay

    return () => clearTimeout(timer);
  }, []); // Empty dependency array - only run once on mount

  return (
    <Box
      sx={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        pointerEvents: "none",
        zIndex: 9999,
        overflow: "hidden",
      }}
    >
      {hearts.map((heart) => (
        <Box
          key={heart.id}
          sx={{
            position: "absolute",
            left: `${heart.left}%`,
            bottom: "-100px",
            width: `${heart.size}px`,
            height: `${heart.size}px`,
            animation: `${flyUp} ${heart.duration}s ease-out forwards`,
            animationDelay: `${heart.delay}s`,
            filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.2))",
            "& svg": {
              width: "100%",
              height: "100%",
            },
          }}
        >
          <svg viewBox="0 0 24 24" fill={heart.color} xmlns="http://www.w3.org/2000/svg">
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
          </svg>
        </Box>
      ))}
    </Box>
  );
};
