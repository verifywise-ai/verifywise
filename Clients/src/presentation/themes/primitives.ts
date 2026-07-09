/**
 * VerifyWise grey scale primitives
 *
 * Hex literals for the grey ramp live here only.
 * Status, brand, and accent hues remain in palette.ts until their scales are defined.
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

export default grey;
