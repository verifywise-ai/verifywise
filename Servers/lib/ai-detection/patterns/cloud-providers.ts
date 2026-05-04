/**
 * @fileoverview Cloud AI Provider Patterns
 *
 * Patterns for detecting cloud-based AI services that send data to external APIs.
 * These are HIGH RISK for data leakage.
 *
 * Pattern sources:
 * - TruffleHog: https://github.com/trufflesecurity/trufflehog
 * - Gitleaks: https://github.com/gitleaks/gitleaks
 *
 * @module lib/ai-detection/patterns/cloud-providers
 */

import type { DetectionPattern } from "../types";

export const CLOUD_PROVIDER_PATTERNS: DetectionPattern[] = [
  // ============================================================================
  // OpenAI
  // ============================================================================
  {
    name: "openai",
    provider: "OpenAI",
    description: "OpenAI API client for GPT, DALL-E, Whisper, and more",
    documentationUrl: "https://platform.openai.com/docs",
    confidence: "high",
    // Keywords for fast pre-filtering (from TruffleHog)
    keywords: [
      "T3BlbkFJ", // Base64 encoded "OpenAI" marker in keys
      "sk-proj-", // Project keys
      "sk-svcacct-", // Service account keys
      "sk-admin-", // Admin keys
      "openai",
      "OPENAI_API_KEY",
      "api.openai.com",
    ],
    patterns: {
      imports: [
        /^import\s+openai/m,
        /^from\s+openai\s+import/m,
        /require\s*\(\s*["']openai["']\s*\)/,
        /import\s+.*\s+from\s+["']openai["']/,
        /import\s+OpenAI\s+from/,
      ],
      dependencies: [/^openai[=<>~!\s@]/m, /"openai"\s*:/, /'openai'\s*:/],
      // Tiered API call detection (most reliable first)
      apiCalls: [
        // Tier 1: API URLs (MOST RELIABLE)
        /api\.openai\.com/,

        // Tier 2: SDK Client Instantiation
        /new\s+OpenAI\s*\(/,
        /OpenAI\s*\(\s*\)/,
        /openai\.OpenAI\s*\(/,

        // Tier 3: Provider-prefixed method calls
        /openai\.chat\.completions\.create\s*\(/,
        /openai\.completions\.create\s*\(/,
        /openai\.embeddings\.create\s*\(/,
        /openai\.images\.generate\s*\(/,
        /openai\.audio\.transcriptions\.create\s*\(/,
        /openai\.audio\.translations\.create\s*\(/,
        /openai\.moderations\.create\s*\(/,
        /openai\.files\.create\s*\(/,
        /openai\.fine_tuning\.jobs\.create\s*\(/,

        // Assistants API
        /openai\.beta\.assistants\./,
        /openai\.beta\.threads\./,
      ],
      // Secret patterns (from Gitleaks - exact format)
      secrets: [
        // Full Gitleaks pattern: sk-(proj|svcacct|admin)-{74 or 58}T3BlbkFJ{74 or 58}
        /\bsk-(?:proj|svcacct|admin)-[A-Za-z0-9_-]{58,74}T3BlbkFJ[A-Za-z0-9_-]{58,74}\b/,
        // Legacy format with T3BlbkFJ marker
        /\bsk-[A-Za-z0-9_-]*T3BlbkFJ[A-Za-z0-9_-]*\b/,
        // Project keys (new format without marker)
        /\bsk-proj-[A-Za-z0-9_-]{48,}\b/,
        // Service account keys
        /\bsk-svcacct-[A-Za-z0-9_-]{48,}\b/,
        // Admin keys
        /\bsk-admin-[A-Za-z0-9_-]{48,}\b/,
        // Environment variable assignments
        /OPENAI_API_KEY\s*[=:]\s*["']?sk-[A-Za-z0-9_-]+["']?/,
      ],
    },
  },

  // ============================================================================
  // Anthropic
  // ============================================================================
  {
    name: "anthropic",
    provider: "Anthropic",
    description: "Anthropic API client for Claude models",
    documentationUrl: "https://docs.anthropic.com",
    confidence: "high",
    keywords: [
      "sk-ant-api03",
      "sk-ant-admin01",
      "anthropic",
      "ANTHROPIC_API_KEY",
      "api.anthropic.com",
      "claude",
    ],
    patterns: {
      imports: [
        /^import\s+anthropic/m,
        /^from\s+anthropic\s+import/m,
        /require\s*\(\s*["']@anthropic-ai\/sdk["']\s*\)/,
        /import\s+.*\s+from\s+["']@anthropic-ai\/sdk["']/,
        /import\s+Anthropic\s+from/,
      ],
      dependencies: [
        /^anthropic[=<>~!\s]/m,
        /"@anthropic-ai\/sdk"\s*:/,
        /'@anthropic-ai\/sdk'\s*:/,
      ],
      apiCalls: [
        // Tier 1: API URL
        /api\.anthropic\.com/,

        // Tier 2: SDK Client Instantiation
        /new\s+Anthropic\s*\(/,
        /Anthropic\s*\(\s*\)/,
        /anthropic\.Anthropic\s*\(/,

        // Tier 3: Provider-prefixed method calls
        /anthropic\.messages\.create\s*\(/,
        /anthropic\.messages\.stream\s*\(/,
        /anthropic\.completions\.create\s*\(/,
      ],
      // Secret patterns (from TruffleHog - exact format)
      secrets: [
        // API keys: exactly 93 chars + AA suffix
        /\bsk-ant-api03-[A-Za-z0-9_-]{93}AA\b/,
        // Admin keys
        /\bsk-ant-admin01-[A-Za-z0-9_-]{93}AA\b/,
        // Environment variable assignments
        /ANTHROPIC_API_KEY\s*[=:]\s*["']?[A-Za-z0-9_-]+["']?/,
        /CLAUDE_API_KEY\s*[=:]\s*["']?[A-Za-z0-9_-]+["']?/,
      ],
    },
  },

  // ============================================================================
  // Google AI (Gemini)
  // ============================================================================
  {
    name: "google-generativeai",
    provider: "Google",
    description: "Google Generative AI (Gemini) API client",
    documentationUrl: "https://ai.google.dev/docs",
    confidence: "high",
    keywords: [
      "AIza", // Google API key prefix
      "generativeai",
      "gemini",
      "GOOGLE_API_KEY",
      "GEMINI_API_KEY",
      "generativelanguage.googleapis.com",
      "aiplatform.googleapis.com",
    ],
    patterns: {
      imports: [
        /^import\s+google\.generativeai/m,
        /^from\s+google\.generativeai\s+import/m,
        /^from\s+google\s+import\s+generativeai/m,
        /require\s*\(\s*["']@google\/generative-ai["']\s*\)/,
        /import\s+.*\s+from\s+["']@google\/generative-ai["']/,
      ],
      dependencies: [
        /^google-generativeai[=<>~!\s]/m,
        /"@google\/generative-ai"\s*:/,
        /'@google\/generative-ai'\s*:/,
      ],
      apiCalls: [
        // Tier 1: API URLs
        /generativelanguage\.googleapis\.com/,
        /aiplatform\.googleapis\.com/,

        // Tier 2: SDK instantiation
        /GenerativeModel\s*\(/,
        /genai\.GenerativeModel\s*\(/,

        // Tier 3: Method calls
        /model\.generate_content\s*\(/,
        /\.generate_content_async\s*\(/,
        /\.start_chat\s*\(/,
        /chat\.send_message\s*\(/,
      ],
      secrets: [
        // Google API keys (AIza prefix, 35 chars)
        /\bAIza[A-Za-z0-9_-]{35}\b/,
        // Environment variables
        /GOOGLE_API_KEY\s*[=:]\s*["']?[A-Za-z0-9_-]+["']?/,
        /GEMINI_API_KEY\s*[=:]\s*["']?[A-Za-z0-9_-]+["']?/,
      ],
    },
  },

  // ============================================================================
  // Azure OpenAI
  // ============================================================================
  {
    name: "azure-openai",
    provider: "Microsoft",
    description: "Azure OpenAI Service client",
    documentationUrl: "https://learn.microsoft.com/azure/ai-services/openai",
    confidence: "high",
    keywords: ["azure", "openai.azure.com", "AZURE_OPENAI", "AzureOpenAI"],
    patterns: {
      imports: [
        /^from\s+openai\s+import\s+AzureOpenAI/m,
        /import\s+.*AzureOpenAI.*from\s+["']openai["']/,
        /require\s*\(\s*["']@azure\/openai["']\s*\)/,
      ],
      dependencies: [/"@azure\/openai"\s*:/, /'@azure\/openai'\s*:/],
      apiCalls: [
        // Tier 1: API URL
        /\.openai\.azure\.com/,

        // Tier 2: SDK instantiation
        /AzureOpenAI\s*\(/,
        /new\s+AzureOpenAI\s*\(/,

        // Tier 3: Method calls
        /\.get_chat_completions\s*\(/,
        /\.get_completions\s*\(/,
        /\.get_embeddings\s*\(/,
      ],
      secrets: [
        /AZURE_OPENAI_API_KEY\s*[=:]\s*["']?[A-Za-z0-9_-]+["']?/,
        /AZURE_OPENAI_KEY\s*[=:]\s*["']?[A-Za-z0-9_-]+["']?/,
        /AZURE_OPENAI_ENDPOINT\s*[=:]\s*["']?https?:\/\/[^"'\s]+["']?/,
      ],
    },
  },

  // ============================================================================
  // AWS Bedrock
  // ============================================================================
  {
    name: "aws-bedrock",
    provider: "AWS",
    description: "AWS Bedrock for accessing foundation models",
    documentationUrl: "https://docs.aws.amazon.com/bedrock",
    confidence: "high",
    keywords: [
      "bedrock",
      "AKIA", // AWS Access Key prefix
      "ABSK", // Bedrock API key prefix
      "amazonaws.com",
      "AWS_ACCESS_KEY",
      "AWS_SECRET",
    ],
    patterns: {
      imports: [
        /^import\s+boto3/m,
        /^from\s+boto3\s+import/m,
        /require\s*\(\s*["']@aws-sdk\/client-bedrock["']\s*\)/,
        /import\s+.*\s+from\s+["']@aws-sdk\/client-bedrock-runtime["']/,
      ],
      dependencies: [
        /"@aws-sdk\/client-bedrock-runtime"\s*:/,
        /'@aws-sdk\/client-bedrock-runtime'\s*:/,
        /^boto3[=<>~!\s]/m,
      ],
      apiCalls: [
        // Tier 1: API URL
        /bedrock-runtime\.[^.]+\.amazonaws\.com/,
        /bedrock\.[^.]+\.amazonaws\.com/,

        // Tier 2: SDK instantiation
        /BedrockRuntimeClient\s*\(/,
        /BedrockRuntime\s*\(/,
        /boto3\.client\s*\(\s*['"]bedrock-runtime['"]/,

        // Tier 3: Method calls
        /\.invoke_model\s*\(/,
        /\.invokeModel\s*\(/,
        /InvokeModelCommand\s*\(/,
        /InvokeModelWithResponseStreamCommand\s*\(/,
      ],
      secrets: [
        // AWS Access Key IDs
        /\bAKIA[A-Z0-9]{16}\b/,
        // Bedrock specific keys
        /\bABSK[A-Za-z0-9+\/]{109,269}={0,2}\b/,
        // Environment variables
        /AWS_ACCESS_KEY_ID\s*[=:]\s*["']?AKIA[A-Z0-9]{16}["']?/,
        /AWS_SECRET_ACCESS_KEY\s*[=:]\s*["']?[A-Za-z0-9\/+=]{40}["']?/,
      ],
    },
  },

  // ============================================================================
  // Cohere
  // ============================================================================
  {
    name: "cohere",
    provider: "Cohere",
    description: "Cohere API for NLP and embeddings",
    documentationUrl: "https://docs.cohere.com",
    confidence: "high",
    keywords: ["cohere", "COHERE_API_KEY", "api.cohere.ai", "api.cohere.com"],
    minEntropy: 4.0, // Cohere keys need high entropy check
    patterns: {
      imports: [
        /^import\s+cohere/m,
        /^from\s+cohere\s+import/m,
        /require\s*\(\s*["']cohere-ai["']\s*\)/,
        /import\s+.*\s+from\s+["']cohere-ai["']/,
      ],
      dependencies: [/^cohere[=<>~!\s]/m, /"cohere-ai"\s*:/, /'cohere-ai'\s*:/],
      apiCalls: [
        // Tier 1: API URL
        /api\.cohere\.ai/,
        /api\.cohere\.com/,

        // Tier 2: SDK instantiation
        /cohere\.Client\s*\(/,
        /new\s+CohereClient\s*\(/,

        // Tier 3: Provider-prefixed method calls
        /cohere\.chat\s*\(/,
        /cohere\.generate\s*\(/,
        /cohere\.embed\s*\(/,
        /cohere\.rerank\s*\(/,
        /co\.chat\s*\(/,
        /co\.generate\s*\(/,
        /co\.embed\s*\(/,
      ],
      secrets: [
        // Cohere API keys (40 chars alphanumeric - from Gitleaks)
        /\b[a-zA-Z0-9]{40}\b/,
        /COHERE_API_KEY\s*[=:]\s*["']?[A-Za-z0-9_-]+["']?/,
        /CO_API_KEY\s*[=:]\s*["']?[A-Za-z0-9_-]+["']?/,
      ],
    },
  },

  // ============================================================================
  // Mistral AI
  // ============================================================================
  {
    name: "mistralai",
    provider: "Mistral AI",
    description: "Mistral AI API client",
    documentationUrl: "https://docs.mistral.ai",
    confidence: "high",
    keywords: ["mistral", "MISTRAL_API_KEY", "api.mistral.ai"],
    patterns: {
      imports: [
        /^import\s+mistralai/m,
        /^from\s+mistralai\s+import/m,
        /require\s*\(\s*["']@mistralai\/mistralai["']\s*\)/,
        /import\s+.*\s+from\s+["']@mistralai\/mistralai["']/,
      ],
      dependencies: [
        /^mistralai[=<>~!\s]/m,
        /"@mistralai\/mistralai"\s*:/,
        /'@mistralai\/mistralai'\s*:/,
      ],
      apiCalls: [
        // Tier 1: API URL
        /api\.mistral\.ai/,

        // Tier 2: SDK instantiation
        /MistralClient\s*\(/,
        /new\s+Mistral\s*\(/,
        /Mistral\s*\(\s*\)/,

        // Tier 3: Provider-prefixed method calls
        /mistral\.chat\s*\(/,
        /mistral\.chat\.complete\s*\(/,
        /mistral\.chat\.stream\s*\(/,
      ],
      secrets: [/MISTRAL_API_KEY\s*[=:]\s*["']?[A-Za-z0-9_-]+["']?/],
    },
  },

  // ============================================================================
  // Replicate
  // ============================================================================
  {
    name: "replicate",
    provider: "Replicate",
    description: "Replicate API for running ML models",
    documentationUrl: "https://replicate.com/docs",
    confidence: "high",
    keywords: [
      "replicate",
      "r8_", // Replicate API token prefix
      "REPLICATE_API_TOKEN",
      "api.replicate.com",
    ],
    patterns: {
      imports: [
        /^import\s+replicate/m,
        /^from\s+replicate\s+import/m,
        /require\s*\(\s*["']replicate["']\s*\)/,
        /import\s+.*\s+from\s+["']replicate["']/,
      ],
      dependencies: [/^replicate[=<>~!\s]/m, /"replicate"\s*:/, /'replicate'\s*:/],
      apiCalls: [
        // Tier 1: API URL
        /api\.replicate\.com/,

        // Tier 2/3: Method calls
        /replicate\.run\s*\(/,
        /replicate\.predictions\.create\s*\(/,
        /replicate\.models\.get\s*\(/,
        /replicate\.stream\s*\(/,
      ],
      secrets: [
        // Replicate API tokens (r8_ prefix)
        /\br8_[A-Za-z0-9]{36,}\b/,
        /REPLICATE_API_TOKEN\s*[=:]\s*["']?[A-Za-z0-9_-]+["']?/,
      ],
    },
  },

  // ============================================================================
  // Hugging Face Inference
  // ============================================================================
  {
    name: "huggingface-inference",
    provider: "Hugging Face",
    description: "Hugging Face Inference API client",
    documentationUrl: "https://huggingface.co/docs/api-inference",
    confidence: "high",
    keywords: [
      "hf_", // HF token prefix
      "api_org_", // Org token prefix
      "huggingface",
      "HF_TOKEN",
      "HUGGINGFACE",
      "api-inference.huggingface.co",
    ],
    patterns: {
      imports: [
        /^from\s+huggingface_hub\s+import/m,
        /^import\s+huggingface_hub/m,
        /require\s*\(\s*["']@huggingface\/inference["']\s*\)/,
        /import\s+.*\s+from\s+["']@huggingface\/inference["']/,
      ],
      dependencies: [
        /^huggingface[-_]hub[=<>~!\s]/m,
        /"@huggingface\/inference"\s*:/,
        /'@huggingface\/inference'\s*:/,
      ],
      apiCalls: [
        // Tier 1: API URL
        /api-inference\.huggingface\.co/,

        // Tier 2: SDK instantiation
        /InferenceClient\s*\(/,
        /HfInference\s*\(/,

        // Tier 3: Method calls
        /inference_client\.text_generation\s*\(/,
        /\.text_generation\s*\(/,
        /\.chat_completion\s*\(/,
      ],
      secrets: [
        // Access tokens (hf_ prefix, 34 chars)
        /\bhf_[A-Za-z]{34}\b/,
        // Organization tokens
        /\bapi_org_[A-Za-z]{34}\b/,
        // Environment variables
        /HF_TOKEN\s*[=:]\s*["']?[A-Za-z0-9_-]+["']?/,
        /HUGGINGFACE_TOKEN\s*[=:]\s*["']?[A-Za-z0-9_-]+["']?/,
        /HUGGING_FACE_HUB_TOKEN\s*[=:]\s*["']?[A-Za-z0-9_-]+["']?/,
      ],
    },
  },

  // ============================================================================
  // Groq
  // ============================================================================
  {
    name: "groq",
    provider: "Groq",
    description: "Groq API for fast LLM inference",
    documentationUrl: "https://console.groq.com/docs",
    confidence: "high",
    keywords: [
      "groq",
      "gsk_", // Groq API key prefix
      "GROQ_API_KEY",
      "api.groq.com",
    ],
    patterns: {
      imports: [
        /^import\s+groq/m,
        /^from\s+groq\s+import/m,
        /require\s*\(\s*["']groq-sdk["']\s*\)/,
        /import\s+.*\s+from\s+["']groq-sdk["']/,
      ],
      dependencies: [/^groq[=<>~!\s]/m, /"groq-sdk"\s*:/, /'groq-sdk'\s*:/],
      apiCalls: [
        // Tier 1: API URL
        /api\.groq\.com/,

        // Tier 2: SDK instantiation
        /Groq\s*\(\s*\)/,
        /new\s+Groq\s*\(/,

        // Tier 3: Method calls
        /groq\.chat\.completions\.create\s*\(/,
      ],
      secrets: [
        // Groq API keys (gsk_ prefix)
        /\bgsk_[A-Za-z0-9]{50,}\b/,
        /GROQ_API_KEY\s*[=:]\s*["']?[A-Za-z0-9_-]+["']?/,
      ],
    },
  },

  // ============================================================================
  // Together AI
  // ============================================================================
  {
    name: "together",
    provider: "Together AI",
    description: "Together AI platform for open-source models",
    documentationUrl: "https://docs.together.ai",
    confidence: "high",
    keywords: ["together", "TOGETHER_API_KEY", "api.together.xyz", "api.together.ai"],
    patterns: {
      imports: [
        /^import\s+together/m,
        /^from\s+together\s+import/m,
        /require\s*\(\s*["']together-ai["']\s*\)/,
        /import\s+.*\s+from\s+["']together-ai["']/,
      ],
      dependencies: [/^together[=<>~!\s]/m, /"together-ai"\s*:/, /'together-ai'\s*:/],
      apiCalls: [
        // Tier 1: API URLs
        /api\.together\.xyz/,
        /api\.together\.ai/,

        // Tier 2: SDK instantiation
        /Together\s*\(\s*\)/,
        /new\s+Together\s*\(/,

        // Tier 3: Method calls
        /together\.chat\.completions\.create\s*\(/,
        /together\.Complete\.create\s*\(/,
      ],
      secrets: [/TOGETHER_API_KEY\s*[=:]\s*["']?[A-Za-z0-9_-]+["']?/],
    },
  },

  // ============================================================================
  // Perplexity
  // ============================================================================
  {
    name: "perplexity",
    provider: "Perplexity",
    description: "Perplexity AI API for search-augmented generation",
    documentationUrl: "https://docs.perplexity.ai",
    confidence: "high",
    keywords: [
      "perplexity",
      "pplx-", // Perplexity API key prefix
      "PERPLEXITY_API_KEY",
      "api.perplexity.ai",
    ],
    patterns: {
      imports: [/^import\s+perplexity/m, /^from\s+perplexity\s+import/m],
      dependencies: [/^perplexity[=<>~!\s]/m],
      apiCalls: [
        // Tier 1: API URL
        /api\.perplexity\.ai/,

        // Tier 3: Method calls (uses OpenAI-compatible API)
        /perplexity\.chat\.completions\.create\s*\(/,
      ],
      secrets: [
        // Perplexity API keys (pplx- prefix, 48 chars)
        /\bpplx-[A-Za-z0-9]{48}\b/,
        /PERPLEXITY_API_KEY\s*[=:]\s*["']?[A-Za-z0-9_-]+["']?/,
      ],
    },
  },

  // ============================================================================
  // Fireworks AI
  // ============================================================================
  {
    name: "fireworks-ai",
    provider: "Fireworks AI",
    description: "Fireworks AI inference platform",
    documentationUrl: "https://docs.fireworks.ai",
    confidence: "high",
    keywords: ["fireworks", "FIREWORKS_API_KEY", "api.fireworks.ai"],
    patterns: {
      imports: [/^import\s+fireworks/m, /^from\s+fireworks\s+import/m],
      dependencies: [/^fireworks-ai[=<>~!\s]/m, /"fireworks-ai"\s*:/, /'fireworks-ai'\s*:/],
      apiCalls: [
        // Tier 1: API URL
        /api\.fireworks\.ai/,

        // Tier 2: SDK instantiation
        /Fireworks\s*\(/,
        /fireworks\.client\s*\(/,
      ],
      secrets: [/FIREWORKS_API_KEY\s*[=:]\s*["']?[A-Za-z0-9_-]+["']?/],
    },
  },

  // ============================================================================
  // DeepSeek
  // ============================================================================
  {
    name: "deepseek",
    provider: "DeepSeek",
    description: "DeepSeek AI API",
    documentationUrl: "https://platform.deepseek.com/docs",
    confidence: "high",
    keywords: ["deepseek", "DEEPSEEK_API_KEY", "api.deepseek.com"],
    patterns: {
      imports: [/^import\s+deepseek/m, /^from\s+deepseek\s+import/m],
      dependencies: [/^deepseek[=<>~!\s]/m],
      apiCalls: [
        // Tier 1: API URL
        /api\.deepseek\.com/,
      ],
      secrets: [/DEEPSEEK_API_KEY\s*[=:]\s*["']?[A-Za-z0-9_-]+["']?/],
    },
  },

  // ============================================================================
  // AI21 Labs
  // ============================================================================
  {
    name: "ai21",
    provider: "AI21 Labs",
    description: "AI21 Labs Jurassic models API",
    documentationUrl: "https://docs.ai21.com",
    confidence: "high",
    keywords: ["ai21", "AI21_API_KEY", "api.ai21.com"],
    patterns: {
      imports: [/^import\s+ai21/m, /^from\s+ai21\s+import/m],
      dependencies: [/^ai21[=<>~!\s]/m, /"ai21"\s*:/, /'ai21'\s*:/],
      apiCalls: [
        // Tier 1: API URL
        /api\.ai21\.com/,
      ],
      secrets: [/AI21_API_KEY\s*[=:]\s*["']?[A-Za-z0-9_-]+["']?/],
    },
  },

  // ============================================================================
  // Cerebras
  // ============================================================================
  {
    name: "cerebras",
    provider: "Cerebras",
    description: "Cerebras fast inference API",
    documentationUrl: "https://docs.cerebras.ai",
    confidence: "high",
    keywords: ["cerebras", "CEREBRAS_API_KEY", "api.cerebras.ai"],
    patterns: {
      imports: [/^import\s+cerebras/m, /^from\s+cerebras\s+import/m],
      dependencies: [/^cerebras-cloud-sdk[=<>~!\s]/m],
      apiCalls: [
        // Tier 1: API URL
        /api\.cerebras\.ai/,
      ],
      secrets: [/CEREBRAS_API_KEY\s*[=:]\s*["']?[A-Za-z0-9_-]+["']?/],
    },
  },

  // ============================================================================
  // xAI (Grok)
  // ============================================================================
  {
    name: "xai",
    provider: "xAI",
    description: "xAI API for Grok models",
    documentationUrl: "https://docs.x.ai",
    confidence: "high",
    keywords: ["xai", "grok", "xai-", "XAI_API_KEY", "api.x.ai"],
    patterns: {
      imports: [/^import\s+xai/m, /^from\s+xai\s+import/m],
      dependencies: [/^xai[=<>~!\s]/m, /"xai"\s*:/, /'xai'\s*:/],
      apiCalls: [
        // Tier 1: API URL
        /api\.x\.ai/,
      ],
      secrets: [
        // xAI API keys (xai- prefix)
        /\bxai-[A-Za-z0-9]{48,}\b/,
        /XAI_API_KEY\s*[=:]\s*["']?[A-Za-z0-9_-]+["']?/,
        /GROK_API_KEY\s*[=:]\s*["']?[A-Za-z0-9_-]+["']?/,
      ],
    },
  },

  // ============================================================================
  // ElevenLabs (Voice AI)
  // ============================================================================
  {
    name: "elevenlabs",
    provider: "ElevenLabs",
    description: "ElevenLabs text-to-speech and voice AI",
    documentationUrl: "https://docs.elevenlabs.io",
    confidence: "high",
    keywords: [
      "elevenlabs",
      "eleven_labs",
      "ELEVEN_API_KEY",
      "ELEVENLABS_API_KEY",
      "api.elevenlabs.io",
    ],
    patterns: {
      imports: [
        /^import\s+elevenlabs/m,
        /^from\s+elevenlabs\s+import/m,
        /require\s*\(\s*["']elevenlabs["']\s*\)/,
        /import\s+.*\s+from\s+["']elevenlabs["']/,
      ],
      dependencies: [/^elevenlabs[=<>~!\s]/m, /"elevenlabs"\s*:/, /'elevenlabs'\s*:/],
      apiCalls: [
        // Tier 1: API URL
        /api\.elevenlabs\.io/,

        // Tier 2: SDK instantiation
        /ElevenLabs\s*\(/,

        // Tier 3: Method calls
        /elevenlabs\.generate\s*\(/,
        /\.text_to_speech\s*\(/,
        /\.voice_clone\s*\(/,
      ],
      secrets: [
        // ElevenLabs API keys (32 hex chars)
        /\b[a-f0-9]{32}\b/,
        /ELEVEN_API_KEY\s*[=:]\s*["']?[A-Za-z0-9_-]+["']?/,
        /ELEVENLABS_API_KEY\s*[=:]\s*["']?[A-Za-z0-9_-]+["']?/,
      ],
    },
    minEntropy: 3.5,
  },

  // ============================================================================
  // AssemblyAI (Speech-to-Text)
  // ============================================================================
  {
    name: "assemblyai",
    provider: "AssemblyAI",
    description: "AssemblyAI speech-to-text and audio intelligence",
    documentationUrl: "https://www.assemblyai.com/docs",
    confidence: "high",
    keywords: ["assemblyai", "assembly_ai", "ASSEMBLYAI_API_KEY", "api.assemblyai.com"],
    patterns: {
      imports: [
        /^import\s+assemblyai/m,
        /^from\s+assemblyai\s+import/m,
        /require\s*\(\s*["']assemblyai["']\s*\)/,
        /import\s+.*\s+from\s+["']assemblyai["']/,
      ],
      dependencies: [/^assemblyai[=<>~!\s]/m, /"assemblyai"\s*:/, /'assemblyai'\s*:/],
      apiCalls: [
        // Tier 1: API URL
        /api\.assemblyai\.com/,

        // Tier 2: SDK instantiation
        /AssemblyAI\s*\(/,
        /aai\.Transcriber\s*\(/,

        // Tier 3: Method calls
        /\.transcribe\s*\(/,
        /\.submit\s*\(/,
      ],
      secrets: [
        // AssemblyAI API keys (32 alphanumeric - from Gitleaks)
        /\b[0-9a-z]{32}\b/,
        /ASSEMBLYAI_API_KEY\s*[=:]\s*["']?[A-Za-z0-9_-]+["']?/,
      ],
    },
    minEntropy: 3.5,
  },

  // ============================================================================
  // Deepgram (Speech-to-Text)
  // ============================================================================
  {
    name: "deepgram",
    provider: "Deepgram",
    description: "Deepgram speech recognition and understanding",
    documentationUrl: "https://developers.deepgram.com",
    confidence: "high",
    keywords: ["deepgram", "DEEPGRAM_API_KEY", "api.deepgram.com"],
    patterns: {
      imports: [
        /^import\s+deepgram/m,
        /^from\s+deepgram\s+import/m,
        /require\s*\(\s*["']@deepgram\/sdk["']\s*\)/,
        /import\s+.*\s+from\s+["']@deepgram\/sdk["']/,
      ],
      dependencies: [/^deepgram-sdk[=<>~!\s]/m, /"@deepgram\/sdk"\s*:/, /'@deepgram\/sdk'\s*:/],
      apiCalls: [
        // Tier 1: API URL
        /api\.deepgram\.com/,

        // Tier 2: SDK instantiation
        /Deepgram\s*\(/,
        /DeepgramClient\s*\(/,

        // Tier 3: Method calls
        /\.transcription\.prerecorded\s*\(/,
        /\.listen\.prerecorded\s*\(/,
        /\.listen\.live\s*\(/,
      ],
      secrets: [
        // Deepgram API keys (40 alphanumeric - from Gitleaks)
        /\b[0-9a-z]{40}\b/,
        /DEEPGRAM_API_KEY\s*[=:]\s*["']?[A-Za-z0-9_-]+["']?/,
      ],
    },
    minEntropy: 4.0,
  },

  // ============================================================================
  // Stability AI (Image Generation)
  // ============================================================================
  {
    name: "stability-ai",
    provider: "Stability AI",
    description: "Stability AI image generation (Stable Diffusion)",
    documentationUrl: "https://platform.stability.ai/docs",
    confidence: "high",
    keywords: ["stability", "stable_diffusion", "sk-", "STABILITY_API_KEY", "api.stability.ai"],
    patterns: {
      imports: [
        /^import\s+stability_sdk/m,
        /^from\s+stability_sdk\s+import/m,
        /require\s*\(\s*["']@stability-ai\/client["']\s*\)/,
        /import\s+.*\s+from\s+["']@stability-ai\/client["']/,
      ],
      dependencies: [
        /^stability-sdk[=<>~!\s]/m,
        /"@stability-ai\/client"\s*:/,
        /'@stability-ai\/client'\s*:/,
      ],
      apiCalls: [
        // Tier 1: API URL
        /api\.stability\.ai/,

        // Tier 2: SDK instantiation
        /StabilityClient\s*\(/,

        // Tier 3: Method calls
        /\.generate\s*\(/,
        /\.text_to_image\s*\(/,
        /\.image_to_image\s*\(/,
      ],
      secrets: [
        // Stability API keys (sk- prefix)
        /\bsk-[A-Za-z0-9]{48,}\b/,
        /STABILITY_API_KEY\s*[=:]\s*["']?[A-Za-z0-9_-]+["']?/,
        /STABILITY_KEY\s*[=:]\s*["']?[A-Za-z0-9_-]+["']?/,
      ],
    },
  },

  // ============================================================================
  // Clarifai (Vision AI)
  // ============================================================================
  {
    name: "clarifai",
    provider: "Clarifai",
    description: "Clarifai AI platform for vision, NLP, and audio",
    documentationUrl: "https://docs.clarifai.com",
    confidence: "high",
    keywords: ["clarifai", "CLARIFAI_PAT", "CLARIFAI_API_KEY", "api.clarifai.com"],
    patterns: {
      imports: [
        /^import\s+clarifai/m,
        /^from\s+clarifai\s+import/m,
        /require\s*\(\s*["']clarifai["']\s*\)/,
        /import\s+.*\s+from\s+["']clarifai["']/,
      ],
      dependencies: [/^clarifai[=<>~!\s]/m, /"clarifai"\s*:/, /'clarifai'\s*:/],
      apiCalls: [
        // Tier 1: API URL
        /api\.clarifai\.com/,

        // Tier 2: SDK instantiation
        /ClarifaiApp\s*\(/,
        /Clarifai\.App\s*\(/,

        // Tier 3: Method calls
        /\.predict\s*\(/,
        /\.models\.predict\s*\(/,
      ],
      secrets: [
        /CLARIFAI_PAT\s*[=:]\s*["']?[A-Za-z0-9_-]+["']?/,
        /CLARIFAI_API_KEY\s*[=:]\s*["']?[A-Za-z0-9_-]+["']?/,
      ],
    },
  },

  // ============================================================================
  // Databricks (Mosaic AI / MLflow)
  // ============================================================================
  {
    name: "databricks",
    provider: "Databricks",
    description: "Databricks ML platform and Mosaic AI",
    documentationUrl: "https://docs.databricks.com",
    confidence: "high",
    keywords: ["databricks", "dapi", "DATABRICKS_TOKEN", "DATABRICKS_HOST"],
    patterns: {
      imports: [
        /^import\s+databricks/m,
        /^from\s+databricks\s+import/m,
        /^from\s+databricks\.sdk\s+import/m,
        /require\s*\(\s*["']@databricks\/sql["']\s*\)/,
      ],
      dependencies: [
        /^databricks-sdk[=<>~!\s]/m,
        /"@databricks\/sql"\s*:/,
        /'@databricks\/sql'\s*:/,
      ],
      apiCalls: [
        // Tier 1: API URL patterns
        /\.cloud\.databricks\.com/,
        /\.azuredatabricks\.net/,

        // Tier 2: SDK instantiation
        /WorkspaceClient\s*\(/,
        /DatabricksSession\s*\(/,

        // Tier 3: Method calls
        /\.serving_endpoints\./,
        /\.model_serving\./,
      ],
      secrets: [
        // Databricks tokens (dapi prefix)
        /\bdapi[A-Za-z0-9]{32,}\b/,
        /DATABRICKS_TOKEN\s*[=:]\s*["']?[A-Za-z0-9_-]+["']?/,
        /DATABRICKS_HOST\s*[=:]\s*["']?https?:\/\/[^"'\s]+["']?/,
      ],
    },
  },

  // ============================================================================
  // Modal (Serverless ML)
  // ============================================================================
  {
    name: "modal",
    provider: "Modal",
    description: "Modal serverless infrastructure for ML",
    documentationUrl: "https://modal.com/docs",
    confidence: "high",
    keywords: ["modal", "MODAL_TOKEN", "api.modal.com"],
    patterns: {
      imports: [/^import\s+modal/m, /^from\s+modal\s+import/m],
      dependencies: [/^modal[=<>~!\s]/m, /"modal"\s*:/, /'modal'\s*:/],
      apiCalls: [
        // Tier 1: API URL
        /api\.modal\.com/,

        // Tier 2: Decorators/SDK
        /@modal\.web_endpoint/,
        /@modal\.function/,
        /@modal\.cls/,
        /modal\.Stub\s*\(/,
        /modal\.App\s*\(/,
      ],
      secrets: [
        /MODAL_TOKEN_ID\s*[=:]\s*["']?[A-Za-z0-9_-]+["']?/,
        /MODAL_TOKEN_SECRET\s*[=:]\s*["']?[A-Za-z0-9_-]+["']?/,
      ],
    },
  },

  // ============================================================================
  // LangSmith (LLM Observability)
  // ============================================================================
  {
    name: "langsmith",
    provider: "LangSmith",
    description: "LangSmith LLM observability and tracing",
    documentationUrl: "https://docs.smith.langchain.com",
    confidence: "high",
    keywords: [
      "langsmith",
      "ls__",
      "LANGCHAIN_API_KEY",
      "LANGSMITH_API_KEY",
      "api.smith.langchain.com",
    ],
    patterns: {
      imports: [/^from\s+langsmith\s+import/m, /^import\s+langsmith/m],
      dependencies: [/^langsmith[=<>~!\s]/m, /"langsmith"\s*:/, /'langsmith'\s*:/],
      apiCalls: [
        // Tier 1: API URL
        /api\.smith\.langchain\.com/,

        // Tier 2: SDK instantiation
        /Client\s*\(\s*\)/,
        /langsmith\.Client\s*\(/,

        // Tier 3: Method calls
        /\.create_run\s*\(/,
        /\.update_run\s*\(/,
        /@traceable/,
      ],
      secrets: [
        // LangSmith API keys (ls__ prefix)
        /\bls__[A-Za-z0-9]{32,}\b/,
        /LANGCHAIN_API_KEY\s*[=:]\s*["']?[A-Za-z0-9_-]+["']?/,
        /LANGSMITH_API_KEY\s*[=:]\s*["']?[A-Za-z0-9_-]+["']?/,
      ],
    },
  },

  // ============================================================================
  // LangFuse (LLM Observability)
  // ============================================================================
  {
    name: "langfuse",
    provider: "LangFuse",
    description: "LangFuse open-source LLM observability",
    documentationUrl: "https://langfuse.com/docs",
    confidence: "high",
    keywords: ["langfuse", "LANGFUSE_PUBLIC_KEY", "LANGFUSE_SECRET_KEY"],
    patterns: {
      imports: [/^from\s+langfuse\s+import/m, /^import\s+langfuse/m],
      dependencies: [/^langfuse[=<>~!\s]/m, /"langfuse"\s*:/, /'langfuse'\s*:/],
      apiCalls: [
        // Tier 2: SDK instantiation
        /Langfuse\s*\(/,
        /langfuse\.Langfuse\s*\(/,

        // Tier 3: Method calls
        /\.trace\s*\(/,
        /\.generation\s*\(/,
        /\.span\s*\(/,
        /@observe/,
      ],
      secrets: [
        /LANGFUSE_PUBLIC_KEY\s*[=:]\s*["']?[A-Za-z0-9_-]+["']?/,
        /LANGFUSE_SECRET_KEY\s*[=:]\s*["']?[A-Za-z0-9_-]+["']?/,
        /LANGFUSE_HOST\s*[=:]\s*["']?https?:\/\/[^"'\s]+["']?/,
      ],
    },
  },

  // ============================================================================
  // Arize AI (ML Observability)
  // ============================================================================
  {
    name: "arize",
    provider: "Arize AI",
    description: "Arize AI ML observability platform",
    documentationUrl: "https://docs.arize.com",
    confidence: "high",
    keywords: ["arize", "phoenix", "ARIZE_API_KEY", "ARIZE_SPACE_KEY"],
    patterns: {
      imports: [/^from\s+arize\s+import/m, /^import\s+arize/m, /^from\s+phoenix\s+import/m],
      dependencies: [/^arize[=<>~!\s]/m, /"arize"\s*:/, /'arize'\s*:/, /^arize-phoenix[=<>~!\s]/m],
      apiCalls: [
        // Tier 2: SDK instantiation
        /Client\s*\(\s*space_key/,
        /arize\.Client\s*\(/,

        // Tier 3: Method calls
        /\.log\s*\(/,
        /\.log_prediction\s*\(/,
      ],
      secrets: [
        /ARIZE_API_KEY\s*[=:]\s*["']?[A-Za-z0-9_-]+["']?/,
        /ARIZE_SPACE_KEY\s*[=:]\s*["']?[A-Za-z0-9_-]+["']?/,
      ],
    },
  },

  // ============================================================================
  // Weights & Biases (Experiment Tracking)
  // ============================================================================
  {
    name: "wandb",
    provider: "Weights & Biases",
    description: "Weights & Biases ML experiment tracking",
    documentationUrl: "https://docs.wandb.ai",
    confidence: "medium",
    keywords: ["wandb", "weights_and_biases", "WANDB_API_KEY", "api.wandb.ai"],
    patterns: {
      imports: [/^import\s+wandb/m, /^from\s+wandb\s+import/m],
      dependencies: [/^wandb[=<>~!\s]/m, /"wandb"\s*:/, /'wandb'\s*:/],
      apiCalls: [
        // Tier 1: API URL
        /api\.wandb\.ai/,

        // Tier 3: Method calls
        /wandb\.init\s*\(/,
        /wandb\.log\s*\(/,
        /wandb\.finish\s*\(/,
        /wandb\.watch\s*\(/,
      ],
      secrets: [
        // W&B API keys (40 hex chars)
        /\b[a-f0-9]{40}\b/,
        /WANDB_API_KEY\s*[=:]\s*["']?[A-Za-z0-9_-]+["']?/,
      ],
    },
    minEntropy: 3.5,
  },

  // ============================================================================
  // OpenRouter (Multi-Provider Gateway)
  // ============================================================================
  {
    name: "openrouter",
    provider: "OpenRouter",
    description: "Unified API gateway for hundreds of AI models",
    documentationUrl: "https://openrouter.ai/docs",
    confidence: "high",
    keywords: ["openrouter", "sk-or-", "OPENROUTER_API_KEY", "openrouter.ai"],
    patterns: {
      imports: [/^import\s+openrouter/m, /^from\s+openrouter\s+import/m],
      dependencies: [/^openrouter[=<>~!\s]/m, /"openrouter"\s*:/, /'openrouter'\s*:/],
      apiCalls: [
        // Tier 1: API URL
        /openrouter\.ai\/api/,
        /api\.openrouter\.ai/,
      ],
      secrets: [
        // OpenRouter API keys (sk-or- prefix)
        /\bsk-or-[A-Za-z0-9_-]{48,}\b/,
        /OPENROUTER_API_KEY\s*[=:]\s*["']?[A-Za-z0-9_-]+["']?/,
      ],
    },
  },

  // ============================================================================
  // SambaNova (Enterprise AI)
  // ============================================================================
  {
    name: "sambanova",
    provider: "SambaNova",
    description: "SambaNova enterprise AI inference platform",
    documentationUrl: "https://sambanova.ai/products/enterprise-ai",
    confidence: "high",
    keywords: ["sambanova", "SAMBANOVA_API_KEY", "api.sambanova.ai"],
    patterns: {
      imports: [/^import\s+sambanova/m, /^from\s+sambanova\s+import/m],
      dependencies: [/^sambanova[=<>~!\s]/m, /"sambanova"\s*:/, /'sambanova'\s*:/],
      apiCalls: [
        // Tier 1: API URL
        /api\.sambanova\.ai/,
        /fast-api\.snova\.ai/,
      ],
      secrets: [/SAMBANOVA_API_KEY\s*[=:]\s*["']?[A-Za-z0-9_-]+["']?/],
    },
  },

  // ============================================================================
  // Lepton AI (Serverless AI)
  // ============================================================================
  {
    name: "lepton",
    provider: "Lepton AI",
    description: "Lepton AI serverless platform for running AI models",
    documentationUrl: "https://www.lepton.ai/docs",
    confidence: "high",
    keywords: ["lepton", "LEPTON_API_TOKEN", "api.lepton.ai"],
    patterns: {
      imports: [/^import\s+leptonai/m, /^from\s+leptonai\s+import/m],
      dependencies: [/^leptonai[=<>~!\s]/m, /"leptonai"\s*:/, /'leptonai'\s*:/],
      apiCalls: [
        // Tier 1: API URL
        /\.lepton\.ai/,
        /api\.lepton\.ai/,
      ],
      secrets: [/LEPTON_API_TOKEN\s*[=:]\s*["']?[A-Za-z0-9_-]+["']?/],
    },
  },

  // ============================================================================
  // Anyscale (Ray-based AI Platform)
  // ============================================================================
  {
    name: "anyscale",
    provider: "Anyscale",
    description: "Anyscale platform for scalable AI applications",
    documentationUrl: "https://docs.anyscale.com",
    confidence: "high",
    keywords: ["anyscale", "ANYSCALE_API_KEY", "api.anyscale.com"],
    patterns: {
      imports: [/^import\s+anyscale/m, /^from\s+anyscale\s+import/m],
      dependencies: [/^anyscale[=<>~!\s]/m, /"anyscale"\s*:/, /'anyscale'\s*:/],
      apiCalls: [
        // Tier 1: API URL
        /api\.anyscale\.com/,
        /endpoints\.anyscale\.com/,
      ],
      secrets: [
        /ANYSCALE_API_KEY\s*[=:]\s*["']?[A-Za-z0-9_-]+["']?/,
        /ANYSCALE_API_BASE\s*[=:]\s*["']?https?:\/\/[^"'\s]+["']?/,
      ],
    },
  },

  // ============================================================================
  // Baseten (Model Deployment)
  // ============================================================================
  {
    name: "baseten",
    provider: "Baseten",
    description: "Baseten platform for deploying ML models",
    documentationUrl: "https://docs.baseten.co",
    confidence: "high",
    keywords: ["baseten", "BASETEN_API_KEY", "api.baseten.co"],
    patterns: {
      imports: [/^import\s+baseten/m, /^from\s+baseten\s+import/m, /^import\s+truss/m],
      dependencies: [/^baseten[=<>~!\s]/m, /"baseten"\s*:/, /'baseten'\s*:/, /^truss[=<>~!\s]/m],
      apiCalls: [
        // Tier 1: API URL
        /api\.baseten\.co/,
        /model-.*\.api\.baseten\.co/,
      ],
      secrets: [/BASETEN_API_KEY\s*[=:]\s*["']?[A-Za-z0-9_-]+["']?/],
    },
  },

  // ============================================================================
  // Voyage AI (Embeddings)
  // ============================================================================
  {
    name: "voyageai",
    provider: "Voyage AI",
    description: "Voyage AI embedding models for search and RAG",
    documentationUrl: "https://docs.voyageai.com",
    confidence: "high",
    keywords: ["voyageai", "voyage", "pa-", "VOYAGE_API_KEY", "api.voyageai.com"],
    patterns: {
      imports: [/^import\s+voyageai/m, /^from\s+voyageai\s+import/m],
      dependencies: [/^voyageai[=<>~!\s]/m, /"voyageai"\s*:/, /'voyageai'\s*:/],
      apiCalls: [
        // Tier 1: API URL
        /api\.voyageai\.com/,
      ],
      secrets: [
        // Voyage AI API keys (pa- prefix)
        /\bpa-[A-Za-z0-9_-]{48,}\b/,
        /VOYAGE_API_KEY\s*[=:]\s*["']?[A-Za-z0-9_-]+["']?/,
      ],
    },
  },

  // ============================================================================
  // Jina AI (Embeddings & Search)
  // ============================================================================
  {
    name: "jinaai",
    provider: "Jina AI",
    description: "Jina AI embeddings and neural search",
    documentationUrl: "https://jina.ai/embeddings",
    confidence: "high",
    keywords: ["jina", "jinaai", "jina-", "JINA_API_KEY", "api.jina.ai"],
    patterns: {
      imports: [/^import\s+jina/m, /^from\s+jina\s+import/m],
      dependencies: [/^jina[=<>~!\s]/m, /"jina"\s*:/, /'jina'\s*:/, /^jinaai[=<>~!\s]/m],
      apiCalls: [
        // Tier 1: API URL
        /api\.jina\.ai/,
        /r\.jina\.ai/,
        /s\.jina\.ai/,
      ],
      secrets: [
        // Jina API keys (jina_ prefix)
        /\bjina_[A-Za-z0-9_-]{32,}\b/,
        /JINA_API_KEY\s*[=:]\s*["']?[A-Za-z0-9_-]+["']?/,
      ],
    },
  },

  // ============================================================================
  // Unify AI (LLM Router)
  // ============================================================================
  {
    name: "unify",
    provider: "Unify AI",
    description: "Unify AI intelligent LLM routing",
    documentationUrl: "https://unify.ai/docs",
    confidence: "high",
    keywords: ["unify", "unifyai", "UNIFY_KEY", "api.unify.ai"],
    patterns: {
      imports: [/^import\s+unify/m, /^from\s+unify\s+import/m, /^from\s+unifyai\s+import/m],
      dependencies: [/^unifyai[=<>~!\s]/m, /"unifyai"\s*:/, /'unifyai'\s*:/],
      apiCalls: [
        // Tier 1: API URL
        /api\.unify\.ai/,
      ],
      secrets: [
        /UNIFY_KEY\s*[=:]\s*["']?[A-Za-z0-9_-]+["']?/,
        /UNIFY_API_KEY\s*[=:]\s*["']?[A-Za-z0-9_-]+["']?/,
      ],
    },
  },

  // ============================================================================
  // Writer AI (Enterprise AI)
  // ============================================================================
  {
    name: "writer",
    provider: "Writer",
    description: "Writer AI enterprise generative AI platform",
    documentationUrl: "https://dev.writer.com",
    confidence: "high",
    keywords: ["writer", "writerai", "WRITER_API_KEY", "api.writer.com"],
    patterns: {
      imports: [/^import\s+writer/m, /^from\s+writer\s+import/m, /^from\s+writerai\s+import/m],
      dependencies: [/^writer-sdk[=<>~!\s]/m, /"writer-sdk"\s*:/, /'writer-sdk'\s*:/],
      apiCalls: [
        // Tier 1: API URL
        /api\.writer\.com/,
        /enterprise-api\.writer\.com/,
      ],
      secrets: [/WRITER_API_KEY\s*[=:]\s*["']?[A-Za-z0-9_-]+["']?/],
    },
  },

  // ============================================================================
  // VECTOR DATABASES (Cloud Services)
  // ============================================================================

  // ============================================================================
  // Pinecone
  // ============================================================================
  {
    name: "pinecone",
    provider: "Pinecone",
    description: "Pinecone vector database for similarity search",
    documentationUrl: "https://docs.pinecone.io",
    confidence: "high",
    keywords: ["pinecone", "PINECONE_API_KEY", "pinecone.io"],
    patterns: {
      imports: [
        /^import\s+pinecone/m,
        /^from\s+pinecone\s+import/m,
        /require\s*\(\s*["']@pinecone-database\/pinecone["']\s*\)/,
        /import\s+.*\s+from\s+["']@pinecone-database\/pinecone["']/,
      ],
      dependencies: [
        /^pinecone-client[=<>~!\s]/m,
        /^pinecone[=<>~!\s]/m,
        /"@pinecone-database\/pinecone"\s*:/,
        /'@pinecone-database\/pinecone'\s*:/,
      ],
      apiCalls: [
        // Tier 1: API URL
        /\.pinecone\.io/,
        /api\.pinecone\.io/,

        // Tier 2: SDK instantiation
        /Pinecone\s*\(\s*\)/,
        /new\s+Pinecone\s*\(/,

        // Tier 3: Method calls
        /pinecone\.Index\s*\(/,
        /\.upsert\s*\(/,
        /\.query\s*\(/,
      ],
      secrets: [
        /PINECONE_API_KEY\s*[=:]\s*["']?[A-Za-z0-9_-]+["']?/,
        /PINECONE_ENVIRONMENT\s*[=:]\s*["']?[A-Za-z0-9_-]+["']?/,
      ],
    },
  },

  // ============================================================================
  // Weaviate (Cloud)
  // ============================================================================
  {
    name: "weaviate",
    provider: "Weaviate",
    description: "Weaviate vector database with hybrid search",
    documentationUrl: "https://weaviate.io/developers/weaviate",
    confidence: "high",
    keywords: ["weaviate", "WEAVIATE_API_KEY", "weaviate.io"],
    patterns: {
      imports: [
        /^import\s+weaviate/m,
        /^from\s+weaviate\s+import/m,
        /require\s*\(\s*["']weaviate-client["']\s*\)/,
        /require\s*\(\s*["']weaviate-ts-client["']\s*\)/,
        /import\s+.*\s+from\s+["']weaviate-ts-client["']/,
      ],
      dependencies: [
        /^weaviate-client[=<>~!\s]/m,
        /"weaviate-client"\s*:/,
        /'weaviate-client'\s*:/,
        /"weaviate-ts-client"\s*:/,
      ],
      apiCalls: [
        // Tier 1: API URL
        /\.weaviate\.cloud/,
        /\.weaviate\.network/,

        // Tier 2: SDK instantiation
        /weaviate\.Client\s*\(/,
        /weaviate\.connect_to_wcs\s*\(/,
        /weaviate\.connect_to_weaviate_cloud\s*\(/,

        // Tier 3: Method calls
        /\.collections\.create\s*\(/,
        /client\.schema\.create_class\s*\(/,
      ],
      secrets: [
        /WEAVIATE_API_KEY\s*[=:]\s*["']?[A-Za-z0-9_-]+["']?/,
        /WEAVIATE_URL\s*[=:]\s*["']?https?:\/\/[^"'\s]+["']?/,
        /WCS_API_KEY\s*[=:]\s*["']?[A-Za-z0-9_-]+["']?/,
      ],
    },
  },

  // ============================================================================
  // Qdrant (Cloud)
  // ============================================================================
  {
    name: "qdrant",
    provider: "Qdrant",
    description: "Qdrant vector similarity search engine",
    documentationUrl: "https://qdrant.tech/documentation",
    confidence: "high",
    keywords: ["qdrant", "QDRANT_API_KEY", "qdrant.io", "qdrant.tech"],
    patterns: {
      imports: [
        /^import\s+qdrant_client/m,
        /^from\s+qdrant_client\s+import/m,
        /require\s*\(\s*["']@qdrant\/js-client-rest["']\s*\)/,
        /import\s+.*\s+from\s+["']@qdrant\/js-client-rest["']/,
      ],
      dependencies: [
        /^qdrant-client[=<>~!\s]/m,
        /"@qdrant\/js-client-rest"\s*:/,
        /'@qdrant\/js-client-rest'\s*:/,
        /"qdrant-client"\s*:/,
      ],
      apiCalls: [
        // Tier 1: API URL
        /\.qdrant\.io/,
        /\.qdrant\.tech/,

        // Tier 2: SDK instantiation
        /QdrantClient\s*\(/,
        /qdrant_client\.QdrantClient\s*\(/,

        // Tier 3: Method calls
        /client\.upsert\s*\(/,
        /client\.search\s*\(/,
        /\.create_collection\s*\(/,
      ],
      secrets: [
        /QDRANT_API_KEY\s*[=:]\s*["']?[A-Za-z0-9_-]+["']?/,
        /QDRANT_URL\s*[=:]\s*["']?https?:\/\/[^"'\s]+["']?/,
      ],
    },
  },

  // ============================================================================
  // Milvus / Zilliz (Cloud)
  // ============================================================================
  {
    name: "milvus",
    provider: "Milvus",
    description: "Milvus/Zilliz vector database for AI applications",
    documentationUrl: "https://milvus.io/docs",
    confidence: "high",
    keywords: ["milvus", "zilliz", "pymilvus", "ZILLIZ_CLOUD"],
    patterns: {
      imports: [
        /^from\s+pymilvus\s+import/m,
        /^import\s+pymilvus/m,
        /require\s*\(\s*["']@zilliz\/milvus2-sdk-node["']\s*\)/,
        /import\s+.*\s+from\s+["']@zilliz\/milvus2-sdk-node["']/,
      ],
      dependencies: [
        /^pymilvus[=<>~!\s]/m,
        /"@zilliz\/milvus2-sdk-node"\s*:/,
        /'@zilliz\/milvus2-sdk-node'\s*:/,
        /"pymilvus"\s*:/,
      ],
      apiCalls: [
        // Tier 1: API URL (Zilliz Cloud)
        /\.zillizcloud\.com/,
        /cloud\.zilliz\.com/,

        // Tier 2: SDK instantiation
        /MilvusClient\s*\(/,
        /connections\.connect\s*\(/,

        // Tier 3: Method calls
        /\.create_collection\s*\(/,
        /\.insert\s*\(/,
        /\.search\s*\(/,
      ],
      secrets: [
        /ZILLIZ_CLOUD_URI\s*[=:]\s*["']?https?:\/\/[^"'\s]+["']?/,
        /ZILLIZ_CLOUD_TOKEN\s*[=:]\s*["']?[A-Za-z0-9_-]+["']?/,
        /MILVUS_URI\s*[=:]\s*["']?https?:\/\/[^"'\s]+["']?/,
      ],
    },
  },

  // ============================================================================
  // Chroma (Cloud)
  // ============================================================================
  {
    name: "chroma",
    provider: "Chroma",
    description: "Chroma AI-native embedding database",
    documentationUrl: "https://docs.trychroma.com",
    confidence: "high",
    keywords: ["chromadb", "chroma", "CHROMA_API_KEY"],
    patterns: {
      imports: [
        /^import\s+chromadb/m,
        /^from\s+chromadb\s+import/m,
        /require\s*\(\s*["']chromadb["']\s*\)/,
        /import\s+.*\s+from\s+["']chromadb["']/,
      ],
      dependencies: [/^chromadb[=<>~!\s]/m, /"chromadb"\s*:/, /'chromadb'\s*:/],
      apiCalls: [
        // Tier 1: API URL (Chroma Cloud)
        /api\.trychroma\.com/,

        // Tier 2: SDK instantiation
        /chromadb\.Client\s*\(/,
        /chromadb\.HttpClient\s*\(/,
        /chromadb\.CloudClient\s*\(/,
        /ChromaClient\s*\(/,

        // Tier 3: Method calls
        /\.get_or_create_collection\s*\(/,
        /\.create_collection\s*\(/,
        /collection\.add\s*\(/,
        /collection\.query\s*\(/,
      ],
      secrets: [
        /CHROMA_API_KEY\s*[=:]\s*["']?[A-Za-z0-9_-]+["']?/,
        /CHROMA_SERVER_AUTH_CREDENTIALS\s*[=:]\s*["']?[A-Za-z0-9_-]+["']?/,
      ],
    },
  },

  // ============================================================================
  // AI OBSERVABILITY & EVALUATION
  // ============================================================================

  // ============================================================================
  // Helicone (LLM Observability)
  // ============================================================================
  {
    name: "helicone",
    provider: "Helicone",
    description: "Helicone LLM observability and monitoring",
    documentationUrl: "https://docs.helicone.ai",
    confidence: "high",
    keywords: ["helicone", "HELICONE_API_KEY", "helicone.ai"],
    patterns: {
      imports: [/^from\s+helicone\s+import/m, /^import\s+helicone/m],
      dependencies: [/^helicone[=<>~!\s]/m, /"helicone"\s*:/, /'helicone'\s*:/],
      apiCalls: [
        // Tier 1: Proxy URL (how Helicone is commonly used)
        /oai\.helicone\.ai/,
        /gateway\.helicone\.ai/,
        /api\.helicone\.ai/,

        // Headers
        /Helicone-Auth/,
        /helicone-auth/,
      ],
      secrets: [/HELICONE_API_KEY\s*[=:]\s*["']?[A-Za-z0-9_-]+["']?/],
    },
  },

  // ============================================================================
  // Braintrust (AI Evaluation)
  // ============================================================================
  {
    name: "braintrust",
    provider: "Braintrust",
    description: "Braintrust AI evaluation and observability platform",
    documentationUrl: "https://www.braintrust.dev/docs",
    confidence: "high",
    keywords: ["braintrust", "BRAINTRUST_API_KEY", "braintrust.dev"],
    patterns: {
      imports: [/^from\s+braintrust\s+import/m, /^import\s+braintrust/m],
      dependencies: [/^braintrust[=<>~!\s]/m, /"braintrust"\s*:/, /'braintrust'\s*:/],
      apiCalls: [
        // Tier 1: API URL / Proxy
        /api\.braintrust\.dev/,
        /braintrustproxy\.com/,

        // Tier 3: Method calls
        /braintrust\.init\s*\(/,
        /braintrust\.Eval\s*\(/,
        /@braintrust\/logger/,
      ],
      secrets: [/BRAINTRUST_API_KEY\s*[=:]\s*["']?[A-Za-z0-9_-]+["']?/],
    },
  },

  // ============================================================================
  // Portkey (AI Gateway)
  // ============================================================================
  {
    name: "portkey",
    provider: "Portkey",
    description: "Portkey AI gateway and observability",
    documentationUrl: "https://docs.portkey.ai",
    confidence: "high",
    keywords: ["portkey", "PORTKEY_API_KEY", "portkey.ai"],
    patterns: {
      imports: [/^from\s+portkey_ai\s+import/m, /^import\s+portkey_ai/m],
      dependencies: [/^portkey-ai[=<>~!\s]/m, /"portkey-ai"\s*:/, /'portkey-ai'\s*:/],
      apiCalls: [
        // Tier 1: API URL
        /api\.portkey\.ai/,

        // Tier 2: SDK instantiation
        /Portkey\s*\(/,

        // Headers
        /x-portkey-api-key/,
      ],
      secrets: [/PORTKEY_API_KEY\s*[=:]\s*["']?[A-Za-z0-9_-]+["']?/],
    },
  },
];
