/**
 * @fileoverview Serialized File Scanner
 *
 * Scans Python serialized files (.pkl, .pt, .pth, .bin) for malicious code
 * by analyzing the bytecode without executing it.
 *
 * Uses the pickleparser npm package to parse the file and extract
 * GLOBAL/REDUCE opcodes that reference potentially dangerous modules.
 *
 * @module utils/modelSecurity/serializedScanner
 */

import * as fs from "fs";
import * as path from "path";
import {
  checkDangerousOperator,
  getComplianceForThreatType,
  DangerousOperator,
} from "../../config/modelSecurityPatterns";
import {
  IModelSecurityFinding,
  IModelScanResult,
  ISerializedParseResult,
  IGlobalReference,
} from "../../domain.layer/interfaces/i.modelSecurity";

// Import pickleparser - handles the bytecode parsing
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pickleparser = require("pickleparser");

/**
 * Scans a serialized file for security threats
 *
 * @param filePath - Absolute path to the serialized file
 * @returns Scan result with findings
 */
export async function scanSerializedFile(filePath: string): Promise<IModelScanResult> {
  const startTime = Date.now();
  const fileExtension = path.extname(filePath).toLowerCase();

  try {
    // Read the file
    const fileBuffer = await fs.promises.readFile(filePath);

    // Parse the serialized content
    const parseResult = parseSerializedContent(fileBuffer);

    if (!parseResult.success) {
      return {
        filePath,
        fileExtension,
        scannerType: "serialized",
        isSafe: false,
        findings: [],
        highestSeverity: null,
        scanDurationMs: Date.now() - startTime,
        error: parseResult.error,
      };
    }

    // Analyze the globals for dangerous operators
    const findings = analyzeGlobals(parseResult.globals, filePath);

    // Determine highest severity
    const highestSeverity = getHighestSeverity(findings);

    return {
      filePath,
      fileExtension,
      scannerType: "serialized",
      isSafe: findings.length === 0,
      findings,
      highestSeverity,
      scanDurationMs: Date.now() - startTime,
    };
  } catch (error) {
    return {
      filePath,
      fileExtension,
      scannerType: "serialized",
      isSafe: false,
      findings: [],
      highestSeverity: null,
      scanDurationMs: Date.now() - startTime,
      error: error instanceof Error ? error.message : "Unknown error during scan",
    };
  }
}

/**
 * Parses serialized content to extract global references
 *
 * @param buffer - File content as Buffer
 * @returns Parse result with globals
 */
function parseSerializedContent(buffer: Buffer): ISerializedParseResult {
  try {
    // Use pickleparser to parse the file
    const parser = new pickleparser.Parser();
    const parsed = parser.parse(buffer);

    // Extract globals from the parsed structure
    const globals = extractGlobalsFromParsed(parsed, parser);

    return {
      success: true,
      globals,
      protocolVersion: detectProtocolVersion(buffer),
    };
  } catch (error) {
    // Fallback: try to extract globals manually from opcodes
    try {
      const globals = extractGlobalsFromOpcodes(buffer);
      return {
        success: true,
        globals,
        protocolVersion: detectProtocolVersion(buffer),
      };
    } catch (fallbackError) {
      return {
        success: false,
        globals: [],
        error: error instanceof Error ? error.message : "Failed to parse serialized content",
      };
    }
  }
}

/**
 * Extracts global references from parsed object
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractGlobalsFromParsed(parsed: unknown, parser: any): IGlobalReference[] {
  const globals: IGlobalReference[] = [];

  // The parser may have a getGlobals() method or we need to traverse
  if (parser.globals && Array.isArray(parser.globals)) {
    for (const global of parser.globals) {
      if (global.module && global.name) {
        globals.push({
          module: String(global.module),
          name: String(global.name),
          position: global.position || 0,
        });
      }
    }
  }

  // Also recursively search the parsed structure for __reduce__ patterns
  searchForReducePatterns(parsed, globals, new Set());

  return globals;
}

/**
 * Recursively searches for __reduce__ patterns in parsed objects
 */
function searchForReducePatterns(
  obj: unknown,
  globals: IGlobalReference[],
  visited: Set<unknown>,
): void {
  if (obj === null || obj === undefined || typeof obj !== "object") {
    return;
  }

  if (visited.has(obj)) {
    return;
  }
  visited.add(obj);

  const record = obj as Record<string, unknown>;

  // Check for __reduce__ or __reduce_ex__ which can contain callables
  if (record.__reduce__ || record.__reduce_ex__) {
    const reduce = record.__reduce__ || record.__reduce_ex__;
    if (Array.isArray(reduce) && reduce.length >= 2) {
      const callable = reduce[0];
      if (callable && typeof callable === "object") {
        const callableRecord = callable as Record<string, unknown>;
        if (callableRecord.__module__ && callableRecord.__name__) {
          globals.push({
            module: String(callableRecord.__module__),
            name: String(callableRecord.__name__),
            position: 0,
          });
        }
      }
    }
  }

  // Recurse into arrays and objects
  if (Array.isArray(obj)) {
    for (const item of obj) {
      searchForReducePatterns(item, globals, visited);
    }
  } else {
    for (const key of Object.keys(record)) {
      searchForReducePatterns(record[key], globals, visited);
    }
  }
}

/**
 * Fallback: Extract globals directly from opcode bytes
 * This handles cases where the parser fails
 */
