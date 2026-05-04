/**
 * @fileoverview Model Security Scanning Interface Definitions
 *
 * Type definitions for model security scanning feature including
 * scan results, findings, and compliance mappings.
 *
 * @module domain.layer/interfaces/i.modelSecurity
 */

import { SecuritySeverity } from "../../config/modelSecurityPatterns";

// ============================================================================
// Security Severity Types
// ============================================================================

/**
 * Re-export SecuritySeverity for convenience
 */
export type { SecuritySeverity };

/**
 * Extended finding type to include model security
 */
export type ExtendedFindingType = "library" | "dependency" | "model_security";

// ============================================================================
// Model Security Finding Types
// ============================================================================

/**
 * Represents a security finding from model file scanning
 */
export interface IModelSecurityFinding {
  /** Type of threat detected */
  threatType: string;
  /** Human-readable threat name */
  threatName: string;
  /** Detailed description of the threat */
  description: string;
  /** Security severity level */
  severity: SecuritySeverity;
  /** Dangerous module name (e.g., 'os', 'subprocess') */
  moduleName: string;
  /** Dangerous operator/function name (e.g., 'system', 'exec') */
  operatorName: string;
  /** CWE identifier (e.g., 'CWE-502') */
  cweId: string;
  /** CWE description */
  cweName: string;
  /** OWASP ML Top 10 identifier (e.g., 'ML06') */
  owaspMlId: string;
  /** OWASP ML Top 10 description */
  owaspMlName: string;
  /** File path where the threat was found */
  filePath: string;
  /** Position in file (if available) */
  position?: {
    offset: number;
    length: number;
  };
}

/**
 * Result of scanning a single model file
 */
export interface IModelScanResult {
  /** File path that was scanned */
  filePath: string;
  /** File extension (e.g., '.pkl', '.pt') */
  fileExtension: string;
  /** Scanner used (e.g., 'serialized', 'h5', 'safetensors') */
  scannerType: string;
  /** Whether the file is considered safe */
  isSafe: boolean;
  /** Security findings (empty if safe) */
  findings: IModelSecurityFinding[];
  /** Highest severity found (null if safe) */
  highestSeverity: SecuritySeverity | null;
  /** Scan duration in milliseconds */
  scanDurationMs: number;
  /** Any errors that occurred during scanning */
  error?: string;
}

/**
 * Aggregated results from scanning multiple model files
 */
export interface IModelSecurityScanSummary {
  /** Total model files scanned */
  totalFilesScanned: number;
  /** Number of files with security issues */
  unsafeFileCount: number;
  /** Number of files that are safe */
  safeFileCount: number;
  /** Total security findings */
  totalFindings: number;
  /** Findings by severity */
  findingsBySeverity: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  /** Findings by threat type */
  findingsByThreatType: Record<string, number>;
  /** Individual file results */
  fileResults: IModelScanResult[];
  /** Total scan duration in milliseconds */
  totalScanDurationMs: number;
}

// ============================================================================
// Serialized File Analysis Types
// ============================================================================

/**
 * Represents an opcode found in a serialized file
 */
export interface ISerializedOpcode {
  /** Opcode name (e.g., 'GLOBAL', 'REDUCE') */
  opcode: string;
  /** Opcode arguments */
  args: unknown[];
  /** Position in the byte stream */
  position: number;
}

/**
 * Represents a global reference in a serialized file
 * (module.function pattern that could be dangerous)
 */
export interface IGlobalReference {
  /** Module name (e.g., 'os', 'builtins') */
  module: string;
  /** Function/class name (e.g., 'system', 'eval') */
  name: string;
  /** Position in the byte stream */
  position: number;
}

/**
 * Result of parsing a serialized file
 */
export interface ISerializedParseResult {
  /** Whether parsing was successful */
  success: boolean;
  /** Protocol version of the serialized file */
  protocolVersion?: number;
  /** Global references found */
  globals: IGlobalReference[];
  /** Raw opcodes (for detailed analysis) */
  opcodes?: ISerializedOpcode[];
  /** Parsing error if any */
  error?: string;
}

// ============================================================================
// H5/Keras Analysis Types
// ============================================================================

/**
 * Represents a Lambda layer found in an H5/Keras model
 */
export interface ILambdaLayerInfo {
  /** Layer name in the model */
  layerName: string;
  /** Lambda function code (if extractable) */
  functionCode?: string;
  /** Config dictionary path */
  configPath: string;
}

/**
 * Result of scanning an H5/Keras model file
 */
