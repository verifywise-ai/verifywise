import { VideoPlayerModal } from "../player/VideoPlayerModal";
import { WELCOME_CONFIG } from "./WelcomeComposition";

interface WelcomeVideoPlayerProps {
  open: boolean;
  onClose: () => void;
}

export function WelcomeVideoPlayer({ open, onClose }: WelcomeVideoPlayerProps) {
  return (
    <VideoPlayerModal open={open} onClose={onClose} config={WELCOME_CONFIG} />
  );
}
