# AI Detection Library

A TypeScript library for detecting AI/ML libraries, API calls, and hardcoded secrets in codebases. Designed for security scanning and AI governance compliance.

## Features

- **Library Detection**: Identifies AI/ML library imports in code files
- **Dependency Detection**: Scans package managers (package.json, requirements.txt, etc.)
- **API Call Detection**: Finds REST API endpoints and SDK method invocations
- **Secret Detection**: Detects hardcoded API keys with entropy validation
- **Risk Classification**: Categorizes findings by risk level (high/medium/low)
- **83 Detection Patterns**: Covers major AI providers, frameworks, vector databases, and ML tools

## Installation

```typescript
// Internal import (within VerifyWise)
import { AIDetector, ALL_PATTERNS } from "./lib/ai-detection";

// Future: npm package
// npm install @verifywise/ai-detection
```

## Quick Start

```typescript
import { AIDetector } from "./lib/ai-detection";

// Create detector instance
const detector = new AIDetector();

// Scan a single file
const result = detector.scanFile(fileContent, "app.py");
console.log(result.matches);

// Scan multiple files
const results = detector.scanFiles([
  { path: "app.py", content: "import openai..." },
  { path: "package.json", content: '{"dependencies": {...}}' },
]);
console.log(results.findings);
console.log(results.summary);
```

## API Reference

### AIDetector Class

The main scanner class for detecting AI/ML usage in code.

#### Constructor

```typescript
const detector = new AIDetector(options?: ScannerOptions);
```

**ScannerOptions:**

| Option                | Type     | Default   | Description                                  |
| --------------------- | -------- | --------- | -------------------------------------------- |
| `useKeywordFiltering` | boolean  | `true`    | Enable keyword pre-filtering for performance |
| `useEntropyChecking`  | boolean  | `true`    | Enable entropy validation for secrets        |
| `minEntropyThreshold` | number   | `3.0`     | Minimum Shannon entropy for secrets          |
| `codeExtensions`      | string[] | See below | File extensions to scan as code              |
| `dependencyFiles`     | string[] | See below | Dependency file names to scan                |
| `ignorePaths`         | string[] | See below | Glob patterns to ignore                      |
| `maxFileSize`         | number   | `1048576` | Maximum file size in bytes (1MB)             |

**Default Code Extensions:**

```
.py, .js, .mjs, .cjs, .ts, .tsx, .jsx, .java, .go, .rb, .rs,
.cpp, .cc, .c, .h, .hpp, .cs, .scala, .kt, .swift, .r, .R, .jl
```

**Default Dependency Files:**

```
package.json, requirements.txt, Pipfile, pyproject.toml, setup.py,
environment.yml, conda.yaml, Gemfile, build.gradle, pom.xml, go.mod, Cargo.toml
```

**Default Ignore Paths:**

```
node_modules/**, .git/**, __pycache__/**, *.min.js, dist/**, build/**, vendor/**
```

#### Methods

##### `scanFile(content: string, filePath: string): FileScanResult`

Scan a single file for AI/ML patterns.

```typescript
const result = detector.scanFile(code, "main.py");
// Returns: { filePath, fileType, matches: PatternMatch[] }
```

##### `scanFiles(files: Array<{path: string, content: string}>): ScanResult`

Scan multiple files and aggregate results.

```typescript
const result = detector.scanFiles(files);
// Returns: { filesScanned, findings: Finding[], summary: ScanSummary }
```

##### `getPatterns(): DetectionPattern[]`

Get all available detection patterns.

##### `getPatternsByProvider(provider: string): DetectionPattern[]`

Get patterns filtered by provider name.

```typescript
const openaiPatterns = detector.getPatternsByProvider("OpenAI");
```

##### `getSecretPatterns(): DetectionPattern[]`

Get patterns that can detect secrets.

##### `getApiCallPatterns(): DetectionPattern[]`

Get patterns that can detect API calls.

##### `addPatterns(patterns: DetectionPattern[]): void`

Add custom patterns to the detector.

##### `setPatterns(patterns: DetectionPattern[]): void`

Replace all patterns with custom patterns.

### Convenience Functions

```typescript
import { quickScan, scanForSecrets, scanForApiCalls } from "./lib/ai-detection";

// Quick single-file scan
const result = quickScan(content, "app.py");

// Scan for secrets only
const secrets = scanForSecrets(content, "config.py");

// Scan for API calls only
const apiCalls = scanForApiCalls(content, "client.py");
```

## Types

### PatternMatch

```typescript
interface PatternMatch {
  pattern: DetectionPattern; // The pattern that matched
  findingType: FindingType; // "library" | "dependency" | "api_call" | "secret"
  lineNumber: number; // Line number (1-based)
  matchedText: string; // The matched text (truncated)
  riskLevel: RiskLevel; // "high" | "medium" | "low"
}
```

