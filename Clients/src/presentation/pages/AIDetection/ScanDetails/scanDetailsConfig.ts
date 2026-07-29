/**
 * @fileoverview Shared configuration and lookup tables for the Scan Details page.
 *
 * @module pages/AIDetection/ScanDetails/scanDetailsConfig
 */

import { Eye, ThumbsUp, Flag, EyeOff, ShieldCheck } from "lucide-react";
import {
  ConfidenceLevel,
  RiskLevel,
  SecuritySeverity,
  GovernanceStatus,
  ComplianceCategory,
  Finding,
} from "../../../../domain/ai-detection/types";
import { DimensionKey } from "../../../../domain/ai-detection/riskScoringTypes";
import { palette } from "../../../themes/palette";

export type TabValue =
  | "libraries"
  | "security"
  | "api-calls"
  | "secrets"
  | "models"
  | "rag"
  | "agents"
  | "compliance"
  | "vulnerabilities";

// ============================================================================
// Configuration
// ============================================================================

export const CONFIDENCE_CHIP_VARIANT: Record<ConfidenceLevel, "high" | "medium" | "low"> = {
  high: "high",
  medium: "medium",
  low: "low",
};

export const SEVERITY_CHIP_VARIANT: Record<
  SecuritySeverity,
  "critical" | "high" | "medium" | "low"
> = {
  critical: "critical",
  high: "high",
  medium: "medium",
  low: "low",
};

export const SEVERITY_BORDER_COLORS: Record<SecuritySeverity, string> = {
  critical: palette.risk.critical.border,
  high: palette.risk.high.border,
  medium: palette.risk.medium.border,
  low: palette.status.info.border,
};

export const CONFIDENCE_TOOLTIPS: Record<ConfidenceLevel, string> = {
  high: "The scanner is very confident this is an actual AI/ML library being used (e.g., direct import of tensorflow, pytorch, openai, etc.)",
  medium: "The scanner found patterns that likely indicate AI/ML usage but with less certainty",
  low: "The scanner found patterns that might indicate AI/ML usage but could be false positives",
};

export const RISK_LEVEL_CONFIG: Record<
  RiskLevel,
  { label: string; color: string; bgColor: string; tooltip: string }
> = {
  high: {
    label: "High risk",
    color: palette.status.error.text,
    bgColor: palette.status.error.bg,
    tooltip:
      "Data sent to external cloud APIs. Risk of data leakage, vendor lock-in, and compliance violations.",
  },
  medium: {
    label: "Medium risk",
    color: palette.status.warning.text,
    bgColor: palette.status.warning.bg,
    tooltip:
      "Framework that can connect to cloud APIs depending on configuration. Review usage to assess actual risk.",
  },
  low: {
    label: "Low risk",
    color: palette.status.success.text,
    bgColor: palette.status.success.bg,
    tooltip:
      "Local processing only. Data stays on your infrastructure with minimal external exposure.",
  },
};

// License risk configuration for inline badge display
export const LICENSE_RISK_CONFIG: Record<
  string,
  { label: string; color: string; bgColor: string; tooltip: string }
> = {
  high: {
    label: "Restrictive",
    color: palette.risk.high.text,
    bgColor: palette.risk.high.bg,
    tooltip:
      "Restrictive license (GPL, AGPL, CC-NC). May require code disclosure or prohibit commercial use.",
  },
  medium: {
    label: "Moderate",
    color: palette.risk.medium.text,
    bgColor: palette.risk.medium.bg,
    tooltip:
      "Moderate restrictions (LGPL, MPL, CC-BY-SA). Some obligations but generally allows commercial use.",
  },
  low: {
    label: "Permissive",
    color: palette.risk.low.text,
    bgColor: palette.risk.low.bg,
    tooltip: "Permissive license (MIT, Apache, BSD). Minimal restrictions, allows commercial use.",
  },
  unknown: {
    label: "Unknown",
    color: palette.status.default.text,
    bgColor: palette.status.default.bg,
    tooltip: "License could not be determined. Verify manually before commercial use.",
  },
};

export const SEVERITY_TOOLTIPS: Record<SecuritySeverity, string> = {
  critical:
    "Critical severity: Immediate action required. This finding indicates a severe security vulnerability that could lead to remote code execution or complete system compromise.",
  high: "High severity: Urgent attention needed. This finding indicates a significant security risk that should be addressed promptly.",
  medium:
    "Medium severity: Should be addressed. This finding indicates a moderate security concern that requires attention.",
  low: "Low severity: Consider addressing. This finding indicates a minor security concern or informational issue.",
};

export const GOVERNANCE_STATUS_CONFIG: Record<
  GovernanceStatus,
  { label: string; color: string; icon: React.ElementType }
> = {
  reviewed: { label: "Reviewed", color: palette.status.info.text, icon: Eye },
  approved: { label: "Approved", color: palette.status.success.text, icon: ThumbsUp },
  flagged: { label: "Flagged", color: palette.status.error.text, icon: Flag },
  suppressed: { label: "Suppressed", color: palette.text.tertiary, icon: EyeOff },
  accepted_risk: {
    label: "Accepted risk",
    color: palette.status.warning.text,
    icon: ShieldCheck,
  },
};

/**
 * A finding is treated as "suppressed" by the UI when EITHER:
 *   - a scan-time rule matched (boolean `suppressed`), or
 *   - a user manually set governance_status to "suppressed".
 * Both signals are also excluded from the risk score by the backend.
 * `accepted_risk` is acknowledged but not hidden — it still renders normally.
 */
