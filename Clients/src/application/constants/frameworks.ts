/**
 * Framework Constants
 *
 * Centralized constants for framework IDs and related configurations
 * to avoid magic numbers throughout the codebase.
 */

export const FRAMEWORK_IDS = {
  ISO_42001: 2,
  ISO_27001: 3,
  NIST_AI_RMF: 4,
  EU_AI_ACT: 5,
  MITRE_ATLAS: 6,
} as const;

export const FRAMEWORK_NAMES = {
  ISO_42001: 'ISO 42001',
  ISO_27001: 'ISO 27001',
  NIST_AI_RMF: 'NIST AI RMF',
  EU_AI_ACT: 'EU AI Act',
  MITRE_ATLAS: 'MITRE ATLAS',
} as const;

export const FRAMEWORK_DETECTION = {
  ISO_42001_PATTERNS: ['iso 42001', 'iso42001'],
  ISO_27001_PATTERNS: ['iso 27001', 'iso27001'],
  NIST_AI_RMF_PATTERNS: ['nist ai rmf', 'nist ai', 'nistai', 'nist rmf'],
  EU_AI_ACT_PATTERNS: ['eu ai act', 'euaiact', 'eu artificial intelligence act', 'ai act', 'regulation 2024/1689'],
  MITRE_ATLAS_PATTERNS: ['mitre atlas', 'mitreatlas', 'atlas framework'],
} as const;

/**
 * Helper function to detect framework type from name
 */
export const getFrameworkType = (frameworkName: string): 'ISO_42001' | 'ISO_27001' | 'NIST_AI_RMF' | 'EU_AI_ACT' | 'MITRE_ATLAS' | 'UNKNOWN' => {
  const name = frameworkName.toLowerCase().replace(/[\s-]/g, '');

  if (FRAMEWORK_DETECTION.ISO_42001_PATTERNS.some(pattern => name.includes(pattern.replace(/[\s-]/g, '')))) {
    return 'ISO_42001';
  }

  if (FRAMEWORK_DETECTION.ISO_27001_PATTERNS.some(pattern => name.includes(pattern.replace(/[\s-]/g, '')))) {
    return 'ISO_27001';
  }

  if (FRAMEWORK_DETECTION.NIST_AI_RMF_PATTERNS.some(pattern => name.includes(pattern.replace(/[\s-]/g, '')))) {
    return 'NIST_AI_RMF';
  }

  if (FRAMEWORK_DETECTION.EU_AI_ACT_PATTERNS.some(pattern => name.includes(pattern.replace(/[\s-]/g, '')))) {
    return 'EU_AI_ACT';
  }

  if (FRAMEWORK_DETECTION.MITRE_ATLAS_PATTERNS.some(pattern => name.includes(pattern.replace(/[\s-]/g, '')))) {
    return 'MITRE_ATLAS';
  }

  return 'UNKNOWN';
};

/**
 * Helper function to check if framework is ISO 42001
 */
export const isISO42001 = (frameworkId: number, frameworkName?: string): boolean => {
  return frameworkId === FRAMEWORK_IDS.ISO_42001 ||
    (frameworkName ? getFrameworkType(frameworkName) === 'ISO_42001' : false);
};

/**
 * Helper function to check if framework is ISO 27001
 */
export const isISO27001 = (frameworkId: number, frameworkName?: string): boolean => {
  return frameworkId === FRAMEWORK_IDS.ISO_27001 ||
    (frameworkName ? getFrameworkType(frameworkName) === 'ISO_27001' : false);
};

/**
 * Helper function to check if framework is NIST AI RMF
 */
export const isNISTAIRMF = (frameworkId: number, frameworkName?: string): boolean => {
  return frameworkId === FRAMEWORK_IDS.NIST_AI_RMF ||
    (frameworkName ? getFrameworkType(frameworkName) === 'NIST_AI_RMF' : false);
};

/**
 * Helper function to check if framework is EU AI Act
 */
export const isEUAIAct = (frameworkId: number, frameworkName?: string): boolean => {
  return frameworkId === FRAMEWORK_IDS.EU_AI_ACT ||
    (frameworkName ? getFrameworkType(frameworkName) === 'EU_AI_ACT' : false);
};

/**
 * Helper function to check if framework is MITRE ATLAS
 */
export const isMITREATLAS = (frameworkId: number, frameworkName?: string): boolean => {
  return frameworkId === FRAMEWORK_IDS.MITRE_ATLAS ||
    (frameworkName ? getFrameworkType(frameworkName) === 'MITRE_ATLAS' : false);
};
