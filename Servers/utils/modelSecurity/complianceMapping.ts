/**
 * @fileoverview Compliance Mapping Utility
 *
 * Maps security findings to compliance frameworks (CWE, OWASP ML Top 10, NIST AI RMF)
 *
 * @module utils/modelSecurity/complianceMapping
 */

import { THREAT_TYPES } from "../../config/modelSecurityPatterns";
import { SecuritySeverity } from "../../domain.layer/interfaces/i.modelSecurity";

/**
 * Compliance reference with documentation URLs
 */
export interface ComplianceInfo {
  cweId: string;
  cweName: string;
  cweUrl: string;
  owaspMlId: string;
  owaspMlName: string;
  owaspMlUrl: string;
  nistAiRmf?: string;
  nistAiRmfUrl?: string;
}

/**
 * Gets full compliance information for a threat type
 */
export function getComplianceInfo(threatType: string): ComplianceInfo {
  const mapping = THREAT_TYPES[threatType];

  if (!mapping) {
    // Default to deserialization if unknown
    return getComplianceInfo("deserialization");
  }

  const compliance = mapping.compliance;

  return {
    cweId: compliance.cweId,
    cweName: compliance.cweName,
    cweUrl:
      "https://cwe.mitre.org/data/definitions/" + compliance.cweId.replace("CWE-", "") + ".html",
    owaspMlId: compliance.owaspMlId,
    owaspMlName: compliance.owaspMlName,
    owaspMlUrl: "https://owasp.org/www-project-machine-learning-security-top-10/",
    nistAiRmf: compliance.nistAiRmf,
    nistAiRmfUrl: compliance.nistAiRmf
      ? "https://www.nist.gov/itl/ai-risk-management-framework"
      : undefined,
  };
}

/**
 * Maps severity to a confidence level for database storage
 */
export function severityToConfidence(severity: SecuritySeverity): "high" | "medium" | "low" {
  switch (severity) {
    case "critical":
    case "high":
      return "high";
    case "medium":
      return "medium";
    case "low":
      return "low";
    default:
      return "medium";
  }
}

/**
 * Gets a human-readable category for a threat type
 */
export function getThreatCategory(threatType: string): string {
  const categories: Record<string, string> = {
    deserialization: "Code Execution",
    lambda_injection: "Code Injection",
    code_execution: "Code Execution",
    network_access: "Network Access",
    file_manipulation: "File System Access",
    dos_attack: "Denial of Service",
    polyglot_attack: "File Validation",
    unknown_operator: "Unknown Risk",
  };

  return categories[threatType] || "Security Risk";
}

/**
 * Gets a description for the provider field based on file extension
 */
export function getProviderFromExtension(extension: string): string {
  const providers: Record<string, string> = {
    ".pkl": "Python Serialization",
    ".pickle": "Python Serialization",
    ".pt": "PyTorch",
    ".pth": "PyTorch",
    ".bin": "PyTorch/Transformers",
    ".h5": "Keras/TensorFlow",
    ".keras": "Keras",
    ".hdf5": "HDF5",
    ".safetensors": "SafeTensors",
    ".onnx": "ONNX",
    ".gguf": "GGUF",
    ".ggml": "GGML",
  };

  return providers[extension.toLowerCase()] || "Unknown Format";
}

/**
 * Generates a documentation URL for a finding
 */
export function getDocumentationUrl(_threatType: string, cweId: string): string {
  // Primary: link to CWE
  const cweNum = cweId.replace("CWE-", "");
  return "https://cwe.mitre.org/data/definitions/" + cweNum + ".html";
}

/**
 * Gets all supported threat types
 */
export function getSupportedThreatTypes(): string[] {
  return Object.keys(THREAT_TYPES);
}

/**
 * Formats a finding name for display
 */
export function formatFindingName(moduleName: string, operatorName: string): string {
  return moduleName + "." + operatorName;
}

/**
 * Generates a summary description for a security finding
 */
export function generateFindingDescription(
  threatType: string,
  moduleName: string,
  operatorName: string,
): string {
  const threatInfo = THREAT_TYPES[threatType];

  if (!threatInfo) {
    return "Potentially dangerous operator detected: " + moduleName + "." + operatorName;
  }

  const descriptions: Record<string, string> = {
    deserialization:
      "Dangerous module '" +
      moduleName +
      "' with operator '" +
      operatorName +
      "' can execute arbitrary code during deserialization",
    lambda_injection:
      "Lambda layer can contain arbitrary Python code that executes during model loading",
    code_execution:
      "Module '" + moduleName + "' operator '" + operatorName + "' can execute system commands",
    network_access:
      "Module '" + moduleName + "' can establish network connections for data exfiltration",
    file_manipulation:
      "Module '" + moduleName + "' operator '" + operatorName + "' can read/write/delete files",
    dos_attack: "Malformed data that could cause resource exhaustion or crashes",
    polyglot_attack: "File may be valid in multiple formats, potentially hiding malicious content",
    unknown_operator: "Unrecognized operator that may pose security risks",
  };

  return descriptions[threatType] || threatInfo.description;
}
