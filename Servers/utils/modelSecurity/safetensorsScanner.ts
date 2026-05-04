/**
 * @fileoverview SafeTensors File Scanner
 *
 * Validates SafeTensors files for security. SafeTensors is designed to be
 * a safe format that cannot contain code, but we validate the header structure.
 *
 * @module utils/modelSecurity/safetensorsScanner
 */

import * as fs from "fs";
import * as path from "path";
import {
  IModelScanResult,
  ISafeTensorsValidationResult,
  IModelSecurityFinding,
} from "../../domain.layer/interfaces/i.modelSecurity";

const MAX_HEADER_SIZE = 100 * 1024 * 1024;
const MIN_HEADER_SIZE = 2;

export async function scanSafeTensorsFile(filePath: string): Promise<IModelScanResult> {
  const startTime = Date.now();
  const fileExtension = path.extname(filePath).toLowerCase();

  try {
    const validationResult = await validateSafeTensorsFile(filePath);
    const findings: IModelSecurityFinding[] = [];

    if (!validationResult.isValid) {
      findings.push({
        threatType: "polyglot_attack",
        threatName: "Invalid SafeTensors File",
        description: validationResult.error || "File does not conform to SafeTensors specification",
        severity: "medium",
        moduleName: "safetensors",
        operatorName: "header_validation",
        cweId: "CWE-434",
        cweName: "Unrestricted Upload of File with Dangerous Type",
        owaspMlId: "ML06",
        owaspMlName: "AI Supply Chain Attacks",
        filePath,
      });
    }

    for (const warning of validationResult.warnings) {
      findings.push({
        threatType: "dos_attack",
        threatName: "SafeTensors Warning",
        description: warning,
        severity: "low",
        moduleName: "safetensors",
        operatorName: "header_check",
        cweId: "CWE-400",
        cweName: "Uncontrolled Resource Consumption",
        owaspMlId: "ML06",
        owaspMlName: "AI Supply Chain Attacks",
        filePath,
      });
    }

    const highestSeverity =
      findings.length > 0
        ? findings.reduce(
            (max, f) => {
              const order = { critical: 0, high: 1, medium: 2, low: 3 };
              return order[f.severity] < order[max] ? f.severity : max;
            },
            "low" as "critical" | "high" | "medium" | "low",
          )
        : null;

    return {
      filePath,
      fileExtension,
      scannerType: "safetensors",
      isSafe: validationResult.isValid && validationResult.warnings.length === 0,
      findings,
      highestSeverity,
      scanDurationMs: Date.now() - startTime,
    };
  } catch (error) {
    return {
      filePath,
      fileExtension,
      scannerType: "safetensors",
      isSafe: false,
      findings: [],
      highestSeverity: null,
      scanDurationMs: Date.now() - startTime,
      error: error instanceof Error ? error.message : "Unknown error during scan",
    };
  }
}

async function validateSafeTensorsFile(filePath: string): Promise<ISafeTensorsValidationResult> {
  const warnings: string[] = [];
  const stats = await fs.promises.stat(filePath);

  if (stats.size < 8) {
    return {
      isValid: false,
      error: "File too small to be a valid SafeTensors file",
      warnings: [],
    };
  }

  const fd = await fs.promises.open(filePath, "r");
  try {
    const headerSizeBuffer = Buffer.alloc(8);
    await fd.read(headerSizeBuffer, 0, 8, 0);
    const headerSize = headerSizeBuffer.readBigUInt64LE();

    if (headerSize < MIN_HEADER_SIZE) {
      return { isValid: false, error: "Header size too small", warnings: [] };
    }

    if (headerSize > MAX_HEADER_SIZE) {
      return { isValid: false, error: "Header size exceeds maximum", warnings: [] };
    }

    const headerSizeNum = Number(headerSize);

    if (stats.size < 8 + headerSizeNum) {
      return { isValid: false, error: "File truncated", warnings: [] };
    }

    const headerBuffer = Buffer.alloc(headerSizeNum);
    await fd.read(headerBuffer, 0, headerSizeNum, 8);

    let header: Record<string, unknown>;
    try {
      header = JSON.parse(headerBuffer.toString("utf-8"));
    } catch {
      return { isValid: false, error: "Invalid JSON in header", warnings: [] };
    }

    if (typeof header !== "object" || header === null) {
      return { isValid: false, error: "Header is not a valid JSON object", warnings: [] };
    }

    let tensorCount = 0;
    for (const key of Object.keys(header)) {
      if (key === "__metadata__") continue;

      const tensorInfo = header[key] as Record<string, unknown>;
      if (!tensorInfo || typeof tensorInfo !== "object") {
        warnings.push("Invalid tensor entry: " + key);
        continue;
      }

      if (!("dtype" in tensorInfo)) warnings.push("Tensor missing dtype: " + key);
      if (!("shape" in tensorInfo)) warnings.push("Tensor missing shape: " + key);
      if (!("data_offsets" in tensorInfo)) warnings.push("Tensor missing data_offsets: " + key);

      tensorCount++;
    }

    const metadata = header.__metadata__ as Record<string, unknown> | undefined;
    if (metadata && typeof metadata === "object") {
      for (const [key, value] of Object.entries(metadata)) {
        if (typeof value === "string" && value.length > 10000) {
          warnings.push("Metadata contains unusually large value: " + key);
        }
      }
    }

    return { isValid: true, headerSize: headerSizeNum, tensorCount, warnings };
  } finally {
    await fd.close();
  }
}

export function isSafeTensorsFile(filePath: string): boolean {
  return path.extname(filePath).toLowerCase() === ".safetensors";
}
