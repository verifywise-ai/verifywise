/**
 * DemoDataLoader - the panel shown while demo data is being created.
 *
 * Four animals (the "governance committee") rise up and take turns commenting
 * on what the seeder makes, above a progress bar estimated from elapsed time
 * (see ./estimate.ts). When `status` turns "done", the bar fills, the cast hops
 * and an "Explore the demo" button appears.
 *
 * Renders as a panel so it can sit inside the first-login setup modal; use
 * DemoDataLoaderOverlay for a full-screen version.
 */
import React, { memo, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Box, LinearProgress, Typography, keyframes } from "@mui/material";
import { CustomizableButton } from "../button/customizable-button";
import { background, border, brand, radiusPx, text } from "../../themes/palette";
import { ALL_LINES, CAST, FINAL_LINE, FINAL_SPEAKER, lineIndexAt } from "./committee";
import { estimateProgress, readExpectedMs, remainingLabel } from "./estimate";

export type DemoDataLoaderStatus = "running" | "done";

interface DemoDataLoaderProps {
  status: DemoDataLoaderStatus;
  /** Called by the "Explore the demo" button once the run is done. */
  onExplore: () => void;
}

const TICK_MS = 250;
const BUBBLE_EDGE_PX = 12;

const rise = keyframes`from { transform: translateY(105%); } to { transform: none; }`;
const breathe = keyframes`0%, 100% { transform: scale(1, 1); } 50% { transform: scale(1.015, 0.985); }`;
const chatter = keyframes`from { transform: rotate(-2deg) scale(1, 1); } to { transform: rotate(2deg) scale(1.02, 0.98); }`;
const look = keyframes`0%, 100% { transform: rotate(0deg); } 30%, 70% { transform: rotate(var(--lean)); }`;
const pop = keyframes`from { opacity: 0; transform: translateX(-50%) translateY(8px) scale(0.92); } to { opacity: 1; transform: translateX(-50%); }`;
const hop = keyframes`0%, 100% { transform: translateY(0) scale(1, 1); } 15% { transform: scale(1.06, 0.92); } 45% { transform: translateY(-22px) scale(0.97, 1.04); } 75% { transform: translateY(0) scale(1.04, 0.95); }`;

interface StageProps {
  /** Index into ALL_LINES, or -1 before the first line. */
  lineIndex: number;
  isDone: boolean;
}

/**
 * The floor, the cast and the speech bubble. Memoized: it only changes when
 * the line does, not on every progress tick.
 */
