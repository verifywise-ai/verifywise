/**
 * @fileoverview Utility functions for AI Detection Library
 * @module lib/ai-detection/utils
 */

import type { RiskLevel, FindingType, DetectionPattern } from "./types";

// ============================================================================
// Risk Level Calculation
// ============================================================================

/**
 * Cloud AI providers that send data to external APIs (high risk)
 * These services process data on remote servers, posing data leakage risk
 */
export const HIGH_RISK_PROVIDERS = [
  "OpenAI",
  "Anthropic",
  "Google",
  "Microsoft",
  "AWS",
  "Cohere",
  "Mistral AI",
  "Replicate",
  "Hugging Face",
  "Together AI",
  "Groq",
  "Perplexity",
  "Anyscale",
  "Fireworks AI",
  "AI21 Labs",
  "Cerebras",
  "DeepSeek",
] as const;

/**
 * Frameworks that can use cloud APIs but also support local models (medium risk)
 * Risk depends on configuration
 */
export const MEDIUM_RISK_PROVIDERS = [
  "LangChain",
  "LlamaIndex",
  "Haystack",
  "CrewAI",
  "Semantic Kernel",
  "AutoGen",
] as const;

/**
 * Local-only processing libraries (low risk)
 * Data stays on local machine, minimal data exposure risk
 */
export const LOW_RISK_PROVIDERS = [
  "PyTorch",
  "TensorFlow",
  "Keras",
  "scikit-learn",
  "Ollama",
  "NVIDIA",
  "Meta",
  "JAX",
  "MXNet",
  "ONNX",
  "NumPy",
  "Pandas",
  "Matplotlib",
  "SciPy",
  "Dask",
  "XGBoost",
  "LightGBM",
  "CatBoost",
  "spaCy",
  "NLTK",
  "Transformers",
  "Accelerate",
  "PEFT",
  "vLLM",
  "llama.cpp",
] as const;

/**
 * Calculate risk level for a finding based on provider and finding type
 *
 * Risk Level Logic:
 * - secret findings: Always HIGH (exposed credentials = immediate risk)
 * - api_call findings: Always HIGH (active data transmission)
 * - library findings: Based on provider classification
 */
export function calculateRiskLevel(provider: string, findingType: FindingType): RiskLevel {
  // Secret findings are always high risk - exposed credentials
  if (findingType === "secret") {
    return "high";
  }

  // API call findings are always high risk - active data transmission
  if (findingType === "api_call") {
    return "high";
  }

  // For library/dependency findings, check provider classification
  if ((HIGH_RISK_PROVIDERS as readonly string[]).includes(provider)) {
    return "high";
  }

  if ((MEDIUM_RISK_PROVIDERS as readonly string[]).includes(provider)) {
    return "medium";
  }

  if ((LOW_RISK_PROVIDERS as readonly string[]).includes(provider)) {
    return "low";
  }

  // Default to medium for unknown providers
  return "medium";
}

// ============================================================================
// Keyword Pre-filtering (TruffleHog best practice)
// ============================================================================

/**
 * Check if a line should be scanned based on keyword pre-filtering
 * This is a performance optimization - only run expensive regex on lines
 * that contain relevant keywords
 *
 * @param line - The line of code to check
 * @param pattern - The pattern with optional keywords
 * @returns true if the line should be scanned
 */
export function shouldScanLine(line: string, pattern: DetectionPattern): boolean {
  // If no keywords defined, always scan (backwards compatible)
  if (!pattern.keywords || pattern.keywords.length === 0) {
    return true;
  }

  // Fast keyword check (case-insensitive)
  const lowerLine = line.toLowerCase();
  return pattern.keywords.some((keyword) => lowerLine.includes(keyword.toLowerCase()));
}

/**
 * Check if any pattern's keywords match the line
 * Used for bulk filtering before detailed scanning
 */
export function lineMatchesAnyKeyword(line: string, patterns: DetectionPattern[]): boolean {
  const lowerLine = line.toLowerCase();

  for (const pattern of patterns) {
    if (!pattern.keywords || pattern.keywords.length === 0) {
      return true; // No keywords means always scan
    }
    if (pattern.keywords.some((kw) => lowerLine.includes(kw.toLowerCase()))) {
      return true;
    }
  }

  return false;
}

