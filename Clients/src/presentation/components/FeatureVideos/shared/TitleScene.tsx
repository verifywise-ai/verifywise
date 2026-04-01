import { interpolate, spring } from "../player/interpolate";
import { COLORS, FONT_FAMILY, FPS } from "../WelcomeVideo/styles";

interface TitleSceneProps {
  frame: number;
  title: string;
  subtitle: string;
}

/** Centered title + subtitle with green accent line. Used as intro for Explore videos. */
export function TitleScene({ frame, title, subtitle }: TitleSceneProps) {
  const titleProgress = spring(frame, FPS, 5);
  const titleY = interpolate(titleProgress, [0, 1], [40, 0]);
  const subtitleOpacity = interpolate(frame, [25, 45], [0, 1]);
  const subtitleY = interpolate(frame, [25, 45], [15, 0]);
  const lineWidth = interpolate(frame, [35, 65], [0, 160]);

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: "transparent",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        fontFamily: FONT_FAMILY,
      }}
    >
      <div
        style={{
          color: COLORS.white,
          fontSize: 48,
          fontWeight: 700,
          letterSpacing: -1.5,
          textAlign: "center",
          padding: "0 60px",
          opacity: titleProgress,
          transform: `translateY(${titleY}px)`,
        }}
      >
        {title}
      </div>
      <div
        style={{
          color: COLORS.subtitle,
          fontSize: 18,
          fontWeight: 400,
          marginTop: 16,
          letterSpacing: 4,
          textTransform: "uppercase",
          textAlign: "center",
          opacity: subtitleOpacity,
          transform: `translateY(${subtitleY}px)`,
        }}
      >
        {subtitle}
      </div>
      <div
        style={{
          width: lineWidth,
          height: 3,
          backgroundColor: COLORS.primary,
          marginTop: 28,
          borderRadius: 2,
        }}
      />
    </div>
  );
}
