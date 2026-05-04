/**
 * @fileoverview AI Detection Scanner
 * @module lib/ai-detection/scanner
 *
 * Main scanning logic for detecting AI/ML usage in code.
 * Implements industry best practices from TruffleHog and Gitleaks.
 */

import type {
  DetectionPattern,
  PatternMatch,
  FileScanResult,
  ScanResult,
  Finding,
  ScannerOptions,
  ScanSummary,
  FindingType,
} from "./types";
import { DEFAULT_SCANNER_OPTIONS } from "./types";
import { ALL_PATTERNS, PATTERN_CATEGORIES } from "./patterns";
import {
  calculateRiskLevel,
  shouldScanLine,
  meetsEntropyThreshold,
  truncateMatch,
  isCodeFile,
  isDependencyFile,
  getFileType,
} from "./utils";

// ============================================================================
// AIDetector Class
// ============================================================================

/**
 * Main scanner class for detecting AI/ML usage in code
 *
 * @example
 * ```typescript
 * const detector = new AIDetector();
 *
 * // Scan a single file
 * const result = detector.scanFile(content, 'app.py');
 *
 * // Scan multiple files
 * const results = detector.scanFiles([
 *   { path: 'app.py', content: '...' },
 *   { path: 'package.json', content: '...' },
 * ]);
 * ```
 */
export class AIDetector {
  private options: Required<ScannerOptions>;
  private patterns: DetectionPattern[];

  constructor(options: ScannerOptions = {}) {
    this.options = { ...DEFAULT_SCANNER_OPTIONS, ...options };
    this.patterns = ALL_PATTERNS;
  }

  /**
   * Scan a single file for AI/ML patterns
   */
  scanFile(content: string, filePath: string): FileScanResult {
    const fileType = getFileType(filePath);

    // Skip unknown file types
    if (fileType === "unknown") {
      return {
        filePath,
        fileType: "code", // Default to code for type compatibility
        matches: [],
      };
    }

    const matches = this.scanContent(content, filePath, fileType);

    return {
      filePath,
      fileType,
      matches,
    };
  }

  /**
   * Scan multiple files and aggregate results
   */
  scanFiles(files: Array<{ path: string; content: string }>): ScanResult {
    const allMatches: PatternMatch[] = [];
    let filesScanned = 0;

    for (const file of files) {
      // Skip files that are too large
      if (file.content.length > this.options.maxFileSize) {
        continue;
      }

      // Skip ignored paths
      if (this.shouldIgnorePath(file.path)) {
        continue;
      }

      const result = this.scanFile(file.content, file.path);
      if (result.matches.length > 0) {
        // Add filePath to each match for aggregation
        for (const match of result.matches) {
          allMatches.push({ ...match, filePath: file.path } as PatternMatch & { filePath: string });
        }
      }
      filesScanned++;
    }

    // Aggregate matches into findings
    const findings = this.aggregateMatches(allMatches);

    return {
      filesScanned,
      findings,
      summary: this.calculateSummary(findings),
    };
  }

  /**
   * Scan content for patterns
   */
  private scanContent(
    content: string,
    filePath: string,
    fileType: "code" | "dependency",
  ): PatternMatch[] {
    const matches: PatternMatch[] = [];
    const lines = content.split("\n");

    for (const pattern of this.patterns) {
      // Check imports/dependencies based on file type
      if (fileType === "code" && pattern.patterns.imports) {
        const importMatches = this.scanForPatternType(
          lines,
          pattern,
          pattern.patterns.imports,
          "library",
        );
        matches.push(...importMatches);
      }

      if (fileType === "dependency" && pattern.patterns.dependencies) {
        const depMatches = this.scanForPatternType(
          lines,
          pattern,
          pattern.patterns.dependencies,
          "dependency",
        );
        matches.push(...depMatches);
      }

      // Check API calls (code files only)
      if (fileType === "code" && pattern.patterns.apiCalls) {
        const apiMatches = this.scanForPatternType(
          lines,
          pattern,
          pattern.patterns.apiCalls,
          "api_call",
        );
        matches.push(...apiMatches);
      }

      // Check secrets (all files)
      if (pattern.patterns.secrets) {
        const secretMatches = this.scanForSecrets(lines, pattern, pattern.patterns.secrets);
        matches.push(...secretMatches);
      }
    }

    return matches;
  }

  /**
   * Scan for a specific pattern type with keyword pre-filtering
   */
  private scanForPatternType(
    lines: string[],
    pattern: DetectionPattern,
    regexes: RegExp[],
    findingType: FindingType,
  ): PatternMatch[] {
    const matches: PatternMatch[] = [];
    const seenPatterns = new Set<string>();

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Keyword pre-filtering (TruffleHog best practice)
      if (this.options.useKeywordFiltering && !shouldScanLine(line, pattern)) {
        continue;
      }

      // Check each regex
      for (const regex of regexes) {
        if (regex.test(line)) {
          // Only one match per pattern per file
          const key = `${pattern.name}::${findingType}`;
          if (!seenPatterns.has(key)) {
            seenPatterns.add(key);
            matches.push({
              pattern,
              findingType,
              lineNumber: i + 1,
              matchedText: truncateMatch(line.trim()),
              riskLevel: calculateRiskLevel(pattern.provider, findingType),
            });
          }
          break; // Move to next line after first match
        }
      }
    }

