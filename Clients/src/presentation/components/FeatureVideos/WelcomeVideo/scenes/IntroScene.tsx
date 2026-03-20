import { interpolate, spring } from "../../player/interpolate";
import { COLORS, FONT_FAMILY, FPS } from "../styles";

export function IntroScene({ frame }: { frame: number }) {
  const titleProgress = spring(frame, FPS, 5);
  const titleY = interpolate(titleProgress, [0, 1], [40, 0]);

  const subtitleOpacity = interpolate(frame, [25, 45], [0, 1]);
  const subtitleY = interpolate(frame, [25, 45], [15, 0]);

  const lineWidth = interpolate(frame, [35, 65], [0, 200]);

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
          fontSize: 52,
          fontWeight: 700,
          letterSpacing: -2,
          textAlign: "center",
          padding: "0 80px",
          opacity: titleProgress,
          transform: `translateY(${titleY}px)`,
        }}
      >
        Welcome to VerifyWise
      </div>

      <div
        style={{
          color: COLORS.subtitle,
          fontSize: 20,
          fontWeight: 400,
          marginTop: 20,
          letterSpacing: 6,
          textTransform: "uppercase",
          opacity: subtitleOpacity,
          transform: `translateY(${subtitleY}px)`,
        }}
      >
        AI governance for enterprise teams
      </div>

      <div
        style={{
          width: lineWidth,
          height: 4,
          backgroundColor: COLORS.primary,
          marginTop: 36,
          borderRadius: 2,
        }}
      />
    </div>
  );
}
