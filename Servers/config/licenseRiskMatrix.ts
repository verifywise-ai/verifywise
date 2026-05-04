/**
 * @fileoverview License Risk Matrix Configuration
 *
 * Defines license classifications and risk levels for AI/ML components.
 * Used to assess compliance and commercial use risks.
 */

// License risk levels
export type LicenseRisk = "high" | "medium" | "low" | "unknown";

// License category
export type LicenseCategory = "permissive" | "copyleft" | "proprietary" | "research" | "unknown";

// License information structure
export interface LicenseInfo {
  spdxId: string;
  name: string;
  risk: LicenseRisk;
  category: LicenseCategory;
  requiresAttribution: boolean;
  allowsCommercialUse: boolean;
  requiresShareAlike: boolean;
  notes?: string;
}

/**
 * License risk matrix mapping SPDX identifiers to risk levels
 *
 * Risk levels:
 * - high: Restrictive licenses (GPL, AGPL, CC-NC) - may require code disclosure or prohibit commercial use
 * - medium: Moderate restrictions (LGPL, MPL) - some obligations but less restrictive
 * - low: Permissive licenses (MIT, Apache, BSD) - minimal restrictions
 * - unknown: Unrecognized license
 */
export const LICENSE_RISK_MATRIX: Record<string, LicenseInfo> = {
  // ============================================================================
  // Permissive Licenses (Low Risk)
  // ============================================================================
  MIT: {
    spdxId: "MIT",
    name: "MIT License",
    risk: "low",
    category: "permissive",
    requiresAttribution: true,
    allowsCommercialUse: true,
    requiresShareAlike: false,
  },
  "Apache-2.0": {
    spdxId: "Apache-2.0",
    name: "Apache License 2.0",
    risk: "low",
    category: "permissive",
    requiresAttribution: true,
    allowsCommercialUse: true,
    requiresShareAlike: false,
  },
  "BSD-2-Clause": {
    spdxId: "BSD-2-Clause",
    name: "BSD 2-Clause License",
    risk: "low",
    category: "permissive",
    requiresAttribution: true,
    allowsCommercialUse: true,
    requiresShareAlike: false,
  },
  "BSD-3-Clause": {
    spdxId: "BSD-3-Clause",
    name: "BSD 3-Clause License",
    risk: "low",
    category: "permissive",
    requiresAttribution: true,
    allowsCommercialUse: true,
    requiresShareAlike: false,
  },
  ISC: {
    spdxId: "ISC",
    name: "ISC License",
    risk: "low",
    category: "permissive",
    requiresAttribution: true,
    allowsCommercialUse: true,
    requiresShareAlike: false,
  },
  Unlicense: {
    spdxId: "Unlicense",
    name: "The Unlicense",
    risk: "low",
    category: "permissive",
    requiresAttribution: false,
    allowsCommercialUse: true,
    requiresShareAlike: false,
  },
  "CC0-1.0": {
    spdxId: "CC0-1.0",
    name: "CC0 1.0 Universal",
    risk: "low",
    category: "permissive",
    requiresAttribution: false,
    allowsCommercialUse: true,
    requiresShareAlike: false,
  },
  WTFPL: {
    spdxId: "WTFPL",
    name: "Do What The F*ck You Want To Public License",
    risk: "low",
    category: "permissive",
    requiresAttribution: false,
    allowsCommercialUse: true,
    requiresShareAlike: false,
  },
  Zlib: {
    spdxId: "Zlib",
    name: "zlib License",
    risk: "low",
    category: "permissive",
    requiresAttribution: true,
    allowsCommercialUse: true,
    requiresShareAlike: false,
  },
  PostgreSQL: {
    spdxId: "PostgreSQL",
    name: "PostgreSQL License",
    risk: "low",
    category: "permissive",
    requiresAttribution: true,
    allowsCommercialUse: true,
    requiresShareAlike: false,
  },

  // ============================================================================
  // Medium Risk Licenses (Weak Copyleft / Some Restrictions)
  // ============================================================================
  "LGPL-2.1": {
    spdxId: "LGPL-2.1",
    name: "GNU Lesser General Public License v2.1",
    risk: "medium",
    category: "copyleft",
    requiresAttribution: true,
    allowsCommercialUse: true,
    requiresShareAlike: true,
    notes: "Library modifications must be shared; linking is allowed",
  },
  "LGPL-3.0": {
    spdxId: "LGPL-3.0",
    name: "GNU Lesser General Public License v3.0",
    risk: "medium",
    category: "copyleft",
    requiresAttribution: true,
    allowsCommercialUse: true,
    requiresShareAlike: true,
    notes: "Library modifications must be shared; linking is allowed",
  },
  "MPL-2.0": {
    spdxId: "MPL-2.0",
    name: "Mozilla Public License 2.0",
    risk: "medium",
    category: "copyleft",
    requiresAttribution: true,
    allowsCommercialUse: true,
    requiresShareAlike: true,
    notes: "File-level copyleft; modifications to MPL files must be shared",
  },
  "EPL-2.0": {
    spdxId: "EPL-2.0",
    name: "Eclipse Public License 2.0",
    risk: "medium",
    category: "copyleft",
    requiresAttribution: true,
    allowsCommercialUse: true,
    requiresShareAlike: true,
  },
  "CC-BY-4.0": {
    spdxId: "CC-BY-4.0",
    name: "Creative Commons Attribution 4.0",
    risk: "medium",
    category: "permissive",
    requiresAttribution: true,
    allowsCommercialUse: true,
    requiresShareAlike: false,
    notes: "Common for datasets and model weights",
  },
  "CC-BY-SA-4.0": {
    spdxId: "CC-BY-SA-4.0",
    name: "Creative Commons Attribution ShareAlike 4.0",
    risk: "medium",
    category: "copyleft",
    requiresAttribution: true,
    allowsCommercialUse: true,
    requiresShareAlike: true,
    notes: "Derivatives must use same license",
  },

  // ============================================================================
  // High Risk Licenses (Strong Copyleft / Non-Commercial)
  // ============================================================================
  "GPL-2.0": {
    spdxId: "GPL-2.0",
    name: "GNU General Public License v2.0",
    risk: "high",
    category: "copyleft",
    requiresAttribution: true,
    allowsCommercialUse: true,
    requiresShareAlike: true,
    notes: "Strong copyleft; derivative works must be GPL",
  },
  "GPL-3.0": {
    spdxId: "GPL-3.0",
    name: "GNU General Public License v3.0",
    risk: "high",
    category: "copyleft",
    requiresAttribution: true,
    allowsCommercialUse: true,
    requiresShareAlike: true,
    notes: "Strong copyleft; derivative works must be GPL",
  },
  "AGPL-3.0": {
    spdxId: "AGPL-3.0",
    name: "GNU Affero General Public License v3.0",
    risk: "high",
    category: "copyleft",
    requiresAttribution: true,
    allowsCommercialUse: true,
    requiresShareAlike: true,
    notes: "Network copyleft; SaaS use triggers disclosure",
  },
  "CC-BY-NC-4.0": {
    spdxId: "CC-BY-NC-4.0",
    name: "Creative Commons Attribution NonCommercial 4.0",
    risk: "high",
    category: "research",
    requiresAttribution: true,
    allowsCommercialUse: false,
    requiresShareAlike: false,
    notes: "Non-commercial use only",
  },
  "CC-BY-NC-SA-4.0": {
    spdxId: "CC-BY-NC-SA-4.0",
    name: "Creative Commons Attribution NonCommercial ShareAlike 4.0",
    risk: "high",
    category: "research",
    requiresAttribution: true,
    allowsCommercialUse: false,
    requiresShareAlike: true,
    notes: "Non-commercial use only; derivatives must use same license",
  },
  "CC-BY-NC-ND-4.0": {
    spdxId: "CC-BY-NC-ND-4.0",
    name: "Creative Commons Attribution NonCommercial NoDerivatives 4.0",
    risk: "high",
    category: "research",
    requiresAttribution: true,
    allowsCommercialUse: false,
    requiresShareAlike: false,
    notes: "Non-commercial; no derivatives allowed",
  },

  // ============================================================================
  // Proprietary / Restrictive Model Licenses
  // ============================================================================
  OpenRAIL: {
    spdxId: "OpenRAIL",
    name: "Open RAIL License",
    risk: "medium",
    category: "research",
    requiresAttribution: true,
    allowsCommercialUse: true,
    requiresShareAlike: false,
    notes: "Responsible AI license with use restrictions",
  },
  "OpenRAIL-M": {
    spdxId: "OpenRAIL-M",
    name: "Open RAIL-M License",
    risk: "medium",
    category: "research",
    requiresAttribution: true,
    allowsCommercialUse: true,
    requiresShareAlike: false,
    notes: "Model-specific RAIL with behavioral restrictions",
  },
  Llama2: {
    spdxId: "Llama2",
    name: "Llama 2 Community License",
    risk: "medium",
    category: "proprietary",
    requiresAttribution: true,
    allowsCommercialUse: true,
    requiresShareAlike: false,
    notes: "Commercial use allowed; 700M MAU threshold requires license",
  },
  Llama3: {
    spdxId: "Llama3",
    name: "Llama 3 Community License",
    risk: "medium",
    category: "proprietary",
    requiresAttribution: true,
    allowsCommercialUse: true,
    requiresShareAlike: false,
    notes: "Similar to Llama 2; check MAU restrictions",
  },
  Gemma: {
    spdxId: "Gemma",
    name: "Gemma Terms of Use",
    risk: "medium",
    category: "proprietary",
    requiresAttribution: true,
    allowsCommercialUse: true,
    requiresShareAlike: false,
    notes: "Google's terms for Gemma models",
  },
};

