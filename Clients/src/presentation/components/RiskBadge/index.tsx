import { Box, Typography } from "@mui/material";

interface RiskBadgeProps {
  score: number;
}

export default function RiskBadge({ score }: RiskBadgeProps) {
  const color = score >= 70 ? "#DC2626" : score >= 40 ? "#F59E0B" : "#10B981";

  return (
    <Box
      sx={{
        display: "inline-flex",
        alignItems: "center",
        gap: 0.5,
        px: 1,
        py: 0.25,
        borderRadius: "4px",
        backgroundColor: `${color}14`,
        border: `1px solid ${color}33`,
      }}
    >
      <Box
        sx={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          backgroundColor: color,
        }}
      />
      <Typography sx={{ fontSize: 12, fontWeight: 500, color }}>{score}</Typography>
    </Box>
  );
}
