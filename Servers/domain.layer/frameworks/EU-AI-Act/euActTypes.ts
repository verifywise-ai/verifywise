export type Role = "Provider" | "Deployer";

export type RiskTier =
  | "Prohibited"
  | "High risk"
  | "Limited risk"
  | "Minimal risk"
  | "GPAI"
  | "General Risk";

export const ROLES: readonly Role[] = ["Provider", "Deployer"] as const;

export const RISK_TIERS: readonly RiskTier[] = [
  "Prohibited",
  "High risk",
  "Limited risk",
  "Minimal risk",
  "GPAI",
  "General Risk",
] as const;