export const isFindingSuppressed = (f: Finding): boolean =>
  f.suppressed === true || f.governance_status === "suppressed";

export const COMPLIANCE_CATEGORY_CONFIG: Record<
  ComplianceCategory,
  { label: string; color: string; bgColor: string; description: string }
> = {
  transparency: {
    label: "Transparency",
    color: palette.accent.blue.text,
    bgColor: palette.accent.blue.bg,
    description: "Requirements for making AI systems understandable to users and deployers",
  },
  documentation: {
    label: "Documentation",
    color: palette.accent.indigo.text,
    bgColor: palette.accent.indigo.bg,
    description: "Requirements for maintaining technical records of AI components",
  },
  risk_management: {
    label: "Risk management",
    color: palette.status.error.text,
    bgColor: palette.status.error.bg,
    description: "Requirements for identifying and mitigating AI-related risks",
  },
  data_governance: {
    label: "Data governance",
    color: palette.accent.teal.text,
    bgColor: palette.accent.teal.bg,
    description: "Requirements for managing data used by AI systems",
  },
  human_oversight: {
    label: "Human oversight",
    color: palette.accent.amber.text,
    bgColor: palette.accent.amber.bg,
    description: "Requirements for human control over AI decisions",
  },
  security: {
    label: "Security",
    color: palette.accent.pink.text,
    bgColor: palette.accent.pink.bg,
    description: "Requirements for protecting AI systems from attacks",
  },
  monitoring: {
    label: "Monitoring",
    color: palette.accent.purple.text,
    bgColor: palette.accent.purple.bg,
    description: "Requirements for ongoing observation of AI performance",
  },
  accountability: {
    label: "Accountability",
    color: palette.accent.teal.text,
    bgColor: palette.accent.teal.bg,
    description: "Requirements for quality management and responsibility",
  },
};

export const PRIORITY_CONFIG: Record<
  string,
  { label: string; color: string; bgColor: string; description: string }
> = {
  high: {
    label: "High",
    color: palette.risk.high.text,
    bgColor: palette.risk.high.bg,
    description: "Address immediately - critical for compliance",
  },
  medium: {
    label: "Medium",
    color: palette.risk.medium.text,
    bgColor: palette.risk.medium.bg,
    description: "Address soon - important for compliance",
  },
  low: {
    label: "Low",
    color: palette.risk.low.text,
    bgColor: palette.risk.low.bg,
    description: "Address when possible - recommended for compliance",
  },
};

// EU AI Act article descriptions for tooltips
export const ARTICLE_DESCRIPTIONS: Record<string, string> = {
  "Article 9":
    "Risk Management System - Requires identifying and mitigating risks throughout the AI lifecycle",
  "Article 9(2)": "Risk Management - Specifically covers third-party and dependency risks",
  "Article 10": "Data Governance - Requires quality datasets and proper data management",
  "Article 10(3)": "Data Governance - Covers data processing and preparation requirements",
  "Article 11":
    "Technical Documentation - Requires comprehensive documentation before market placement",
  "Article 11(1)": "Technical Documentation - Covers minimum content standards",
  "Article 13":
    "Transparency - AI systems must be transparent enough for users to interpret outputs",
  "Article 13(3)": "Transparency - Requires clear information about AI model capabilities",
  "Article 14": "Human Oversight - AI systems must allow effective human supervision",
  "Article 14(4)": "Human Oversight - Covers autonomy controls and intervention capabilities",
  "Article 15":
    "Security - AI systems must achieve appropriate accuracy, robustness, and cybersecurity",
  "Article 15(5)":
    "Security - Covers AI-specific vulnerabilities like data poisoning and adversarial attacks",
  "Article 17": "Quality Management - Requires documented quality management systems",
  "Article 50":
    "Transparency Obligations - Users must know when interacting with AI; synthetic content must be marked",
  "Article 72":
    "Post-Market Monitoring - Requires ongoing monitoring of AI systems after deployment",
};

// ============================================================================
// Suggested Risk Helpers
// ============================================================================

export const DIMENSION_CHIP_COLORS: Record<DimensionKey, { text: string; bg: string }> = {
  data_sovereignty: { text: palette.accent.indigo.text, bg: palette.accent.indigo.bg },
  transparency: { text: palette.accent.blue.text, bg: palette.accent.blue.bg },
  security: { text: palette.accent.pink.text, bg: palette.accent.pink.bg },
  autonomy: { text: palette.accent.purple.text, bg: palette.accent.purple.bg },
  supply_chain: { text: palette.accent.orange.text, bg: palette.accent.orange.bg },
};

// ============================================================================
// Vulnerability Finding Helpers
// ============================================================================

export const VULN_TYPE_LABELS: Record<string, { label: string; owaspId: string }> = {
  prompt_injection: { label: "Prompt injection", owaspId: "LLM01" },
  jailbreak_risk: { label: "Insecure output handling", owaspId: "LLM02" },
  training_data_poisoning: { label: "Training data poisoning", owaspId: "LLM03" },
  model_dos: { label: "Model denial of service", owaspId: "LLM04" },
  supply_chain: { label: "Supply chain vulnerabilities", owaspId: "LLM05" },
  pii_exposure: { label: "Sensitive information disclosure", owaspId: "LLM06" },
  insecure_plugin: { label: "Insecure plugin design", owaspId: "LLM07" },
  excessive_agency: { label: "Excessive agency", owaspId: "LLM08" },
  overreliance: { label: "Overreliance", owaspId: "LLM09" },
  model_theft: { label: "Model theft", owaspId: "LLM10" },
};
