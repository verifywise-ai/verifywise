import { useEffect, useState, useCallback } from "react";
import { Box, IconButton } from "@mui/material";
import { keyframes } from "@emotion/react";
import { X } from "lucide-react";
import { useFramePlayer } from "./useFramePlayer";
import { PlayerControls } from "./PlayerControls";
import {
  VideoComposition,
  calcTotalFrames,
  type VideoConfig,
} from "./VideoComposition";

const enterAnim = keyframes`
  0% { opacity: 0; transform: scale(0.85) translateY(30px); }
  100% { opacity: 1; transform: scale(1) translateY(0); }
`;

const exitAnim = keyframes`
  0% { opacity: 1; transform: scale(1) translate(0, 0) rotate(0deg); }
  60% { opacity: 0.6; transform: scale(0.88) translate(60px, -40px) rotate(2deg); }
  100% { opacity: 0; transform: scale(0.5) translate(300px, -200px) rotate(6deg); }
`;

const backdropIn = keyframes`
  from { opacity: 0; } to { opacity: 1; }
`;

const backdropOut = keyframes`
  from { opacity: 1; } to { opacity: 0; }
`;

interface VideoPlayerModalProps {
  open: boolean;
  onClose: () => void;
  config: VideoConfig;
}

export function VideoPlayerModal({
  open,
  onClose,
  config,
}: VideoPlayerModalProps) {
  const totalFrames = calcTotalFrames(config);
  const fps = config.fps ?? 30;
  const player = useFramePlayer(totalFrames, fps, false);
  const [visible, setVisible] = useState(false);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    if (open) {
      setVisible(true);
      setExiting(false);
      player.seek(0);
      const t = setTimeout(() => player.play(), 400);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (player.finished && visible && !exiting) {
      const t = setTimeout(() => triggerExit(), 800);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [player.finished, visible, exiting]); // eslint-disable-line react-hooks/exhaustive-deps

  const triggerExit = useCallback(() => {
    setExiting(true);
    setTimeout(() => {
      setVisible(false);
      setExiting(false);
      player.pause();
      onClose();
    }, 500);
  }, [onClose, player]);

  const handleClose = useCallback(() => {
    player.pause();
    triggerExit();
  }, [player, triggerExit]);

  // ESC key closes the video
  useEffect(() => {
    if (!visible) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [visible, handleClose]);

  if (!visible) return null;

  return (
    <Box
      className="confirmation-backdrop"
      sx={{
        position: "fixed",
        inset: 0,
        zIndex: 1300,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(0,0,0,0.65)",
        animation: `${exiting ? backdropOut : backdropIn} ${exiting ? "0.4s" : "0.3s"} ease-out forwards`,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <Box
        role="dialog"
        aria-modal="true"
        className="feature-video-player"
        sx={{
          position: "relative",
          width: "min(960px, 90vw)",
          aspectRatio: "16/9",
          borderRadius: "8px",
          overflow: "hidden",
          backgroundColor: "#0a0a0a",
          outline: "none",
          animation: `${exiting ? exitAnim : enterAnim} ${exiting ? "0.5s" : "0.45s"} cubic-bezier(0.34, 1.56, 0.64, 1) forwards`,
          boxShadow: "0 24px 80px rgba(0,0,0,0.5)",
        }}
      >
        <IconButton
          onClick={handleClose}
          sx={{
            position: "absolute",
            top: 8,
            right: 8,
            zIndex: 10,
            color: "background.main",
            backgroundColor: "rgba(0,0,0,0.5)",
            "&:hover": { backgroundColor: "rgba(0,0,0,0.7)" },
          }}
        >
          <X size={18} />
        </IconButton>

        <Box sx={{ position: "absolute", inset: 0 }}>
          <VideoComposition
            config={config}
            frame={player.frame}
            playing={player.playing}
          />
        </Box>
        <PlayerControls player={player} />
      </Box>
    </Box>
  );
}
