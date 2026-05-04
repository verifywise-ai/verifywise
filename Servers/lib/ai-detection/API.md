# AI Detection Library - API Reference

## Quick Reference

```typescript
import {
  // Main class
  AIDetector,

  // Convenience functions
  quickScan,
  scanForSecrets,
  scanForApiCalls,

  // Pattern data
  ALL_PATTERNS,
  PATTERN_CATEGORIES,
  CLOUD_PROVIDER_PATTERNS,
  FRAMEWORK_PATTERNS,
  LOCAL_ML_PATTERNS,

  // Utility functions
  calculateRiskLevel,
  calculateEntropy,
  meetsEntropyThreshold,
  shouldScanLine,
  maskSecret,
  truncateMatch,
  isCodeFile,
  isDependencyFile,
  getFileType,

  // Types
  type DetectionPattern,
  type PatternMatch,
  type Finding,
  type FileScanResult,
  type ScanResult,
  type ScanSummary,
  type ScannerOptions,
  type FindingType,
  type RiskLevel,
  type ConfidenceLevel,
} from "./lib/ai-detection";
```

## AIDetector Class

### Constructor

```typescript
new AIDetector(options?: ScannerOptions)
```

### Instance Methods

| Method                  | Parameters                          | Returns              | Description           |
| ----------------------- | ----------------------------------- | -------------------- | --------------------- |
| `scanFile`              | `content: string, filePath: string` | `FileScanResult`     | Scan single file      |
| `scanFiles`             | `files: {path, content}[]`          | `ScanResult`         | Scan multiple files   |
| `getPatterns`           | -                                   | `DetectionPattern[]` | Get all patterns      |
| `getPatternsByProvider` | `provider: string`                  | `DetectionPattern[]` | Filter by provider    |
| `getSecretPatterns`     | -                                   | `DetectionPattern[]` | Get secret patterns   |
| `getApiCallPatterns`    | -                                   | `DetectionPattern[]` | Get API call patterns |
| `addPatterns`           | `patterns: DetectionPattern[]`      | `void`               | Add custom patterns   |
| `setPatterns`           | `patterns: DetectionPattern[]`      | `void`               | Replace all patterns  |

## Convenience Functions

| Function          | Parameters                    | Returns          | Description             |
| ----------------- | ----------------------------- | ---------------- | ----------------------- |
| `quickScan`       | `content, filePath, options?` | `FileScanResult` | Quick single-file scan  |
| `scanForSecrets`  | `content, filePath, options?` | `PatternMatch[]` | Scan for secrets only   |
| `scanForApiCalls` | `content, filePath, options?` | `PatternMatch[]` | Scan for API calls only |

## Utility Functions

| Function                | Parameters              | Returns                               | Description              |
| ----------------------- | ----------------------- | ------------------------------------- | ------------------------ |
| `calculateRiskLevel`    | `provider, findingType` | `RiskLevel`                           | Calculate risk level     |
| `calculateEntropy`      | `str`                   | `number`                              | Shannon entropy (0-8)    |
| `meetsEntropyThreshold` | `text, minEntropy?`     | `boolean`                             | Check entropy threshold  |
| `shouldScanLine`        | `line, pattern`         | `boolean`                             | Keyword pre-filter check |
| `maskSecret`            | `secret`                | `string`                              | Mask secret for display  |
| `truncateMatch`         | `text, maxLength?`      | `string`                              | Truncate matched text    |
| `isCodeFile`            | `filePath`              | `boolean`                             | Check if code file       |
| `isDependencyFile`      | `filePath`              | `boolean`                             | Check if dependency file |
| `getFileType`           | `filePath`              | `"code" \| "dependency" \| "unknown"` | Get file type            |

## Type Definitions

### ScannerOptions

```typescript
interface ScannerOptions {
  useKeywordFiltering?: boolean; // default: true
  useEntropyChecking?: boolean; // default: true
  minEntropyThreshold?: number; // default: 3.0
  codeExtensions?: string[]; // default: [".py", ".js", ...]
  dependencyFiles?: string[]; // default: ["package.json", ...]
  ignorePaths?: string[]; // default: ["node_modules/**", ...]
  maxFileSize?: number; // default: 1048576 (1MB)
}
```

### FileScanResult

```typescript
interface FileScanResult {
  filePath: string;
  fileType: "code" | "dependency";
  matches: PatternMatch[];
}
```

### PatternMatch

