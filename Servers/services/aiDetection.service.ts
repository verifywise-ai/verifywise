/**
 * @fileoverview AI Detection Service Layer
 *
 * Business logic for AI Detection operations including:
 * - Repository URL validation
 * - Scan creation and management
 * - Repository scanning with pattern matching
 * - Finding aggregation and storage
 *
 * Follows the established service layer pattern with ServiceContext.
 *
 * @module services/aiDetection
 */

import { sequelize } from "../database/db";
import { spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import logger from "../utils/logger/fileLogger";
import {
  IScan,
  IServiceContext,
  ICreateScanInput,
  ICreateFindingInput,
  IFilePath,
  IParsedGitHubUrl,
  ScanStatus,
  IScanResponse,
  IFindingsResponse,
  IScansResponse,
  IScanStatusResponse,
  GovernanceStatus,
  IUpdateGovernanceStatusResponse,
} from "../domain.layer/interfaces/i.aiDetection";
import {
  ValidationException,
  NotFoundException,
  BusinessLogicException,
  ExternalServiceException,
  ForbiddenException,
} from "../domain.layer/exceptions/custom.exception";
import {
  createScanQuery,
  getScanByIdQuery,
  getScanWithUserQuery,
  updateScanProgressQuery,
  getScansListQuery,
  deleteScanQuery,
  getActiveScanForRepoQuery,
  createFindingsBatchQuery,
  createModelSecurityFindingsBatchQuery,
  getFindingsForScanQuery,
  getAllFindingsForExportQuery,
  getFindingsSummaryQuery,
  updateFindingGovernanceStatusQuery,
  getGovernanceSummaryQuery,
  getAIDetectionStatsQuery,
  IAIDetectionStats,
} from "../utils/aiDetection.utils";
import {
  AI_DETECTION_PATTERNS,
  CODE_EXTENSIONS,
  DEPENDENCY_FILES,
  SKIP_DIRECTORIES,
  DetectionPattern,
  calculateRiskLevel,
} from "../config/aiDetectionPatterns";
import {
  getProviderFromExtension,
  severityToConfidence,
  getDocumentationUrl,
  formatFindingName,
  generateFindingDescription,
  getThreatCategory,
} from "../utils/modelSecurity";
import {
  getDecryptedGitHubToken,
  updateGitHubTokenLastUsed,
} from "../utils/githubToken.utils";
import {
  IModelSecurityFinding,
  ICreateModelSecurityFindingInput,
  IModelSecurityFindingRecord,
} from "../domain.layer/interfaces/i.modelSecurity";
import { QueryTypes } from "sequelize";
import { isModelFileExtension } from "../config/modelSecurityPatterns";
import { getLicenseForFinding } from "../utils/licenseDetection.utils";
import {
  cacheAside,
  buildOrgCacheKey,
  deleteByPattern,
  CACHE_KEYS,
} from "../utils/cache.utils";
import { calculateAndStoreRiskScore } from "./aiDetection/riskScoring";
import { scanFileForVulnerabilityIndicators, buildAnalysisContext, VulnerabilityCandidate } from "./aiDetection/vulnerabilityPreFilter";
import { analyzeVulnerabilities } from "./aiDetection/vulnerabilityAnalyzer";
import { getRiskScoringConfigQuery } from "../utils/aiDetectionRiskScoring.utils";

// ============================================================================
// Types
// ============================================================================

/**
 * Maximum number of concurrent scans to track (prevents memory exhaustion)
 */
const MAX_CONCURRENT_SCANS = 100;

/**
 * Maximum age for progress entries before cleanup (5 minutes)
 */
const PROGRESS_MAX_AGE_MS = 5 * 60 * 1000;

/**
 * Progress entry with timestamp for cleanup
 */
interface ScanProgressEntry {
  status: ScanStatus;
  progress: number;
  currentFile?: string;
  filesScanned: number;
  totalFiles?: number;
  findingsCount: number;
  abortController?: AbortController;
  createdAt: number;
  startedAt?: Date;
  errorMessage?: string;
}

/**
 * In-memory progress tracking for active scans
 * Key: scanId, Value: progress state with timestamp
 */
const scanProgressMap = new Map<number, ScanProgressEntry>();

/**
 * Update the linked repository's last_scan fields after scan completion
 */
async function updateLinkedRepositoryLastScan(
  scanId: number,
  scanStatus: string,
  organizationId: number
): Promise<void> {
  try {
    const scan = await getScanByIdQuery(scanId, organizationId);
    if (scan?.repository_id) {
      const { updateRepositoryLastScanQuery } = require("../utils/aiDetectionRepository.utils");
      await updateRepositoryLastScanQuery(scan.repository_id, scanId, scanStatus, organizationId);
    }
  } catch (error) {
    logger.error(`Failed to update repository last scan for scan ${scanId}:`, error);
  }
}

/**
 * Clean up stale progress entries that are older than MAX_AGE
 * This prevents memory leaks from orphaned entries
 */
function cleanupStaleProgressEntries(): void {
  const now = Date.now();
  for (const [scanId, entry] of scanProgressMap.entries()) {
    // Remove completed/failed/cancelled entries older than max age
    const isTerminal = ["completed", "failed", "cancelled"].includes(entry.status);
    const isStale = now - entry.createdAt > PROGRESS_MAX_AGE_MS;

    if (isTerminal && isStale) {
      scanProgressMap.delete(scanId);
    }
  }
}

// Run cleanup every minute
setInterval(cleanupStaleProgressEntries, 60000);

/**
 * File item from local file system scan
 */
interface LocalFileItem {
  path: string;
  fullPath: string;
  size: number;
}

// ============================================================================
// Git Clone Helpers
// ============================================================================

/**
 * Clone repository timeout (2 minutes)
 */
const CLONE_TIMEOUT_MS = 120000;

/**
 * Maximum repository size allowed for scanning (2.5 GB in KB - GitHub API returns size in KB)
 */
const MAX_REPO_SIZE_KB = 2.5 * 1024 * 1024; // 2.5 GB

/**
 * Check repository size before cloning
 * @param owner - Repository owner
 * @param repo - Repository name
 * @param githubToken - Optional GitHub token for private repositories
 * @throws ValidationException if repo is too large
 */
async function checkRepositorySize(
  owner: string,
  repo: string,
  githubToken?: string
): Promise<void> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "VerifyWise-Scanner",
  };

  if (githubToken) {
    headers.Authorization = `Bearer ${githubToken}`;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      // Don't fail here - let the clone handle auth/not-found errors
      // Just skip the size check if we can't get repo info
      logger.warn(`Could not fetch repo info for size check: ${response.status} ${response.statusText}`);
      return;
    }

    const data = await response.json();
    const sizeKB = data.size || 0;
    const sizeGB = (sizeKB / 1024 / 1024).toFixed(2);

    if (sizeKB > MAX_REPO_SIZE_KB) {
      throw new ValidationException(
        `Repository size (${sizeGB} GB) exceeds the maximum allowed size of 2.5 GB. Please scan a smaller repository.`,
        "repository_url"
      );
    }
  } catch (error) {
    // Re-throw validation errors (repo too large)
    if (error instanceof ValidationException) {
      throw error;
    }
    // Log and skip size check on network/timeout errors
    logger.warn(`Size check failed, proceeding with clone: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

/**
 * Clone a GitHub repository to a temporary directory
 *
 * @param owner - Repository owner
 * @param repo - Repository name
 * @param signal - Optional abort signal
 * @param githubToken - Optional GitHub token for private repositories
 * @returns Path to cloned repository
 */
async function cloneRepository(
  owner: string,
  repo: string,
  signal?: AbortSignal,
  githubToken?: string
): Promise<string> {
  if (signal?.aborted) {
    throw new BusinessLogicException("Scan was cancelled");
  }

  // Create temp directory
  const tempDir = path.join(os.tmpdir(), `verifywise-scan-${Date.now()}-${Math.random().toString(36).substring(7)}`);
  await fs.promises.mkdir(tempDir, { recursive: true });

  // Build repository URL - use authenticated URL if token provided
  let repoUrl: string;
  if (githubToken) {
    // Use token in URL for authentication (git will use this for HTTPS auth)
    repoUrl = `https://${githubToken}@github.com/${owner}/${repo}.git`;
  } else {
    repoUrl = `https://github.com/${owner}/${repo}.git`;
  }

  try {
    // Clone with depth 1 (shallow clone - only latest commit)
    // Use spawn to get the child process so we can kill it on abort
    const clonePromise = new Promise<void>((resolve, reject) => {
      const gitProcess = spawn("git", ["clone", "--depth", "1", repoUrl, tempDir]);

      let stderr = "";
      gitProcess.stderr.on("data", (data: Buffer) => {
        stderr += data.toString();
      });

      // Handle abort signal - kill the git process
      const abortHandler = () => {
        gitProcess.kill("SIGTERM");
        reject(new BusinessLogicException("Scan was cancelled"));
      };

      if (signal) {
        signal.addEventListener("abort", abortHandler, { once: true });
      }

      // Set timeout
      const timeout = setTimeout(() => {
        gitProcess.kill("SIGTERM");
        reject(new Error("timeout"));
      }, CLONE_TIMEOUT_MS);

      gitProcess.on("close", (code: number) => {
        clearTimeout(timeout);
        if (signal) {
          signal.removeEventListener("abort", abortHandler);
        }

        if (code === 0) {
          resolve();
        } else {
          reject(new Error(stderr || `git clone exited with code ${code}`));
        }
      });

      gitProcess.on("error", (err: Error) => {
        clearTimeout(timeout);
        if (signal) {
          signal.removeEventListener("abort", abortHandler);
        }
        reject(err);
      });
    });

    await clonePromise;
    return tempDir;
  } catch (error) {
    // Clean up on failure (including cancellation)
    await cleanupClonedRepo(tempDir);

    if (error instanceof BusinessLogicException) {
      throw error; // Re-throw cancellation
    }

    if (error instanceof Error) {
      // Check for authentication errors
      if (error.message.includes("Authentication failed") ||
          error.message.includes("could not read Username") ||
          error.message.includes("403")) {
        throw new ValidationException(
          githubToken
            ? "Authentication failed. The token may be invalid or expired, or lacks permission for this repository."
            : "Repository not found or is private. Configure a GitHub token in Settings to scan private repositories.",
          "repository_url"
        );
      }
      if (error.message.includes("not found") || error.message.includes("Repository not found")) {
        throw new ValidationException(
          githubToken
            ? "Repository not found. Check the URL and ensure your token has access to this repository."
            : "Repository not found or is private. Configure a GitHub token in Settings to scan private repositories.",
          "repository_url"
        );
      }
      if (error.message.includes("timeout")) {
        throw new ExternalServiceException(
          "Repository clone timed out. The repository may be too large.",
          "Git"
        );
      }
    }
    throw new ExternalServiceException(
      `Failed to clone repository: ${error instanceof Error ? error.message : "Unknown error"}`,
      "Git"
    );
  }
}

/**
 * Clean up cloned repository directory
 */
