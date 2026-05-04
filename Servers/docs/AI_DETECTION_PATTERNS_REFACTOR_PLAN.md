# AI Detection Patterns Refactor Plan

## Overview

Refactor our AI detection patterns based on industry best practices from TruffleHog, Gitleaks, and Semgrep. The goal is to reduce false positives while maintaining comprehensive detection coverage.

---

## Key Learnings from Industry Tools

### 1. TruffleHog Approach

- **Keyword pre-filtering**: Check for keywords BEFORE running regex (fast filtering)
- **Specific patterns**: Use exact key formats (e.g., `T3BlbkFJ` base64 marker for OpenAI)
- **Verification endpoints**: Validate secrets against actual APIs
- **800+ detectors** with high precision

### 2. Gitleaks Approach

- **Entropy thresholds**: Filter out low-entropy strings (reduce false positives)
- **Keyword anchoring**: Patterns require context keywords nearby
- **Allowlists**: Exclude known false positive patterns
- **TOML configuration**: Easy to add/modify patterns

### 3. Semgrep Shadow AI Approach

- **API URLs as primary signal**: Most reliable detection method
- **Import detection**: Track library usage via imports
- **Framework-aware**: Detect LangChain, LlamaIndex wrapper patterns

---

## Current Problems in Our Implementation

### Secret Detection Issues

| Problem              | Example                      | Impact                     |
| -------------------- | ---------------------------- | -------------------------- |
| Too broad patterns   | `/sk-[A-Za-z0-9]{32,}/`      | Matches non-OpenAI keys    |
| Missing key formats  | No `sk-proj-`, `sk-svcacct-` | Misses new OpenAI formats  |
| No keyword filtering | Regex runs on all lines      | Slow, more false positives |

### API Call Detection Issues

| Problem              | Example                        | Impact                        |
| -------------------- | ------------------------------ | ----------------------------- |
| Generic method names | `/.invoke\s*\(/`               | Matches ANY `.invoke()` call  |
| Variable assumptions | `/client\.chat\s*\(/`          | Matches any "client" variable |
| Missing API URLs     | Not detecting `api.openai.com` | Unreliable detection          |

---

## Refactoring Plan

### Phase 1: Adopt Industry Secret Patterns

#### OpenAI (from TruffleHog/Gitleaks)

```typescript
secrets: [
  // Standard API keys (contains base64 "OpenAI" marker: T3BlbkFJ)
  /\bsk-[A-Za-z0-9_-]*T3BlbkFJ[A-Za-z0-9_-]*\b/,
  // Project keys (new format)
  /\bsk-proj-[A-Za-z0-9_-]{20,}\b/,
  // Service account keys
  /\bsk-svcacct-[A-Za-z0-9_-]{20,}\b/,
  // Admin keys
  /\bsk-admin-[A-Za-z0-9_-]{20,}\b/,
],
keywords: ["T3BlbkFJ", "sk-proj-", "sk-svcacct-", "sk-admin-", "OPENAI_API_KEY"],
```

#### Anthropic (from TruffleHog)

```typescript
secrets: [
  // API keys (exactly 93 chars + AA suffix)
  /\bsk-ant-api03-[A-Za-z0-9_-]{93}AA\b/,
  // Admin keys
  /\bsk-ant-admin01-[A-Za-z0-9_-]{93}AA\b/,
],
keywords: ["sk-ant-api03", "sk-ant-admin01", "ANTHROPIC_API_KEY"],
```

#### Hugging Face (from Gitleaks)

```typescript
secrets: [
  // Access tokens
  /\bhf_[A-Za-z]{34}\b/,
  // Organization tokens
  /\bapi_org_[A-Za-z]{34}\b/,
],
keywords: ["hf_", "api_org_", "HUGGINGFACE", "HF_TOKEN"],
```

#### Cohere (from Gitleaks)