/**
 * Normalize license string to SPDX format
 */
export function normalizeLicenseId(license: string): string {
  if (!license) return "unknown";

  const normalized = license.trim();

  // Common variations mapping
  const variations: Record<string, string> = {
    mit: "MIT",
    "apache 2.0": "Apache-2.0",
    "apache-2": "Apache-2.0",
    apache2: "Apache-2.0",
    apache: "Apache-2.0",
    "bsd-2": "BSD-2-Clause",
    "bsd-3": "BSD-3-Clause",
    bsd: "BSD-3-Clause",
    "gpl-2": "GPL-2.0",
    "gpl-3": "GPL-3.0",
    gpl2: "GPL-2.0",
    gpl3: "GPL-3.0",
    gpl: "GPL-3.0",
    "lgpl-2.1": "LGPL-2.1",
    "lgpl-3": "LGPL-3.0",
    lgpl: "LGPL-3.0",
    "agpl-3": "AGPL-3.0",
    agpl: "AGPL-3.0",
    "mpl-2": "MPL-2.0",
    mpl: "MPL-2.0",
    cc0: "CC0-1.0",
    "cc-by": "CC-BY-4.0",
    "cc-by-4": "CC-BY-4.0",
    "cc-by-sa": "CC-BY-SA-4.0",
    "cc-by-nc": "CC-BY-NC-4.0",
    "cc-by-nc-sa": "CC-BY-NC-SA-4.0",
    unlicense: "Unlicense",
    "public domain": "Unlicense",
    openrail: "OpenRAIL",
    "openrail-m": "OpenRAIL-M",
    "llama 2": "Llama2",
    llama2: "Llama2",
    "llama 3": "Llama3",
    llama3: "Llama3",
    gemma: "Gemma",
  };

  const lowerNormalized = normalized.toLowerCase();
  return variations[lowerNormalized] || normalized;
}

/**
 * Get license info from SPDX ID
 */
export function getLicenseInfo(license: string): LicenseInfo {
  const normalizedId = normalizeLicenseId(license);
  return (
    LICENSE_RISK_MATRIX[normalizedId] || {
      spdxId: normalizedId,
      name: license || "Unknown",
      risk: "unknown" as LicenseRisk,
      category: "unknown" as LicenseCategory,
      requiresAttribution: true,
      allowsCommercialUse: true,
      requiresShareAlike: false,
    }
  );
}

/**
 * Get risk level for a license
 */
export function getLicenseRisk(license: string): LicenseRisk {
  return getLicenseInfo(license).risk;
}

/**
 * Check if license allows commercial use
 */
export function allowsCommercialUse(license: string): boolean {
  return getLicenseInfo(license).allowsCommercialUse;
}