async function cleanupClonedRepo(repoPath: string): Promise<void> {
  try {
    await fs.promises.rm(repoPath, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

/**
 * Get all files in cloned repository recursively
 */
async function getRepositoryFiles(
  repoPath: string,
  signal?: AbortSignal
): Promise<LocalFileItem[]> {
  const files: LocalFileItem[] = [];

  async function scanDirectory(dirPath: string, relativePath: string = ""): Promise<void> {
    if (signal?.aborted) {
      throw new BusinessLogicException("Scan was cancelled");
    }

    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      const relPath = relativePath ? path.join(relativePath, entry.name) : entry.name;

      if (entry.isDirectory()) {
        // Skip .git directory and other skip directories
        if (entry.name === ".git" || SKIP_DIRECTORIES.includes(entry.name)) {
          continue;
        }
        await scanDirectory(fullPath, relPath);
      } else if (entry.isFile()) {
        try {
          const stat = await fs.promises.stat(fullPath);
          files.push({
            path: relPath,
            fullPath,
            size: stat.size,
          });
        } catch {
          // Skip files we can't stat
        }
      }
    }
  }

  await scanDirectory(repoPath);
  return files;
}

/**
 * Read file content from disk
 */
async function readFileContent(filePath: string): Promise<string> {
  return fs.promises.readFile(filePath, "utf-8");
}

/**
 * Read file content as buffer (for binary files like model files)
 */
async function readFileBuffer(filePath: string): Promise<Buffer> {
  return fs.promises.readFile(filePath);
}

// ============================================================================
// URL Parsing and Validation
// ============================================================================

/**
 * Maximum allowed length for repository URL input
 */
const MAX_URL_LENGTH = 500;

/**
 * Maximum allowed length for owner/repo names (GitHub limit is 100)
 */
const MAX_NAME_LENGTH = 100;

/**
 * Allowed characters in GitHub owner/repo names
 * GitHub allows: alphanumeric, hyphens, underscores, periods
 */
const VALID_NAME_PATTERN = /^[a-zA-Z0-9._-]+$/;

/**
 * Parse GitHub URL into owner and repo
 *
 * @param url - GitHub repository URL
 * @returns Parsed owner and repo
 * @throws {ValidationException} If URL is invalid, too long, or contains invalid characters
 */
export function parseGitHubUrl(url: string): IParsedGitHubUrl {
  // Validate input is a string
  if (typeof url !== "string") {
    throw new ValidationException(
      "Repository URL must be a string",
      "repository_url"
    );
  }

  // Validate URL length to prevent abuse
  if (url.length > MAX_URL_LENGTH) {
    throw new ValidationException(
      `Repository URL is too long (max ${MAX_URL_LENGTH} characters)`,
      "repository_url"
    );
  }

  // Clean the URL
  const cleanUrl = url.trim().replace(/\.git$/, "").replace(/\/$/, "");

  // Try HTTPS format: https://github.com/owner/repo
  const httpsMatch = cleanUrl.match(
    /^https?:\/\/github\.com\/([^\/]+)\/([^\/]+)/i
  );
  if (httpsMatch) {
    return validateParsedNames(httpsMatch[1], httpsMatch[2]);
  }

  // Try SSH format: git@github.com:owner/repo
  const sshMatch = cleanUrl.match(/^git@github\.com:([^\/]+)\/([^\/]+)/i);
  if (sshMatch) {
    return validateParsedNames(sshMatch[1], sshMatch[2]);
  }

  // Try shorthand: owner/repo
  const shortMatch = cleanUrl.match(/^([^\/]+)\/([^\/]+)$/);
  if (shortMatch) {
    return validateParsedNames(shortMatch[1], shortMatch[2]);
  }

  throw new ValidationException(
    "Invalid GitHub URL format. Please provide a valid public GitHub repository URL.",
    "repository_url"
  );
}

/**
 * Validate parsed owner and repo names
 */
function validateParsedNames(owner: string, repo: string): IParsedGitHubUrl {
  // Check length
  if (owner.length > MAX_NAME_LENGTH || repo.length > MAX_NAME_LENGTH) {
    throw new ValidationException(
      `Owner/repository name is too long (max ${MAX_NAME_LENGTH} characters)`,
      "repository_url"
    );
  }

  // Check for valid characters
  if (!VALID_NAME_PATTERN.test(owner) || !VALID_NAME_PATTERN.test(repo)) {
    throw new ValidationException(
      "Owner/repository name contains invalid characters",
      "repository_url"
    );
  }

  return { owner, repo };
}


// ============================================================================
// Pattern Matching
// ============================================================================

/**
 * Check if file should be scanned
 */
function shouldScanFile(filePath: string): "code" | "dependency" | false {
  const fileName = filePath.split("/").pop() || "";

  // Check if in skip directory
  for (const skipDir of SKIP_DIRECTORIES) {
    if (filePath.includes(`/${skipDir}/`) || filePath.startsWith(`${skipDir}/`)) {
      return false;
    }
  }

  // Check for dependency files
  if (DEPENDENCY_FILES.includes(fileName)) {
    return "dependency";
  }

  // Check for code files
  const ext = "." + fileName.split(".").pop()?.toLowerCase();
  if (CODE_EXTENSIONS.includes(ext)) {
    return "code";
  }

  return false;
}

/**
 * Extract surrounding lines for code context (3 lines before and after by default)
 */
function getCodeContext(lines: string[], matchLineIndex: number, contextLines: number = 3, maskSecrets: boolean = false): string {
  const startLine = Math.max(0, matchLineIndex - contextLines);
  const endLine = Math.min(lines.length - 1, matchLineIndex + contextLines);

  const contextParts: string[] = [];
  for (let i = startLine; i <= endLine; i++) {
    const lineNum = i + 1; // 1-indexed line number
    const prefix = i === matchLineIndex ? "→ " : "  ";
    let lineContent = lines[i].substring(0, 120); // Truncate very long lines

    // Mask secrets in the matched line if requested
    if (maskSecrets && i === matchLineIndex) {
      lineContent = maskSecret(lineContent);
    }

    contextParts.push(`${prefix}${lineNum.toString().padStart(4, " ")} │ ${lineContent}`);
  }

  return contextParts.join("\n");
}

/**
 * Common placeholder patterns used in documentation and example files
 * These should not be flagged as actual secrets
 */
const PLACEHOLDER_PATTERNS = [
  /your[_-]?(api[_-]?)?key[_-]?here/i,
  /your[_-]?key[_-]?here/i,
  /your[_-]?token[_-]?here/i,
  /your[_-]?secret[_-]?here/i,
  /replace[_-]?with[_-]?your/i,
  /insert[_-]?your[_-]?key/i,
  /add[_-]?your[_-]?key/i,
  /xxx+/i,
  /placeholder/i,
  /example[_-]?key/i,
  /test[_-]?key/i,
  /dummy[_-]?key/i,
  /fake[_-]?key/i,
  /sample[_-]?key/i,
  /^["']?sk-[x]{10,}["']?$/i, // sk-xxxxxxxxxxxx
  /^["']?your[_-]?/i,
  /\.\.\./,  // Ellipsis placeholder
  /<[^>]+>/,  // <your-key-here> style placeholders
];

/**
 * Patterns that indicate this is NOT a secret (import statements, dependency declarations, etc.)
 * These are code structure patterns that should never be flagged as secrets
 */
const NOT_SECRET_PATTERNS = [
  // Python/JS import statements
  /^import\s+/,
  /^from\s+\w+\s+import/,
  /require\s*\(/,
  // Dependency declarations (requirements.txt, package.json)
  /^[a-zA-Z][a-zA-Z0-9_-]*[=<>~!]=?\d/,  // package>=1.0.0, package==1.0.0
  /^\s*["'][a-zA-Z@][^"']*["']\s*:\s*["']\^?~?[\d*]/,  // "package": "^1.0.0"
  // Function/method calls that aren't assignments
  /^\s*\w+\s*=\s*\w+\.\w+\(/,  // result = client.method(
  /^\s*return\s+/,
  /^\s*await\s+/,
  // Comments
  /^\s*#/,
  /^\s*\/\//,
  /^\s*\/\*/,
  /^\s*\*/,
];

/**
 * Check if a matched line contains a placeholder value rather than a real secret
 */
function isPlaceholderSecret(line: string): boolean {
  return PLACEHOLDER_PATTERNS.some(pattern => pattern.test(line));
}

/**
 * Check if a line is definitely not a secret (import, dependency, etc.)
 */
function isDefinitelyNotSecret(line: string): boolean {
  return NOT_SECRET_PATTERNS.some(pattern => pattern.test(line.trim()));
}

/**
 * Scan file content for AI patterns
 */
function scanFileForPatterns(
  content: string,
  fileType: "code" | "dependency"
): Array<{
  pattern: DetectionPattern;
  lineNumber: number | null;
  matchedText: string;
  findingType: "library" | "api_call" | "secret" | "model_ref" | "rag_component" | "agent";
  extractedModelName?: string; // Extracted model name from capturing group (for model_ref findings)
  confidence?: "high" | "medium" | "low"; // Override pattern's default confidence
}> {
  const matches: Array<{
    pattern: DetectionPattern;
    lineNumber: number | null;
    matchedText: string;
    findingType: "library" | "api_call" | "secret" | "model_ref" | "rag_component" | "agent";
    extractedModelName?: string;
    confidence?: "high" | "medium" | "low";
  }> = [];

  const lines = content.split("\n");

  for (const category of AI_DETECTION_PATTERNS) {
    for (const pattern of category.patterns) {
      // Check imports/dependencies (library findings)
      const patternsToCheck =
        fileType === "code" ? pattern.patterns.imports : pattern.patterns.dependencies;

      if (patternsToCheck) {
        for (const regex of patternsToCheck) {
          // Search line by line for code files to get line numbers
          if (fileType === "code") {
            for (let i = 0; i < lines.length; i++) {
              const line = lines[i];
              const match = line.match(regex);
              if (match) {
                matches.push({
                  pattern,
                  lineNumber: i + 1,
                  matchedText: getCodeContext(lines, i),
                  findingType: "library",
                });
                break; // One match per pattern per file is enough
              }
            }
          } else {
            // For dependency files, check entire content
            const match = content.match(regex);
            if (match) {
              matches.push({
                pattern,
                lineNumber: null,
                matchedText: match[0].substring(0, 100),
                findingType: "library",
              });
            }
          }
        }
      }

      // Check API calls (only for code files)
      if (fileType === "code" && pattern.patterns.apiCalls) {
        for (const regex of pattern.patterns.apiCalls) {
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const match = line.match(regex);
            if (match) {
              matches.push({
                pattern,
                lineNumber: i + 1,
                matchedText: getCodeContext(lines, i),
                findingType: "api_call",
              });
              break; // One match per pattern per file is enough
            }
          }
        }
      }

      // Check hardcoded secrets (only for code files)
      if (fileType === "code" && pattern.patterns.secrets) {
        for (const regex of pattern.patterns.secrets) {
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const match = line.match(regex);
            if (match) {
              // Skip placeholder values (e.g., your_key_here, xxx, <your-api-key>)
              if (isPlaceholderSecret(line)) {
                continue;
              }
              // Skip lines that are clearly not secrets (imports, dependencies, function calls)
              if (isDefinitelyNotSecret(line)) {
                continue;
              }
              // Use code context with secret masking enabled
              matches.push({
                pattern,
                lineNumber: i + 1,
                matchedText: getCodeContext(lines, i, 3, true), // maskSecrets = true
                findingType: "secret",
              });
              break; // One match per pattern per file is enough
            }
          }
        }
      }

      // Check model references (Hugging Face models, etc.) - only for code files
      // Extract model names from capturing groups for better identification
      if (fileType === "code" && pattern.patterns.modelRefs) {
        for (const regex of pattern.patterns.modelRefs) {
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const match = line.match(regex);
            if (match) {
              // Extract model name from first capturing group if present
              const extractedModel = match[1] || null;

              // Determine confidence based on pattern specificity
              // - Explicit from_pretrained/pipeline calls are high confidence
              // - Generic model ID patterns are medium confidence
              const isExplicitApiCall = /from_pretrained|pipeline|AutoModel|AutoTokenizer|ollama\.(chat|generate|pull)|ChatOpenAI|ChatAnthropic|GenerativeModel/i.test(match[0]);
              const confidence: "high" | "medium" | "low" = isExplicitApiCall ? "high" : "medium";

              matches.push({
                pattern,
                lineNumber: i + 1,
                matchedText: getCodeContext(lines, i),
                findingType: "model_ref",
                extractedModelName: extractedModel || undefined,
                confidence,
              });
              break; // One match per pattern per file is enough
            }
          }
        }
      }

      // Check RAG pipeline components (vector DBs, embeddings, etc.) - only for code files
      if (fileType === "code" && pattern.patterns.ragPatterns) {
        for (const regex of pattern.patterns.ragPatterns) {
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const match = line.match(regex);
            if (match) {
              matches.push({
                pattern,
                lineNumber: i + 1,
                matchedText: getCodeContext(lines, i),
                findingType: "rag_component",
              });
              break; // One match per pattern per file is enough
            }
          }
        }
      }

      // Check AI agent patterns (LangChain agents, MCP, etc.) - only for code files
      if (fileType === "code" && pattern.patterns.agentPatterns) {
        for (const regex of pattern.patterns.agentPatterns) {
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const match = line.match(regex);
            if (match) {
              matches.push({
                pattern,
                lineNumber: i + 1,
                matchedText: getCodeContext(lines, i),
                findingType: "agent",
              });
              break; // One match per pattern per file is enough
            }
          }
        }
      }
    }
  }

  return matches;
}

/**
 * Mask a secret to avoid exposing full value
 * Shows first 4 and last 4 characters with asterisks in between
 */
function maskSecret(secret: string): string {
  if (secret.length <= 12) {
    // Very short secrets - show first 2 and mask rest
    return secret.substring(0, 2) + "*".repeat(secret.length - 2);
  }
  // Show first 4 and last 4 characters
  return secret.substring(0, 4) + "*".repeat(8) + secret.substring(secret.length - 4);
}
/**
 * Scan model file content for security threats
 * This works with content retrieved from GitHub API
 *
 * @param content - File content as string (may be base64 encoded for binary files)
 * @param filePath - File path for logging
 * @param extension - File extension
 * @returns Scan result with security findings
 */
async function scanModelFileContent(
  content: string,
  filePath: string,
  extension: string
): Promise<{ findings: IModelSecurityFinding[] }> {
  const findings: IModelSecurityFinding[] = [];

  try {
    // For serialized files (.pkl, .pt, .pth, .bin), we need to analyze the content
    // The content from GitHub API may be base64 encoded
    let buffer: Buffer;
    try {
      // Try to decode as base64 first (GitHub returns binary files as base64)
      buffer = Buffer.from(content, "base64");
    } catch {
      // If not base64, use as-is
      buffer = Buffer.from(content, "utf-8");
    }

    // Use pattern matching on the decoded content to find dangerous patterns
    const contentStr = buffer.toString("latin1");

    // Import the dangerous operator check from model security patterns
    const { checkDangerousOperator, getComplianceForThreatType } = await import(
      "../config/modelSecurityPatterns"
    );

    // Common dangerous patterns in serialized files
    // GLOBAL opcode: 'c' + module + '\n' + name + '\n'
    const globalPattern = /c([a-zA-Z_][a-zA-Z0-9_.]*)\n([a-zA-Z_][a-zA-Z0-9_]*)\n/g;
    let match;

    while ((match = globalPattern.exec(contentStr)) !== null) {
      const moduleName = match[1];
      const operatorName = match[2];

      const dangerousOp = checkDangerousOperator(moduleName, operatorName);
      if (dangerousOp) {
        const threatType = determineThreatTypeFromModule(moduleName);
        const compliance = getComplianceForThreatType(threatType);

        findings.push({
          threatType,
          threatName: getThreatNameFromType(threatType),
          description: dangerousOp.description,
          severity: dangerousOp.severity,
          moduleName,
          operatorName,
          cweId: compliance?.cweId || "CWE-502",
          cweName: compliance?.cweName || "Deserialization of Untrusted Data",
          owaspMlId: compliance?.owaspMlId || "ML06",
          owaspMlName: compliance?.owaspMlName || "AI Supply Chain Attacks",
          filePath,
          position: { offset: match.index, length: match[0].length },
        });
      }
    }

    // Also check for Lambda layers in H5 files
    if ([".h5", ".keras", ".hdf5"].includes(extension)) {
      const lambdaPatterns = [
        /"class_name":\s*"Lambda"/gi,
        /keras\.layers\.Lambda/gi,
      ];

      for (const pattern of lambdaPatterns) {
        if (pattern.test(contentStr)) {
          findings.push({
            threatType: "lambda_injection",
            threatName: "Lambda Layer Injection",
            description: "Keras Lambda layer detected which can contain arbitrary Python code",
            severity: "medium",
            moduleName: "keras.layers",
            operatorName: "Lambda",
            cweId: "CWE-94",
            cweName: "Improper Control of Generation of Code",
            owaspMlId: "ML06",
            owaspMlName: "AI Supply Chain Attacks",
            filePath,
          });
          break;
        }
      }
    }
  } catch (error) {
    // Silently continue - model file scan failures shouldn't fail the entire scan
    // Error is expected for corrupted or incompatible model files
  }

  return { findings };
}

/**
 * Determine threat type from module name
 */
function determineThreatTypeFromModule(module: string): string {
  const networkModules = ["socket", "httplib", "urllib", "requests", "aiohttp", "webbrowser"];
  const fileModules = ["shutil", "pathlib", "tensorflow.io"];
  const codeRunModules = ["os", "subprocess", "sys", "runpy", "code", "commands", "nt", "posix"];

  if (networkModules.some((m) => module.toLowerCase().includes(m))) return "network_access";
  if (fileModules.some((m) => module.toLowerCase().includes(m))) return "file_manipulation";
  if (codeRunModules.some((m) => module.toLowerCase() === m)) return "code_run";
  if (module === "builtins") return "code_run";

  return "deserialization";
}

/**
 * Get human-readable threat name from type
 */
function getThreatNameFromType(threatType: string): string {
  const names: Record<string, string> = {
    deserialization: "Deserialization Attack",
    code_run: "Arbitrary Code Run",
    network_access: "Unauthorized Network Access",
    file_manipulation: "File System Manipulation",
    lambda_injection: "Lambda Layer Injection",
  };
  return names[threatType] || "Security Threat";
}

// ============================================================================
// Scan Operations
// ============================================================================

/**
 * Start a new repository scan
 *
 * @param repositoryUrl - GitHub repository URL
 * @param ctx - Service context
 * @returns Created scan
 * @throws {ValidationException} If URL is invalid or repo is private
 * @throws {BusinessLogicException} If scan already in progress
 */
export async function startScan(
  repositoryUrl: string,
  ctx: IServiceContext,
  repoLinkOptions?: { repositoryId?: number; triggeredByType?: string }
): Promise<IScan> {
  // Parse and validate URL
  const { owner, repo } = parseGitHubUrl(repositoryUrl);

  // Note: Repository validation now happens during clone
  // The cloneRepository function will throw if repo doesn't exist or is private

  // Check for existing active scan
  const activeScan = await getActiveScanForRepoQuery(owner, repo, ctx.organizationId);
  if (activeScan) {
    throw new BusinessLogicException(
      `A scan is already in progress for ${owner}/${repo}. Please wait for it to complete.`
    );
  }

  // Auto-link to repository registry if not explicitly provided
  let repositoryId = repoLinkOptions?.repositoryId ?? null;
  let triggeredByType = repoLinkOptions?.triggeredByType ?? "manual";

  if (!repositoryId) {
    // Check if this repo is in the registry
    const { getRepositoryByOwnerNameQuery } = require("../utils/aiDetectionRepository.utils");
    const registeredRepo = await getRepositoryByOwnerNameQuery(owner, repo, ctx.organizationId);
    if (registeredRepo) {
      repositoryId = registeredRepo.id;
    }
  }

  // Create scan record
  const transaction = await sequelize.transaction();
  try {
    const scanInput: ICreateScanInput = {
      repository_url: `https://github.com/${owner}/${repo}`,
      repository_owner: owner,
      repository_name: repo,
      triggered_by: ctx.userId,
      status: "pending",
      repository_id: repositoryId,
      triggered_by_type: triggeredByType,
    };

    let scan: IScan;
    try {
      scan = await createScanQuery(scanInput, ctx.organizationId, transaction);
      await transaction.commit();
    } catch (dbError: unknown) {
      await transaction.rollback();
      // Handle unique constraint violation from partial unique index
      // (concurrent active scan for same repo)
      const errMsg = dbError instanceof Error ? dbError.message : "";
      if (errMsg.includes("unique_active_idx") || errMsg.includes("duplicate key")) {
        throw new BusinessLogicException(
          `A scan is already in progress for ${owner}/${repo}. Please wait for it to complete.`
        );
      }
      throw dbError;
    }

    // Check if we've hit the maximum concurrent scans limit
    if (scanProgressMap.size >= MAX_CONCURRENT_SCANS) {
      // Clean up stale entries first
      cleanupStaleProgressEntries();

      // If still at limit after cleanup, reject
      if (scanProgressMap.size >= MAX_CONCURRENT_SCANS) {
        throw new BusinessLogicException(
          "Too many concurrent scans. Please try again later."
        );
      }
    }

    // Initialize progress tracking with timestamp
    scanProgressMap.set(scan.id!, {
      status: "pending",
      progress: 0,
      filesScanned: 0,
      findingsCount: 0,
      abortController: new AbortController(),
      createdAt: Date.now(),
    });

    // Start async scanning process (non-blocking)
    // Errors are handled internally by executeScan via updateScanProgressQuery
    executeScan(scan.id!, owner, repo, ctx).catch(() => {
      // Error already handled and logged in executeScan
    });

    return scan;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

/**
 * Cross-reference vulnerability findings with non-vulnerability findings
 * that share the same file paths. Updates vulnerability_details JSONB
 * with related_finding_ids and related_finding_types so the UI can
 * show connections between vulnerability and library/agent/security tabs.
 */
async function crossReferenceFindings(scanId: number, organizationId: number): Promise<void> {
  // 1. Get all findings for this scan
  const [allFindings] = await sequelize.query(
    `SELECT id, finding_type, file_paths, vulnerability_details
     FROM ai_detection_findings
     WHERE scan_id = :scanId AND organization_id = :organizationId`,
    { replacements: { scanId, organizationId } }
  ) as [Array<{
    id: number;
    finding_type: string;
    file_paths: Array<{ path: string; line_number: number | null; matched_text: string }> | null;
    vulnerability_details: Record<string, unknown> | null;
  }>, unknown];

  // 2. Separate vulnerability vs non-vulnerability findings
  const vulnTypes = new Set([
    "prompt_injection", "jailbreak_risk", "training_data_poisoning", "model_dos",
    "supply_chain", "pii_exposure", "insecure_plugin", "excessive_agency",
    "overreliance", "model_theft",
  ]);

  const vulnFindings = allFindings.filter((f) => vulnTypes.has(f.finding_type));
  const otherFindings = allFindings.filter((f) => !vulnTypes.has(f.finding_type));

  if (vulnFindings.length === 0 || otherFindings.length === 0) return;

  // 3. Build a map of file paths to non-vuln finding IDs
  const fileToFindings = new Map<string, { id: number; finding_type: string }[]>();
  for (const f of otherFindings) {
    const paths = f.file_paths || [];
    for (const fp of paths) {
      const key = fp.path;
      if (!fileToFindings.has(key)) fileToFindings.set(key, []);
      fileToFindings.get(key)!.push({ id: f.id, finding_type: f.finding_type });
    }
  }

  // 4. For each vuln finding, find related non-vuln findings by shared file paths
  for (const vf of vulnFindings) {
    const vfPaths = vf.file_paths || [];
    const relatedSet = new Map<number, string>(); // id -> finding_type

    for (const fp of vfPaths) {
      const matches = fileToFindings.get(fp.path) || [];
      for (const m of matches) {
        relatedSet.set(m.id, m.finding_type);
      }
    }

    if (relatedSet.size === 0) continue;

    // 5. Merge into existing vulnerability_details
    const existingDetails = vf.vulnerability_details || {};
    const updatedDetails = {
      ...existingDetails,
      related_finding_ids: Array.from(relatedSet.keys()),
      related_finding_types: [...new Set(relatedSet.values())],
    };

    await sequelize.query(
      `UPDATE ai_detection_findings
       SET vulnerability_details = :details
       WHERE id = :id AND organization_id = :organizationId`,
      { replacements: { details: JSON.stringify(updatedDetails), id: vf.id, organizationId } }
    );
  }
}

/**
 * Execute the actual scan process asynchronously using git clone
 */
async function executeScan(
  scanId: number,
  owner: string,
  repo: string,
  ctx: IServiceContext
): Promise<void> {
  const progressState = scanProgressMap.get(scanId);
  if (!progressState) return;

  const signal = progressState.abortController?.signal;
  let clonedRepoPath: string | null = null;

  try {
    // Update status to cloning
    const startedAt = new Date();
    progressState.status = "cloning";
    progressState.progress = 5;
    progressState.startedAt = startedAt;
    await updateScanProgressQuery(
      scanId,
      { status: "cloning", started_at: startedAt },
      ctx.organizationId
    );

    // Fetch GitHub token for private repository support
    const githubToken = await getDecryptedGitHubToken(ctx.organizationId);

    // Check repository size before cloning (max 2.5 GB)
    await checkRepositorySize(owner, repo, githubToken || undefined);

    // Clone the repository (with token if available)
    clonedRepoPath = await cloneRepository(owner, repo, signal, githubToken || undefined);

    // Update last used timestamp if token was used
    if (githubToken) {
      await updateGitHubTokenLastUsed(ctx.organizationId);
    }

    // Get all files from cloned repository
    const allFiles = await getRepositoryFiles(clonedRepoPath, signal);

    // Filter scannable files (code and dependency files)
    const filesToScan = allFiles.filter((file) => shouldScanFile(file.path));

    progressState.totalFiles = filesToScan.length;
    progressState.status = "scanning";

    await updateScanProgressQuery(
      scanId,
      { status: "scanning", total_files: filesToScan.length },
      ctx.organizationId
    );

    // Collect findings (aggregated by pattern and finding type)
    // For model_ref findings, we also aggregate by extracted model name
    const findingsMap = new Map<
      string,
      {
        pattern: DetectionPattern;
        filePaths: IFilePath[];
        category: string;
        findingType: "library" | "api_call" | "secret" | "model_ref" | "rag_component" | "agent";
        extractedModelName?: string; // For model_ref findings: the actual model ID
        overrideConfidence?: "high" | "medium" | "low"; // Dynamic confidence override
      }
    >();

    // Scan files - now reading from local disk (much faster!)
    for (let i = 0; i < filesToScan.length; i++) {
      if (signal?.aborted) {
        throw new BusinessLogicException("Scan was cancelled");
      }

      const file = filesToScan[i];
      const fileType = shouldScanFile(file.path);
      if (!fileType) continue;

      progressState.currentFile = file.path;
      progressState.filesScanned = i + 1;
      progressState.progress = Math.round(5 + (i / filesToScan.length) * 90);

      try {
        // Read file content from disk
        const content = await readFileContent(file.fullPath);

        // Scan for patterns
        const matches = scanFileForPatterns(content, fileType);

        // Aggregate findings (separate by findingType so library and api_call are tracked independently)
        // For model_ref findings, also separate by extracted model name
        for (const match of matches) {
          // For model_ref findings with extracted model names, include the model name in the key
          // This ensures each unique model gets its own finding entry
          const modelNameSuffix = match.extractedModelName ? `::${match.extractedModelName}` : "";
          const key = `${match.pattern.name}::${match.pattern.provider}::${match.findingType}${modelNameSuffix}`;
          const existing = findingsMap.get(key);

          if (existing) {
            existing.filePaths.push({
              path: file.path,
              line_number: match.lineNumber,
              matched_text: match.matchedText,
            });
          } else {
            findingsMap.set(key, {
              pattern: match.pattern,
              category: AI_DETECTION_PATTERNS.find((c) =>
                c.patterns.includes(match.pattern)
              )?.name || "Unknown",
              findingType: match.findingType,
              extractedModelName: match.extractedModelName,
              overrideConfidence: match.confidence,
              filePaths: [
                {
                  path: file.path,
                  line_number: match.lineNumber,
                  matched_text: match.matchedText,
                },
              ],
            });
          }
        }

        progressState.findingsCount = findingsMap.size;
      } catch {
        // Skip files that fail to read (might be binary, permissions issue, etc.)
        // This is expected behavior and doesn't need logging
      }

      // Update progress in database periodically (every 50 files - can be more frequent since local reads are fast)
      if (i % 50 === 0) {
        await updateScanProgressQuery(
          scanId,
          { files_scanned: i + 1, findings_count: findingsMap.size },
          ctx.organizationId
        );
      }
    }

    // ========================================================================
    // LLM Vulnerability Pre-Filter (Phase 2)
    // ========================================================================
    let vulnerabilityCandidates: VulnerabilityCandidate[] = [];
    const vulnerabilityFileContents = new Map<string, string>();
    let vulnerabilityFindings: ICreateFindingInput[] = [];

    try {
      // Check if vulnerability scanning is enabled for this org
      const riskConfig = await getRiskScoringConfigQuery(ctx.organizationId);
      const vulnScanEnabled = riskConfig?.vulnerability_scan_enabled &&
        riskConfig?.llm_enabled && riskConfig?.llm_key_id;

      // Determine which vulnerability types are enabled
      const enabledTypes = riskConfig?.vulnerability_types_enabled ?? {
        prompt_injection: true,
        pii_exposure: true,
        excessive_agency: true,
        jailbreak_risk: true,
        training_data_poisoning: true,
        model_dos: true,
        supply_chain: true,
        insecure_plugin: true,
        overreliance: true,
        model_theft: true,
      };

      if (vulnScanEnabled && !signal?.aborted) {
        // Re-scan code files for vulnerability indicators
        for (const file of filesToScan) {
          if (signal?.aborted) break;
          try {
            const content = await readFileContent(file.fullPath);
            const candidates = scanFileForVulnerabilityIndicators(content, file.path)
              .filter((c) => enabledTypes[c.vulnerabilityType as keyof typeof enabledTypes] !== false);
            if (candidates.length > 0) {
              vulnerabilityCandidates.push(...candidates);
              vulnerabilityFileContents.set(file.path, content);
            }
          } catch {
            // Skip unreadable files
          }
        }

        // Run LLM analysis on candidates
        if (vulnerabilityCandidates.length > 0 && riskConfig!.llm_key_id) {
          const context = buildAnalysisContext(vulnerabilityCandidates, vulnerabilityFileContents);
          vulnerabilityFindings = await analyzeVulnerabilities(
            context,
            riskConfig!.llm_key_id,
            ctx.organizationId,
            scanId
          );
        }
      }
    } catch (err) {
      // Graceful degradation: vulnerability scan failure does not fail the overall scan
      logger.warn(`Vulnerability scan failed for scan ${scanId}, continuing without vulnerability findings:`, err);
      vulnerabilityFindings = [];
    }

    // ========================================================================
    // Model Security Scanning (Phase 3)
    // ========================================================================
    const modelSecurityFindings: ICreateModelSecurityFindingInput[] = [];
    const MAX_MODEL_FILE_SIZE = 500 * 1024 * 1024; // 500MB local limit (more generous than API)

    // Filter model files from all files
    const modelFiles = allFiles.filter((file) => {
      const ext = path.extname(file.path || "").toLowerCase();
      return isModelFileExtension(ext);
    });

    // Scan model files for security threats
    for (const modelFile of modelFiles) {
      if (signal?.aborted) break;

      const extension = path.extname(modelFile.path || "").toLowerCase();

      // Check file size limit
      if (modelFile.size > MAX_MODEL_FILE_SIZE) {
        modelSecurityFindings.push({
          scan_id: scanId,
          finding_type: "model_security",
          category: "Scan Incomplete",
          name: "File too large to scan",
          provider: getProviderFromExtension(extension),
          confidence: "low",
          description: `File exceeds 500MB size limit (${Math.round(modelFile.size / 1024 / 1024)}MB). Unable to analyze for security threats.`,
          documentation_url: undefined,
          file_count: 1,
          file_paths: [{ path: modelFile.path, line_number: null, matched_text: "Size limit exceeded" }],
          severity: "low",
          cwe_id: "N/A",
          cwe_name: "N/A",
          owasp_ml_id: "N/A",
          owasp_ml_name: "N/A",
          threat_type: "scan_incomplete",
          operator_name: "size_check",
          module_name: "scanner",
        });
        continue;
      }

      try {
        // Read file content as buffer from disk
        const buffer = await readFileBuffer(modelFile.fullPath);
        const content = buffer.toString("base64"); // Convert to base64 for scanModelFileContent

        // Scan the file for security issues
        const scanResult = await scanModelFileContent(content, modelFile.path, extension);

        // Convert findings to database format
        for (const finding of scanResult.findings) {
          modelSecurityFindings.push({
            scan_id: scanId,
            finding_type: "model_security",
            category: getThreatCategory(finding.threatType),
            name: formatFindingName(finding.moduleName, finding.operatorName),
            provider: getProviderFromExtension(extension),
            confidence: severityToConfidence(finding.severity),
            description: generateFindingDescription(finding.threatType, finding.moduleName, finding.operatorName),
            documentation_url: getDocumentationUrl(finding.threatType, finding.cweId),
            file_count: 1,
            file_paths: [{
              path: modelFile.path,
              line_number: null,
              matched_text: finding.moduleName + "." + finding.operatorName,
            }],
            severity: finding.severity,
            cwe_id: finding.cweId,
            cwe_name: finding.cweName,
            owasp_ml_id: finding.owaspMlId,
            owasp_ml_name: finding.owaspMlName,
            threat_type: finding.threatType,
            operator_name: finding.operatorName,
            module_name: finding.moduleName,
          });
        }
      } catch (error) {
        // Create "scan incomplete" finding with reason
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        modelSecurityFindings.push({
          scan_id: scanId,
          finding_type: "model_security",
          category: "Scan Incomplete",
          name: "Unable to analyze file",
          provider: getProviderFromExtension(extension),
          confidence: "low",
          description: "Could not complete security scan: " + errorMessage,
          documentation_url: undefined,
          file_count: 1,
          file_paths: [{ path: modelFile.path, line_number: null, matched_text: "Scan incomplete" }],
          severity: "low",
          cwe_id: "N/A",
          cwe_name: "N/A",
          owasp_ml_id: "N/A",
          owasp_ml_name: "N/A",
          threat_type: "scan_incomplete",
          operator_name: "error",
          module_name: "scanner",
        });
        // Error already recorded as a finding with threat_type: "scan_incomplete"
      }
    }

    // Store findings in database
    const transaction = await sequelize.transaction();
    try {
      // Deduplicate findings by name+provider+findingType+modelName to avoid ON CONFLICT errors
      // Each finding type is kept separate (library, api_call, secret, model_ref, rag_component, agent)
      // For model_ref findings, also separate by extracted model name
      const deduplicatedFindingsMap = new Map<string, ICreateFindingInput>();

      for (const [, finding] of findingsMap) {
        const findingType = finding.findingType || "library";

        // Build the display name - for model_ref findings with extracted model name,
        // show the actual model instead of the generic pattern name
        let displayName = finding.pattern.name;
        if (finding.extractedModelName && findingType === "model_ref") {
          // Format: "Provider: model-name" (e.g., "Hugging Face: bert-base-uncased")
          displayName = `${finding.pattern.provider}: ${finding.extractedModelName}`;
        }

        // Use displayName in the key since DB constraint is on (scan_id, name, provider)
        // This ensures proper deduplication matching the database unique constraint
        // Include findingType to keep different types separate; batch insert dedup handles DB-level collisions
        const normalizedProvider = finding.pattern.provider || "NULL";
        const key = `${displayName}::${normalizedProvider}::${findingType}`;
        const existing = deduplicatedFindingsMap.get(key);

        if (existing) {
          // Merge file paths from findings of the same type
          const existingPaths = existing.file_paths || [];
          existing.file_paths = [...existingPaths, ...finding.filePaths];
          existing.file_count = existing.file_paths.length;
        } else {
          // Determine confidence based on finding type and override
          let confidence = finding.overrideConfidence || finding.pattern.confidence;
          if (findingType === "api_call" || findingType === "secret" || findingType === "agent") {
            confidence = "high"; // These finding types are always high confidence
          }

          deduplicatedFindingsMap.set(key, {
            scan_id: scanId,
            finding_type: findingType,
            category: finding.category,
            name: displayName,
            provider: finding.pattern.provider,
            confidence,
            // Calculate risk level based on provider and finding type
            risk_level: calculateRiskLevel(finding.pattern.provider, findingType),
            description: finding.pattern.description,
            documentation_url: finding.pattern.documentationUrl,
            file_count: finding.filePaths.length,
            file_paths: finding.filePaths,
          });
        }
      }

      const findingInputs = Array.from(deduplicatedFindingsMap.values());

      // Add license information to findings
      if (findingInputs.length > 0) {
        console.log(`[LICENSE] Processing ${findingInputs.length} findings for license info`);
        let licensesFound = 0;
        // Batch license lookups (limit concurrent requests)
        const licensePromises = findingInputs.map(async (finding) => {
          try {
            const license = await getLicenseForFinding(
              finding.name,
              finding.provider || "",
              undefined // No code content available at this point
            );
            if (license) {
              finding.license_id = license.licenseId;
              finding.license_name = license.licenseName;
              finding.license_risk = license.licenseRisk;
              finding.license_source = license.licenseSource;
              licensesFound++;
              console.log(`[LICENSE] Found license for ${finding.name} (${finding.provider}): ${license.licenseId}`);
            } else {
              console.log(`[LICENSE] No license found for ${finding.name} (${finding.provider})`);
            }
          } catch (err) {
            console.log(`[LICENSE] Error looking up license for ${finding.name}: ${err}`);
          }
        });
        await Promise.all(licensePromises);
        console.log(`[LICENSE] Total licenses found: ${licensesFound}/${findingInputs.length}`);

        await createFindingsBatchQuery(findingInputs, ctx.organizationId, transaction);
      }

      // Store vulnerability findings
      if (vulnerabilityFindings.length > 0) {
        await createFindingsBatchQuery(vulnerabilityFindings, ctx.organizationId, transaction);
      }

      // Store model security findings (deduplicate by name+provider to avoid ON CONFLICT errors)
      if (modelSecurityFindings.length > 0) {
        // Deduplicate security findings by aggregating file paths
        const securityFindingsMap = new Map<string, ICreateModelSecurityFindingInput>();
        for (const finding of modelSecurityFindings) {
          const normalizedProvider = finding.provider || "NULL";
          const key = `${finding.name}::${normalizedProvider}`;
          const existing = securityFindingsMap.get(key);
          if (existing) {
            // Merge file paths
            const existingPaths = existing.file_paths || [];
            const newPaths = finding.file_paths || [];
            existing.file_paths = [...existingPaths, ...newPaths];
            existing.file_count = existing.file_paths.length;
          } else {
            securityFindingsMap.set(key, { ...finding });
          }
        }
        const deduplicatedSecurityFindings = Array.from(securityFindingsMap.values());
        await createModelSecurityFindingsBatchQuery(deduplicatedSecurityFindings, ctx.organizationId, transaction);
      }

      // Mark scan as completed (include both library and security findings)
      const deduplicatedSecurityCount = modelSecurityFindings.length > 0
        ? new Set(modelSecurityFindings.map(f => `${f.name}::${f.provider}`)).size
        : 0;
      const totalFindings = findingsMap.size + deduplicatedSecurityCount + vulnerabilityFindings.length;
      const completedAt = new Date();
      const durationMs = progressState.startedAt
        ? completedAt.getTime() - progressState.startedAt.getTime()
        : undefined;
      await updateScanProgressQuery(
        scanId,
        {
          status: "completed",
          files_scanned: filesToScan.length + modelFiles.length,
          findings_count: totalFindings,
          completed_at: completedAt,
          duration_ms: durationMs,
        },
        ctx.organizationId,
        transaction
      );

      await transaction.commit();

      progressState.status = "completed";
      progressState.progress = 100;

      // Cross-reference vulnerability findings with library/agent/security findings
      // that share file paths (fire-and-forget, non-blocking)
      crossReferenceFindings(scanId, ctx.organizationId).catch((err) => {
        logger.warn(`Cross-reference pass failed for scan ${scanId}, skipping:`, err);
      });

      // Update linked repository's last_scan fields
      updateLinkedRepositoryLastScan(scanId, "completed", ctx.organizationId).catch((err) => {
        logger.error(`Failed to update repository last scan for scan ${scanId}:`, err);
      });

      // Invalidate stats cache after successful scan completion
      invalidateAIDetectionStatsCache(ctx.organizationId).catch(() => {
        // Silently ignore cache invalidation errors
      });

      // Calculate risk score (fire-and-forget)
      calculateAndStoreRiskScore(scanId, `${owner}/${repo}`, ctx).catch((err) => {
        logger.error(`Failed to calculate risk score for scan ${scanId}:`, err);
      });
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error occurred";
    const status: ScanStatus =
      error instanceof BusinessLogicException &&
      errorMessage.includes("cancelled")
        ? "cancelled"
        : "failed";

    const errorCompletedAt = new Date();
    const errorDurationMs = progressState.startedAt
      ? errorCompletedAt.getTime() - progressState.startedAt.getTime()
      : undefined;
    await updateScanProgressQuery(
      scanId,
      {
        status,
        error_message: errorMessage,
        completed_at: errorCompletedAt,
        duration_ms: errorDurationMs,
      },
      ctx.organizationId
    );

    progressState.status = status;
    progressState.progress = 100;
    progressState.errorMessage = errorMessage;

    // Update linked repository's last_scan fields on failure too
    updateLinkedRepositoryLastScan(scanId, status, ctx.organizationId).catch((err) => {
      logger.error(`Failed to update repository last scan for scan ${scanId}:`, err);
    });
  } finally {
    // Clean up cloned repository
    if (clonedRepoPath) {
      await cleanupClonedRepo(clonedRepoPath);
    }

    // Clean up progress tracking after a delay
    setTimeout(() => {
      scanProgressMap.delete(scanId);
    }, 60000); // Keep for 1 minute for status polling
  }
}

/**
 * Get scan status (for polling)
 *
 * @param scanId - Scan ID
 * @param ctx - Service context
 * @returns Scan status
 */
export async function getScanStatus(
  scanId: number,
  ctx: IServiceContext
): Promise<IScanStatusResponse> {
  // Check in-memory progress first
  const progressState = scanProgressMap.get(scanId);
  if (progressState) {
    return {
      id: scanId,
      status: progressState.status,
      progress: progressState.progress,
      current_file: progressState.currentFile,
      files_scanned: progressState.filesScanned,
      total_files: progressState.totalFiles,
      findings_count: progressState.findingsCount,
      error_message: progressState.errorMessage,
    };
  }

  // Fall back to database
  const scan = await getScanByIdQuery(scanId, ctx.organizationId);
  if (!scan) {
    throw new NotFoundException(`Scan with ID ${scanId} not found`);
  }

  return {
    id: scan.id!,
    status: scan.status,
    progress: scan.status === "completed" ? 100 : scan.status === "failed" ? 100 : 0,
    files_scanned: scan.files_scanned || 0,
    total_files: scan.total_files || undefined,
    findings_count: scan.findings_count || 0,
    error_message: scan.error_message || undefined,
  };
}

/**
 * Get scan with full details
 *
 * @param scanId - Scan ID
 * @param ctx - Service context
 * @returns Scan with summary
 */
export async function getScan(
  scanId: number,
  ctx: IServiceContext
): Promise<IScanResponse> {
  const scan = await getScanWithUserQuery(scanId, ctx.organizationId);
  if (!scan) {
    throw new NotFoundException(`Scan with ID ${scanId} not found`);
  }

  const summary = await getFindingsSummaryQuery(scanId, ctx.organizationId);

  return {
    scan: {
      id: scan.id!,
      repository_url: scan.repository_url,
      repository_owner: scan.repository_owner,
      repository_name: scan.repository_name,
      status: scan.status,
      findings_count: scan.findings_count || 0,
      files_scanned: scan.files_scanned || 0,
      started_at: scan.started_at?.toISOString(),
      completed_at: scan.completed_at?.toISOString(),
      duration_ms: scan.duration_ms || undefined,
      error_message: scan.error_message || undefined,
      triggered_by: scan.triggered_by_user,
      risk_score: scan.risk_score != null ? parseFloat(String(scan.risk_score)) : null,
      risk_score_grade: scan.risk_score_grade ?? null,
      risk_score_details: scan.risk_score_details ?? null,
      risk_score_calculated_at: scan.risk_score_calculated_at
        ? (scan.risk_score_calculated_at as Date).toISOString()
        : null,
      created_at: scan.created_at!.toISOString(),
    },
    summary,
  };
}

/**
 * Get findings for a scan
 *
 * @param scanId - Scan ID
 * @param ctx - Service context
 * @param page - Page number
 * @param limit - Items per page
 * @param confidence - Optional confidence filter
 * @param findingType - Optional finding type filter (library, dependency, api_call)
 * @returns Paginated findings
 */
export async function getScanFindings(
  scanId: number,
  ctx: IServiceContext,
  page: number = 1,
  limit: number = 50,
  confidence?: string,
  findingType?: string
): Promise<IFindingsResponse> {
  // Verify scan exists
  const scan = await getScanByIdQuery(scanId, ctx.organizationId);
  if (!scan) {
    throw new NotFoundException(`Scan with ID ${scanId} not found`);
  }

  const { findings, total } = await getFindingsForScanQuery(
    scanId,
    ctx.organizationId,
    page,
    limit,
    confidence,
    findingType
  );

  return {
    findings: findings.map((f) => ({
      id: f.id!,
      finding_type: f.finding_type,
      category: f.category,
      name: f.name,
      provider: f.provider || "",
      confidence: f.confidence,
      risk_level: f.risk_level || "medium",
      description: f.description,
      documentation_url: f.documentation_url,
      file_count: f.file_count || 0,
      file_paths: f.file_paths || [],
      governance_status: f.governance_status,
      governance_updated_at: f.governance_updated_at?.toISOString(),
      governance_updated_by: f.governance_updated_by,
      // License information
      license_id: f.license_id,
      license_name: f.license_name,
      license_risk: f.license_risk,
      license_source: f.license_source,
    })),
    pagination: {
      total,
      page,
      limit,
      total_pages: Math.ceil(total / limit),
    },
  };
}

/**
 * Get scan history list
 *
 * @param ctx - Service context
 * @param page - Page number
 * @param limit - Items per page
 * @param status - Optional status filter
 * @returns Paginated scans
 */
export async function getScans(
  ctx: IServiceContext,
  page: number = 1,
  limit: number = 20,
  status?: ScanStatus
): Promise<IScansResponse> {
  const { scans, total } = await getScansListQuery(ctx.organizationId, page, limit, status);

  return {
    scans: scans.map((s) => ({
      id: s.id!,
      repository_url: s.repository_url,
      repository_owner: s.repository_owner,
      repository_name: s.repository_name,
      status: s.status,
      findings_count: s.findings_count || 0,
      files_scanned: s.files_scanned || 0,
      started_at: s.started_at?.toISOString(),
      completed_at: s.completed_at?.toISOString(),
      duration_ms: s.duration_ms || undefined,
      triggered_by: s.triggered_by_user,
      risk_score: s.risk_score != null ? parseFloat(String(s.risk_score)) : null,
      risk_score_grade: s.risk_score_grade ?? null,
      created_at: s.created_at!.toISOString(),
    })),
    pagination: {
      total,
      page,
      limit,
      total_pages: Math.ceil(total / limit),
    },
  };
}

/**
 * Get the most recent active scan (pending, cloning, or scanning)
 * Efficient single query to check for any active scans.
 *
 * @param ctx - Service context
 * @returns Active scan or null if no active scan
 */
export async function getActiveScan(
  ctx: IServiceContext
): Promise<IScan | null> {
  const activeStatuses = ["pending", "cloning", "scanning"];

  // Single query to find any active scan (most recent first)
  // Note: users table is in public schema, not tenant schema
  const [scan] = await sequelize.query<IScan>(
    `SELECT s.*
     FROM ai_detection_scans s
     WHERE s.organization_id = :organizationId AND s.status IN (:statuses)
     ORDER BY s.created_at DESC
     LIMIT 1`,
    {
      type: QueryTypes.SELECT,
      replacements: { organizationId: ctx.organizationId, statuses: activeStatuses },
    }
  );

  return scan || null;
}

/**
 * Cancel an in-progress scan
 *
 * Authorization: Admin can cancel any scan, Editor can only cancel their own scans.
 *
 * @param scanId - Scan ID
 * @param ctx - Service context
 * @returns Updated scan
 * @throws {NotFoundException} If scan not found
 * @throws {ForbiddenException} If user not authorized to cancel this scan
 * @throws {BusinessLogicException} If scan cannot be cancelled (wrong status)
 */
export async function cancelScan(
  scanId: number,
  ctx: IServiceContext
): Promise<{ id: number; status: "cancelled"; message: string }> {
  const scan = await getScanByIdQuery(scanId, ctx.organizationId);
  if (!scan) {
    throw new NotFoundException(`Scan with ID ${scanId} not found`);
  }

  // Authorization check: Admin can cancel any scan, others can only cancel their own
  const isAdmin = ctx.role === "Admin";
  const isOwner = scan.triggered_by === ctx.userId;

  if (!isAdmin && !isOwner) {
    throw new ForbiddenException(
      "You can only cancel scans that you initiated",
      "scan",
      "cancel"
    );
  }

  if (!["pending", "cloning", "scanning"].includes(scan.status)) {
    throw new BusinessLogicException(
      `Cannot cancel scan with status "${scan.status}". Only pending/in-progress scans can be cancelled.`
    );
  }

  // Abort the scan if it's in progress
  const progressState = scanProgressMap.get(scanId);
  if (progressState?.abortController) {
    progressState.abortController.abort();
  }

  // Update database with duration
  const cancelledAt = new Date();
  const cancelDurationMs = progressState?.startedAt
    ? cancelledAt.getTime() - progressState.startedAt.getTime()
    : undefined;
  await updateScanProgressQuery(
    scanId,
    { status: "cancelled", completed_at: cancelledAt, duration_ms: cancelDurationMs },
    ctx.organizationId
  );

  return {
    id: scanId,
    status: "cancelled",
    message: "Scan cancelled successfully",
  };
}

/**
 * Delete a completed/failed/cancelled scan
 *
 * @param scanId - Scan ID
 * @param ctx - Service context
 * @returns Success message
 */
export async function deleteScan(
  scanId: number,
  ctx: IServiceContext
): Promise<{ message: string }> {
  const scan = await getScanByIdQuery(scanId, ctx.organizationId);
  if (!scan) {
    throw new NotFoundException(`Scan with ID ${scanId} not found`);
  }

  if (["pending", "cloning", "scanning"].includes(scan.status)) {
    throw new BusinessLogicException(
      `Cannot delete scan with status "${scan.status}". Please cancel it first.`
    );
  }

  const transaction = await sequelize.transaction();
  try {
    await deleteScanQuery(scanId, ctx.organizationId, transaction);
    await transaction.commit();

    // Invalidate stats cache after successful deletion
    invalidateAIDetectionStatsCache(ctx.organizationId).catch(() => {
      // Silently ignore cache invalidation errors
    });

    return { message: "Scan deleted successfully" };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

// ============================================================================
// Security Findings
// ============================================================================

/**
 * Get security findings for a scan
 *
 * @param scanId - Scan ID
 * @param ctx - Service context
 * @param page - Page number
 * @param limit - Page size
 * @param severity - Severity filter
 * @returns Paginated security findings
 */
export async function getSecurityFindings(
  scanId: number,
  ctx: IServiceContext,
  page: number = 1,
  limit: number = 50,
  severity?: string
): Promise<{
  findings: IModelSecurityFindingRecord[];
  pagination: { total: number; page: number; limit: number; total_pages: number };
}> {
  const scan = await getScanByIdQuery(scanId, ctx.organizationId);
  if (!scan) {
    throw new NotFoundException(`Scan with ID ${scanId} not found`);
  }

  // Build WHERE clause for findings query - filter by finding_type = 'model_security'
  let whereClause = `WHERE organization_id = $1 AND scan_id = $2 AND finding_type = 'model_security'`;
  const countParams: (number | string)[] = [ctx.organizationId, scanId];

  if (severity) {
    whereClause += ` AND severity = $3`;
    countParams.push(severity);
  }

  // Get total count
  const countQuery = `
    SELECT COUNT(*) as total
    FROM ai_detection_findings
    ${whereClause}
  `;
  const countResult = await sequelize.query(countQuery, {
    bind: countParams,
    type: QueryTypes.SELECT,
  }) as Array<{ total: string }>;
  const total = parseInt(countResult[0]?.total || "0", 10);

  // Get paginated findings
  const offset = (page - 1) * limit;
  const paginatedParams: (number | string)[] = [...countParams, limit, offset];
  const limitParamIndex = severity ? 4 : 3;
  const offsetParamIndex = severity ? 5 : 4;

  const findingsQuery = `
    SELECT
      id,
      scan_id,
      finding_type,
      category,
      name,
      provider,
      confidence,
      description,
      documentation_url,
      file_paths,
      severity,
      cwe_id,
      cwe_name,
      owasp_ml_id,
      owasp_ml_name,
      threat_type,
      operator_name,
      module_name,
      created_at
    FROM ai_detection_findings
    ${whereClause}
    ORDER BY
      CASE severity
        WHEN 'critical' THEN 1
        WHEN 'high' THEN 2
        WHEN 'medium' THEN 3
        WHEN 'low' THEN 4
      END,
      id
    LIMIT $${limitParamIndex} OFFSET $${offsetParamIndex}
  `;

  const findings = await sequelize.query(findingsQuery, {
    bind: paginatedParams,
    type: QueryTypes.SELECT,
  }) as IModelSecurityFindingRecord[];

  // Transform findings (parse file_paths if stored as JSON string)
  const transformedFindings = findings.map((finding) => ({
    ...finding,
    file_paths:
      typeof finding.file_paths === "string"
        ? JSON.parse(finding.file_paths)
        : finding.file_paths,
    file_count: Array.isArray(finding.file_paths)
      ? finding.file_paths.length
      : typeof finding.file_paths === "string"
      ? JSON.parse(finding.file_paths).length
      : 0,
  }));

  return {
    findings: transformedFindings,
    pagination: {
      total,
      page,
      limit,
      total_pages: Math.ceil(total / limit),
    },
  };
}

/**
 * Get security summary for a scan
 *
 * @param scanId - Scan ID
 * @param ctx - Service context
 * @returns Security summary
 */
export async function getSecuritySummary(
  scanId: number,
  ctx: IServiceContext
): Promise<{
  total: number;
  by_severity: { critical: number; high: number; medium: number; low: number };
  by_threat_type: Record<string, number>;
  model_files_scanned: number;
}> {
  const scan = await getScanByIdQuery(scanId, ctx.organizationId);
  if (!scan) {
    throw new NotFoundException(`Scan with ID ${scanId} not found`);
  }

  // Get counts by severity - filter by finding_type = 'model_security'
  const severityQuery = `
    SELECT severity, COUNT(*) as count
    FROM ai_detection_findings
    WHERE organization_id = $1 AND scan_id = $2 AND finding_type = 'model_security'
    GROUP BY severity
  `;
  const severityCounts = await sequelize.query(severityQuery, {
    bind: [ctx.organizationId, scanId],
    type: QueryTypes.SELECT,
  }) as Array<{ severity: string; count: string }>;

  // Get counts by threat type - filter by finding_type = 'model_security'
  const threatTypeQuery = `
    SELECT threat_type, COUNT(*) as count
    FROM ai_detection_findings
    WHERE organization_id = $1 AND scan_id = $2 AND finding_type = 'model_security'
    GROUP BY threat_type
  `;
  const threatTypeCounts = await sequelize.query(threatTypeQuery, {
    bind: [ctx.organizationId, scanId],
    type: QueryTypes.SELECT,
  }) as Array<{ threat_type: string; count: string }>;

  // Get model files scanned count (count findings with finding_type = 'model_security')
  // Note: model_files_scanned column is not yet in the schema, so we derive from findings
  const modelFilesQuery = `
    SELECT COUNT(DISTINCT file_paths) as model_files_scanned
    FROM ai_detection_findings
    WHERE organization_id = $1 AND scan_id = $2 AND finding_type = 'model_security'
  `;
  const modelFilesResult = await sequelize.query(modelFilesQuery, {
    bind: [ctx.organizationId, scanId],
    type: QueryTypes.SELECT,
  }) as Array<{ model_files_scanned: string }>;

  // Build response
  const by_severity = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
  };
  let total = 0;
  for (const row of severityCounts) {
    const count = parseInt(row.count, 10);
    total += count;
    if (row.severity in by_severity) {
      by_severity[row.severity as keyof typeof by_severity] = count;
    }
  }

  const by_threat_type: Record<string, number> = {};
  for (const row of threatTypeCounts) {
    by_threat_type[row.threat_type] = parseInt(row.count, 10);
  }

  return {
    total,
    by_severity,
    by_threat_type,
    model_files_scanned: parseInt(modelFilesResult[0]?.model_files_scanned || "0", 10),
  };
}

// ============================================================================
// Governance Status Operations
// ============================================================================

/**
 * Update governance status for a finding
 *
 * @param scanId - Scan ID
 * @param findingId - Finding ID
 * @param governanceStatus - New status or null to clear
 * @param ctx - Service context
 * @returns Updated finding with governance info
 */
export async function updateFindingGovernanceStatus(
  scanId: number,
  findingId: number,
  governanceStatus: GovernanceStatus | null,
  ctx: IServiceContext
): Promise<IUpdateGovernanceStatusResponse> {
  // Verify scan exists and belongs to tenant
  const scan = await getScanByIdQuery(scanId, ctx.organizationId);
  if (!scan) {
    throw new NotFoundException(`Scan ${scanId} not found`);
  }

  // Validate governance status if provided
  if (governanceStatus !== null && !["reviewed", "approved", "flagged"].includes(governanceStatus)) {
    throw new ValidationException("governance_status must be 'reviewed', 'approved', 'flagged', or null");
  }

  // Update the finding
  const updatedFinding = await updateFindingGovernanceStatusQuery(
    findingId,
    scanId,
    governanceStatus,
    ctx.userId,
    ctx.organizationId
  );

  if (!updatedFinding) {
    throw new NotFoundException(`Finding ${findingId} not found in scan ${scanId}`);
  }

  return {
    id: updatedFinding.id!,
    governance_status: governanceStatus,
    governance_updated_at: new Date().toISOString(),
    governance_updated_by: ctx.userId,
  };
}

/**
 * Get governance summary for a scan
 *
 * @param scanId - Scan ID
 * @param ctx - Service context
 * @returns Governance summary with counts
 */
export async function getGovernanceSummary(
  scanId: number,
  ctx: IServiceContext
): Promise<{
  total: number;
  reviewed: number;
  approved: number;
  flagged: number;
  unreviewed: number;
}> {
  // Verify scan exists
  const scan = await getScanByIdQuery(scanId, ctx.organizationId);
  if (!scan) {
    throw new NotFoundException(`Scan ${scanId} not found`);
  }

  return getGovernanceSummaryQuery(scanId, ctx.organizationId);
}

// ============================================================================
// Statistics Operations
// ============================================================================

// Cache TTL for AI Detection stats (2 minutes)
const AI_DETECTION_STATS_CACHE_TTL = 120;

/**
 * Get overall AI Detection statistics
 *
 * Uses caching to avoid expensive aggregation queries on every request.
 * Cache is invalidated when scans are created, completed, or deleted.
 *
 * @param ctx - Service context with tenant info
 * @returns Aggregated statistics
 */
export async function getAIDetectionStats(
  ctx: IServiceContext
): Promise<IAIDetectionStats> {
  const cacheKey = buildOrgCacheKey(CACHE_KEYS.AI_DETECTION_STATS, ctx.organizationId);

  return cacheAside(
    cacheKey,
    () => getAIDetectionStatsQuery(ctx.organizationId),
    AI_DETECTION_STATS_CACHE_TTL
  );
}

/**
 * Invalidate AI Detection stats cache for a tenant
 *
 * Call this when data changes that would affect stats:
 * - Scan created/completed/deleted
 * - Findings added/modified
 *
 * @param organizationId - Tenant identifier
 */
export async function invalidateAIDetectionStatsCache(
  organizationId: number
): Promise<void> {
  const pattern = `${CACHE_KEYS.AI_DETECTION_STATS}:${organizationId}`;
  await deleteByPattern(pattern);
}

// ============================================================================
// AI-BOM Export
// ============================================================================

/**
 * AI Bill of Materials format (based on CycloneDX-like structure)
 */
export interface AIBOMComponent {
  type: "library" | "model" | "service" | "framework" | "tool";
  name: string;
  provider: string;
  version?: string;
  description?: string;
  confidence: "high" | "medium" | "low";
  riskLevel: "high" | "medium" | "low";
  documentationUrl?: string;
  purl?: string; // Package URL (e.g., pkg:npm/openai@4.0.0)
  locations: Array<{
    path: string;
    lineNumber?: number | null;
  }>;
  metadata?: {
    findingType: string;
    governanceStatus?: string | null;
    detectedAt?: string;
  };
}

export interface AIBOMExport {
  bomFormat: "AI-BOM";
  specVersion: "1.0";
  serialNumber: string;
  version: 1;
  metadata: {
    timestamp: string;
    tools: Array<{ name: string; version: string }>;
    repository: {
      url: string;
      owner: string;
      name: string;
    };
    scan: {
      id: number;
      completedAt?: string;
      filesScanned: number;
    };
  };
  components: AIBOMComponent[];
  summary: {
    totalComponents: number;
    byType: Record<string, number>;
    byRiskLevel: { high: number; medium: number; low: number };
    byProvider: Record<string, number>;
  };
}

/**
 * Map finding type to component type
 */
function findingTypeToComponentType(
  findingType: string
): "library" | "model" | "service" | "framework" | "tool" {
  switch (findingType) {
    case "model_ref":
      return "model";
    case "api_call":
      return "service";
    case "agent":
      return "framework";
    case "rag_component":
      return "tool";
    default:
      return "library";
  }
}

/**
 * Generate a Package URL (purl) for a component
 */
function generatePurl(provider: string, name: string): string {
  const normalizedProvider = provider.toLowerCase().replace(/\s+/g, "-");
  const normalizedName = name.toLowerCase().replace(/\s+/g, "-");
  return `pkg:ai/${normalizedProvider}/${normalizedName}`;
}

/**
 * Export scan results as AI Bill of Materials (AI-BOM)
 *
 * @param scanId - Scan ID
 * @param ctx - Service context
 * @returns AI-BOM export object
 */
export async function exportScanAsAIBOM(
  scanId: number,
  ctx: IServiceContext
): Promise<AIBOMExport> {
  // Get scan details
  const scan = await getScanWithUserQuery(scanId, ctx.organizationId);
  if (!scan) {
    throw new NotFoundException(`Scan with ID ${scanId} not found`);
  }

  // Get all findings for the scan (library, api_call, model_ref, rag_component, agent)
  // Exclude secrets and model_security from AI-BOM using batched query
  const relevantFindings = await getAllFindingsForExportQuery(
    scanId,
    ctx.organizationId,
    ["secret", "model_security"] // Exclude these types
  );

  // Transform findings to AI-BOM components
  const components: AIBOMComponent[] = relevantFindings.map((finding) => ({
    type: findingTypeToComponentType(finding.finding_type),
    name: finding.name,
    provider: finding.provider || "Unknown",
    description: finding.description || undefined,
    confidence: finding.confidence,
    riskLevel: finding.risk_level || "medium",
    documentationUrl: finding.documentation_url || undefined,
    purl: generatePurl(finding.provider || "unknown", finding.name),
    locations: (finding.file_paths || []).map((fp) => ({
      path: fp.path,
      lineNumber: fp.line_number,
    })),
    metadata: {
      findingType: finding.finding_type,
      governanceStatus: finding.governance_status || null,
      detectedAt: finding.created_at?.toISOString(),
    },
  }));

  // Calculate summary statistics
  const byType: Record<string, number> = {};
  const byRiskLevel = { high: 0, medium: 0, low: 0 };
  const byProvider: Record<string, number> = {};

  for (const component of components) {
    // Count by type
    byType[component.type] = (byType[component.type] || 0) + 1;

    // Count by risk level
    byRiskLevel[component.riskLevel]++;

    // Count by provider
    byProvider[component.provider] = (byProvider[component.provider] || 0) + 1;
  }

  // Generate serial number (UUID-like)
  const serialNumber = `urn:uuid:${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 9)}`;

  return {
    bomFormat: "AI-BOM",
    specVersion: "1.0",
    serialNumber,
    version: 1,
    metadata: {
      timestamp: new Date().toISOString(),
      tools: [
        { name: "VerifyWise AI Detection", version: "1.0.0" },
      ],
      repository: {
        url: scan.repository_url,
        owner: scan.repository_owner,
        name: scan.repository_name,
      },
      scan: {
        id: scan.id!,
        completedAt: scan.completed_at?.toISOString(),
        filesScanned: scan.files_scanned || 0,
      },
    },
    components,
    summary: {
      totalComponents: components.length,
      byType,
      byRiskLevel,
      byProvider,
    },
  };
}

// ============================================================================
// AI Dependency Graph
// ============================================================================

/**
 * Graph node for AI Dependency visualization
 */
export interface DependencyGraphNode {
  id: string;
  findingId: number;
  type: "library" | "model" | "api" | "secret" | "rag" | "agent" | "repository";
  label: string;
  sublabel?: string;
  provider: string;
  confidence: "high" | "medium" | "low";
  riskLevel: "high" | "medium" | "low";
  fileCount: number;
  filePaths: IFilePath[];
  governanceStatus?: string | null;
}

/**
 * Graph edge representing relationship between components
 */
export interface DependencyGraphEdge {
  id: string;
  source: string;
  target: string;
  relationship: "uses" | "calls" | "requires" | "exposes" | "orchestrates" | "contains";
  confidence: "high" | "medium" | "low";
}

/**
 * Full dependency graph response
 */
export interface DependencyGraphResponse {
  nodes: DependencyGraphNode[];
  edges: DependencyGraphEdge[];
  repository: {
    owner: string;
    name: string;
    url: string;
  };
  summary: {
    totalNodes: number;
    byType: Record<string, number>;
    byRiskLevel: { high: number; medium: number; low: number };
    byProvider: Record<string, number>;
  };
}

/**
 * Map finding type to graph node type
 */
function findingTypeToNodeType(
  findingType: string
): "library" | "model" | "api" | "secret" | "rag" | "agent" {
  switch (findingType) {
    case "model_ref":
      return "model";
    case "api_call":
      return "api";
    case "secret":
      return "secret";
    case "rag_component":
      return "rag";
    case "agent":
      return "agent";
    default:
      return "library";
  }
}

/**
 * Infer relationships between findings based on file co-location
 * If two findings appear in the same file, they likely have a relationship
 */
function inferRelationships(
  nodes: DependencyGraphNode[]
): DependencyGraphEdge[] {
  const edges: DependencyGraphEdge[] = [];
  const edgeSet = new Set<string>(); // Prevent duplicates

  // Build a map of file paths to node IDs
  const fileToNodes = new Map<string, string[]>();
  for (const node of nodes) {
    for (const fp of node.filePaths) {
      const existing = fileToNodes.get(fp.path) || [];
      existing.push(node.id);
      fileToNodes.set(fp.path, existing);
    }
  }

  // Create a map for quick node lookup
  const nodeMap = new Map<string, DependencyGraphNode>();
  for (const node of nodes) {
    nodeMap.set(node.id, node);
  }

  // For each file with multiple findings, create edges
  for (const [, nodeIds] of fileToNodes) {
    if (nodeIds.length < 2) continue;

    // Create relationships between co-located findings
    for (let i = 0; i < nodeIds.length; i++) {
      for (let j = i + 1; j < nodeIds.length; j++) {
        const nodeA = nodeMap.get(nodeIds[i])!;
        const nodeB = nodeMap.get(nodeIds[j])!;

        // Determine relationship type and direction based on finding types
        const relationship = determineRelationship(nodeA, nodeB);
        if (!relationship) continue;

        const edgeKey = `${relationship.source}-${relationship.target}`;
        if (edgeSet.has(edgeKey)) continue;
        edgeSet.add(edgeKey);

        edges.push({
          id: `edge-${relationship.source}-${relationship.target}`,
          source: relationship.source,
          target: relationship.target,
          relationship: relationship.type,
          confidence: "medium", // Inferred relationships are medium confidence
        });
      }
    }
  }

  return edges;
}

/**
 * Determine relationship type and direction between two nodes
 */
function determineRelationship(
  nodeA: DependencyGraphNode,
  nodeB: DependencyGraphNode
): { source: string; target: string; type: DependencyGraphEdge["relationship"] } | null {
  const typeA = nodeA.type;
  const typeB = nodeB.type;

  // Define relationship rules (source type → target type → relationship)
  // Library uses model
  if (typeA === "library" && typeB === "model") {
    return { source: nodeA.id, target: nodeB.id, type: "uses" };
  }
  if (typeB === "library" && typeA === "model") {
    return { source: nodeB.id, target: nodeA.id, type: "uses" };
  }

  // Library calls API
  if (typeA === "library" && typeB === "api") {
    return { source: nodeA.id, target: nodeB.id, type: "calls" };
  }
  if (typeB === "library" && typeA === "api") {
    return { source: nodeB.id, target: nodeA.id, type: "calls" };
  }

  // Agent orchestrates model/api
  if (typeA === "agent" && (typeB === "model" || typeB === "api")) {
    return { source: nodeA.id, target: nodeB.id, type: "orchestrates" };
  }
  if (typeB === "agent" && (typeA === "model" || typeA === "api")) {
    return { source: nodeB.id, target: nodeA.id, type: "orchestrates" };
  }

  // RAG uses model for embeddings
  if (typeA === "rag" && typeB === "model") {
    return { source: nodeA.id, target: nodeB.id, type: "uses" };
  }
  if (typeB === "rag" && typeA === "model") {
    return { source: nodeB.id, target: nodeA.id, type: "uses" };
  }

  // Secret exposes (connected to API)
  if (typeA === "secret" && typeB === "api") {
    return { source: nodeA.id, target: nodeB.id, type: "exposes" };
  }
  if (typeB === "secret" && typeA === "api") {
    return { source: nodeB.id, target: nodeA.id, type: "exposes" };
  }

  // Default: no relationship for unhandled pairs
  return null;
}

/**
 * Get dependency graph data for a scan
 *
 * @param scanId - Scan ID
 * @param ctx - Service context
 * @returns Dependency graph with nodes and edges
 */
export async function getDependencyGraph(
  scanId: number,
  ctx: IServiceContext
): Promise<DependencyGraphResponse> {
  // Get scan details
  const scan = await getScanWithUserQuery(scanId, ctx.organizationId);
  if (!scan) {
    throw new NotFoundException(`Scan with ID ${scanId} not found`);
  }

  // Get all findings for the scan using batched query
  const allFindings = await getAllFindingsForExportQuery(
    scanId,
    ctx.organizationId
    // No exclusions - include all finding types in graph
  );

  // Transform findings to graph nodes
  const nodes: DependencyGraphNode[] = allFindings.map((finding) => ({
    id: `finding-${finding.id}`,
    findingId: finding.id!,
    type: findingTypeToNodeType(finding.finding_type),
    label: finding.name,
    sublabel: finding.provider || undefined,
    provider: finding.provider || "Unknown",
    confidence: finding.confidence,
    riskLevel: (finding.risk_level as "high" | "medium" | "low") || "medium",
    fileCount: finding.file_count || 0,
    filePaths: finding.file_paths || [],
    governanceStatus: finding.governance_status,
  }));

  // Infer relationships between findings
  const edges = inferRelationships(nodes);

  // Calculate summary statistics
  const byType: Record<string, number> = {};
  const byRiskLevel = { high: 0, medium: 0, low: 0 };
  const byProvider: Record<string, number> = {};

  for (const node of nodes) {
    byType[node.type] = (byType[node.type] || 0) + 1;
    byRiskLevel[node.riskLevel]++;
    byProvider[node.provider] = (byProvider[node.provider] || 0) + 1;
  }

  return {
    nodes,
    edges,
    repository: {
      owner: scan.repository_owner,
      name: scan.repository_name,
      url: scan.repository_url,
    },
    summary: {
      totalNodes: nodes.length,
      byType,
      byRiskLevel,
      byProvider,
    },
  };
}

// ============================================================================
// Compliance Mapping
// ============================================================================

import {
  COMPLIANCE_REQUIREMENTS,
  getComplianceRequirementsForFinding,
  getRiskFactorsForFinding,
  getDocumentationNeedsForFinding,
  ComplianceRequirement,
  ComplianceCategory,
} from "../config/complianceMapping";

/**
 * Compliance mapping response types
 */
export interface ComplianceFindingMapping {
  findingId: number;
  findingName: string;
  findingType: string;
  provider: string;
  requirements: ComplianceRequirement[];
  riskFactors: string[];
  documentationNeeds: string[];
}

export interface ComplianceChecklistItem {
  id: string;
  text: string;
  category: ComplianceCategory;
  articleRef: string;
  priority: "high" | "medium" | "low";
  relatedFindings: { id: number; name: string; type: string }[];
  completed: boolean;
}

export interface ComplianceSummary {
  totalRequirements: number;
  byCategory: Record<ComplianceCategory, number>;
  byPriority: { high: number; medium: number; low: number };
  coveragePercentage: number;
}

export interface ComplianceMappingResponse {
  scanId: number;
  repository: {
    owner: string;
    name: string;
    url: string;
  };
  mappings: ComplianceFindingMapping[];
  checklist: ComplianceChecklistItem[];
  summary: ComplianceSummary;
  generatedAt: string;
}

/**
 * Get compliance mapping for a scan
 *
 * Maps all findings from a scan to EU AI Act compliance requirements
 * and generates a comprehensive checklist.
 */
export async function getComplianceMapping(
  scanId: number,
  ctx: IServiceContext
): Promise<ComplianceMappingResponse> {
  // Verify scan exists and is completed
  const scan = await getScanWithUserQuery(scanId, ctx.organizationId);
  if (!scan) {
    throw new NotFoundException(`Scan with ID ${scanId} not found`);
  }

  if (scan.status !== "completed") {
    throw new BusinessLogicException(
      "Compliance mapping is only available for completed scans"
    );
  }

  // Get all findings for the scan using batched query
  const findings = await getAllFindingsForExportQuery(
    scanId,
    ctx.organizationId
    // No exclusions - include all finding types for compliance mapping
  );

  // Map each finding to compliance requirements
  const mappings: ComplianceFindingMapping[] = findings.map((finding) => ({
    findingId: finding.id!,
    findingName: finding.name,
    findingType: finding.finding_type,
    provider: finding.provider || "",
    requirements: getComplianceRequirementsForFinding(
      finding.finding_type,
      finding.provider
    ),
    riskFactors: getRiskFactorsForFinding(finding.finding_type),
    documentationNeeds: getDocumentationNeedsForFinding(finding.finding_type),
  }));

  // Generate unified checklist from all mappings
  const checklist = generateComplianceChecklist(mappings);

  // Calculate summary statistics
  const summary = calculateComplianceSummary(mappings, checklist);

  return {
    scanId,
    repository: {
      owner: scan.repository_owner,
      name: scan.repository_name,
      url: scan.repository_url,
    },
    mappings,
    checklist,
    summary,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Generate a consolidated compliance checklist from finding mappings
 */
function generateComplianceChecklist(
  mappings: ComplianceFindingMapping[]
): ComplianceChecklistItem[] {
  // Collect all unique checklist items with their related findings
  const checklistMap = new Map<
    string,
    {
      item: string;
      requirement: ComplianceRequirement;
      findings: { id: number; name: string; type: string }[];
    }
  >();

  for (const mapping of mappings) {
    for (const requirement of mapping.requirements) {
      for (const checkItem of requirement.checklistItems) {
        const key = `${requirement.id}::${checkItem}`;
        const existing = checklistMap.get(key);

        if (existing) {
          // Only add finding if not already present (avoid duplicates)
          const alreadyExists = existing.findings.some(
            (f) => f.id === mapping.findingId
          );
          if (!alreadyExists) {
            existing.findings.push({
              id: mapping.findingId,
              name: mapping.findingName,
              type: mapping.findingType,
            });
          }
        } else {
          checklistMap.set(key, {
            item: checkItem,
            requirement,
            findings: [
              {
                id: mapping.findingId,
                name: mapping.findingName,
                type: mapping.findingType,
              },
            ],
          });
        }
      }
    }
  }

  // Convert to checklist items with priority based on finding count and requirement type
  const checklist: ComplianceChecklistItem[] = [];

  for (const [key, value] of checklistMap) {
    const priority = determinePriority(value.requirement, value.findings.length);

    checklist.push({
      id: key,
      text: value.item,
      category: value.requirement.category,
      articleRef: value.requirement.articleRef,
      priority,
      relatedFindings: value.findings,
      completed: false, // Default to not completed
    });
  }

  // Sort by priority (high first) then by category
  return checklist.sort((a, b) => {
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    }
    return a.category.localeCompare(b.category);
  });
}

/**
 * Determine priority of a checklist item
 */
function determinePriority(
  requirement: ComplianceRequirement,
  findingCount: number
): "high" | "medium" | "low" {
  // High priority: security, or required documentation with many findings
  if (
    requirement.category === "security" ||
    (requirement.documentationRequired === "required" && findingCount >= 3)
  ) {
    return "high";
  }

  // Medium priority: human oversight, risk management, or moderate findings
  if (
    requirement.category === "human_oversight" ||
    requirement.category === "risk_management" ||
    findingCount >= 2
  ) {
    return "medium";
  }

  return "low";
}

/**
 * Calculate compliance summary statistics
 */
function calculateComplianceSummary(
  mappings: ComplianceFindingMapping[],
  checklist: ComplianceChecklistItem[]
): ComplianceSummary {
  // Count unique requirements
  const uniqueRequirements = new Set<string>();
  const byCategory: Record<ComplianceCategory, number> = {
    transparency: 0,
    documentation: 0,
    risk_management: 0,
    data_governance: 0,
    human_oversight: 0,
    security: 0,
    monitoring: 0,
    accountability: 0,
  };

  for (const mapping of mappings) {
    for (const req of mapping.requirements) {
      if (!uniqueRequirements.has(req.id)) {
        uniqueRequirements.add(req.id);
        byCategory[req.category]++;
      }
    }
  }

  // Count by priority
  const byPriority = { high: 0, medium: 0, low: 0 };
  for (const item of checklist) {
    byPriority[item.priority]++;
  }

  // Calculate coverage (percentage of all possible requirements that are triggered)
  const totalPossibleRequirements = Object.keys(COMPLIANCE_REQUIREMENTS).length;
  const coveragePercentage = Math.round(
    (uniqueRequirements.size / totalPossibleRequirements) * 100
  );

  return {
    totalRequirements: uniqueRequirements.size,
    byCategory,
    byPriority,
    coveragePercentage,
  };
}

/**
 * Get compliance requirements for specific finding types
 * Useful for displaying requirements in finding details
 */
export function getRequirementsForFindingType(
  findingType: string,
  provider?: string
): ComplianceRequirement[] {
  return getComplianceRequirementsForFinding(findingType, provider);
}