```typescript
secrets: [
  // API tokens (40 chars, context required)
  /\b[A-Za-z0-9]{40}\b/,  // Only when near "cohere" keyword
],
keywords: ["cohere", "co_api_key", "COHERE_API_KEY"],
entropy: 4.0,  // High entropy required
```

#### Perplexity (from Gitleaks)

```typescript
secrets: [
  /\bpplx-[A-Za-z0-9]{48}\b/,
],
keywords: ["pplx-", "PERPLEXITY_API_KEY"],
```

#### Replicate

```typescript
secrets: [
  /\br8_[A-Za-z0-9]{36,}\b/,
],
keywords: ["r8_", "REPLICATE_API_TOKEN"],
```

#### Google AI

```typescript
secrets: [
  /\bAIza[A-Za-z0-9_-]{35}\b/,
],
keywords: ["AIza", "GOOGLE_API_KEY", "GEMINI_API_KEY"],
```

#### AWS (for Bedrock)

```typescript
secrets: [
  /\bAKIA[A-Z0-9]{16}\b/,  // Access Key ID
  /\bABSK[A-Za-z0-9+/]{109,269}={0,2}\b/,  // Bedrock specific
],
keywords: ["AKIA", "ABSK", "AWS_ACCESS_KEY", "AWS_SECRET"],
```

---

### Phase 2: Improve API Call Detection

#### Strategy: Prioritize by Reliability

**Tier 1: API URLs (Most Reliable)**

```typescript
apiCalls: [
  // Direct API endpoints - HIGHEST confidence
  /api\.openai\.com/,
  /api\.anthropic\.com/,
  /generativelanguage\.googleapis\.com/,
  /api\.cohere\.ai/,
  /api\.mistral\.ai/,
  /api\.replicate\.com/,
  /api\.together\.xyz/,
  /api\.groq\.com/,
  /api\.perplexity\.ai/,
  /api-inference\.huggingface\.co/,
  /bedrock-runtime\.[^.]+\.amazonaws\.com/,
  /\.openai\.azure\.com/,
],
```

**Tier 2: SDK Client Instantiation (High Reliability)**

```typescript
apiCalls: [
  // OpenAI
  /new\s+OpenAI\s*\(/,
  /OpenAI\s*\(\s*\)/,
  /openai\.OpenAI\s*\(/,

  // Anthropic
  /new\s+Anthropic\s*\(/,
  /Anthropic\s*\(\s*\)/,
  /anthropic\.Anthropic\s*\(/,

  // Google
  /GenerativeModel\s*\(/,
  /genai\.GenerativeModel\s*\(/,

  // Azure
  /AzureOpenAI\s*\(/,

  // LangChain wrappers
  /ChatOpenAI\s*\(/,
  /ChatAnthropic\s*\(/,
  /ChatGoogleGenerativeAI\s*\(/,
],
```

**Tier 3: Provider-Prefixed Method Calls (Medium Reliability)**

```typescript
apiCalls: [
  // OpenAI SDK methods (with openai. prefix)
  /openai\.chat\.completions\.create\s*\(/,
  /openai\.completions\.create\s*\(/,
  /openai\.embeddings\.create\s*\(/,
  /openai\.images\.generate\s*\(/,
  /openai\.audio\.transcriptions\.create\s*\(/,
  /openai\.beta\.assistants\./,
  /openai\.beta\.threads\./,

  // Anthropic SDK methods (with anthropic. prefix)
  /anthropic\.messages\.create\s*\(/,
  /anthropic\.completions\.create\s*\(/,

  // Google SDK methods
  /model\.generate_content\s*\(/,
  /\.generate_content_async\s*\(/,
],
```

**REMOVED: Generic Patterns (Too Many False Positives)**

```typescript
// DO NOT USE - matches non-AI code
/.invoke\s*\(/,        // Matches any invoke()
/.stream\s*\(/,        // Matches Node.js streams
/client\.chat\s*\(/,   // Matches any chat client
/await\s+openai\./,    // Too broad
```

---

### Phase 3: Add Keyword Pre-filtering

