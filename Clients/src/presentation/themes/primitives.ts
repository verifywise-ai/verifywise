/**
 * VerifyWise color primitives.
 *
 * Hex literals for color ramps live here only.
 * Semantic tokens in palette.ts derive from these values.
 */

/** Grey ramp: 50 (lightest) → 950 (black) */
export const grey = {
  50: "#FFFFFF",
  100: "#F9FAFB",
  150: "#F3F4F6",
  200: "#E5E7EB",
  300: "#D0D5DD",
  350: "#9CA3AF",
  400: "#838C99",
  450: "#667085",
  500: "#6B7280",
  600: "#475467",
  700: "#344054",
  800: "#1F2937",
  900: "#1C2130",
  950: "#000000",
} as const;

export type GreyStep = keyof typeof grey;

/** Brand green ramp: 50 (lightest) → 900 (darkest) */
export const green = {
  50: "#F0FDF4",
  100: "#E6F0EC",
  200: "#E6F4EA",
  300: "#C8E6D0",
  400: "#C2DDD3",
  500: "#10B981",
  600: "#138A5E",
  700: "#13715B",
  800: "#10614D",
  900: "#0F5A47",
} as const;

export type GreenStep = keyof typeof green;

/**
 * Error red ramp (partial): 50 (subtle tint) → 500 (main).
 */
export const red = {
  50: "#FEF2F2",
  200: "#FFD6D6",
  300: "#F5B8B8",
  500: "#D32F2F",
} as const;

export type RedStep = keyof typeof red;

export default grey;
