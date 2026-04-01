import { useMemo, useRef, useEffect } from "react";
import { interpolate } from "./interpolate";
import { FilledEllipticBg } from "../backgrounds/FilledEllipticBg";
import { COLORS } from "../WelcomeVideo/styles";

// ── Scene definition ──

export interface SceneDef {
  key: string;
  durationInFrames: number;
  render: (localFrame: number) => React.ReactNode;
}

export interface VideoConfig {
  scenes: SceneDef[];
  transitionFrames?: number; // default 15
  fps?: number; // default 30
  audio?: boolean; // default true
}

// ── Build timeline with overlap offsets ──

interface TimelineEntry {
  key: string;
  startFrame: number;
  durationInFrames: number;
  render: (localFrame: number) => React.ReactNode;
}

function buildTimeline(
  scenes: SceneDef[],
  overlap: number
): { entries: TimelineEntry[]; totalFrames: number } {
  const entries: TimelineEntry[] = [];
  let cursor = 0;

  scenes.forEach((scene, i) => {
    entries.push({
      key: scene.key,
      startFrame: cursor,
      durationInFrames: scene.durationInFrames,
      render: scene.render,
    });
    // Overlap with next scene (except last)
    if (i < scenes.length - 1) {
      cursor += scene.durationInFrames - overlap;
    } else {
      cursor += scene.durationInFrames;
    }
  });

  return { entries, totalFrames: cursor };
}

/** Calculate total duration for a video config (for player setup) */
export function calcTotalFrames(config: VideoConfig): number {
  const overlap = config.transitionFrames ?? 15;
  const { totalFrames } = buildTimeline(config.scenes, overlap);
  return totalFrames;
}

// ── Composition component ──

interface VideoCompositionProps {
  config: VideoConfig;
  frame: number;
  playing: boolean;
}

export function VideoComposition({
  config,
  frame,
  playing,
}: VideoCompositionProps) {
  const overlap = config.transitionFrames ?? 15;
  const useAudio = config.audio ?? true;

  const { entries, totalFrames } = useMemo(
    () => buildTimeline(config.scenes, overlap),
    [config.scenes, overlap]
  );

  // ── Audio ──
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!useAudio) return;
    if (!audioRef.current) {
      const audio = new Audio("/ambient-pad.mp3");
      audio.loop = true;
      audio.volume = 0;
      audioRef.current = audio;
    }
    return () => {
      const a = audioRef.current;
      if (a) {
        a.pause();
        a.src = "";
      }
      audioRef.current = null;
    };
  }, [useAudio]);

  useEffect(() => {
    if (!useAudio) return;
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  }, [playing, useAudio]);

  useEffect(() => {
    if (!useAudio) return;
    const audio = audioRef.current;
    if (!audio) return;
    const vol =
      interpolate(frame, [0, 30], [0, 0.3]) *
      (1 - interpolate(frame, [totalFrames - 60, totalFrames], [0, 1]));
    audio.volume = Math.max(0, Math.min(vol, 1));
  }, [frame, totalFrames, useAudio]);

  // ── Active scenes ──
  const activeEntries = entries.filter((e) => {
    const end = e.startFrame + e.durationInFrames;
    return frame >= e.startFrame && frame < end;
  });

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        backgroundColor: COLORS.background,
      }}
    >
      {/* Bokeh background — always visible */}
      <div style={{ position: "absolute", inset: 0, zIndex: 0 }}>
        <FilledEllipticBg frame={frame} />
      </div>

      {/* Scene layers */}
      {activeEntries.map((entry) => {
        const localFrame = frame - entry.startFrame;
        const end = entry.startFrame + entry.durationInFrames;

        let opacity = 1;
        if (localFrame < overlap) {
          opacity = interpolate(localFrame, [0, overlap], [0, 1]);
        }
        if (frame > end - overlap) {
          opacity = interpolate(frame, [end - overlap, end], [1, 0]);
        }

        return (
          <div
            key={entry.key}
            style={{ position: "absolute", inset: 0, opacity, zIndex: 1 }}
          >
            {entry.render(localFrame)}
          </div>
        );
      })}
    </div>
  );
}
