/**
 * @fileoverview H5/Keras Model Scanner
 *
 * Scans H5/HDF5 model files for security issues, particularly Lambda layers
 * that can contain arbitrary Python code.
 *
 * @module utils/modelSecurity/h5Scanner
 */

import * as fs from "fs";
import * as path from "path";
import {
  IModelScanResult,
  IH5ScanResult,
  ILambdaLayerInfo,
  IModelSecurityFinding,
} from "../../domain.layer/interfaces/i.modelSecurity";

// H5 file magic number
const H5_MAGIC = Buffer.from([0x89, 0x48, 0x44, 0x46, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * Scans an H5/Keras model file for security issues
 *
 * @param filePath - Absolute path to the H5 file
 * @returns Scan result with findings
 */
export async function scanH5File(filePath: string): Promise<IModelScanResult> {
  const startTime = Date.now();
  const fileExtension = path.extname(filePath).toLowerCase();

  try {
    const h5Result = await analyzeH5File(filePath);
    const findings: IModelSecurityFinding[] = [];

    if (!h5Result.success) {
      return {
        filePath,
        fileExtension,
        scannerType: "h5",
        isSafe: false,
        findings: [],
        highestSeverity: null,
        scanDurationMs: Date.now() - startTime,
        error: h5Result.error,
      };
    }

    // Check for Lambda layers (can contain arbitrary code)
    for (const lambda of h5Result.lambdaLayers) {
      findings.push({
        threatType: "lambda_injection",
        threatName: "Lambda Layer Injection",
        description:
          "Keras Lambda layer found which can contain arbitrary Python code: " + lambda.layerName,
        severity: "medium",
        moduleName: "keras.layers",
        operatorName: "Lambda",
        cweId: "CWE-94",
        cweName: "Improper Control of Generation of Code",
        owaspMlId: "ML06",
        owaspMlName: "AI Supply Chain Attacks",
        filePath,
      });
    }

    // Check for custom objects
    for (const customObj of h5Result.customObjects) {
      findings.push({
        threatType: "deserialization",
        threatName: "Custom Object Detected",
        description: "Custom object found that may contain code: " + customObj,
        severity: "low",
        moduleName: "keras",
        operatorName: "custom_objects",
        cweId: "CWE-502",
        cweName: "Deserialization of Untrusted Data",
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
      scannerType: "h5",
      isSafe: findings.length === 0,
      findings,
      highestSeverity,
      scanDurationMs: Date.now() - startTime,
    };
  } catch (error) {
    return {
      filePath,
      fileExtension,
      scannerType: "h5",
      isSafe: false,
      findings: [],
      highestSeverity: null,
      scanDurationMs: Date.now() - startTime,
      error: error instanceof Error ? error.message : "Unknown error during scan",
    };
  }
}

/**
 * Analyzes an H5 file for Lambda layers and custom objects
 */
async function analyzeH5File(filePath: string): Promise<IH5ScanResult> {
  const lambdaLayers: ILambdaLayerInfo[] = [];
  const customObjects: string[] = [];

  try {
    // Verify it's an H5 file
    const fd = await fs.promises.open(filePath, "r");
    try {
      const magicBuffer = Buffer.alloc(8);
      await fd.read(magicBuffer, 0, 8, 0);

      if (!magicBuffer.equals(H5_MAGIC)) {
        return {
          success: false,
          lambdaLayers: [],
          customObjects: [],
          error: "Not a valid HDF5 file (invalid magic number)",
        };
      }
    } finally {
      await fd.close();
    }

    // Read file content to search for Lambda patterns
    // Note: For production, we would use a proper H5 library
    // This is a simplified pattern-matching approach
    const content = await fs.promises.readFile(filePath);
    const contentStr = content.toString("latin1");

    // Search for Lambda layer patterns in Keras model config
    const lambdaPatterns = [
      /"class_name":\s*"Lambda"/gi,
      /Lambda\s*\(/gi,
      /"function":\s*"[^"]+"/gi,
      /keras\.layers\.Lambda/gi,
      /tensorflow\.keras\.layers\.Lambda/gi,
    ];

    for (const pattern of lambdaPatterns) {
      const matches = contentStr.match(pattern);
      if (matches) {
        for (let i = 0; i < matches.length; i++) {
          lambdaLayers.push({
            layerName: "lambda_" + (i + 1),
            configPath: "model_config",
          });
        }
        break; // Only count once
      }
    }

    // Search for custom object patterns
    const customObjectPatterns = [/"custom_objects":\s*\{[^}]+\}/gi, /custom_objects\s*=/gi];

    for (const pattern of customObjectPatterns) {
      const matches = contentStr.match(pattern);
      if (matches) {
        for (const match of matches) {
          // Extract object names from the match
          const nameMatch = match.match(/"(\w+)":/g);
          if (nameMatch) {
            for (const name of nameMatch) {
              const cleanName = name.replace(/["':]/g, "");
              if (!customObjects.includes(cleanName)) {
                customObjects.push(cleanName);
              }
            }
          } else {
            customObjects.push("custom_object");
          }
        }
      }
    }

    // Detect model format
    let modelFormat = "unknown";
    if (contentStr.includes("keras")) {
      modelFormat = "keras";
    } else if (contentStr.includes("tensorflow")) {
      modelFormat = "tensorflow";
    }

    return {
      success: true,
      modelFormat,
      lambdaLayers,
      customObjects,
    };
  } catch (error) {
    return {
      success: false,
      lambdaLayers: [],
      customObjects: [],
      error: error instanceof Error ? error.message : "Failed to analyze H5 file",
    };
  }
}

/**
 * Checks if a file is an H5/HDF5 file
 */
export function isH5File(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return [".h5", ".keras", ".hdf5"].includes(ext);
}