// ============================================================================
// Entropy Calculation (Gitleaks best practice)
// ============================================================================

/**
 * Calculate Shannon entropy of a string
 * Higher entropy = more random = more likely to be a secret
 *
 * Typical thresholds:
 * - 3.0 for base64 encoded strings
 * - 4.0 for hex encoded strings
 * - 4.5 for high-entropy secrets
 *
 * @param str - The string to calculate entropy for
 * @returns Shannon entropy value (0-8 for ASCII)
 */
export function calculateEntropy(str: string): number {
  if (!str || str.length === 0) {
    return 0;
  }

  // Count character frequencies
  const freq: Record<string, number> = {};
  for (const char of str) {
    freq[char] = (freq[char] || 0) + 1;
  }

  // Calculate entropy
  const len = str.length;
  let entropy = 0;

  for (const count of Object.values(freq)) {
    const p = count / len;
    entropy -= p * Math.log2(p);
  }

  return entropy;
}

/**
 * Check if a matched string meets the minimum entropy threshold
 *
 * @param matchedText - The matched text to check
 * @param minEntropy - Minimum entropy threshold (default: 3.0)
 * @returns true if entropy is high enough
 */
export function meetsEntropyThreshold(matchedText: string, minEntropy: number = 3.0): boolean {
  // Extract the secret part (after = or : if present)
  const secretMatch = matchedText.match(/[=:]\s*["']?([^"'\s]+)["']?/);
  const secretPart = secretMatch ? secretMatch[1] : matchedText;

  // Skip very short strings (likely not secrets)
  if (secretPart.length < 8) {
    return false;
  }

  return calculateEntropy(secretPart) >= minEntropy;
}

// ============================================================================
// Pattern Matching Utilities
// ============================================================================

/**
 * Truncate matched text for display
 */
export function truncateMatch(text: string, maxLength: number = 100): string {
  if (text.length <= maxLength) {
    return text;
  }
  return text.substring(0, maxLength - 3) + "...";
}

/**
 * Extract the actual secret value from a matched line
 * Useful for verification and masking
 */
export function extractSecretValue(matchedText: string): string | null {
  // Try to extract value after = or :
  const patterns = [
    /["']([^"']+)["']/, // Quoted value
    /[=:]\s*["']?([^\s"']+)["']?/, // Assignment value
  ];

  for (const pattern of patterns) {
    const match = matchedText.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  return matchedText;
}

/**
 * Mask a secret for safe display
 * Shows first and last 4 characters, masks the rest
 */
export function maskSecret(secret: string): string {
  if (secret.length <= 12) {
    return "*".repeat(secret.length);
  }

  const start = secret.substring(0, 4);
  const end = secret.substring(secret.length - 4);
  const masked = "*".repeat(Math.min(secret.length - 8, 20));

  return `${start}${masked}${end}`;
}

// ============================================================================
// File Type Detection
// ============================================================================

/**
 * Default code file extensions
 */
export const CODE_EXTENSIONS = [
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
] as const;

/**
 * Default dependency file names
 */
export const DEPENDENCY_FILES = [
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
] as const;

/**
 * Determine if a file is a code file based on extension
 */
export function isCodeFile(filePath: string): boolean {
  const lastDotIndex = filePath.lastIndexOf(".");
  // No extension found
  if (lastDotIndex === -1 || lastDotIndex === filePath.length - 1) {
    return false;
  }
  const ext = filePath.substring(lastDotIndex).toLowerCase();
  return (CODE_EXTENSIONS as readonly string[]).includes(ext);
}

/**
 * Determine if a file is a dependency file based on name
 */
export function isDependencyFile(filePath: string): boolean {
  const fileName = filePath.split("/").pop() || "";
  return (DEPENDENCY_FILES as readonly string[]).includes(fileName);
}

/**
 * Get file type for scanning
 */
export function getFileType(filePath: string): "code" | "dependency" | "unknown" {
  if (isDependencyFile(filePath)) {
    return "dependency";
  }
  if (isCodeFile(filePath)) {
    return "code";
  }
  return "unknown";
}
