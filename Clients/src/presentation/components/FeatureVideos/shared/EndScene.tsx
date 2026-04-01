import { interpolate, spring } from "../player/interpolate";
import { COLORS, FONT_FAMILY, FPS } from "../WelcomeVideo/styles";

interface EndSceneProps {
  frame: number;
  message?: string;
}

/** Short outro scene with a closing message. */
export function EndScene({ frame, message = "Explore more at verifywise.ai" }: EndSceneProps) {
  const titleProgress = spring(frame, FPS, 5);
  const titleY = interpolate(titleProgress, [0, 1], [30, 0]);
  const lineWidth = interpolate(frame, [30, 55], [0, 120]);

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
          height: 3,
          backgroundColor: COLORS.primary,
          marginBottom: 28,
          borderRadius: 2,
        }}
      />
      <div
        style={{
          color: COLORS.subtitle,
          fontSize: 17,
          fontWeight: 400,
          opacity: titleProgress,
          transform: `translateY(${titleY}px)`,
          textAlign: "center",
        }}
      >
        {message}
      </div>
    </div>
  );
}
