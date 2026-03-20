import { interpolate, spring } from "../../player/interpolate";
import { COLORS, FONT_FAMILY, FPS, BENEFITS } from "../styles";

export function BenefitsScene({ frame }: { frame: number }) {
  const titleProgress = spring(frame, FPS, 5);
  const titleY = interpolate(titleProgress, [0, 1], [30, 0]);

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
          opacity: titleProgress,
        }}
      >
        KEY BENEFITS
      </div>

      <div
        style={{
          color: COLORS.white,
          fontSize: 32,
          fontWeight: 700,
          letterSpacing: -1,
          marginBottom: 40,
          opacity: titleProgress,
          transform: `translateY(${titleY}px)`,
        }}
      >
        Why VerifyWise?
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {BENEFITS.map((benefit, i) => {
          const itemOpacity = interpolate(
            frame,
            [20 + i * 10, 35 + i * 10],
            [0, 1]
          );
          const itemX = interpolate(
            frame,
            [20 + i * 10, 35 + i * 10],
            [-20, 0]
          );

          return (
            <div
              key={benefit}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 16,
                opacity: itemOpacity,
                transform: `translateX(${itemX}px)`,
              }}
            >
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: COLORS.primary,
                  flexShrink: 0,
                }}
              />
              <div
                style={{
                  color: COLORS.subtitle,
                  fontSize: 17,
                  fontWeight: 400,
                }}
              >
                {benefit}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
