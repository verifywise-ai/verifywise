import { useState, useRef, useCallback, useEffect } from "react";

export interface FramePlayerState {
  frame: number;
  playing: boolean;
  finished: boolean;
  progress: number;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  seek: (frame: number) => void;
  seekProgress: (pct: number) => void;
}

/**
 * Lightweight frame-based animation player.
 * Drives animations at a target FPS using requestAnimationFrame.
 * Stops (does not loop) when reaching the last frame.
 */
export function useFramePlayer(
  totalFrames: number,
  fps: number = 30,
  autoPlay: boolean = false
): FramePlayerState {
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(autoPlay);
  const [finished, setFinished] = useState(false);
  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const frameRef = useRef(0);
  const playingRef = useRef(autoPlay);

  const msPerFrame = 1000 / fps;

  const tick = useCallback(
    (now: number) => {
      if (!playingRef.current) return;

      if (!lastTimeRef.current) lastTimeRef.current = now;
      const delta = now - lastTimeRef.current;

      if (delta >= msPerFrame) {
        const framesToAdvance = Math.floor(delta / msPerFrame);
        lastTimeRef.current = now - (delta % msPerFrame);

        frameRef.current = frameRef.current + framesToAdvance;
        if (frameRef.current >= totalFrames) {
          frameRef.current = totalFrames - 1;
          setFrame(frameRef.current);
          playingRef.current = false;
          setPlaying(false);
          setFinished(true);
          return; // Stop — don't loop
        }
        setFrame(frameRef.current);
      }

      rafRef.current = requestAnimationFrame(tick);
    },
    [totalFrames, msPerFrame]
  );

  const play = useCallback(() => {
    // If finished, restart from beginning
    if (frameRef.current >= totalFrames - 1) {
      frameRef.current = 0;
      setFrame(0);
      setFinished(false);
    }
    playingRef.current = true;
    setPlaying(true);
    lastTimeRef.current = 0;
    rafRef.current = requestAnimationFrame(tick);
  }, [tick, totalFrames]);

  const pause = useCallback(() => {
    playingRef.current = false;
    setPlaying(false);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  }, []);

  const toggle = useCallback(() => {
    if (playingRef.current) pause();
    else play();
  }, [play, pause]);

  const seek = useCallback(
    (f: number) => {
      const clamped = Math.max(0, Math.min(f, totalFrames - 1));
      frameRef.current = clamped;
      setFrame(clamped);
      setFinished(false);
      lastTimeRef.current = 0;
    },
    [totalFrames]
  );

  const seekProgress = useCallback(
    (pct: number) => {
      seek(Math.round(pct * (totalFrames - 1)));
    },
    [seek, totalFrames]
  );

  // Auto-play on mount
  useEffect(() => {
    if (autoPlay) play();
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    frame,
    playing,
    finished,
    progress: totalFrames > 1 ? frame / (totalFrames - 1) : 0,
    play,
    pause,
    toggle,
    seek,
    seekProgress,
  };
}