```typescript
interface PatternMatch {
  pattern: DetectionPattern;
  findingType: "library" | "dependency" | "api_call" | "secret";
  lineNumber: number;
  matchedText: string;
  riskLevel: "high" | "medium" | "low";
}
```

### ScanResult

```typescript
interface ScanResult {
  filesScanned: number;
  findings: Finding[];
  summary: ScanSummary;
}
```

### Finding

```typescript
interface Finding {
  pattern: DetectionPattern;
  findingType: FindingType;
  category: string;
  filePaths: FilePath[];
  riskLevel: RiskLevel;
}
```

### ScanSummary

```typescript
interface ScanSummary {
  total: number;
  byConfidence: Record<"high" | "medium" | "low", number>;
  byProvider: Record<string, number>;
  byFindingType: Record<FindingType, number>;
  byRiskLevel: Record<"high" | "medium" | "low", number>;
}
```

### DetectionPattern

```typescript
interface DetectionPattern {
  name: string;
  provider: string;
  description: string;
  documentationUrl: string;
  confidence: "high" | "medium" | "low";
  patterns: {
    imports?: RegExp[];
    dependencies?: RegExp[];
    apiCalls?: RegExp[];
    secrets?: RegExp[];
  };
  keywords?: string[];
  minEntropy?: number;
}
```

## Pattern Categories

### Cloud Providers (45 patterns)

`CLOUD_PROVIDER_PATTERNS` - High risk, sends data to external APIs
Includes: OpenAI, Anthropic, Google AI, Azure OpenAI, AWS Bedrock, Cohere, Mistral, Replicate, HuggingFace, Groq, Together AI, Perplexity, Fireworks AI, DeepSeek, AI21, Cerebras, xAI, ElevenLabs, AssemblyAI, Deepgram, Stability AI, Clarifai, Databricks, Modal, LangSmith, LangFuse, Arize, Weights & Biases, OpenRouter, SambaNova, Lepton AI, Anyscale, Baseten, Voyage AI, Jina AI, Unify AI, Writer, Pinecone, Weaviate, Qdrant, Milvus, Chroma, Helicone, Braintrust, Portkey

### Frameworks (17 patterns)

`FRAMEWORK_PATTERNS` - Medium risk, can use cloud or local
Includes: LangChain, LlamaIndex, Haystack, CrewAI, Semantic Kernel, AutoGen, Instructor, Guidance, DSPy, LiteLLM, Phidata, Pydantic AI, Smolagents, Agency Swarm, ControlFlow, Marvin, Vercel AI SDK

### Local ML (21 patterns)

`LOCAL_ML_PATTERNS` - Low risk, processes data locally

## Examples

### Basic Scanning

```typescript
const detector = new AIDetector();

// Scan Python file
const result = detector.scanFile(
  `
import openai
client = openai.OpenAI()
response = client.chat.completions.create(model="gpt-4")
`,
  "app.py",
);

// result.matches contains:
// - library finding for "import openai"
// - api_call finding for "client.chat.completions.create"
```

### Batch Scanning

```typescript
const results = detector.scanFiles([
  { path: "main.py", content: "import anthropic" },
  { path: "package.json", content: '{"dependencies":{"openai":"^4.0"}}' },
]);

console.log(results.summary);
// { total: 2, byProvider: { Anthropic: 1, OpenAI: 1 }, ... }
```

### Secret Detection

```typescript
const secrets = scanForSecrets(
  `
OPENAI_API_KEY = "sk-proj-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
`,
  "config.py",
);

// Returns matches with findingType: "secret"
```

### Custom Configuration

```typescript
const detector = new AIDetector({
  useKeywordFiltering: true,
  useEntropyChecking: true,
  minEntropyThreshold: 4.0, // Stricter entropy check
  ignorePaths: ["test/**", "*.test.ts"],
  maxFileSize: 500 * 1024, // 500KB limit
});
```

### Adding Custom Patterns

```typescript
detector.addPatterns([
  {
    name: "custom-ai",
    provider: "Custom AI",
    description: "Custom AI service",
    documentationUrl: "https://docs.custom.ai",
    confidence: "high",
    keywords: ["custom_ai"],
    patterns: {
      imports: [/import\s+custom_ai/],
      apiCalls: [/custom_ai\.generate\(/],
      secrets: [/CUSTOM_AI_KEY\s*=\s*["'][^"']+["']/],
    },
  },
]);
```
