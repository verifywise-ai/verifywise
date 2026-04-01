const ORBS = [
  { cx: "18%", cy: "22%", r: 200, speed: 0.025, phase: 0, color: "19,113,91" },
  { cx: "72%", cy: "55%", r: 280, speed: 0.018, phase: 2, color: "19,113,91" },
  { cx: "45%", cy: "78%", r: 190, speed: 0.03, phase: 4, color: "26,157,126" },
  { cx: "82%", cy: "18%", r: 160, speed: 0.022, phase: 1, color: "15,90,71" },
  { cx: "35%", cy: "42%", r: 240, speed: 0.015, phase: 3.5, color: "19,113,91" },
  { cx: "60%", cy: "15%", r: 130, speed: 0.035, phase: 5, color: "26,157,126" },
] as const;

/** Large soft glowing filled orbs — bokeh-like with visible drift & breathing */
export function FilledEllipticBg({ frame }: { frame: number }) {

  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      {ORBS.map((orb, i) => {
        // Wider drift range for visible movement
        const x = Math.sin(frame * orb.speed + orb.phase) * 60
                + Math.sin(frame * orb.speed * 0.6 + orb.phase * 2) * 25;
        const y = Math.cos(frame * orb.speed * 0.8 + orb.phase) * 45
                + Math.cos(frame * orb.speed * 0.4 + orb.phase * 1.5) * 20;

        // More pronounced breathing
        const scale = 1
          + Math.sin(frame * orb.speed * 0.7 + orb.phase) * 0.25
          + Math.sin(frame * orb.speed * 1.3 + orb.phase * 0.5) * 0.1;

        // Pulsing opacity
        const opacity = 0.14
          + Math.sin(frame * 0.03 + i * 1.2) * 0.06
          + Math.sin(frame * 0.06 + i * 0.8) * 0.03;

        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: orb.cx,
              top: orb.cy,
              width: orb.r * 2 * scale,
              height: orb.r * 2 * scale,
              borderRadius: "50%",
              background: `radial-gradient(circle, rgba(${orb.color},${opacity}) 0%, rgba(${orb.color},${opacity * 0.4}) 40%, rgba(${orb.color},0) 70%)`,
              transform: `translate(-50%, -50%) translate(${x}px, ${y}px)`,
              filter: "blur(35px)",
            }}
          />
        );
      })}
    </div>
  );
}
