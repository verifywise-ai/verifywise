/**
 * Linear interpolation clamped to output range.
 * Mirrors Remotion's interpolate() with clamp behavior.
 */
export function interpolate(
  value: number,
  inputRange: [number, number],
  outputRange: [number, number]
): number {
  const [inMin, inMax] = inputRange;
  const [outMin, outMax] = outputRange;

  if (value <= inMin) return outMin;
  if (value >= inMax) return outMax;

  const t = (value - inMin) / (inMax - inMin);
  return outMin + t * (outMax - outMin);
}

/**
 * Simple spring-like easing.
 * Returns 0→1 with overshoot and settle, starting at `delay` frames.
 */
export function spring(
  frame: number,
  fps: number,
  delay: number = 0
): number {
  const f = frame - delay;
  if (f <= 0) return 0;

  const durationSec = 0.6;
  const totalFrames = durationSec * fps;
  const t = Math.min(f / totalFrames, 1);

  // Spring approximation: overshoot then settle
  const damping = 0.7;
  const omega = 2 * Math.PI / durationSec;
  const progress =
    1 - Math.exp(-damping * omega * (t * durationSec)) *
    Math.cos(omega * Math.sqrt(1 - damping * damping) * (t * durationSec));

  return Math.min(Math.max(progress, 0), 1);
}
