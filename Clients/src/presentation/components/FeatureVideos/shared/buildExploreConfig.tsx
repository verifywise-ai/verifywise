import type { SceneDef, VideoConfig } from "../player/VideoComposition";
import { TitleScene } from "./TitleScene";
import { FeatureItemScene } from "./FeatureItemScene";
import { EndScene } from "./EndScene";

export interface ExploreFeature {
  number: string;
  category: string;
  title: string;
  description: string;
}

export interface ExploreVideoData {
  introTitle: string;
  introSubtitle: string;
  features: ExploreFeature[];
}

const INTRO_FRAMES = 120; // 4s
const FEATURE_FRAMES = 135; // 4.5s
const OUTRO_FRAMES = 90; // 3s

export function buildExploreConfig(data: ExploreVideoData): VideoConfig {
  const scenes: SceneDef[] = [];

  scenes.push({
    key: "intro",
    durationInFrames: INTRO_FRAMES,
    render: (f) => (
      <TitleScene frame={f} title={data.introTitle} subtitle={data.introSubtitle} />
    ),
  });

  data.features.forEach((feat, i) => {
    scenes.push({
      key: `feat-${i}`,
      durationInFrames: FEATURE_FRAMES,
      render: (f) => (
        <FeatureItemScene
          frame={f}
          number={feat.number}
          category={feat.category}
          title={feat.title}
          description={feat.description}
        />
      ),
    });
  });

  scenes.push({
    key: "outro",
    durationInFrames: OUTRO_FRAMES,
    render: (f) => <EndScene frame={f} />,
  });

  return {
    scenes,
    transitionFrames: 15,
    fps: 30,
    audio: true,
  };
}