function extractGlobalsFromOpcodes(buffer: Buffer): IGlobalReference[] {
  const globals: IGlobalReference[] = [];
  const content = buffer.toString("latin1");

  // GLOBAL opcode pattern: 'c' + module + '\n' + name + '\n'
  // This is a simplified pattern matching approach
  const globalPattern = /c([a-zA-Z_][a-zA-Z0-9_.]*)\n([a-zA-Z_][a-zA-Z0-9_]*)\n/g;
  let match;

  while ((match = globalPattern.exec(content)) !== null) {
    globals.push({
      module: match[1],
      name: match[2],
      position: match.index,
    });
  }

  // Also check for STACK_GLOBAL opcode (protocol 4+)
  // Pattern: '\x93' followed by string references
  // This is more complex but we can catch common patterns
  const stackGlobalModules = [
    "os",
    "sys",
    "subprocess",
    "socket",
    "builtins",
    "nt",
    "posix",
    "code",
    "runpy",
    "commands",
    "popen2",
    "webbrowser",
    "httplib",
    "urllib",
    "requests",
    "aiohttp",
    "ctypes",
    "marshal",
  ];

  for (const module of stackGlobalModules) {
    // Check if the module name appears in the binary
    if (content.includes(module)) {
      // Look for function names that commonly follow
      const dangerousFunctions = [
        "system",
        "popen",
        "exec",
        "eval",
        "spawn",
        "call",
        "run",
        "check_output",
        "Popen",
      ];
      for (const func of dangerousFunctions) {
        if (content.includes(func)) {
          // Check if both appear close together (within 100 bytes)
          const moduleIdx = content.indexOf(module);
          const funcIdx = content.indexOf(func);
          if (Math.abs(moduleIdx - funcIdx) < 100) {
            globals.push({
              module,
              name: func,
              position: Math.min(moduleIdx, funcIdx),
            });
          }
        }
      }
    }
  }

  return globals;
}

/**
 * Detects the protocol version from the file header
 */
function detectProtocolVersion(buffer: Buffer): number {
  if (buffer.length < 2) {
    return 0;
  }

  // Protocol 2+ files start with 0x80 followed by the version number
  if (buffer[0] === 0x80) {
    return buffer[1];
  }

  // Protocol 0 or 1 (no header)
  return 0;
}

/**
 * Analyzes global references for dangerous operators
 */
function analyzeGlobals(globals: IGlobalReference[], filePath: string): IModelSecurityFinding[] {
  const findings: IModelSecurityFinding[] = [];
  const seen = new Set<string>();

  for (const global of globals) {
    const key = `${global.module}.${global.name}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);

    const dangerousOp = checkDangerousOperator(global.module, global.name);
    if (dangerousOp) {
      const finding = createFinding(global, dangerousOp, filePath);
      findings.push(finding);
    }
  }

  return findings;
}

/**
 * Creates a security finding from a dangerous operator match
 */
function createFinding(
  global: IGlobalReference,
  dangerousOp: DangerousOperator,
  filePath: string,
): IModelSecurityFinding {
  // Determine threat type based on module
  const threatType = determineThreatType(global.module);
  const compliance = getComplianceForThreatType(threatType);

  return {
    threatType,
    threatName: getThreatName(threatType),
    description: dangerousOp.description,
    severity: dangerousOp.severity,
    moduleName: global.module,
    operatorName: global.name,
    cweId: compliance?.cweId || "CWE-502",
    cweName: compliance?.cweName || "Deserialization of Untrusted Data",
    owaspMlId: compliance?.owaspMlId || "ML06",
    owaspMlName: compliance?.owaspMlName || "AI Supply Chain Attacks",
    filePath,
    position: {
      offset: global.position,
      length: global.module.length + global.name.length + 1,
    },
  };
}

/**
 * Determines threat type based on module
 */
function determineThreatType(module: string): string {
  const networkModules = [
    "socket",
    "httplib",
    "http.client",
    "urllib",
    "urllib.request",
    "urllib2",
    "requests",
    "aiohttp",
    "webbrowser",
  ];
  const fileModules = ["shutil", "pathlib", "tensorflow.io", "tensorflow.io.gfile"];
  const codeExecModules = [
    "os",
    "subprocess",
    "sys",
    "runpy",
    "code",
    "commands",
    "popen2",
    "nt",
    "posix",
  ];

  if (networkModules.some((m) => module.toLowerCase().includes(m))) {
    return "network_access";
  }
  if (fileModules.some((m) => module.toLowerCase().includes(m))) {
    return "file_manipulation";
  }
  if (codeExecModules.some((m) => module.toLowerCase() === m)) {
    return "code_execution";
  }
  if (module === "builtins") {
    return "code_execution";
  }

  return "deserialization";
}

/**
 * Gets human-readable threat name
 */
function getThreatName(threatType: string): string {
  const names: Record<string, string> = {
    deserialization: "Deserialization Attack",
    code_execution: "Arbitrary Code Execution",
    network_access: "Unauthorized Network Access",
    file_manipulation: "File System Manipulation",
    lambda_injection: "Lambda Layer Injection",
    dos_attack: "Denial of Service",
    polyglot_attack: "Polyglot File Attack",
    unknown_operator: "Unknown Operator",
  };
  return names[threatType] || "Security Threat";
}

/**
 * Gets the highest severity from a list of findings
 */
function getHighestSeverity(
  findings: IModelSecurityFinding[],
): "critical" | "high" | "medium" | "low" | null {
  if (findings.length === 0) {
    return null;
  }

  const severityOrder = ["critical", "high", "medium", "low"] as const;

  for (const severity of severityOrder) {
    if (findings.some((f) => f.severity === severity)) {
      return severity;
    }
  }

  return "low";
}

/**
 * Checks if a file is a supported serialized format
 */
export function isSerializedFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return [".pkl", ".pickle", ".pt", ".pth", ".bin"].includes(ext);
}