### Finding

```typescript
interface Finding {
  pattern: DetectionPattern; // Pattern that was detected
  findingType: FindingType; // Type of finding
  category: string; // Category name
  filePaths: FilePath[]; // All file paths where found
  riskLevel: RiskLevel; // Calculated risk level
}
```

### ScanSummary

```typescript
interface ScanSummary {
  total: number; // Total findings
  byConfidence: Record<ConfidenceLevel, number>;
  byProvider: Record<string, number>;
  byFindingType: Record<FindingType, number>;
  byRiskLevel: Record<RiskLevel, number>;
}
```

### DetectionPattern

```typescript
interface DetectionPattern {
  name: string; // Pattern identifier
  provider: string; // Provider/company name
  description: string; // Human-readable description
  documentationUrl: string; // Link to official docs
  confidence: ConfidenceLevel; // "high" | "medium" | "low"
  patterns: PatternConfig; // Regex patterns
  keywords?: string[]; // Keywords for pre-filtering
  minEntropy?: number; // Minimum entropy for secrets
}
```

## Supported Providers

### Cloud AI Providers (High Risk)

| Provider     | Pattern Name            | Detection Types                           |
| ------------ | ----------------------- | ----------------------------------------- |
| OpenAI       | `openai`                | imports, dependencies, API calls, secrets |
| Anthropic    | `anthropic`             | imports, dependencies, API calls, secrets |
| Google AI    | `google-generativeai`   | imports, dependencies, API calls, secrets |
| Azure OpenAI | `azure-openai`          | imports, dependencies, API calls, secrets |
| AWS Bedrock  | `aws-bedrock`           | imports, dependencies, API calls, secrets |
| Cohere       | `cohere`                | imports, dependencies, API calls, secrets |
| Mistral AI   | `mistralai`             | imports, dependencies, API calls, secrets |
| Replicate    | `replicate`             | imports, dependencies, API calls, secrets |
| Hugging Face | `huggingface-inference` | imports, dependencies, API calls, secrets |
| Groq         | `groq`                  | imports, dependencies, API calls, secrets |
| Together AI  | `together`              | imports, dependencies, API calls, secrets |
| Perplexity   | `perplexity`            | imports, dependencies, API calls, secrets |
| Fireworks AI | `fireworks-ai`          | imports, dependencies, API calls          |
| DeepSeek     | `deepseek`              | imports, dependencies, API calls, secrets |
| AI21 Labs    | `ai21`                  | imports, dependencies, API calls, secrets |
| Cerebras     | `cerebras`              | imports, dependencies, API calls, secrets |

### AI/ML Frameworks (Medium Risk)

| Provider        | Pattern Name      | Detection Types                  |
| --------------- | ----------------- | -------------------------------- |
| LangChain       | `langchain`       | imports, dependencies, API calls |
| LlamaIndex      | `llamaindex`      | imports, dependencies, API calls |
| Haystack        | `haystack`        | imports, dependencies, API calls |
| CrewAI          | `crewai`          | imports, dependencies, API calls |
| Semantic Kernel | `semantic-kernel` | imports, dependencies, API calls |
| AutoGen         | `autogen`         | imports, dependencies, API calls |
| Instructor      | `instructor`      | imports, dependencies, API calls |
| Guidance        | `guidance`        | imports, dependencies, API calls |
| DSPy            | `dspy`            | imports, dependencies, API calls |
| LiteLLM         | `litellm`         | imports, dependencies, API calls |

### Local ML Libraries (Low Risk)

| Provider         | Pattern Name   | Detection Types                  |
| ---------------- | -------------- | -------------------------------- |
| PyTorch          | `pytorch`      | imports, dependencies            |
| TensorFlow       | `tensorflow`   | imports, dependencies            |
| Keras            | `keras`        | imports, dependencies            |
| scikit-learn     | `scikit-learn` | imports, dependencies            |
| Transformers     | `transformers` | imports, dependencies, API calls |
| Ollama           | `ollama`       | imports, dependencies, API calls |
| llama.cpp        | `llama-cpp`    | imports, dependencies, API calls |
| vLLM             | `vllm`         | imports, dependencies, API calls |
| ONNX Runtime     | `onnxruntime`  | imports, dependencies            |
| JAX              | `jax`          | imports, dependencies            |
| XGBoost          | `xgboost`      | imports, dependencies            |
| LightGBM         | `lightgbm`     | imports, dependencies            |
| CatBoost         | `catboost`     | imports, dependencies            |
| spaCy            | `spacy`        | imports, dependencies            |
| NLTK             | `nltk`         | imports, dependencies            |
| NumPy            | `numpy`        | imports, dependencies            |
| Pandas           | `pandas`       | imports, dependencies            |
| Accelerate       | `accelerate`   | imports, dependencies            |
| PEFT             | `peft`         | imports, dependencies            |
| MLflow           | `mlflow`       | imports, dependencies            |
| Weights & Biases | `wandb`        | imports, dependencies            |