#### New Interface Structure

```typescript
export interface DetectionPattern {
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
  // NEW: Keywords for fast pre-filtering
  keywords?: string[];
  // NEW: Minimum entropy for secret detection (optional)
  minEntropy?: number;
}
```

#### Pre-filter Logic

```typescript
function shouldScanLine(line: string, pattern: DetectionPattern): boolean {
  // If no keywords defined, always scan
  if (!pattern.keywords || pattern.keywords.length === 0) {
    return true;
  }

  // Fast keyword check (case-insensitive)
  const lowerLine = line.toLowerCase();
  return pattern.keywords.some((kw) => lowerLine.includes(kw.toLowerCase()));
}
```

---

### Phase 4: Provider-Specific Improvements

#### New Providers to Add

| Provider     | Secret Format | API URL            | Keywords                         |
| ------------ | ------------- | ------------------ | -------------------------------- |
| Groq         | (unknown)     | `api.groq.com`     | `groq`, `GROQ_API_KEY`           |
| Together AI  | (unknown)     | `api.together.xyz` | `together`, `TOGETHER_API_KEY`   |
| Fireworks AI | (unknown)     | `api.fireworks.ai` | `fireworks`, `FIREWORKS_API_KEY` |
| Cerebras     | (unknown)     | `api.cerebras.ai`  | `cerebras`, `CEREBRAS_API_KEY`   |
| DeepSeek     | (unknown)     | `api.deepseek.com` | `deepseek`, `DEEPSEEK_API_KEY`   |

#### Providers to Update

| Provider  | Current Issue           | Fix                            |
| --------- | ----------------------- | ------------------------------ |
| OpenAI    | Missing new key formats | Add `sk-proj-`, `sk-svcacct-`  |
| Anthropic | Pattern too loose       | Use exact `{93}AA` format      |
| Cohere    | Generic `client.chat`   | Remove, use API URL only       |
| Mistral   | Generic patterns        | Use specific `mistral.` prefix |

---

## Implementation Order

### Step 1: Update Secret Patterns (Low Risk)

- Replace loose patterns with industry-standard ones
- Add missing providers (Perplexity, Groq, etc.)
- Add keyword arrays to each provider

### Step 2: Refactor API Call Patterns (Medium Risk)

- Remove all generic patterns (`.invoke`, `.stream`, `client.chat`)
- Organize by reliability tier (URL > Instantiation > Method)
- Add provider prefixes to all method patterns

### Step 3: Add Pre-filtering Infrastructure (Medium Risk)

- Add `keywords` field to interface
- Implement `shouldScanLine()` function
- Update scanner to use pre-filtering

### Step 4: Testing & Validation

- Scan known AI repos to verify detection
- Check for false positives on non-AI repos
- Compare results with TruffleHog/Gitleaks

---

## Success Metrics

| Metric                      | Before   | Target                         |
| --------------------------- | -------- | ------------------------------ |
| False positives (API calls) | High     | < 5%                           |
| OpenAI key detection        | Partial  | 100% of formats                |
| Anthropic key detection     | Partial  | 100% of formats                |
| New provider coverage       | 15       | 20+                            |
| Scan performance            | Baseline | 20% faster (keyword filtering) |

---

## Files to Modify

1. `Servers/config/aiDetectionPatterns.ts` - Main patterns file
2. `Servers/services/aiDetection.service.ts` - Add keyword pre-filtering
3. `Servers/domain.layer/interfaces/i.aiDetection.ts` - Update interfaces if needed

---

## References

- [TruffleHog Detectors](https://github.com/trufflesecurity/trufflehog/tree/main/pkg/detectors)
- [Gitleaks Config](https://github.com/gitleaks/gitleaks/blob/master/config/gitleaks.toml)
- [Semgrep Shadow AI](https://dev.to/semgrep/replit-genai-security-scans-and-shadow-ai-4kek)
- [Secrets Patterns DB](https://mazinahmed.net/blog/secrets-patterns-db/)
