import { interpolate, spring } from "../../player/interpolate";
import { COLORS, FONT_FAMILY, FPS } from "../styles";

export function OutroScene({ frame }: { frame: number }) {
  const titleProgress = spring(frame, FPS, 5);
  const titleY = interpolate(titleProgress, [0, 1], [40, 0]);

  const subtitleOpacity = interpolate(frame, [30, 50], [0, 1]);

  const lineWidth = interpolate(frame, [40, 70], [0, 160]);

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
          width: lineWidth,
          height: 4,
          backgroundColor: COLORS.primary,
          marginBottom: 36,
          borderRadius: 2,
        }}
      />

      <div
        style={{
          color: COLORS.white,
          fontSize: 42,
          fontWeight: 700,
          letterSpacing: -1.5,
          textAlign: "center",
          opacity: titleProgress,
          transform: `translateY(${titleY}px)`,
        }}
      >
        Get started today
      </div>

      <div
        style={{
          color: COLORS.subtitle,
          fontSize: 17,
          fontWeight: 400,
          marginTop: 16,
          opacity: subtitleOpacity,
          textAlign: "center",
        }}
      >
        verifywise.ai
      </div>
    </div>
  );
}
