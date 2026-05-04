/**
 * @fileoverview Type definitions for AI Detection Library
 * @module lib/ai-detection/types
 */

// ============================================================================
// Core Types
// ============================================================================

/**
 * Confidence level for pattern detection
 * - high: Definitive AI/ML library with no false positive risk
 * - medium: Likely AI/ML related but could have other uses
 * - low: Possibly AI/ML related, requires context
 */
export type ConfidenceLevel = "high" | "medium" | "low";

/**
 * Risk level for findings
 * - high: Cloud AI services, secrets, API calls (data leakage risk)
 * - medium: Frameworks that can use cloud APIs
 * - low: Local-only processing libraries
 */
export type RiskLevel = "high" | "medium" | "low";

/**
 * Type of finding detected
 */
export type FindingType = "library" | "dependency" | "api_call" | "secret";

// ============================================================================
// Pattern Definition Types
// ============================================================================

/**
 * Pattern matching configuration
 */
export interface PatternConfig {
  /** Regex patterns for import statements in code files */
  imports?: RegExp[];
  /** Regex patterns for dependency file entries (package.json, requirements.txt) */
  dependencies?: RegExp[];
  /** Regex patterns for API calls (REST endpoints and SDK method calls) */
  apiCalls?: RegExp[];
  /** Regex patterns for hardcoded secrets (API keys, tokens) */
  secrets?: RegExp[];
}

/**
 * Detection pattern definition with industry best practices
 */
export interface DetectionPattern {
  /** Display name of the library/service */
  name: string;
  /** Provider/company that created the library */
  provider: string;
  /** Description of what the library does */
  description: string;
  /** Link to official documentation */
  documentationUrl: string;
  /** Confidence level for detection */
  confidence: ConfidenceLevel;
  /** Pattern definitions */
  patterns: PatternConfig;
  /**
   * Keywords for fast pre-filtering (industry best practice from TruffleHog)
   * Lines are only scanned if they contain at least one keyword
   */
  keywords?: string[];
  /**
   * Minimum Shannon entropy for secret detection (from Gitleaks)
   * Higher values = more random strings, fewer false positives
   * Typical values: 3.0 for base64, 4.0 for hex
   */
  minEntropy?: number;
}

/**
 * Category grouping for patterns
 */
export interface PatternCategory {
  /** Category name (e.g., "Cloud AI Providers", "ML Frameworks") */
  name: string;
  /** Patterns in this category */
  patterns: DetectionPattern[];
}

// ============================================================================
// Scanner Types
// ============================================================================

/**
 * Match result from scanning a line
 */
export interface PatternMatch {
  /** The pattern that matched */
  pattern: DetectionPattern;
  /** Type of finding */
  findingType: FindingType;
  /** Line number where match was found (1-based) */
  lineNumber: number;
  /** The matched text (truncated for display) */
  matchedText: string;
  /** Risk level calculated from provider and finding type */
  riskLevel: RiskLevel;
}

/**
 * File path information for a finding
 */
export interface FilePath {
  /** Path to the file */
  path: string;
  /** Line number (1-based, null if not applicable) */
  lineNumber: number | null;
  /** The matched text */
  matchedText: string;
}

/**
 * Aggregated finding (multiple matches of same pattern)
 */
export interface Finding {
  /** Pattern that was detected */
  pattern: DetectionPattern;
  /** Type of finding */
  findingType: FindingType;
  /** Category name */
  category: string;
  /** All file paths where this pattern was found */
  filePaths: FilePath[];
  /** Calculated risk level */
  riskLevel: RiskLevel;
}

/**
 * Scan result for a single file
 */
export interface FileScanResult {
  /** File path */
  filePath: string;
  /** File type (code or dependency) */
  fileType: "code" | "dependency";
  /** All matches found in this file */
  matches: PatternMatch[];
}

/**
 * Scan result for entire repository
 */
export interface ScanResult {
  /** Total files scanned */
  filesScanned: number;
  /** Aggregated findings */
  findings: Finding[];
  /** Summary statistics */
  summary: ScanSummary;
}

/**
 * Summary statistics for a scan
 */
export interface ScanSummary {
  /** Total findings count */
  total: number;
  /** Breakdown by confidence level */
  byConfidence: Record<ConfidenceLevel, number>;
  /** Breakdown by provider */
  byProvider: Record<string, number>;
  /** Breakdown by finding type */
  byFindingType: Record<FindingType, number>;
  /** Breakdown by risk level */
  byRiskLevel: Record<RiskLevel, number>;
}

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Scanner configuration options
 */
export interface ScannerOptions {
  /** Enable keyword pre-filtering for performance (default: true) */
  useKeywordFiltering?: boolean;
  /** Enable entropy checking for secrets (default: true) */
  useEntropyChecking?: boolean;
  /** Minimum entropy threshold override */
  minEntropyThreshold?: number;
  /** File extensions to scan as code files */
  codeExtensions?: string[];
  /** Dependency file names to scan */
  dependencyFiles?: string[];
  /** Paths to ignore (glob patterns) */
  ignorePaths?: string[];
  /** Maximum file size to scan (bytes) */
  maxFileSize?: number;
}

/**
 * Default scanner options
 */
export const DEFAULT_SCANNER_OPTIONS: Required<ScannerOptions> = {
  useKeywordFiltering: true,
  useEntropyChecking: true,
  minEntropyThreshold: 3.0,
  codeExtensions: [
    ".py",
    ".js",
    ".mjs",
    ".cjs",
    ".ts",
    ".tsx",
    ".jsx",
    ".java",
    ".go",
    ".rb",
    ".rs",
    ".cpp",
    ".cc",
    ".c",
    ".h",
    ".hpp",
    ".cs",
    ".scala",
    ".kt",
    ".swift",
    ".r",
    ".R",
    ".jl",
  ],
  dependencyFiles: [
    "package.json",
    "requirements.txt",
    "Pipfile",
    "pyproject.toml",
    "setup.py",
    "environment.yml",
    "conda.yaml",
    "Gemfile",
    "build.gradle",
    "pom.xml",
    "go.mod",
    "Cargo.toml",
  ],
  ignorePaths: [
    "node_modules/**",
    ".git/**",
    "__pycache__/**",
    "*.min.js",
    "dist/**",
    "build/**",
    "vendor/**",
  ],
  maxFileSize: 1024 * 1024, // 1MB
};
