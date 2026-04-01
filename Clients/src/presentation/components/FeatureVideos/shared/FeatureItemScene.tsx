import { interpolate, spring } from "../player/interpolate";
import { COLORS, FONT_FAMILY, FPS } from "../WelcomeVideo/styles";

interface FeatureItemSceneProps {
  frame: number;
  number: string;
  category: string;
  title: string;
  description: string;
}

/** Feature scene with category tag, green bar, title + description. Reusable across all videos. */
export function FeatureItemScene({
  frame,
  number,
  category,
  title,
  description,
}: FeatureItemSceneProps) {
  const tagOpacity = interpolate(frame, [5, 20], [0, 1]);
  const tagX = interpolate(frame, [5, 20], [-20, 0]);
  const barHeight = interpolate(frame, [8, 30], [0, 48]);
  const titleProgress = spring(frame, FPS, 15);
  const titleY = interpolate(titleProgress, [0, 1], [30, 0]);
  const descOpacity = interpolate(frame, [35, 55], [0, 1]);
  const descY = interpolate(frame, [35, 55], [15, 0]);

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: "transparent",
        fontFamily: FONT_FAMILY,
        padding: "0 80px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          color: COLORS.tag,
          fontSize: 13,
          fontWeight: 400,
          letterSpacing: 4,
          textTransform: "uppercase",
          marginBottom: 28,
          opacity: tagOpacity,
          transform: `translateX(${tagX}px)`,
        }}
      >
        {number} / {category}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 24, marginBottom: 24 }}>
        <div
          style={{
            width: 4,
            height: barHeight,
            backgroundColor: COLORS.primary,
            borderRadius: 2,
            flexShrink: 0,
          }}
        />
        <div
          style={{
            color: COLORS.white,
            fontSize: 38,
            fontWeight: 700,
            letterSpacing: -1.5,
            lineHeight: 1.15,
            opacity: titleProgress,
            transform: `translateY(${titleY}px)`,
            whiteSpace: "pre-line",
          }}
        >
          {title}
        </div>
      </div>
      <div
        style={{
          color: COLORS.subtitle,
          fontSize: 17,
          fontWeight: 400,
          lineHeight: 1.5,
          marginLeft: 28,
          maxWidth: 600,
          opacity: descOpacity,
          transform: `translateY(${descY}px)`,
        }}
      >
        {description}
      </div>
    </div>
  );
}
