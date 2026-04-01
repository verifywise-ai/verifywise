import {
  VideoComposition,
  calcTotalFrames,
  type SceneDef,
  type VideoConfig,
} from "../player/VideoComposition";
import { IntroScene } from "./scenes/IntroScene";
import { FeatureItemScene } from "../shared/FeatureItemScene";
import { BenefitsScene } from "./scenes/BenefitsScene";
import { OutroScene } from "./scenes/OutroScene";
import { FEATURES } from "./styles";

const INTRO_FRAMES = 135;
const FEATURE_FRAMES = 150;
const OUTRO_FRAMES = 135;

function buildWelcomeScenes(): SceneDef[] {
  const scenes: SceneDef[] = [];

  scenes.push({
    key: "intro",
    durationInFrames: INTRO_FRAMES,
    render: (f) => <IntroScene frame={f} />,
  });

  FEATURES.forEach((feature, i) => {
    scenes.push({
      key: `feature-${i}`,
      durationInFrames: FEATURE_FRAMES,
      render: (f) => (
        <FeatureItemScene
          frame={f}
          number={feature.number}
          category={feature.category}
          title={feature.title}
          description={feature.description}
        />
      ),
    });
  });

  scenes.push({
    key: "benefits",
    durationInFrames: FEATURE_FRAMES,
    render: (f) => <BenefitsScene frame={f} />,
  });

  scenes.push({
    key: "outro",
    durationInFrames: OUTRO_FRAMES,
    render: (f) => <OutroScene frame={f} />,
  });

  return scenes;
}

export const WELCOME_CONFIG: VideoConfig = {
  scenes: buildWelcomeScenes(),
  transitionFrames: 15,
  fps: 30,
  audio: true,
};

export const WELCOME_TOTAL_FRAMES = calcTotalFrames(WELCOME_CONFIG);

interface WelcomeCompositionProps {
  frame: number;
  playing: boolean;
}

export function WelcomeComposition({ frame, playing }: WelcomeCompositionProps) {
  return <VideoComposition config={WELCOME_CONFIG} frame={frame} playing={playing} />;
}
