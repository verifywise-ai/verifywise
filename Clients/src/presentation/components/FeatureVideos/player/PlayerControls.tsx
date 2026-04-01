import { Box, IconButton } from "@mui/material";
import { Play, Pause } from "lucide-react";
import type { FramePlayerState } from "./useFramePlayer";
import { brand, background } from "../../../themes/palette";

interface PlayerControlsProps {
  player: FramePlayerState;
}

export function PlayerControls({ player }: PlayerControlsProps) {
  return (
    <Box
      sx={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "8px 12px",
        background: "linear-gradient(transparent, rgba(0,0,0,0.6))",
      }}
    >
      <IconButton
        onClick={player.toggle}
        sx={{
          color: `${background.main}`,
          padding: "4px",
          "&:hover": { backgroundColor: "rgba(255,255,255,0.1)" },
        }}
      >
        {player.playing ? <Pause size={16} /> : <Play size={16} />}
      </IconButton>

      {/* Progress bar */}
      <Box
        sx={{
          flex: 1,
          height: 4,
          borderRadius: 2,
          backgroundColor: "rgba(255,255,255,0.2)",
          cursor: "pointer",
          position: "relative",
        }}
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const pct = (e.clientX - rect.left) / rect.width;
          player.seekProgress(pct);
        }}
      >
        <Box
          sx={{
            height: "100%",
            borderRadius: 2,
            backgroundColor: `${brand.primary}`,
            width: `${player.progress * 100}%`,
            transition: "width 0.05s linear",
          }}
        />
      </Box>
    </Box>
  );
}
