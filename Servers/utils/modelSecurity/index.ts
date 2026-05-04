/**
 * @fileoverview Model Security Scanner - Main Entry Point
 *
 * Orchestrates scanning of model files for security threats.
 * Routes files to appropriate scanners based on extension.
 *
 * @module utils/modelSecurity
 */

import * as path from "path";
import {
  IModelScanResult,
  IModelSecurityScanSummary,
  IModelSecurityConfig,
  DEFAULT_MODEL_SECURITY_CONFIG,
  SecuritySeverity,
} from "../../domain.layer/interfaces/i.modelSecurity";
import { isModelFileExtension, getRiskLevelForExtension } from "../../config/modelSecurityPatterns";
import { scanSerializedFile, isSerializedFile } from "./serializedScanner";
import { scanSafeTensorsFile, isSafeTensorsFile } from "./safetensorsScanner";
import { scanH5File, isH5File } from "./h5Scanner";

// Re-export types and utilities
export * from "./serializedScanner";
export * from "./safetensorsScanner";
export * from "./h5Scanner";
export * from "./complianceMapping";

/**
 * Scans a single model file for security threats
 *
 * @param filePath - Absolute path to the model file
 * @param config - Optional scanning configuration
 * @returns Scan result with findings
 */
export async function scanModelFile(
  filePath: string,
  _config: Partial<IModelSecurityConfig> = {},
): Promise<IModelScanResult> {
  const extension = path.extname(filePath).toLowerCase();

  // Check if this is a model file we should scan
  if (!isModelFileExtension(extension)) {
    return {
      filePath,
      fileExtension: extension,
      scannerType: "none",
      isSafe: true,
      findings: [],
      highestSeverity: null,
      scanDurationMs: 0,
      error: "Not a recognized model file format",
    };
  }

  // Route to appropriate scanner
  if (isSerializedFile(filePath)) {
    return scanSerializedFile(filePath);
  }

  if (isSafeTensorsFile(filePath)) {
    return scanSafeTensorsFile(filePath);
  }

  if (isH5File(filePath)) {
    return scanH5File(filePath);
  }

  // Fallback for other model files
  return {
    filePath,
    fileExtension: extension,
    scannerType: "unknown",
    isSafe: true,
    findings: [],
    highestSeverity: null,
    scanDurationMs: 0,
    error: "No scanner available for this format",
  };
}

/**
 * Scans multiple model files and aggregates results
 *
 * @param filePaths - Array of absolute file paths
 * @param config - Optional scanning configuration
 * @returns Aggregated scan summary
 */
export async function scanModelFiles(
  filePaths: string[],
  config: Partial<IModelSecurityConfig> = {},
): Promise<IModelSecurityScanSummary> {
  const startTime = Date.now();
  const mergedConfig = { ...DEFAULT_MODEL_SECURITY_CONFIG, ...config };

  // Filter to only model files
  const modelFiles = filePaths.filter((fp) => isModelFileExtension(path.extname(fp).toLowerCase()));

  // Filter by enabled extensions
  const enabledFiles = modelFiles.filter((fp) =>
    mergedConfig.enabledExtensions.includes(path.extname(fp).toLowerCase()),
  );

  // Scan all files
  const results: IModelScanResult[] = [];
  for (const filePath of enabledFiles) {
    const result = await scanModelFile(filePath, mergedConfig);
    results.push(result);
  }

  // Aggregate results
  const summary = aggregateResults(results);
  summary.totalScanDurationMs = Date.now() - startTime;

  return summary;
}

/**
 * Aggregates scan results into a summary
 */
function aggregateResults(results: IModelScanResult[]): IModelSecurityScanSummary {
  const summary: IModelSecurityScanSummary = {
    totalFilesScanned: results.length,
    unsafeFileCount: 0,
    safeFileCount: 0,
    totalFindings: 0,
    findingsBySeverity: {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
    },
    findingsByThreatType: {},
    fileResults: results,
    totalScanDurationMs: 0,
  };

  for (const result of results) {
    if (result.isSafe) {
      summary.safeFileCount++;
    } else {
      summary.unsafeFileCount++;
    }

    for (const finding of result.findings) {
      summary.totalFindings++;
      summary.findingsBySeverity[finding.severity]++;
      summary.findingsByThreatType[finding.threatType] =
        (summary.findingsByThreatType[finding.threatType] || 0) + 1;
    }

    summary.totalScanDurationMs += result.scanDurationMs;
  }

  return summary;
}

/**
 * Filters model files from a list of file paths
 *
 * @param filePaths - Array of file paths
 * @returns Only the model files
 */
export function filterModelFiles(filePaths: string[]): string[] {
  return filePaths.filter((fp) => isModelFileExtension(path.extname(fp).toLowerCase()));
}

/**
 * Gets the risk level for a model file
 *
 * @param filePath - Path to the model file
 * @returns Risk level or null if not a model file
 */
export function getModelFileRisk(filePath: string): SecuritySeverity | null {
  const extension = path.extname(filePath).toLowerCase();
  return getRiskLevelForExtension(extension);
}

/**
 * Checks if model security scanning should be performed on a file
 *
 * @param filePath - Path to check
 * @param config - Configuration
 * @returns Whether to scan this file
 */
export function shouldScanFile(
  filePath: string,
  config: Partial<IModelSecurityConfig> = {},
): boolean {
  const mergedConfig = { ...DEFAULT_MODEL_SECURITY_CONFIG, ...config };

  if (!mergedConfig.enabled) {
    return false;
  }

  const extension = path.extname(filePath).toLowerCase();
  return mergedConfig.enabledExtensions.includes(extension);
}