export interface IH5ScanResult {
  /** Whether parsing was successful */
  success: boolean;
  /** Model format (e.g., 'keras', 'tensorflow') */
  modelFormat?: string;
  /** Lambda layers found */
  lambdaLayers: ILambdaLayerInfo[];
  /** Custom objects that may contain code */
  customObjects: string[];
  /** Scanning error if any */
  error?: string;
}

// ============================================================================
// SafeTensors Analysis Types
// ============================================================================

/**
 * Result of validating a SafeTensors file
 */
export interface ISafeTensorsValidationResult {
  /** Whether the file is a valid SafeTensors file */
  isValid: boolean;
  /** Header size in bytes */
  headerSize?: number;
  /** Number of tensors in the file */
  tensorCount?: number;
  /** Validation error if any */
  error?: string;
  /** Any warnings (non-blocking issues) */
  warnings: string[];
}

// ============================================================================
// Scanner Configuration Types
// ============================================================================

/**
 * Configuration for model security scanning
 */
export interface IModelSecurityConfig {
  /** Whether model security scanning is enabled */
  enabled: boolean;
  /** Scan mode: 'quick' for fast blocklist, 'thorough' for deep analysis */
  scanMode: "quick" | "thorough";
  /** Minimum severity to report (filter out lower severities) */
  severityThreshold: SecuritySeverity;
  /** Maximum file size to scan in bytes (default: 100MB for GitHub limit) */
  maxModelFileSize: number;
  /** File extensions to scan */
  enabledExtensions: string[];
  /** Whether to scan Lambda layers in H5 files */
  scanLambdaLayers: boolean;
}

/**
 * Default configuration values
 */
export const DEFAULT_MODEL_SECURITY_CONFIG: IModelSecurityConfig = {
  enabled: true,
  scanMode: "quick",
  severityThreshold: "low",
  maxModelFileSize: 100 * 1024 * 1024, // 100MB
  enabledExtensions: [
    ".pkl",
    ".pickle",
    ".pt",
    ".pth",
    ".bin",
    ".h5",
    ".keras",
    ".hdf5",
    ".safetensors",
  ],
  scanLambdaLayers: true,
};

// ============================================================================
// Database Types (for storing findings)
// ============================================================================

/**
 * Input for creating a model security finding in the database
 */
export interface ICreateModelSecurityFindingInput {
  scan_id: number;
  finding_type: "model_security";
  category: string;
  name: string;
  provider?: string;
  confidence: "high" | "medium" | "low";
  description?: string;
  documentation_url?: string;
  file_count?: number;
  file_paths?: Array<{
    path: string;
    line_number: number | null;
    matched_text: string;
  }>;
  // Model security specific fields
  severity: SecuritySeverity;
  cwe_id: string;
  cwe_name: string;
  owasp_ml_id: string;
  owasp_ml_name: string;
  threat_type: string;
  operator_name: string;
  module_name: string;
}

/**
 * Model security finding as returned from the database
 */
export interface IModelSecurityFindingRecord {
  id: number;
  scan_id: number;
  finding_type: "model_security";
  category: string;
  name: string;
  provider: string | null;
  confidence: "high" | "medium" | "low";
  description: string | null;
  documentation_url: string | null;
  file_count: number;
  file_paths: Array<{
    path: string;
    line_number: number | null;
    matched_text: string;
  }> | null;
  severity: SecuritySeverity;
  cwe_id: string;
  cwe_name: string;
  owasp_ml_id: string;
  owasp_ml_name: string;
  threat_type: string;
  operator_name: string;
  module_name: string;
  created_at: Date;
}

// ============================================================================
// API Response Types
// ============================================================================

/**
 * Model security finding for API response
 */
export interface IModelSecurityFindingResponse {
  id: number;
  findingType: "model_security";
  category: string;
  name: string;
  severity: SecuritySeverity;
  threatType: string;
  moduleName: string;
  operatorName: string;
  description: string;
  filePaths: Array<{
    path: string;
    lineNumber: number | null;
    matchedText: string;
  }>;
  compliance: {
    cweId: string;
    cweName: string;
    owaspMlId: string;
    owaspMlName: string;
  };
}

/**
 * Summary of security findings by severity
 */
export interface ISecurityFindingsBySeverity {
  critical: number;
  high: number;
  medium: number;
  low: number;
}

/**
 * Extended scan summary including security findings
 */
export interface IExtendedScanSummary {
  total: number;
  by_confidence: {
    high: number;
    medium: number;
    low: number;
  };
  by_provider: Record<string, number>;
  security: {
    total: number;
    by_severity: ISecurityFindingsBySeverity;
    by_threat_type: Record<string, number>;
  };
}