## Risk Levels

Risk levels are calculated based on provider classification and finding type:

| Finding Type             | Risk Level  | Reason                               |
| ------------------------ | ----------- | ------------------------------------ |
| Secret                   | Always High | Exposed credentials = immediate risk |
| API Call                 | Always High | Active data transmission to cloud    |
| Library (Cloud Provider) | High        | Data sent to external APIs           |
| Library (Framework)      | Medium      | Can use cloud APIs but configurable  |
| Library (Local ML)       | Low         | Data stays on-premises               |

## Industry Best Practices

This library implements techniques from industry-leading security tools:

### Keyword Pre-filtering (TruffleHog)

Lines are pre-filtered by keywords before running expensive regex operations. This significantly improves performance on large codebases.

```typescript
// Only scan lines containing relevant keywords
keywords: ["openai", "OPENAI_API_KEY", "sk-proj-", "T3BlbkFJ"];
```

### Entropy Validation (Gitleaks)

Shannon entropy is calculated to filter out low-entropy strings that are unlikely to be real secrets.

```typescript
// Typical entropy thresholds
// 3.0 - base64 encoded strings
// 4.0 - hex encoded strings
// 4.5 - high-entropy secrets
```

### Tiered API Call Detection

API calls are detected using a tiered approach by reliability:

1. **Tier 1 (Most Reliable)**: API URLs

   ```regex
   /api\.openai\.com/
   ```

2. **Tier 2**: SDK Client Instantiation

   ```regex
   /new\s+OpenAI\s*\(/
   ```

3. **Tier 3**: Provider-prefixed Method Calls
   ```regex
   /openai\.chat\.completions\.create\s*\(/
   ```

## Custom Patterns

Add custom detection patterns for internal or proprietary AI services:

```typescript
import { AIDetector, DetectionPattern } from "./lib/ai-detection";

const customPattern: DetectionPattern = {
  name: "internal-ai",
  provider: "Internal AI",
  description: "Internal AI service",
  documentationUrl: "https://internal.docs",
  confidence: "high",
  keywords: ["internal-ai", "INTERNAL_AI_KEY"],
  patterns: {
    imports: [/import\s+internal_ai/],
    dependencies: [/"internal-ai":\s*"/],
    apiCalls: [/internal\.ai\.generate\s*\(/],
    secrets: [/INTERNAL_AI_KEY\s*[=:]\s*["']?[A-Za-z0-9_-]+["']?/],
  },
};

const detector = new AIDetector();
detector.addPatterns([customPattern]);
```

## Utility Functions

### Risk Level Calculation

```typescript
import { calculateRiskLevel } from "./lib/ai-detection";

const risk = calculateRiskLevel("OpenAI", "api_call"); // "high"
const risk = calculateRiskLevel("PyTorch", "library"); // "low"
```

### Entropy Calculation

```typescript
import { calculateEntropy, meetsEntropyThreshold } from "./lib/ai-detection";

const entropy = calculateEntropy("sk-proj-abc123xyz789");
const isHighEntropy = meetsEntropyThreshold("sk-proj-abc123xyz789", 3.0);
```

### Secret Masking

```typescript
import { maskSecret } from "./lib/ai-detection";

const masked = maskSecret("sk-proj-abc123xyz789def456");
// Returns: "sk-p********************f456"
```

### File Type Detection

```typescript
import { isCodeFile, isDependencyFile, getFileType } from "./lib/ai-detection";

isCodeFile("app.py"); // true
isDependencyFile("package.json"); // true
getFileType("main.ts"); // "code"
getFileType("requirements.txt"); // "dependency"
getFileType("README.md"); // "unknown"
```

## Architecture

```
lib/ai-detection/
├── index.ts              # Main entry point
├── types.ts              # Type definitions
├── scanner.ts            # AIDetector class
├── utils.ts              # Utility functions
├── patterns/
│   ├── index.ts          # Pattern exports
│   ├── cloud-providers.ts # Cloud AI provider patterns
│   ├── frameworks.ts     # AI/ML framework patterns
│   └── local-ml.ts       # Local ML library patterns
└── README.md             # This file
```

## Performance

- **Keyword pre-filtering**: 10-100x faster on large files
- **One match per pattern per file**: Prevents duplicate findings
- **Configurable file size limit**: Skip large binary files
- **Glob-based path ignoring**: Skip node_modules, .git, etc.

## Testing

Run the pattern test suite:

```bash
npx tsx lib/ai-detection/test-patterns.ts
```

## License

Part of the VerifyWise platform. See main repository for license details.