    return matches;
  }

  /**
   * Scan for secrets with entropy checking
   */
  private scanForSecrets(
    lines: string[],
    pattern: DetectionPattern,
    regexes: RegExp[],
  ): PatternMatch[] {
    const matches: PatternMatch[] = [];
    const seenPatterns = new Set<string>();

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Keyword pre-filtering
      if (this.options.useKeywordFiltering && !shouldScanLine(line, pattern)) {
        continue;
      }

      // Check each regex
      for (const regex of regexes) {
        const match = line.match(regex);
        if (match) {
          // Entropy checking (Gitleaks best practice)
          if (this.options.useEntropyChecking) {
            const threshold = pattern.minEntropy || this.options.minEntropyThreshold;
            if (!meetsEntropyThreshold(match[0], threshold)) {
              continue;
            }
          }

          // Only one match per pattern per file
          const key = `${pattern.name}::secret`;
          if (!seenPatterns.has(key)) {
            seenPatterns.add(key);
            matches.push({
              pattern,
              findingType: "secret",
              lineNumber: i + 1,
              matchedText: truncateMatch(line.trim()),
              riskLevel: "high", // Secrets are always high risk
            });
          }
          break;
        }
      }
    }

    return matches;
  }

  /**
   * Aggregate individual matches into findings
   */
  private aggregateMatches(matches: Array<PatternMatch & { filePath: string }>): Finding[] {
    const findingMap = new Map<string, Finding>();

    for (const match of matches) {
      const key = `${match.pattern.name}::${match.pattern.provider}::${match.findingType}`;

      if (findingMap.has(key)) {
        const existing = findingMap.get(key)!;
        existing.filePaths.push({
          path: match.filePath,
          lineNumber: match.lineNumber,
          matchedText: match.matchedText,
        });
      } else {
        // Find category
        const category = PATTERN_CATEGORIES.find((cat) =>
          cat.patterns.some((p) => p.name === match.pattern.name),
        );

        findingMap.set(key, {
          pattern: match.pattern,
          findingType: match.findingType,
          category: category?.name || "Unknown",
          filePaths: [
            {
              path: match.filePath,
              lineNumber: match.lineNumber,
              matchedText: match.matchedText,
            },
          ],
          riskLevel: match.riskLevel,
        });
      }
    }

    return Array.from(findingMap.values());
  }

  /**
   * Calculate summary statistics
   */
  private calculateSummary(findings: Finding[]): ScanSummary {
    const summary: ScanSummary = {
      total: findings.length,
      byConfidence: { high: 0, medium: 0, low: 0 },
      byProvider: {},
      byFindingType: { library: 0, dependency: 0, api_call: 0, secret: 0 },
      byRiskLevel: { high: 0, medium: 0, low: 0 },
    };

    for (const finding of findings) {
      // By confidence
      summary.byConfidence[finding.pattern.confidence]++;

      // By provider
      const provider = finding.pattern.provider;
      summary.byProvider[provider] = (summary.byProvider[provider] || 0) + 1;

      // By finding type
      summary.byFindingType[finding.findingType]++;

      // By risk level
      summary.byRiskLevel[finding.riskLevel]++;
    }

    return summary;
  }

  /**
   * Check if a path should be ignored
   */
  private shouldIgnorePath(filePath: string): boolean {
    // Simple glob matching (supports ** and *)
    for (const ignorePattern of this.options.ignorePaths) {
      if (this.matchGlob(filePath, ignorePattern)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Simple glob matching
   */
  private matchGlob(path: string, pattern: string): boolean {
    // Convert glob to regex
    // Order matters: escape special regex chars first, then convert glob patterns
    const regexStr = pattern
      .replace(/\\/g, "\\\\") // Escape backslashes first
      .replace(/[.+^${}()|[\]]/g, "\\$&") // Escape other regex metacharacters (except * and ?)
      .replace(/\*\*/g, ".*") // Convert ** to match anything
      .replace(/\*/g, "[^/]*") // Convert * to match anything except /
      .replace(/\?/g, "."); // Convert ? to match single character

    return new RegExp(`^${regexStr}$`).test(path);
  }

  // ============================================================================
  // Public Utility Methods
  // ============================================================================

  /**
   * Get all available patterns
   */
  getPatterns(): DetectionPattern[] {
    return this.patterns;
  }

  /**
   * Get patterns filtered by provider
   */
  getPatternsByProvider(provider: string): DetectionPattern[] {
    return this.patterns.filter((p) => p.provider.toLowerCase() === provider.toLowerCase());
  }

  /**
   * Get patterns that can detect secrets
   */
  getSecretPatterns(): DetectionPattern[] {
    return this.patterns.filter((p) => p.patterns.secrets && p.patterns.secrets.length > 0);
  }

  /**
   * Get patterns that can detect API calls
   */
  getApiCallPatterns(): DetectionPattern[] {
    return this.patterns.filter((p) => p.patterns.apiCalls && p.patterns.apiCalls.length > 0);
  }

  /**
   * Add custom patterns
   */
  addPatterns(patterns: DetectionPattern[]): void {
    this.patterns = [...this.patterns, ...patterns];
  }

  /**
   * Set custom patterns (replaces default)
   */
  setPatterns(patterns: DetectionPattern[]): void {
    this.patterns = patterns;
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Quick scan function for single file
 */
export function quickScan(
  content: string,
  filePath: string,
  options?: ScannerOptions,
): FileScanResult {
  const detector = new AIDetector(options);
  return detector.scanFile(content, filePath);
}

/**
 * Quick scan for secrets only
 */
export function scanForSecrets(
  content: string,
  filePath: string,
  options?: ScannerOptions,
): PatternMatch[] {
  const detector = new AIDetector(options);
  const result = detector.scanFile(content, filePath);
  return result.matches.filter((m) => m.findingType === "secret");
}

/**
 * Quick scan for API calls only
 */
export function scanForApiCalls(
  content: string,
  filePath: string,
  options?: ScannerOptions,
): PatternMatch[] {
  const detector = new AIDetector(options);
  const result = detector.scanFile(content, filePath);
  return result.matches.filter((m) => m.findingType === "api_call");
}