const Stage = memo(function Stage({ lineIndex, isDone }: StageProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const bodyRefs = useRef<(HTMLDivElement | null)[]>([]);

  const line = !isDone && lineIndex >= 0 ? ALL_LINES[lineIndex] : null;
  const speakerIndex = line ? CAST.findIndex((member) => member.id === line.who) : -1;
  // One of the others turns to listen, a different one on each line.
  const listenerIndex =
    speakerIndex >= 0 ? (speakerIndex + 1 + (lineIndex % (CAST.length - 1))) % CAST.length : -1;
  const showBubble = isDone || line !== null;
  const bubbleKey = isDone ? "done" : String(lineIndex);

  // Points the bubble at the speaker; centred over the stage when everyone is
  // done. Measured again whenever the bubble changes size, because the DOM
  // translator swaps in the (often longer) translation after layout.
  useLayoutEffect(() => {
    const place = () => {
      const stage = stageRef.current;
      const bubble = bubbleRef.current;
      if (!stage || !bubble) return;
      const stageBox = stage.getBoundingClientRect();
      const speaker = speakerIndex >= 0 ? bodyRefs.current[speakerIndex] : null;
      let anchor = stageBox.width / 2;
      if (speaker) {
        const box = speaker.getBoundingClientRect();
        anchor = box.left + box.width / 2 - stageBox.left;
      }
      const half = bubble.offsetWidth / 2;
      const x = Math.min(
        Math.max(anchor, half + BUBBLE_EDGE_PX),
        stageBox.width - half - BUBBLE_EDGE_PX,
      );
      const tail = Math.min(Math.max(anchor - x + half, 14), bubble.offsetWidth - 14);
      bubble.style.setProperty("--x", `${x}px`);
      bubble.style.setProperty("--tail", `${tail}px`);
    };
    place();
    window.addEventListener("resize", place);
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => place());
    if (observer && bubbleRef.current) observer.observe(bubbleRef.current);
    return () => {
      window.removeEventListener("resize", place);
      observer?.disconnect();
    };
  }, [bubbleKey, speakerIndex]);

  return (
    <Box
      ref={stageRef}
      aria-hidden="true"
      sx={{ position: "relative", height: { xs: "232px", sm: "268px" }, marginTop: "8px" }}
    >
      <Box
        sx={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: "46px",
          borderTop: `1px solid ${border.light}`,
          background: `linear-gradient(to bottom, ${background.alt}, ${brand.primaryLight})`,
        }}
      />

      {showBubble && (
        <Box
          key={bubbleKey}
          ref={bubbleRef}
          sx={{
            "position": "absolute",
            "zIndex": 2,
            "top": "12px",
            "left": "var(--x, 50%)",
            "transform": "translateX(-50%)",
            "width": "max-content",
            "maxWidth": `min(320px, calc(100% - ${BUBBLE_EDGE_PX * 2}px))`,
            "padding": "10px 14px 11px",
            "backgroundColor": background.main,
            "border": `1px solid ${border.light}`,
            "borderRadius": radiusPx.sm,
            "boxShadow": "0 8px 24px rgba(16, 28, 24, 0.14)",
            "animation": `${pop} 0.32s cubic-bezier(0.3, 1.4, 0.6, 1)`,
            "&::after": {
              content: '""',
              position: "absolute",
              bottom: "-7px",
              left: "var(--tail, 50%)",
              width: "12px",
              height: "12px",
              backgroundColor: background.main,
              borderRight: `1px solid ${border.light}`,
              borderBottom: `1px solid ${border.light}`,
              transform: "translateX(-50%) rotate(45deg)",
            },
          }}
        >
          <Typography
            component="span"
            sx={{
              display: "block",
              fontSize: 11,
              fontWeight: 600,
              color: brand.primary,
              marginBottom: "2px",
            }}
          >
            {isDone ? FINAL_SPEAKER : CAST[speakerIndex]?.name}
          </Typography>
          <Typography
            component="span"
            sx={{ display: "block", fontSize: 14, lineHeight: 1.45, color: text.primary }}
          >
            {isDone ? FINAL_LINE : line?.text}
          </Typography>
        </Box>
      )}

      {/* Cast: each animal stands on the floor line, its name on the floor below it. */}
      <Box
        sx={{
          position: "absolute",
          left: "12px",
          right: "12px",
          bottom: 0,
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
          alignItems: "end",
        }}
      >
        {CAST.map((member, index) => {
          const isSpeaker = index === speakerIndex;
          const isListener = index === listenerIndex;
          const dimmed = speakerIndex >= 0 && !isSpeaker;
          let imageAnimation = `${breathe} 3.4s ease-in-out ${-index * 0.85}s infinite`;
          if (isDone) imageAnimation = `${hop} 0.6s ease-in-out ${index * 0.1}s 3`;
          else if (isSpeaker) imageAnimation = `${chatter} 0.36s ease-in-out infinite alternate`;
          else if (isListener) imageAnimation = `${look} 1.4s ease-in-out 1.5s`;

          return (
            <Box
              key={member.id}
              sx={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                minWidth: 0,
                opacity: dimmed ? 0.55 : 1,
                filter: dimmed ? "saturate(0.6)" : "none",
                transition: "opacity 0.35s ease, filter 0.35s ease",
              }}
            >
              {/* Clips at the floor line so each animal rises up out of the floor. */}
              <Box
                sx={{
                  width: "100%",
                  display: "flex",
                  justifyContent: "center",
                  clipPath: "inset(-200px -60px 0 -60px)",
                }}
              >
                <Box
                  ref={(el: HTMLDivElement | null) => {
                    bodyRefs.current[index] = el;
                  }}
                  sx={{
                    position: "relative",
                    width: { xs: "84px", sm: "116px" },
                    maxWidth: "100%",
                    aspectRatio: "1",
                    marginBottom: "-4px",
                    animation: `${rise} 0.7s cubic-bezier(0.25, 1.45, 0.5, 1) ${index * 0.18}s backwards`,
                  }}
                >
                  <Box
                    sx={{
                      width: "100%",
                      height: "100%",
                      transformOrigin: "50% 100%",
                      transform: isSpeaker ? "translateY(-6px) scale(1.08)" : "none",
                      transition: "transform 0.35s cubic-bezier(0.3, 1.4, 0.6, 1)",
                    }}
                  >
                    <Box
                      component="img"
                      src={member.image}
                      alt=""
                      draggable={false}
                      style={{ ["--lean" as string]: `${member.leanDeg}deg` }}
                      sx={{
                        display: "block",
                        width: "100%",
                        height: "100%",
                        objectFit: "contain",
                        transformOrigin: "50% 100%",
                        filter: "drop-shadow(0 6px 8px rgba(0, 0, 0, 0.12))",
                        userSelect: "none",
                        animation: imageAnimation,
                      }}
                    />
                  </Box>
                </Box>
              </Box>
              <Typography
                sx={{
                  height: "46px",
                  display: "flex",
                  alignItems: "center",
                  fontSize: 13,
                  fontWeight: isSpeaker ? 600 : 500,
                  color: isSpeaker ? text.primary : text.tertiary,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  maxWidth: "100%",
                }}
              >
                {member.name}
              </Typography>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
});

const DemoDataLoader: React.FC<DemoDataLoaderProps> = ({ status, onExplore }) => {
  const isDone = status === "done";
  const [startedAt] = useState(() => Date.now());
  const [expectedMs] = useState(readExpectedMs);
  const [elapsedMs, setElapsedMs] = useState(0);

  const rootRef = useRef<HTMLDivElement>(null);
  const exploreRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isDone) return undefined;
    const id = window.setInterval(() => setElapsedMs(Date.now() - startedAt), TICK_MS);
    return () => window.clearInterval(id);
  }, [isDone, startedAt]);

  // Keyboard users land on the panel, then on its only control once it appears.
  useEffect(() => {
    rootRef.current?.focus();
  }, []);
  useEffect(() => {
    if (isDone) exploreRef.current?.focus();
  }, [isDone]);

  const lineIndex = isDone ? -1 : lineIndexAt(elapsedMs);
  const progress = isDone ? 1 : estimateProgress(elapsedMs, expectedMs);
  const percent = Math.round(progress * 100);

  return (
    <Box
      ref={rootRef}
      tabIndex={-1}
      data-testid="demo-data-loader"
      aria-busy={!isDone}
      sx={{
        "display": "flex",
        "flexDirection": "column",
        "outline": "none",
        "@media (prefers-reduced-motion: reduce)": {
          "& *, & *::before, & *::after": {
            animation: "none !important",
            transition: "none !important",
          },
        },
      }}
    >
      <Box role="status" sx={{ padding: "24px 24px 0" }}>
        <Typography sx={{ fontSize: 17, fontWeight: 600, color: text.primary }}>
          {isDone ? "Your demo workspace is ready" : "Setting up your demo workspace"}
        </Typography>
        <Typography sx={{ fontSize: 13, color: text.tertiary, marginTop: "4px", lineHeight: 1.5 }}>
          {isDone
            ? "Use cases, risks, vendors, policies and 90 days of AI traffic are in place."
            : "The governance committee is in session."}
        </Typography>
      </Box>

      <Stage lineIndex={lineIndex} isDone={isDone} />

      {/* Progress */}
      <Box
        sx={{
          padding: "14px 24px 18px",
          borderTop: `1px solid ${border.light}`,
          display: "flex",
          flexDirection: "column",
          gap: "12px",
        }}
      >
        <LinearProgress
          variant="determinate"
          value={percent}
          aria-label="Demo data progress"
          sx={{
            "height": "4px",
            "borderRadius": radiusPx.sm,
            "backgroundColor": brand.primaryLight,
            "& .MuiLinearProgress-bar": { backgroundColor: brand.primary },
          }}
        />
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
            minHeight: "34px",
          }}
        >
          <Typography sx={{ fontSize: 13, color: text.tertiary }}>
            {isDone ? "Finished" : remainingLabel(elapsedMs, expectedMs)}
          </Typography>
          {isDone ? (
            <CustomizableButton
              ref={exploreRef}
              variant="contained"
              text="Explore the demo"
              onClick={onExplore}
              testId="demo-data-loader-explore"
            />
          ) : (
            <Typography
              sx={{ fontSize: 13, color: text.tertiary, fontVariantNumeric: "tabular-nums" }}
            >
              {percent}%
            </Typography>
          )}
        </Box>
      </Box>
    </Box>
  );
};

export default DemoDataLoader;
