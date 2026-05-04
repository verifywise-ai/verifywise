/**
 * @fileoverview AI Detection Patterns Configuration
 *
 * Defines patterns for detecting AI/ML libraries and frameworks in codebases.
 * Used by the AI Detection scanner to identify technologies in repositories.
 *
 * Pattern Types:
 * - imports: Regex patterns for import statements in code files
 * - dependencies: Regex patterns for dependency file entries
 *
 * Confidence Levels:
 * - high: Definitive AI/ML library with no false positive risk
 * - medium: Likely AI/ML related but could have other uses
 * - low: Possibly AI/ML related, requires context
 *
 * @module config/aiDetectionPatterns
 */

// ============================================================================
// Types
// ============================================================================

export interface DetectionPattern {
  /** Display name of the library */
  name: string;
  /** Provider/company that created the library */
  provider: string;
  /** Description of what the library does */
  description: string;
  /** Link to official documentation */
  documentationUrl: string;
  /** Confidence level for detection */
  confidence: "high" | "medium" | "low";
  /** Pattern definitions */
  patterns: {
    /** Regex patterns for import statements */
    imports?: RegExp[];
    /** Regex patterns for dependency files */
    dependencies?: RegExp[];
    /** Regex patterns for API calls (REST endpoints and SDK method calls) */
    apiCalls?: RegExp[];
    /** Regex patterns for hardcoded secrets (API keys, tokens) */
    secrets?: RegExp[];
    /** Regex patterns for model references (Hugging Face models, etc.) */
    modelRefs?: RegExp[];
    /** Regex patterns for RAG pipeline components (vector DBs, embeddings, etc.) */
    ragPatterns?: RegExp[];
    /** Regex patterns for AI agent frameworks and MCP servers */
    agentPatterns?: RegExp[];
  };
}

// ============================================================================
// Risk Level Calculation
// ============================================================================

/**
 * Cloud AI providers that send data to external APIs (high risk)
 * These services process data on remote servers, posing data leakage risk
 */
const HIGH_RISK_PROVIDERS = [
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
];

/**
 * Frameworks that can use cloud APIs but also support local models (medium risk)
 * Risk depends on configuration
 */
const MEDIUM_RISK_PROVIDERS = ["LangChain", "LlamaIndex", "Haystack", "CrewAI"];

/**
 * Local-only processing libraries (low risk)
 * Data stays on local machine, minimal data exposure risk
 */
const LOW_RISK_PROVIDERS = [
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
];

/** All valid finding types */
export type FindingType =
  | "library"
  | "dependency"
  | "api_call"
  | "secret"
  | "model_ref"
  | "rag_component"
  | "agent";

/**
 * Calculate risk level for a finding based on provider and finding type
 *
 * Risk Level Logic:
 * - secret findings: Always HIGH (exposed credentials = immediate risk)
 * - api_call findings: Always HIGH (active data transmission)
 * - model_ref findings: Based on provider (cloud models = high, local = medium)
 * - rag_component findings: MEDIUM (data processing, depends on vector DB)
 * - agent findings: HIGH (autonomous actions, potential for misuse)
 * - library findings: Based on provider classification
 *
 * @param provider - The provider/company name
 * @param findingType - The type of finding
 * @returns Risk level: "high" | "medium" | "low"
 */
export function calculateRiskLevel(
  provider: string,
  findingType: FindingType,
): "high" | "medium" | "low" {
  // Secret findings are always high risk - exposed credentials
  if (findingType === "secret") {
    return "high";
  }

  // API call findings are always high risk - active data transmission
  if (findingType === "api_call") {
    return "high";
  }

  // Agent findings are high risk - autonomous actions
  if (findingType === "agent") {
    return "high";
  }

  // Model reference findings - check if cloud or local
  if (findingType === "model_ref") {
    // Cloud-hosted models are high risk
    if (HIGH_RISK_PROVIDERS.includes(provider)) {
      return "high";
    }
    // Most model refs are medium risk (could be local or cloud)
    return "medium";
  }

  // RAG component findings are medium risk by default
  if (findingType === "rag_component") {
    // Cloud vector DBs are higher risk
    if (["Pinecone", "Weaviate Cloud", "Qdrant Cloud"].includes(provider)) {
      return "high";
    }
    return "medium";
  }

  // For library/dependency findings, check provider classification
  if (HIGH_RISK_PROVIDERS.includes(provider)) {
    return "high";
  }

  if (MEDIUM_RISK_PROVIDERS.includes(provider)) {
    return "medium";
  }

  if (LOW_RISK_PROVIDERS.includes(provider)) {
    return "low";
  }

  // Default to medium for unknown providers
  return "medium";
}

export interface PatternCategory {
  /** Category name */
  name: string;
  /** Type of finding (library, dependency) */
  findingType: string;
  /** Patterns in this category */
  patterns: DetectionPattern[];
}

// ============================================================================
// File Extensions to Scan
// ============================================================================

/**
 * Code file extensions that will be scanned for import statements
 */
export const CODE_EXTENSIONS = [
  ".py", // Python
  ".js",
  ".mjs",
  ".cjs", // JavaScript
  ".ts",
  ".tsx", // TypeScript
  ".jsx", // React
  ".java", // Java
  ".go", // Go
  ".rb", // Ruby
  ".rs", // Rust
  ".cpp",
  ".cc",
  ".c",
  ".h",
  ".hpp", // C/C++
  ".cs", // C#
  ".scala", // Scala
  ".kt", // Kotlin
  ".swift", // Swift
  ".r",
  ".R", // R
  ".jl", // Julia
  ".yml",
  ".yaml", // YAML (GitHub Actions workflows, docker-compose, etc.)
];

/**
 * Dependency file names that will be scanned for package declarations
 * Note: Lock files are excluded in Phase 1 (complex format requiring dedicated parsers)
 */
export const DEPENDENCY_FILES = [
  "requirements.txt",
  "setup.py",
  "pyproject.toml",
  "Pipfile",
  "environment.yml",
  "conda.yml",
  "package.json",
  "Cargo.toml",
  "go.mod",
  "pom.xml",
  "build.gradle",
  "build.gradle.kts",
  "Gemfile",
  "mix.exs",
  "deps.edn",
  "Project.toml", // Julia
  "Dockerfile", // Docker container definitions
  "docker-compose.yml",
  "docker-compose.yaml", // Docker Compose orchestration
  "mcp.json", // MCP server configuration
  "claude_desktop_config.json", // Claude Desktop MCP configuration
];

/**
 * Directories to skip during scanning
 */
export const SKIP_DIRECTORIES = [
  "node_modules",
  ".git",
  ".svn",
  ".hg",
  "venv",
  ".venv",
  "env",
  ".env",
  "__pycache__",
  ".pytest_cache",
  ".mypy_cache",
  "dist",
  "build",
  "target",
  ".next",
  ".nuxt",
  "vendor",
  "bower_components",
  ".tox",
  "eggs",
  "*.egg-info",
  ".idea",
  ".vscode",
];

// ============================================================================
// Detection Patterns - Phase 1 Technologies/Libraries
// ============================================================================

export const AI_DETECTION_PATTERNS: PatternCategory[] = [
  {
    name: "Technologies",
    findingType: "library",
    patterns: [
      // ========================
      // OpenAI
      // ========================
      {
        name: "openai",
        provider: "OpenAI",
        description: "Official OpenAI Python/Node.js library for GPT models",
        documentationUrl: "https://platform.openai.com/docs",
        confidence: "high",
        patterns: {
          imports: [
            /^import\s+openai/m,
            /^from\s+openai\s+import/m,
            /require\s*\(\s*['"]openai['"]\s*\)/,
            /from\s+['"]openai['"]/,
            /import\s+.*\s+from\s+['"]openai['"]/,
          ],
          dependencies: [/^openai[=<>~!\s]/m, /"openai"\s*:/, /'openai'\s*:/],
          apiCalls: [
            // REST API URLs
            /api\.openai\.com/,
            /https?:\/\/[^"']*openai\.com\/v1\//,
            // Python SDK method calls
            /openai\.ChatCompletion\.create\s*\(/,
            /openai\.chat\.completions\.create\s*\(/,
            // Note: Removed generic /.completions.create/ - too broad, causes false positives
            /openai\.Completion\.create\s*\(/,
            /openai\.Embedding\.create\s*\(/,
            /openai\.embeddings\.create\s*\(/,
            /openai\.Image\.create\s*\(/,
            /openai\.images\.generate\s*\(/,
            /openai\.Audio\.transcribe\s*\(/,
            /openai\.audio\.transcriptions\.create\s*\(/,
            /openai\.Moderation\.create\s*\(/,
            /openai\.moderations\.create\s*\(/,
            // Assistants API (beta)
            /openai\.beta\.assistants\./,
            /openai\.beta\.threads\./,
            /client\.beta\.assistants\./,
            /client\.beta\.threads\./,
            // Generic SDK client patterns (without openai. prefix)
            /client\.chat\.completions\.create\s*\(/,
            /client\.embeddings\.create\s*\(/,
            /client\.images\.generate\s*\(/,
            /client\.audio\.transcriptions\.create\s*\(/,
          ],
          secrets: [
            // OpenAI API keys (sk-... format, 40+ chars)
            /sk-[A-Za-z0-9]{32,}/,
            // OpenAI project API keys (sk-proj-...)
            /sk-proj-[A-Za-z0-9_-]{32,}/,
            // Environment variable assignments
            /OPENAI_API_KEY\s*[=:]\s*["']?[A-Za-z0-9_-]+["']?/,
            /OPENAI_KEY\s*[=:]\s*["']?[A-Za-z0-9_-]+["']?/,
            // Direct string assignments in code
            /openai\.api_key\s*=\s*["'][^"']+["']/,
            /api_key\s*[=:]\s*["']sk-[A-Za-z0-9]{20,}["']/,
          ],
        },
      },

      // ========================
      // Anthropic
      // ========================
      {
        name: "anthropic",
        provider: "Anthropic",
        description: "Official Anthropic Python/Node.js library for Claude models",
        documentationUrl: "https://docs.anthropic.com",
        confidence: "high",
        patterns: {
          imports: [
            /^import\s+anthropic/m,
            /^from\s+anthropic\s+import/m,
            /require\s*\(\s*['"]@anthropic-ai\/sdk['"]\s*\)/,
            /from\s+['"]@anthropic-ai\/sdk['"]/,
            /import\s+.*\s+from\s+['"]@anthropic-ai\/sdk['"]/,
          ],
          dependencies: [
            /^anthropic[=<>~!\s]/m,
            /"@anthropic-ai\/sdk"\s*:/,
            /'@anthropic-ai\/sdk'\s*:/,
          ],
          apiCalls: [
            // REST API URLs
            /api\.anthropic\.com/,
            /https?:\/\/[^"']*anthropic\.com\/v1\//,
            // Python SDK method calls
            /anthropic\.messages\.create\s*\(/,
            /client\.messages\.create\s*\(/,
            /\.messages\.create\s*\(.*model.*claude/,
            /anthropic\.completions\.create\s*\(/,
            /anthropic\.Anthropic\s*\(/,
            // Streaming (more specific)
            /anthropic\.messages\.stream\s*\(/,
            /client\.messages\.stream\s*\(/,
          ],
          secrets: [
            // Anthropic API keys (sk-ant-... format)
            /sk-ant-[A-Za-z0-9_-]{32,}/,
            // Environment variable assignments
            /ANTHROPIC_API_KEY\s*[=:]\s*["']?[A-Za-z0-9_-]+["']?/,
            /CLAUDE_API_KEY\s*[=:]\s*["']?[A-Za-z0-9_-]+["']?/,
            // Direct string assignments in code
            /api_key\s*[=:]\s*["']sk-ant-[A-Za-z0-9_-]+["']/,
          ],
        },
      },

      // ========================
      // Google AI
      // ========================
      {
        name: "tensorflow",
        provider: "Google",
        description: "TensorFlow machine learning framework",
        documentationUrl: "https://www.tensorflow.org/api_docs",
        confidence: "high",
        patterns: {
          imports: [
            /^import\s+tensorflow/m,
            /^from\s+tensorflow\s+import/m,
            /import\s+tensorflow\s+as\s+tf/m,
          ],
          dependencies: [/^tensorflow[=<>~!\s]/m, /^tensorflow-gpu[=<>~!\s]/m],
        },
      },
      {
        name: "keras",
        provider: "Google",
        description: "Keras deep learning API",
        documentationUrl: "https://keras.io/api/",
        confidence: "high",
        patterns: {
          imports: [
            /^import\s+keras/m,
            /^from\s+keras\s+import/m,
            /^from\s+tensorflow\.keras\s+import/m,
            /^from\s+tensorflow\s+import\s+keras/m,
          ],
          dependencies: [/^keras[=<>~!\s]/m],
        },
      },
      {
        name: "google-generativeai",
        provider: "Google",
        description: "Google Generative AI (Gemini) SDK",
        documentationUrl: "https://ai.google.dev/gemini-api/docs",
        confidence: "high",
        patterns: {
          imports: [
            /^import\s+google\.generativeai/m,
            /^from\s+google\.generativeai\s+import/m,
            /^from\s+google\s+import\s+generativeai/m,
          ],
          dependencies: [/^google-generativeai[=<>~!\s]/m],
          apiCalls: [
            // REST API URLs
            /generativelanguage\.googleapis\.com/,
            /aiplatform\.googleapis\.com/,
            // Python SDK method calls
            /\.generate_content\s*\(/,
            /model\.generate_content\s*\(/,
            /GenerativeModel\s*\(/,
            /genai\.GenerativeModel\s*\(/,
            /\.generate_content_async\s*\(/,
            /\.start_chat\s*\(/,
            /chat\.send_message\s*\(/,
            // Vertex AI
            /vertexai\.generative_models/,
          ],
          secrets: [
            // Google API keys (AIza...)
            /AIza[A-Za-z0-9_-]{35}/,
            // Environment variable assignments
            /GOOGLE_API_KEY\s*[=:]\s*["']?[A-Za-z0-9_-]+["']?/,
            /GEMINI_API_KEY\s*[=:]\s*["']?[A-Za-z0-9_-]+["']?/,
            /GOOGLE_CLOUD_API_KEY\s*[=:]\s*["']?[A-Za-z0-9_-]+["']?/,
          ],
        },
      },

      // ========================
      // Meta / PyTorch
      // ========================
      {
        name: "pytorch",
        provider: "Meta",
        description: "PyTorch deep learning framework",
        documentationUrl: "https://pytorch.org/docs/stable/index.html",
        confidence: "high",
        patterns: {
          imports: [/^import\s+torch/m, /^from\s+torch\s+import/m, /^import\s+pytorch/m],
          dependencies: [
            /^torch[=<>~!\s]/m,
            /^pytorch[=<>~!\s]/m,
            /^torchvision[=<>~!\s]/m,
            /^torchaudio[=<>~!\s]/m,
          ],
        },
      },

      // ========================
      // HuggingFace
      // ========================
      {
        name: "transformers",
        provider: "HuggingFace",
        description: "HuggingFace Transformers library for NLP",
        documentationUrl: "https://huggingface.co/docs/transformers",
        confidence: "high",
        patterns: {
          imports: [/^import\s+transformers/m, /^from\s+transformers\s+import/m],
          dependencies: [/^transformers[=<>~!\s]/m],
        },
      },
      {
        name: "huggingface_hub",
        provider: "HuggingFace",
        description: "HuggingFace Hub client library",
        documentationUrl: "https://huggingface.co/docs/huggingface_hub",
        confidence: "high",
        patterns: {
          imports: [/^import\s+huggingface_hub/m, /^from\s+huggingface_hub\s+import/m],
          dependencies: [/^huggingface[-_]hub[=<>~!\s]/m],
          secrets: [
            // HuggingFace API tokens (hf_...)
            /hf_[A-Za-z0-9]{32,}/,
            // Environment variable assignments
            /HUGGINGFACE_TOKEN\s*[=:]\s*["']?[A-Za-z0-9_-]+["']?/,
            /HF_TOKEN\s*[=:]\s*["']?[A-Za-z0-9_-]+["']?/,
            /HUGGING_FACE_HUB_TOKEN\s*[=:]\s*["']?[A-Za-z0-9_-]+["']?/,
          ],
        },
      },
      {
        name: "datasets",
        provider: "HuggingFace",
        description: "HuggingFace Datasets library",
        documentationUrl: "https://huggingface.co/docs/datasets",
        confidence: "high",
        patterns: {
          imports: [/^import\s+datasets/m, /^from\s+datasets\s+import/m],
          dependencies: [/^datasets[=<>~!\s]/m],
        },
      },

      // ========================
      // LangChain
      // ========================
      {
        name: "langchain",
        provider: "LangChain",
        description: "LangChain framework for LLM applications",
        documentationUrl: "https://docs.langchain.com",
        confidence: "high",
        patterns: {
          imports: [
            /^import\s+langchain/m,
            /^from\s+langchain\s+import/m,
            /^from\s+langchain_core\s+import/m,
            /^from\s+langchain_community\s+import/m,
            /^from\s+langchain_openai\s+import/m,
            /^from\s+langchain_anthropic\s+import/m,
            /require\s*\(\s*['"]langchain['"]\s*\)/,
            /from\s+['"]langchain['"]/,
            /from\s+['"]@langchain\/core['"]/,
          ],
          dependencies: [
            /^langchain[=<>~!\s]/m,
            /^langchain[-_]/m,
            /"@langchain\//,
            /'@langchain\//,
          ],
          apiCalls: [
            // LangChain model wrappers (specific class instantiations)
            /ChatOpenAI\s*\(/,
            /ChatAnthropic\s*\(/,
            /ChatGoogleGenerativeAI\s*\(/,
            /AzureChatOpenAI\s*\(/,
            /BedrockChat\s*\(/,
            /ChatCohere\s*\(/,
            /ChatMistralAI\s*\(/,
            /ChatGroq\s*\(/,
            // Specific LangChain chain/agent calls (more specific patterns)
            /chain\.invoke\s*\(/,
            /chain\.ainvoke\s*\(/,
            /chain\.stream\s*\(/,
            /chain\.astream\s*\(/,
            /agent\.invoke\s*\(/,
            /llm\.invoke\s*\(/,
            /model\.invoke\s*\(/,
            /chain\.run\s*\(/,
            /agent\.run\s*\(/,
            /llm\.predict\s*\(/,
            /llm\.generate\s*\(/,
            // RunnableSequence calls
            /runnable\.invoke\s*\(/,
            /pipeline\.invoke\s*\(/,
          ],
        },
      },

      // ========================
      // LlamaIndex
      // ========================
      {
        name: "llama_index",
        provider: "LlamaIndex",
        description: "LlamaIndex data framework for LLM applications",
        documentationUrl: "https://docs.llamaindex.ai",
        confidence: "high",
        patterns: {
          imports: [
            /^import\s+llama_index/m,
            /^from\s+llama_index\s+import/m,
            /^from\s+llama_index\.core\s+import/m,
          ],
          dependencies: [/^llama[-_]index[=<>~!\s]/m, /^llama[-_]index[-_]/m],
          apiCalls: [
            // LLM calls
            /OpenAI\s*\(\s*model\s*=/,
            /Anthropic\s*\(\s*model\s*=/,
            /llm\.complete\s*\(/,
            /llm\.chat\s*\(/,
            /llm\.stream_complete\s*\(/,
            // Query engine calls
            /query_engine\.query\s*\(/,
            /index\.as_query_engine\s*\(/,
            /chat_engine\.chat\s*\(/,
            // Retriever calls
            /retriever\.retrieve\s*\(/,
          ],
        },
      },

      // ========================
      // Cohere
      // ========================
      {
        name: "cohere",
        provider: "Cohere",
        description: "Cohere NLP API client",
        documentationUrl: "https://docs.cohere.com",
        confidence: "high",
        patterns: {
          imports: [/^import\s+cohere/m, /^from\s+cohere\s+import/m],
          dependencies: [/^cohere[=<>~!\s]/m],
          apiCalls: [
            // REST API URL
            /api\.cohere\.ai/,
            /api\.cohere\.com/,
            // SDK method calls
            /cohere\.chat\s*\(/,
            /cohere\.generate\s*\(/,
            /cohere\.embed\s*\(/,
            /cohere\.rerank\s*\(/,
            /co\.chat\s*\(/,
            /co\.generate\s*\(/,
            /co\.embed\s*\(/,
            /cohere_client\.chat\s*\(/,
          ],
          secrets: [
            // Cohere API keys
            /COHERE_API_KEY\s*[=:]\s*["']?[A-Za-z0-9_-]+["']?/,
            // Direct API key patterns (Cohere uses alphanumeric keys)
            /api_key\s*[=:]\s*["'][A-Za-z0-9]{30,}["']/,
          ],
        },
      },

      // ========================
      // Replicate
      // ========================
      {
        name: "replicate",
        provider: "Replicate",
        description: "Replicate ML model hosting API",
        documentationUrl: "https://replicate.com/docs",
        confidence: "high",
        patterns: {
          imports: [/^import\s+replicate/m, /^from\s+replicate\s+import/m],
          dependencies: [/^replicate[=<>~!\s]/m],
          apiCalls: [
            // REST API URL
            /api\.replicate\.com/,
            // SDK method calls
            /replicate\.run\s*\(/,
            /replicate\.predictions\.create\s*\(/,
            /replicate\.models\.get\s*\(/,
            /replicate\.stream\s*\(/,
          ],
          secrets: [
            // Replicate API tokens (r8_...)
            /r8_[A-Za-z0-9]{36,}/,
            // Environment variable assignments
            /REPLICATE_API_TOKEN\s*[=:]\s*["']?[A-Za-z0-9_-]+["']?/,
          ],
        },
      },

      // ========================
      // AWS Bedrock
      // ========================
      {
        name: "aws-bedrock",
        provider: "AWS",
        description: "AWS Bedrock foundation models service",
        documentationUrl: "https://docs.aws.amazon.com/bedrock",
        confidence: "high",
        patterns: {
          imports: [
            /from\s+['"]@aws-sdk\/client-bedrock['"]/,
            /from\s+['"]@aws-sdk\/client-bedrock-runtime['"]/,
            /require\s*\(\s*['"]@aws-sdk\/client-bedrock['"]\s*\)/,
            /boto3\.client\s*\(\s*['"]bedrock['"]/,
          ],
          dependencies: [
            /"@aws-sdk\/client-bedrock"\s*:/,
            /"@aws-sdk\/client-bedrock-runtime"\s*:/,
          ],
          apiCalls: [
            // REST API URL
            /bedrock-runtime\.[^.]+\.amazonaws\.com/,
            /bedrock\.[^.]+\.amazonaws\.com/,
            // SDK method calls
            /\.invoke_model\s*\(/,
            /\.invokeModel\s*\(/,
            /invoke_model_with_response_stream\s*\(/,
            /InvokeModelCommand\s*\(/,
            /InvokeModelWithResponseStreamCommand\s*\(/,
            /BedrockRuntimeClient\s*\(/,
            /BedrockRuntime\s*\(/,
            /boto3\.client\s*\(\s*['"]bedrock-runtime['"]/,
          ],
          secrets: [
            // AWS Access Key IDs (AKIA...)
            /AKIA[A-Z0-9]{16}/,
            // AWS Secret Access Keys (40 chars)
            /AWS_SECRET_ACCESS_KEY\s*[=:]\s*["']?[A-Za-z0-9\/+=]{40}["']?/,
            /AWS_ACCESS_KEY_ID\s*[=:]\s*["']?AKIA[A-Z0-9]{16}["']?/,
          ],
        },
      },

      // ========================
      // Microsoft Azure OpenAI
      // ========================
      {
        name: "azure-openai",
        provider: "Microsoft",
        description: "Azure OpenAI Service SDK",
        documentationUrl: "https://learn.microsoft.com/azure/ai-services/openai",
        confidence: "high",
        patterns: {
          imports: [
            /from\s+['"]@azure\/openai['"]/,
            /require\s*\(\s*['"]@azure\/openai['"]\s*\)/,
            /^from\s+azure\.ai\.openai\s+import/m,
          ],
          dependencies: [/"@azure\/openai"\s*:/, /^azure-ai-openai[=<>~!\s]/m],
          apiCalls: [
            // REST API URL
            /\.openai\.azure\.com/,
            /azure\.openai\.com/,
            // SDK method calls
            /AzureOpenAI\s*\(/,
            /openai\.AzureOpenAI\s*\(/,
            /AzureKeyCredential\s*\(/,
            /\.get_chat_completions\s*\(/,
            /\.get_completions\s*\(/,
            /\.get_embeddings\s*\(/,
          ],
          secrets: [
            // Azure OpenAI API keys
            /AZURE_OPENAI_API_KEY\s*[=:]\s*["']?[A-Za-z0-9_-]+["']?/,
            /AZURE_OPENAI_KEY\s*[=:]\s*["']?[A-Za-z0-9_-]+["']?/,
          ],
        },
      },

      // ========================
      // Mistral AI
      // ========================
      {
        name: "mistralai",
        provider: "Mistral",
        description: "Mistral AI Python client",
        documentationUrl: "https://docs.mistral.ai",
        confidence: "high",
        patterns: {
          imports: [/^import\s+mistralai/m, /^from\s+mistralai\s+import/m],
          dependencies: [/^mistralai[=<>~!\s]/m],
          apiCalls: [
            // REST API URL
            /api\.mistral\.ai/,
            // SDK method calls
            /MistralClient\s*\(/,
            /Mistral\s*\(/,
            /mistral\.chat\s*\(/,
            /mistral_client\.chat\s*\(/,
            /mistral\.chat\.complete\s*\(/,
            /mistral\.chat\.stream\s*\(/,
          ],
          secrets: [
            // Mistral API keys
            /MISTRAL_API_KEY\s*[=:]\s*["']?[A-Za-z0-9_-]+["']?/,
          ],
        },
      },

      // ========================
      // Traditional ML Libraries
      // ========================
      {
        name: "scikit-learn",
        provider: "scikit-learn",
        description: "Machine learning library for Python",
        documentationUrl: "https://scikit-learn.org/stable/documentation.html",
        confidence: "high",
        patterns: {
          imports: [/^import\s+sklearn/m, /^from\s+sklearn\s+import/m, /^from\s+sklearn\./m],
          dependencies: [/^scikit-learn[=<>~!\s]/m, /^sklearn[=<>~!\s]/m],
        },
      },
      {
        name: "mxnet",
        provider: "MXNet",
        description: "Flexible and efficient deep learning framework",
        documentationUrl: "https://mxnet.apache.org/",
        confidence: "high",
        patterns: {
          imports: [/^import\s+mxnet/m, /^from\s+mxnet\s+import/m, /import\s+mxnet\s+as\s+mx/m],
          dependencies: [/^mxnet[=<>~!\s]/m],
        },
      },
      {
        name: "xgboost",
        provider: "XGBoost",
        description: "Gradient boosting framework",
        documentationUrl: "https://xgboost.readthedocs.io",
        confidence: "high",
        patterns: {
          imports: [/^import\s+xgboost/m, /^from\s+xgboost\s+import/m],
          dependencies: [/^xgboost[=<>~!\s]/m],
        },
      },
      {
        name: "lightgbm",
        provider: "Microsoft",
        description: "Light Gradient Boosting Machine",
        documentationUrl: "https://lightgbm.readthedocs.io",
        confidence: "high",
        patterns: {
          imports: [/^import\s+lightgbm/m, /^from\s+lightgbm\s+import/m],
          dependencies: [/^lightgbm[=<>~!\s]/m],
        },
      },

      // ========================
      // NLP Libraries
      // ========================
      {
        name: "spacy",
        provider: "Explosion",
        description: "Industrial-strength NLP library",
        documentationUrl: "https://spacy.io/api",
        confidence: "high",
        patterns: {
          imports: [/^import\s+spacy/m, /^from\s+spacy\s+import/m],
          dependencies: [/^spacy[=<>~!\s]/m],
        },
      },
      {
        name: "nltk",
        provider: "NLTK",
        description: "Natural Language Toolkit",
        documentationUrl: "https://www.nltk.org",
        confidence: "high",
        patterns: {
          imports: [/^import\s+nltk/m, /^from\s+nltk\s+import/m],
          dependencies: [/^nltk[=<>~!\s]/m],
        },
      },
      {
        name: "gensim",
        provider: "Gensim",
        description: "Topic modeling and word embeddings",
        documentationUrl: "https://radimrehurek.com/gensim/",
        confidence: "high",
        patterns: {
          imports: [/^import\s+gensim/m, /^from\s+gensim\s+import/m],
          dependencies: [/^gensim[=<>~!\s]/m],
        },
      },

      // ========================
      // Deep Learning Frameworks
      // ========================
      {
        name: "fastai",
        provider: "fast.ai",
        description: "Deep learning library built on PyTorch",
        documentationUrl: "https://docs.fast.ai",
        confidence: "high",
        patterns: {
          imports: [/^import\s+fastai/m, /^from\s+fastai\s+import/m, /^from\s+fastai\./m],
          dependencies: [/^fastai[=<>~!\s]/m],
        },
      },
      {
        name: "jax",
        provider: "Google",
        description: "High-performance numerical computing",
        documentationUrl: "https://jax.readthedocs.io",
        confidence: "high",
        patterns: {
          imports: [/^import\s+jax/m, /^from\s+jax\s+import/m],
          dependencies: [/^jax[=<>~!\s]/m, /^jaxlib[=<>~!\s]/m],
        },
      },
      {
        name: "flax",
        provider: "Google",
        description: "Neural network library for JAX",
        documentationUrl: "https://flax.readthedocs.io",
        confidence: "high",
        patterns: {
          imports: [/^import\s+flax/m, /^from\s+flax\s+import/m],
          dependencies: [/^flax[=<>~!\s]/m],
        },
      },
      // ========================
      // Model Serving & Deployment
      // ========================
      {
        name: "onnx",
        provider: "ONNX",
        description: "Open Neural Network Exchange format",
        documentationUrl: "https://onnx.ai/onnx/",
        confidence: "high",
        patterns: {
          imports: [
            /^import\s+onnx/m,
            /^from\s+onnx\s+import/m,
            /^import\s+onnxruntime/m,
            /^from\s+onnxruntime\s+import/m,
          ],
          dependencies: [/^onnx[=<>~!\s]/m, /^onnxruntime[=<>~!\s]/m],
        },
      },

      // ========================
      // ML Operations
      // ========================
      {
        name: "mlflow",
        provider: "MLflow",
        description: "ML lifecycle management platform",
        documentationUrl: "https://mlflow.org/docs/latest/index.html",
        confidence: "high",
        patterns: {
          imports: [/^import\s+mlflow/m, /^from\s+mlflow\s+import/m],
          dependencies: [/^mlflow[=<>~!\s]/m],
        },
      },
      {
        name: "wandb",
        provider: "Weights & Biases",
        description: "ML experiment tracking and visualization",
        documentationUrl: "https://docs.wandb.ai",
        confidence: "high",
        patterns: {
          imports: [/^import\s+wandb/m, /^from\s+wandb\s+import/m],
          dependencies: [/^wandb[=<>~!\s]/m],
        },
      },

      // ========================
      // Computer Vision
      // ========================
      {
        name: "opencv",
        provider: "OpenCV",
        description: "Computer vision library",
        documentationUrl: "https://docs.opencv.org",
        confidence: "high",
        patterns: {
          imports: [/^import\s+cv2/m, /^from\s+cv2\s+import/m],
          dependencies: [/^opencv-python[=<>~!\s]/m, /^opencv-python-headless[=<>~!\s]/m],
        },
      },
      {
        name: "detectron2",
        provider: "Meta",
        description: "Meta's object detection library",
        documentationUrl: "https://detectron2.readthedocs.io",
        confidence: "high",
        patterns: {
          imports: [/^import\s+detectron2/m, /^from\s+detectron2\s+import/m],
          dependencies: [/^detectron2[=<>~!\s]/m],
        },
      },
      {
        name: "ultralytics",
        provider: "Ultralytics",
        description: "YOLO object detection library",
        documentationUrl: "https://docs.ultralytics.com",
        confidence: "high",
        patterns: {
          imports: [/^import\s+ultralytics/m, /^from\s+ultralytics\s+import/m],
          dependencies: [/^ultralytics[=<>~!\s]/m],
        },
      },

      // ========================
      // Speech & Audio
      // ========================
      {
        name: "whisper",
        provider: "OpenAI",
        description: "OpenAI Whisper speech recognition",
        documentationUrl: "https://github.com/openai/whisper",
        confidence: "high",
        patterns: {
          imports: [/^import\s+whisper/m, /^from\s+whisper\s+import/m],
          dependencies: [/^openai-whisper[=<>~!\s]/m],
        },
      },

      // ========================
      // Vector Databases / Embeddings
      // ========================
      {
        name: "pinecone",
        provider: "Pinecone",
        description: "Vector database for ML applications",
        documentationUrl: "https://docs.pinecone.io",
        confidence: "high",
        patterns: {
          imports: [/^import\s+pinecone/m, /^from\s+pinecone\s+import/m],
          dependencies: [/^pinecone-client[=<>~!\s]/m],
        },
      },
      {
        name: "chromadb",
        provider: "Chroma",
        description: "Open-source embedding database",
        documentationUrl: "https://docs.trychroma.com",
        confidence: "high",
        patterns: {
          imports: [/^import\s+chromadb/m, /^from\s+chromadb\s+import/m],
          dependencies: [/^chromadb[=<>~!\s]/m],
        },
      },
      {
        name: "weaviate",
        provider: "Weaviate",
        description: "Vector search engine",
        documentationUrl: "https://weaviate.io/developers/weaviate",
        confidence: "high",
        patterns: {
          imports: [/^import\s+weaviate/m, /^from\s+weaviate\s+import/m],
          dependencies: [/^weaviate-client[=<>~!\s]/m],
        },
      },
      {
        name: "qdrant",
        provider: "Qdrant",
        description: "Vector similarity search engine",
        documentationUrl: "https://qdrant.tech/documentation",
        confidence: "high",
        patterns: {
          imports: [/^import\s+qdrant_client/m, /^from\s+qdrant_client\s+import/m],
          dependencies: [/^qdrant-client[=<>~!\s]/m],
        },
      },
      {
        name: "faiss",
        provider: "Meta",
        description: "Facebook AI Similarity Search",
        documentationUrl: "https://faiss.ai",
        confidence: "high",
        patterns: {
          imports: [/^import\s+faiss/m, /^from\s+faiss\s+import/m],
          dependencies: [/^faiss-cpu[=<>~!\s]/m, /^faiss-gpu[=<>~!\s]/m],
        },
      },

      // ========================
      // AI Agent Frameworks
      // ========================
      {
        name: "autogen",
        provider: "Microsoft",
        description: "Multi-agent conversation framework",
        documentationUrl: "https://microsoft.github.io/autogen",
        confidence: "high",
        patterns: {
          imports: [/^import\s+autogen/m, /^from\s+autogen\s+import/m],
          dependencies: [/^pyautogen[=<>~!\s]/m],
        },
      },
      {
        name: "crewai",
        provider: "CrewAI",
        description: "Multi-agent orchestration framework",
        documentationUrl: "https://docs.crewai.com",
        confidence: "high",
        patterns: {
          imports: [/^import\s+crewai/m, /^from\s+crewai\s+import/m],
          dependencies: [/^crewai[=<>~!\s]/m],
        },
      },

      // ========================
      // Semantic Kernel
      // ========================
      {
        name: "semantic-kernel",
        provider: "Microsoft",
        description: "Microsoft's AI orchestration framework",
        documentationUrl: "https://learn.microsoft.com/semantic-kernel",
        confidence: "high",
        patterns: {
          imports: [/^import\s+semantic_kernel/m, /^from\s+semantic_kernel\s+import/m],
          dependencies: [/^semantic-kernel[=<>~!\s]/m],
        },
      },

      // ========================
      // Additional LLM Providers
      // ========================
      {
        name: "groq",
        provider: "Groq",
        description: "Groq API client for fast LLM inference",
        documentationUrl: "https://console.groq.com/docs",
        confidence: "high",
        patterns: {
          imports: [/^import\s+groq/m, /^from\s+groq\s+import/m],
          dependencies: [/^groq[=<>~!\s]/m],
          apiCalls: [
            // REST API URL
            /api\.groq\.com/,
            // SDK method calls
            /Groq\s*\(\s*\)/,
            /groq\.chat\.completions\.create\s*\(/,
          ],
        },
      },
      {
        name: "together",
        provider: "Together AI",
        description: "Together AI platform client",
        documentationUrl: "https://docs.together.ai",
        confidence: "high",
        patterns: {
          imports: [/^import\s+together/m, /^from\s+together\s+import/m],
          dependencies: [/^together[=<>~!\s]/m],
          apiCalls: [
            // REST API URL
            /api\.together\.xyz/,
            /api\.together\.ai/,
            // SDK method calls
            /Together\s*\(\s*\)/,
            /together\.Complete\.create\s*\(/,
            /together\.chat\.completions\.create\s*\(/,
          ],
        },
      },
      {
        name: "fireworks-ai",
        provider: "Fireworks AI",
        description: "Fireworks AI inference platform",
        documentationUrl: "https://docs.fireworks.ai",
        confidence: "high",
        patterns: {
          imports: [/^import\s+fireworks/m, /^from\s+fireworks\s+import/m],
          dependencies: [/^fireworks-ai[=<>~!\s]/m],
          apiCalls: [
            // REST API URL
            /api\.fireworks\.ai/,
            // SDK method calls
            /Fireworks\s*\(/,
            /fireworks\.client\s*\(/,
            /fireworks\.chat\.completions\.create\s*\(/,
          ],
        },
      },
      {
        name: "ai21",
        provider: "AI21 Labs",
        description: "AI21 Labs Jurassic models API",
        documentationUrl: "https://docs.ai21.com",
        confidence: "high",
        patterns: {
          imports: [/^import\s+ai21/m, /^from\s+ai21\s+import/m],
          dependencies: [/^ai21[=<>~!\s]/m],
        },
      },
      {
        name: "stability-sdk",
        provider: "Stability AI",
        description: "Stability AI SDK for Stable Diffusion",
        documentationUrl: "https://platform.stability.ai/docs",
        confidence: "high",
        patterns: {
          imports: [/^import\s+stability_sdk/m, /^from\s+stability_sdk\s+import/m],
          dependencies: [/^stability-sdk[=<>~!\s]/m],
        },
      },
      {
        name: "writer",
        provider: "Writer",
        description: "Writer AI platform SDK",
        documentationUrl: "https://dev.writer.com/docs",
        confidence: "high",
        patterns: {
          imports: [/^import\s+writer/m, /^from\s+writer\s+import/m],
          dependencies: [/^writer-sdk[=<>~!\s]/m],
        },
      },
      {
        name: "litellm",
        provider: "LiteLLM",
        description: "Unified API for 100+ LLM providers",
        documentationUrl: "https://docs.litellm.ai",
        confidence: "high",
        patterns: {
          imports: [/^import\s+litellm/m, /^from\s+litellm\s+import/m],
          dependencies: [/^litellm[=<>~!\s]/m],
        },
      },
      {
        name: "deepseek",
        provider: "DeepSeek",
        description: "DeepSeek AI API client",
        documentationUrl: "https://platform.deepseek.com/docs",
        confidence: "high",
        patterns: {
          imports: [/^import\s+deepseek/m, /^from\s+deepseek\s+import/m],
          dependencies: [/^deepseek[=<>~!\s]/m],
        },
      },
      {
        name: "perplexity",
        provider: "Perplexity AI",
        description: "Perplexity AI API client",
        documentationUrl: "https://docs.perplexity.ai",
        confidence: "high",
        patterns: {
          imports: [/^import\s+perplexity/m, /^from\s+perplexity\s+import/m],
          dependencies: [/^perplexity[=<>~!\s]/m],
          apiCalls: [
            // REST API URL
            /api\.perplexity\.ai/,
            // SDK method calls (uses OpenAI-compatible API)
            /perplexity\.chat\.completions\.create\s*\(/,
          ],
        },
      },
      {
        name: "cerebras",
        provider: "Cerebras",
        description: "Cerebras fast inference API",
        documentationUrl: "https://docs.cerebras.ai",
        confidence: "high",
        patterns: {
          imports: [/^import\s+cerebras/m, /^from\s+cerebras\s+import/m],
          dependencies: [/^cerebras-cloud-sdk[=<>~!\s]/m],
        },
      },
      {
        name: "lepton",
        provider: "Lepton AI",
        description: "Lepton AI deployment platform",
        documentationUrl: "https://www.lepton.ai/docs",
        confidence: "high",
        patterns: {
          imports: [/^import\s+leptonai/m, /^from\s+leptonai\s+import/m],
          dependencies: [/^leptonai[=<>~!\s]/m],
        },
      },
      {
        name: "modal",
        provider: "Modal",
        description: "Serverless ML compute platform",
        documentationUrl: "https://modal.com/docs",
        confidence: "high",
        patterns: {
          imports: [/^import\s+modal/m, /^from\s+modal\s+import/m],
          dependencies: [/^modal[=<>~!\s]/m],
        },
      },
      {
        name: "baseten",
        provider: "Baseten",
        description: "Model deployment platform",
        documentationUrl: "https://docs.baseten.co",
        confidence: "high",
        patterns: {
          imports: [
            /^import\s+baseten/m,
            /^from\s+baseten\s+import/m,
            /^import\s+truss/m,
            /^from\s+truss\s+import/m,
          ],
          dependencies: [/^baseten[=<>~!\s]/m, /^truss[=<>~!\s]/m],
        },
      },
      {
        name: "runpod",
        provider: "RunPod",
        description: "GPU cloud platform",
        documentationUrl: "https://docs.runpod.io",
        confidence: "high",
        patterns: {
          imports: [/^import\s+runpod/m, /^from\s+runpod\s+import/m],
          dependencies: [/^runpod[=<>~!\s]/m],
        },
      },
      {
        name: "assemblyai",
        provider: "AssemblyAI",
        description: "Speech-to-text API",
        documentationUrl: "https://www.assemblyai.com/docs",
        confidence: "high",
        patterns: {
          imports: [/^import\s+assemblyai/m, /^from\s+assemblyai\s+import/m],
          dependencies: [/^assemblyai[=<>~!\s]/m],
        },
      },
      {
        name: "elevenlabs",
        provider: "ElevenLabs",
        description: "Text-to-speech API",
        documentationUrl: "https://elevenlabs.io/docs",
        confidence: "high",
        patterns: {
          imports: [/^import\s+elevenlabs/m, /^from\s+elevenlabs\s+import/m],
          dependencies: [/^elevenlabs[=<>~!\s]/m],
        },
      },
      {
        name: "reka",
        provider: "Reka AI",
        description: "Multimodal AI API",
        documentationUrl: "https://docs.reka.ai",
        confidence: "high",
        patterns: {
          imports: [/^import\s+reka/m, /^from\s+reka\s+import/m],
          dependencies: [/^reka-api[=<>~!\s]/m],
        },
      },
      {
        name: "voyage",
        provider: "Voyage AI",
        description: "Embedding models API",
        documentationUrl: "https://docs.voyageai.com",
        confidence: "high",
        patterns: {
          imports: [/^import\s+voyageai/m, /^from\s+voyageai\s+import/m],
          dependencies: [/^voyageai[=<>~!\s]/m],
        },
      },
      {
        name: "jina",
        provider: "Jina AI",
        description: "Neural search and embeddings",
        documentationUrl: "https://docs.jina.ai",
        confidence: "high",
        patterns: {
          imports: [/^import\s+jina/m, /^from\s+jina\s+import/m],
          dependencies: [/^jina[=<>~!\s]/m],
        },
      },
      {
        name: "nomic",
        provider: "Nomic AI",
        description: "Open-source embeddings",
        documentationUrl: "https://docs.nomic.ai",
        confidence: "high",
        patterns: {
          imports: [/^import\s+nomic/m, /^from\s+nomic\s+import/m],
          dependencies: [/^nomic[=<>~!\s]/m],
        },
      },
      {
        name: "octoai",
        provider: "OctoAI",
        description: "AI inference platform",
        documentationUrl: "https://docs.octoai.cloud",
        confidence: "high",
        patterns: {
          imports: [/^import\s+octoai/m, /^from\s+octoai\s+import/m],
          dependencies: [/^octoai-sdk[=<>~!\s]/m],
        },
      },
      {
        name: "deepinfra",
        provider: "DeepInfra",
        description: "ML model inference API",
        documentationUrl: "https://deepinfra.com/docs",
        confidence: "high",
        patterns: {
          imports: [/^import\s+deepinfra/m, /^from\s+deepinfra\s+import/m],
          dependencies: [/^deepinfra[=<>~!\s]/m],
        },
      },
      {
        name: "vertexai",
        provider: "Google",
        description: "Google Vertex AI platform",
        documentationUrl: "https://cloud.google.com/vertex-ai/docs",
        confidence: "high",
        patterns: {
          imports: [
            /^import\s+vertexai/m,
            /^from\s+vertexai\s+import/m,
            /^from\s+google\.cloud\s+import\s+aiplatform/m,
          ],
          dependencies: [/^google-cloud-aiplatform[=<>~!\s]/m, /^vertexai[=<>~!\s]/m],
        },
      },
      {
        name: "sagemaker",
        provider: "AWS",
        description: "AWS SageMaker ML platform",
        documentationUrl: "https://docs.aws.amazon.com/sagemaker",
        confidence: "high",
        patterns: {
          imports: [/^import\s+sagemaker/m, /^from\s+sagemaker\s+import/m],
          dependencies: [/^sagemaker[=<>~!\s]/m],
        },
      },

      // ========================
      // Agent & Orchestration Frameworks
      // ========================
      {
        name: "haystack",
        provider: "deepset",
        description: "LLM orchestration framework for RAG pipelines",
        documentationUrl: "https://docs.haystack.deepset.ai",
        confidence: "high",
        patterns: {
          imports: [/^import\s+haystack/m, /^from\s+haystack\s+import/m, /^from\s+haystack\./m],
          dependencies: [/^haystack-ai[=<>~!\s]/m, /^farm-haystack[=<>~!\s]/m],
        },
      },
      {
        name: "instructor",
        provider: "Instructor",
        description: "Structured output extraction from LLMs",
        documentationUrl: "https://python.useinstructor.com",
        confidence: "high",
        patterns: {
          imports: [/^import\s+instructor/m, /^from\s+instructor\s+import/m],
          dependencies: [/^instructor[=<>~!\s]/m],
        },
      },
      {
        name: "dspy",
        provider: "Stanford NLP",
        description: "Programming framework for LLMs",
        documentationUrl: "https://dspy-docs.vercel.app",
        confidence: "high",
        patterns: {
          imports: [/^import\s+dspy/m, /^from\s+dspy\s+import/m],
          dependencies: [/^dspy-ai[=<>~!\s]/m],
        },
      },
      {
        name: "guidance",
        provider: "Microsoft",
        description: "Guidance language for LLM control",
        documentationUrl: "https://github.com/guidance-ai/guidance",
        confidence: "high",
        patterns: {
          imports: [/^import\s+guidance/m, /^from\s+guidance\s+import/m],
          dependencies: [/^guidance[=<>~!\s]/m],
        },
      },
      {
        name: "marvin",
        provider: "Prefect",
        description: "AI engineering toolkit",
        documentationUrl: "https://www.askmarvin.ai",
        confidence: "high",
        patterns: {
          imports: [/^import\s+marvin/m, /^from\s+marvin\s+import/m],
          dependencies: [/^marvin[=<>~!\s]/m],
        },
      },
      {
        name: "pydantic-ai",
        provider: "Pydantic",
        description: "Type-safe AI agent framework",
        documentationUrl: "https://ai.pydantic.dev",
        confidence: "high",
        patterns: {
          imports: [/^import\s+pydantic_ai/m, /^from\s+pydantic_ai\s+import/m],
          dependencies: [/^pydantic-ai[=<>~!\s]/m],
        },
      },
      {
        name: "outlines",
        provider: "Outlines",
        description: "Structured text generation",
        documentationUrl: "https://outlines-dev.github.io/outlines",
        confidence: "high",
        patterns: {
          imports: [/^import\s+outlines/m, /^from\s+outlines\s+import/m],
          dependencies: [/^outlines[=<>~!\s]/m],
        },
      },
      {
        name: "phidata",
        provider: "Phidata",
        description: "AI assistant framework with memory",
        documentationUrl: "https://docs.phidata.com",
        confidence: "high",
        patterns: {
          imports: [/^import\s+phi/m, /^from\s+phi\s+import/m, /^from\s+phi\./m],
          dependencies: [/^phidata[=<>~!\s]/m],
        },
      },
      {
        name: "smolagents",
        provider: "HuggingFace",
        description: "Lightweight agent library from HuggingFace",
        documentationUrl: "https://huggingface.co/docs/smolagents",
        confidence: "high",
        patterns: {
          imports: [/^import\s+smolagents/m, /^from\s+smolagents\s+import/m],
          dependencies: [/^smolagents[=<>~!\s]/m],
        },
      },

      // ========================
      // Additional Vector Databases
      // ========================
      {
        name: "milvus",
        provider: "Zilliz",
        description: "Open-source vector database",
        documentationUrl: "https://milvus.io/docs",
        confidence: "high",
        patterns: {
          imports: [/^import\s+pymilvus/m, /^from\s+pymilvus\s+import/m],
          dependencies: [/^pymilvus[=<>~!\s]/m],
        },
      },
      {
        name: "pgvector",
        provider: "pgvector",
        description: "Vector similarity search for PostgreSQL",
        documentationUrl: "https://github.com/pgvector/pgvector",
        confidence: "high",
        patterns: {
          imports: [/^from\s+pgvector\s+import/m, /^from\s+pgvector\./m],
          dependencies: [/^pgvector[=<>~!\s]/m],
        },
      },
      {
        name: "lancedb",
        provider: "LanceDB",
        description: "Serverless vector database",
        documentationUrl: "https://lancedb.github.io/lancedb",
        confidence: "high",
        patterns: {
          imports: [/^import\s+lancedb/m, /^from\s+lancedb\s+import/m],
          dependencies: [/^lancedb[=<>~!\s]/m],
        },
      },

      // ========================
      // Model Optimization & Deployment
      // ========================
      {
        name: "vllm",
        provider: "vLLM",
        description: "High-throughput LLM serving engine",
        documentationUrl: "https://docs.vllm.ai",
        confidence: "high",
        patterns: {
          imports: [/^import\s+vllm/m, /^from\s+vllm\s+import/m],
          dependencies: [/^vllm[=<>~!\s]/m],
        },
      },
      {
        name: "llama-cpp-python",
        provider: "llama.cpp",
        description: "Python bindings for llama.cpp",
        documentationUrl: "https://llama-cpp-python.readthedocs.io",
        confidence: "high",
        patterns: {
          imports: [/^import\s+llama_cpp/m, /^from\s+llama_cpp\s+import/m],
          dependencies: [/^llama-cpp-python[=<>~!\s]/m],
        },
      },
      {
        name: "ollama",
        provider: "Ollama",
        description: "Local LLM runtime",
        documentationUrl: "https://ollama.ai",
        confidence: "high",
        patterns: {
          imports: [/^import\s+ollama/m, /^from\s+ollama\s+import/m],
          dependencies: [/^ollama[=<>~!\s]/m],
        },
      },
      {
        name: "tensorrt",
        provider: "NVIDIA",
        description: "NVIDIA TensorRT for optimized inference",
        documentationUrl: "https://developer.nvidia.com/tensorrt",
        confidence: "high",
        patterns: {
          imports: [/^import\s+tensorrt/m, /^from\s+tensorrt\s+import/m],
          dependencies: [/^tensorrt[=<>~!\s]/m, /^nvidia-tensorrt[=<>~!\s]/m],
        },
      },
      {
        name: "text-generation-inference",
        provider: "HuggingFace",
        description: "HuggingFace Text Generation Inference",
        documentationUrl: "https://huggingface.co/docs/text-generation-inference",
        confidence: "high",
        patterns: {
          imports: [/^from\s+text_generation\s+import/m],
          dependencies: [/^text-generation[=<>~!\s]/m],
          apiCalls: [
            // REST API URL
            /api-inference\.huggingface\.co/,
            // SDK method calls
            /InferenceClient\s*\(/,
            /inference_client\.text_generation\s*\(/,
            /client\.text_generation\s*\(/,
            /\.chat_completion\s*\(/,
          ],
        },
      },
      {
        name: "triton",
        provider: "NVIDIA",
        description: "NVIDIA Triton Inference Server client",
        documentationUrl: "https://docs.nvidia.com/deeplearning/triton-inference-server",
        confidence: "high",
        patterns: {
          imports: [/^import\s+tritonclient/m, /^from\s+tritonclient\s+import/m],
          dependencies: [/^tritonclient[=<>~!\s]/m, /^nvidia-pytriton[=<>~!\s]/m],
        },
      },
      {
        name: "ctransformers",
        provider: "CTransformers",
        description: "Python bindings for GGML models",
        documentationUrl: "https://github.com/marella/ctransformers",
        confidence: "high",
        patterns: {
          imports: [/^import\s+ctransformers/m, /^from\s+ctransformers\s+import/m],
          dependencies: [/^ctransformers[=<>~!\s]/m],
        },
      },

      // ========================
      // Local LLM & Quantization
      // ========================
      {
        name: "mlx",
        provider: "Apple",
        description: "Apple Silicon ML framework",
        documentationUrl: "https://ml-explore.github.io/mlx",
        confidence: "high",
        patterns: {
          imports: [/^import\s+mlx/m, /^from\s+mlx\s+import/m],
          dependencies: [/^mlx[=<>~!\s]/m],
        },
      },
      {
        name: "mlx-lm",
        provider: "Apple",
        description: "LLM inference on Apple Silicon",
        documentationUrl: "https://github.com/ml-explore/mlx-examples",
        confidence: "high",
        patterns: {
          imports: [/^import\s+mlx_lm/m, /^from\s+mlx_lm\s+import/m],
          dependencies: [/^mlx-lm[=<>~!\s]/m],
        },
      },
      {
        name: "exllamav2",
        provider: "ExLlama",
        description: "Fast GPTQ/EXL2 inference",
        documentationUrl: "https://github.com/turboderp/exllamav2",
        confidence: "high",
        patterns: {
          imports: [/^import\s+exllamav2/m, /^from\s+exllamav2\s+import/m],
          dependencies: [/^exllamav2[=<>~!\s]/m],
        },
      },
      {
        name: "auto-gptq",
        provider: "AutoGPTQ",
        description: "GPTQ quantization library",
        documentationUrl: "https://github.com/AutoGPTQ/AutoGPTQ",
        confidence: "high",
        patterns: {
          imports: [/^import\s+auto_gptq/m, /^from\s+auto_gptq\s+import/m],
          dependencies: [/^auto-gptq[=<>~!\s]/m],
        },
      },
      {
        name: "autoawq",
        provider: "AutoAWQ",
        description: "AWQ quantization library",
        documentationUrl: "https://github.com/casper-hansen/AutoAWQ",
        confidence: "high",
        patterns: {
          imports: [/^import\s+awq/m, /^from\s+awq\s+import/m],
          dependencies: [/^autoawq[=<>~!\s]/m],
        },
      },
      {
        name: "bitsandbytes",
        provider: "bitsandbytes",
        description: "8-bit and 4-bit quantization",
        documentationUrl: "https://github.com/TimDettmers/bitsandbytes",
        confidence: "high",
        patterns: {
          imports: [/^import\s+bitsandbytes/m, /^from\s+bitsandbytes\s+import/m],
          dependencies: [/^bitsandbytes[=<>~!\s]/m],
        },
      },
      {
        name: "unsloth",
        provider: "Unsloth",
        description: "Fast LLM fine-tuning (2x speed)",
        documentationUrl: "https://github.com/unslothai/unsloth",
        confidence: "high",
        patterns: {
          imports: [/^import\s+unsloth/m, /^from\s+unsloth\s+import/m],
          dependencies: [/^unsloth[=<>~!\s]/m],
        },
      },
      {
        name: "gpt4all",
        provider: "Nomic AI",
        description: "Local LLM runtime",
        documentationUrl: "https://docs.gpt4all.io",
        confidence: "high",
        patterns: {
          imports: [/^import\s+gpt4all/m, /^from\s+gpt4all\s+import/m],
          dependencies: [/^gpt4all[=<>~!\s]/m],
        },
      },
      {
        name: "lmdeploy",
        provider: "InternLM",
        description: "LLM deployment toolkit",
        documentationUrl: "https://lmdeploy.readthedocs.io",
        confidence: "high",
        patterns: {
          imports: [/^import\s+lmdeploy/m, /^from\s+lmdeploy\s+import/m],
          dependencies: [/^lmdeploy[=<>~!\s]/m],
        },
      },
      {
        name: "aphrodite-engine",
        provider: "Aphrodite",
        description: "High-throughput LLM inference",
        documentationUrl: "https://github.com/PygmalionAI/aphrodite-engine",
        confidence: "high",
        patterns: {
          imports: [/^import\s+aphrodite/m, /^from\s+aphrodite\s+import/m],
          dependencies: [/^aphrodite-engine[=<>~!\s]/m],
        },
      },
      {
        name: "lorax",
        provider: "Predibase",
        description: "Multi-LoRA serving",
        documentationUrl: "https://github.com/predibase/lorax",
        confidence: "high",
        patterns: {
          imports: [/^import\s+lorax/m, /^from\s+lorax\s+import/m],
          dependencies: [/^lorax-client[=<>~!\s]/m],
        },
      },
      {
        name: "xinference",
        provider: "Xorbits",
        description: "Distributed model inference",
        documentationUrl: "https://inference.readthedocs.io",
        confidence: "high",
        patterns: {
          imports: [/^import\s+xinference/m, /^from\s+xinference\s+import/m],
          dependencies: [/^xinference[=<>~!\s]/m],
        },
      },

      // ========================
      // Fine-tuning & Training
      // ========================
      {
        name: "peft",
        provider: "HuggingFace",
        description: "Parameter-efficient fine-tuning (LoRA, QLoRA)",
        documentationUrl: "https://huggingface.co/docs/peft",
        confidence: "high",
        patterns: {
          imports: [/^import\s+peft/m, /^from\s+peft\s+import/m],
          dependencies: [/^peft[=<>~!\s]/m],
        },
      },
      {
        name: "trl",
        provider: "HuggingFace",
        description: "Transformer Reinforcement Learning (RLHF)",
        documentationUrl: "https://huggingface.co/docs/trl",
        confidence: "high",
        patterns: {
          imports: [/^import\s+trl/m, /^from\s+trl\s+import/m],
          dependencies: [/^trl[=<>~!\s]/m],
        },
      },
      {
        name: "accelerate",
        provider: "HuggingFace",
        description: "Distributed training utility",
        documentationUrl: "https://huggingface.co/docs/accelerate",
        confidence: "high",
        patterns: {
          imports: [/^import\s+accelerate/m, /^from\s+accelerate\s+import/m],
          dependencies: [/^accelerate[=<>~!\s]/m],
        },
      },
      {
        name: "deepspeed",
        provider: "Microsoft",
        description: "Large model training optimization",
        documentationUrl: "https://www.deepspeed.ai",
        confidence: "high",
        patterns: {
          imports: [/^import\s+deepspeed/m, /^from\s+deepspeed\s+import/m],
          dependencies: [/^deepspeed[=<>~!\s]/m],
        },
      },
      {
        name: "lightning",
        provider: "Lightning AI",
        description: "PyTorch training framework",
        documentationUrl: "https://lightning.ai/docs/pytorch",
        confidence: "high",
        patterns: {
          imports: [
            /^import\s+lightning/m,
            /^from\s+lightning\s+import/m,
            /^import\s+pytorch_lightning/m,
            /^from\s+pytorch_lightning\s+import/m,
          ],
          dependencies: [/^lightning[=<>~!\s]/m, /^pytorch-lightning[=<>~!\s]/m],
        },
      },
      {
        name: "colossalai",
        provider: "ColossalAI",
        description: "Distributed training system",
        documentationUrl: "https://colossalai.org",
        confidence: "high",
        patterns: {
          imports: [/^import\s+colossalai/m, /^from\s+colossalai\s+import/m],
          dependencies: [/^colossalai[=<>~!\s]/m],
        },
      },
      {
        name: "axolotl",
        provider: "Axolotl",
        description: "LLM fine-tuning framework",
        documentationUrl: "https://github.com/OpenAccess-AI-Collective/axolotl",
        confidence: "high",
        patterns: {
          imports: [/^import\s+axolotl/m, /^from\s+axolotl\s+import/m],
          dependencies: [/^axolotl[=<>~!\s]/m],
        },
      },
      {
        name: "fairscale",
        provider: "Meta",
        description: "PyTorch distributed training",
        documentationUrl: "https://fairscale.readthedocs.io",
        confidence: "high",
        patterns: {
          imports: [/^import\s+fairscale/m, /^from\s+fairscale\s+import/m],
          dependencies: [/^fairscale[=<>~!\s]/m],
        },
      },
      {
        name: "flash-attn",
        provider: "Flash Attention",
        description: "Fast and memory-efficient attention",
        documentationUrl: "https://github.com/Dao-AILab/flash-attention",
        confidence: "high",
        patterns: {
          imports: [/^import\s+flash_attn/m, /^from\s+flash_attn\s+import/m],
          dependencies: [/^flash-attn[=<>~!\s]/m],
        },
      },
      {
        name: "xformers",
        provider: "Meta",
        description: "Memory-efficient transformers",
        documentationUrl: "https://facebookresearch.github.io/xformers",
        confidence: "high",
        patterns: {
          imports: [/^import\s+xformers/m, /^from\s+xformers\s+import/m],
          dependencies: [/^xformers[=<>~!\s]/m],
        },
      },
      {
        name: "apex",
        provider: "NVIDIA",
        description: "PyTorch extension for mixed precision",
        documentationUrl: "https://github.com/NVIDIA/apex",
        confidence: "high",
        patterns: {
          imports: [/^import\s+apex/m, /^from\s+apex\s+import/m],
          dependencies: [/^apex[=<>~!\s]/m, /^nvidia-apex[=<>~!\s]/m],
        },
      },
      {
        name: "liger-kernel",
        provider: "LinkedIn",
        description: "Efficient training kernels",
        documentationUrl: "https://github.com/linkedin/Liger-Kernel",
        confidence: "high",
        patterns: {
          imports: [/^import\s+liger_kernel/m, /^from\s+liger_kernel\s+import/m],
          dependencies: [/^liger-kernel[=<>~!\s]/m],
        },
      },

      // ========================
      // RAG & Document Processing
      // ========================
      {
        name: "langgraph",
        provider: "LangChain",
        description: "Agent state graphs and workflows",
        documentationUrl: "https://langchain-ai.github.io/langgraph",
        confidence: "high",
        patterns: {
          imports: [/^import\s+langgraph/m, /^from\s+langgraph\s+import/m],
          dependencies: [/^langgraph[=<>~!\s]/m],
        },
      },
      {
        name: "unstructured",
        provider: "Unstructured",
        description: "Document parsing and extraction",
        documentationUrl: "https://docs.unstructured.io",
        confidence: "high",
        patterns: {
          imports: [/^import\s+unstructured/m, /^from\s+unstructured\s+import/m],
          dependencies: [/^unstructured[=<>~!\s]/m],
        },
      },
      {
        name: "docling",
        provider: "IBM",
        description: "Document understanding toolkit",
        documentationUrl: "https://ds4sd.github.io/docling",
        confidence: "high",
        patterns: {
          imports: [/^import\s+docling/m, /^from\s+docling\s+import/m],
          dependencies: [/^docling[=<>~!\s]/m],
        },
      },
      {
        name: "embedchain",
        provider: "Embedchain",
        description: "RAG framework for LLM apps",
        documentationUrl: "https://docs.embedchain.ai",
        confidence: "high",
        patterns: {
          imports: [/^import\s+embedchain/m, /^from\s+embedchain\s+import/m],
          dependencies: [/^embedchain[=<>~!\s]/m],
        },
      },
      {
        name: "docarray",
        provider: "Jina",
        description: "Multi-modal data structures",
        documentationUrl: "https://docs.docarray.org",
        confidence: "high",
        patterns: {
          imports: [/^import\s+docarray/m, /^from\s+docarray\s+import/m],
          dependencies: [/^docarray[=<>~!\s]/m],
        },
      },
      {
        name: "llama-parse",
        provider: "LlamaIndex",
        description: "Document parsing for RAG",
        documentationUrl: "https://docs.llamaindex.ai/en/stable/llama_cloud/llama_parse",
        confidence: "high",
        patterns: {
          imports: [/^import\s+llama_parse/m, /^from\s+llama_parse\s+import/m],
          dependencies: [/^llama-parse[=<>~!\s]/m],
        },
      },
      {
        name: "marker",
        provider: "Marker",
        description: "PDF to markdown conversion",
        documentationUrl: "https://github.com/VikParuchuri/marker",
        confidence: "high",
        patterns: {
          imports: [/^import\s+marker/m, /^from\s+marker\s+import/m],
          dependencies: [/^marker-pdf[=<>~!\s]/m],
        },
      },
      {
        name: "surya",
        provider: "Surya",
        description: "Document OCR toolkit",
        documentationUrl: "https://github.com/VikParuchuri/surya",
        confidence: "high",
        patterns: {
          imports: [/^import\s+surya/m, /^from\s+surya\s+import/m],
          dependencies: [/^surya-ocr[=<>~!\s]/m],
        },
      },
      {
        name: "ragatouille",
        provider: "RAGatouille",
        description: "ColBERT-based RAG",
        documentationUrl: "https://github.com/bclavie/RAGatouille",
        confidence: "high",
        patterns: {
          imports: [/^import\s+ragatouille/m, /^from\s+ragatouille\s+import/m],
          dependencies: [/^ragatouille[=<>~!\s]/m],
        },
      },
      {
        name: "flashrank",
        provider: "FlashRank",
        description: "Fast reranking for RAG",
        documentationUrl: "https://github.com/PrithivirajDamodaran/FlashRank",
        confidence: "high",
        patterns: {
          imports: [/^import\s+flashrank/m, /^from\s+flashrank\s+import/m],
          dependencies: [/^flashrank[=<>~!\s]/m],
        },
      },
      {
        name: "txtai",
        provider: "txtai",
        description: "Semantic search and RAG",
        documentationUrl: "https://neuml.github.io/txtai",
        confidence: "high",
        patterns: {
          imports: [/^import\s+txtai/m, /^from\s+txtai\s+import/m],
          dependencies: [/^txtai[=<>~!\s]/m],
        },
      },

      // ========================
      // Computer Vision (expanded)
      // ========================
      {
        name: "torchvision",
        provider: "Meta",
        description: "PyTorch computer vision library",
        documentationUrl: "https://pytorch.org/vision/stable/index.html",
        confidence: "high",
        patterns: {
          imports: [/^import\s+torchvision/m, /^from\s+torchvision\s+import/m],
          dependencies: [/^torchvision[=<>~!\s]/m],
        },
      },
      {
        name: "albumentations",
        provider: "Albumentations",
        description: "Image augmentation library",
        documentationUrl: "https://albumentations.ai/docs",
        confidence: "high",
        patterns: {
          imports: [/^import\s+albumentations/m, /^from\s+albumentations\s+import/m],
          dependencies: [/^albumentations[=<>~!\s]/m],
        },
      },
      {
        name: "mmdetection",
        provider: "OpenMMLab",
        description: "OpenMMLab object detection toolbox",
        documentationUrl: "https://mmdetection.readthedocs.io",
        confidence: "high",
        patterns: {
          imports: [/^import\s+mmdet/m, /^from\s+mmdet\s+import/m],
          dependencies: [/^mmdet[=<>~!\s]/m],
        },
      },
      {
        name: "timm",
        provider: "HuggingFace",
        description: "PyTorch Image Models",
        documentationUrl: "https://huggingface.co/docs/timm",
        confidence: "high",
        patterns: {
          imports: [/^import\s+timm/m, /^from\s+timm\s+import/m],
          dependencies: [/^timm[=<>~!\s]/m],
        },
      },
      {
        name: "supervision",
        provider: "Roboflow",
        description: "Computer vision utilities and visualization",
        documentationUrl: "https://supervision.roboflow.com",
        confidence: "high",
        patterns: {
          imports: [/^import\s+supervision/m, /^from\s+supervision\s+import/m],
          dependencies: [/^supervision[=<>~!\s]/m],
        },
      },

      // ========================
      // Audio & Speech (expanded)
      // ========================
      {
        name: "speechbrain",
        provider: "SpeechBrain",
        description: "PyTorch speech toolkit",
        documentationUrl: "https://speechbrain.github.io",
        confidence: "high",
        patterns: {
          imports: [/^import\s+speechbrain/m, /^from\s+speechbrain\s+import/m],
          dependencies: [/^speechbrain[=<>~!\s]/m],
        },
      },
      {
        name: "coqui-tts",
        provider: "Coqui",
        description: "Text-to-speech library",
        documentationUrl: "https://tts.readthedocs.io",
        confidence: "high",
        patterns: {
          imports: [/^import\s+TTS/m, /^from\s+TTS\s+import/m],
          dependencies: [/^TTS[=<>~!\s]/m, /^coqui-tts[=<>~!\s]/m],
        },
      },
      {
        name: "librosa",
        provider: "librosa",
        description: "Audio analysis library",
        documentationUrl: "https://librosa.org/doc",
        confidence: "high",
        patterns: {
          imports: [/^import\s+librosa/m, /^from\s+librosa\s+import/m],
          dependencies: [/^librosa[=<>~!\s]/m],
        },
      },
      {
        name: "pyannote",
        provider: "pyannote",
        description: "Speaker diarization toolkit",
        documentationUrl: "https://github.com/pyannote/pyannote-audio",
        confidence: "high",
        patterns: {
          imports: [/^import\s+pyannote/m, /^from\s+pyannote\s+import/m, /^from\s+pyannote\./m],
          dependencies: [/^pyannote[=<>~!\s]/m],
        },
      },
      {
        name: "audiocraft",
        provider: "Meta",
        description: "Audio generation models (MusicGen, AudioGen)",
        documentationUrl: "https://github.com/facebookresearch/audiocraft",
        confidence: "high",
        patterns: {
          imports: [/^import\s+audiocraft/m, /^from\s+audiocraft\s+import/m],
          dependencies: [/^audiocraft[=<>~!\s]/m],
        },
      },

      // ========================
      // Reinforcement Learning
      // ========================
      {
        name: "stable-baselines3",
        provider: "Stable Baselines",
        description: "Reliable RL implementations",
        documentationUrl: "https://stable-baselines3.readthedocs.io",
        confidence: "high",
        patterns: {
          imports: [/^import\s+stable_baselines3/m, /^from\s+stable_baselines3\s+import/m],
          dependencies: [/^stable-baselines3[=<>~!\s]/m],
        },
      },
      {
        name: "gymnasium",
        provider: "Farama Foundation",
        description: "RL environment toolkit (successor to OpenAI Gym)",
        documentationUrl: "https://gymnasium.farama.org",
        confidence: "high",
        patterns: {
          imports: [
            /^import\s+gymnasium/m,
            /^from\s+gymnasium\s+import/m,
            /^import\s+gym\b/m,
            /^from\s+gym\s+import/m,
          ],
          dependencies: [/^gymnasium[=<>~!\s]/m, /^gym[=<>~!\s]/m],
        },
      },
      {
        name: "rllib",
        provider: "Anyscale",
        description: "Ray's reinforcement learning library",
        documentationUrl: "https://docs.ray.io/en/latest/rllib",
        confidence: "high",
        patterns: {
          imports: [/^from\s+ray\.rllib\s+import/m, /^from\s+ray\s+import\s+rllib/m],
          dependencies: [/^ray\[rllib\]/m],
        },
      },

      // ========================
      // AutoML & Hyperparameter Optimization
      // ========================
      {
        name: "optuna",
        provider: "Optuna",
        description: "Hyperparameter optimization framework",
        documentationUrl: "https://optuna.readthedocs.io",
        confidence: "high",
        patterns: {
          imports: [/^import\s+optuna/m, /^from\s+optuna\s+import/m],
          dependencies: [/^optuna[=<>~!\s]/m],
        },
      },
      {
        name: "hyperopt",
        provider: "Hyperopt",
        description: "Distributed hyperparameter optimization",
        documentationUrl: "http://hyperopt.github.io/hyperopt",
        confidence: "high",
        patterns: {
          imports: [/^import\s+hyperopt/m, /^from\s+hyperopt\s+import/m],
          dependencies: [/^hyperopt[=<>~!\s]/m],
        },
      },
      {
        name: "auto-sklearn",
        provider: "AutoML",
        description: "Automated machine learning toolkit",
        documentationUrl: "https://automl.github.io/auto-sklearn",
        confidence: "high",
        patterns: {
          imports: [/^import\s+autosklearn/m, /^from\s+autosklearn\s+import/m],
          dependencies: [/^auto-sklearn[=<>~!\s]/m],
        },
      },
      {
        name: "autokeras",
        provider: "AutoKeras",
        description: "AutoML library for deep learning",
        documentationUrl: "https://autokeras.com",
        confidence: "high",
        patterns: {
          imports: [/^import\s+autokeras/m, /^from\s+autokeras\s+import/m],
          dependencies: [/^autokeras[=<>~!\s]/m],
        },
      },
      {
        name: "tpot",
        provider: "TPOT",
        description: "Genetic AutoML tool",
        documentationUrl: "http://epistasislab.github.io/tpot",
        confidence: "high",
        patterns: {
          imports: [/^import\s+tpot/m, /^from\s+tpot\s+import/m],
          dependencies: [/^tpot[=<>~!\s]/m],
        },
      },

      // ========================
      // Explainability & Interpretability
      // ========================
      {
        name: "shap",
        provider: "SHAP",
        description: "SHapley Additive exPlanations",
        documentationUrl: "https://shap.readthedocs.io",
        confidence: "high",
        patterns: {
          imports: [/^import\s+shap/m, /^from\s+shap\s+import/m],
          dependencies: [/^shap[=<>~!\s]/m],
        },
      },
      {
        name: "lime",
        provider: "LIME",
        description: "Local Interpretable Model-agnostic Explanations",
        documentationUrl: "https://lime-ml.readthedocs.io",
        confidence: "high",
        patterns: {
          imports: [/^import\s+lime/m, /^from\s+lime\s+import/m],
          dependencies: [/^lime[=<>~!\s]/m],
        },
      },
      {
        name: "captum",
        provider: "Meta",
        description: "Model interpretability for PyTorch",
        documentationUrl: "https://captum.ai",
        confidence: "high",
        patterns: {
          imports: [/^import\s+captum/m, /^from\s+captum\s+import/m],
          dependencies: [/^captum[=<>~!\s]/m],
        },
      },
      {
        name: "interpret",
        provider: "Microsoft",
        description: "InterpretML for model interpretability",
        documentationUrl: "https://interpret.ml",
        confidence: "high",
        patterns: {
          imports: [/^import\s+interpret/m, /^from\s+interpret\s+import/m],
          dependencies: [/^interpret[=<>~!\s]/m],
        },
      },
      {
        name: "alibi",
        provider: "Seldon",
        description: "Machine learning model inspection and interpretation",
        documentationUrl: "https://docs.seldon.io/projects/alibi",
        confidence: "high",
        patterns: {
          imports: [/^import\s+alibi/m, /^from\s+alibi\s+import/m],
          dependencies: [/^alibi[=<>~!\s]/m],
        },
      },

      // ========================
      // Time Series
      // ========================
      {
        name: "prophet",
        provider: "Meta",
        description: "Forecasting at scale",
        documentationUrl: "https://facebook.github.io/prophet",
        confidence: "high",
        patterns: {
          imports: [/^import\s+prophet/m, /^from\s+prophet\s+import/m],
          dependencies: [/^prophet[=<>~!\s]/m],
        },
      },
      {
        name: "darts",
        provider: "Unit8",
        description: "Time series forecasting library",
        documentationUrl: "https://unit8co.github.io/darts",
        confidence: "high",
        patterns: {
          imports: [/^import\s+darts/m, /^from\s+darts\s+import/m],
          dependencies: [/^darts[=<>~!\s]/m],
        },
      },
      {
        name: "neuralprophet",
        provider: "NeuralProphet",
        description: "Neural network based forecasting",
        documentationUrl: "https://neuralprophet.com",
        confidence: "high",
        patterns: {
          imports: [/^import\s+neuralprophet/m, /^from\s+neuralprophet\s+import/m],
          dependencies: [/^neuralprophet[=<>~!\s]/m],
        },
      },
      {
        name: "sktime",
        provider: "sktime",
        description: "Unified time series ML framework",
        documentationUrl: "https://www.sktime.net",
        confidence: "high",
        patterns: {
          imports: [/^import\s+sktime/m, /^from\s+sktime\s+import/m],
          dependencies: [/^sktime[=<>~!\s]/m],
        },
      },

      // ========================
      // Graph Neural Networks
      // ========================
      {
        name: "pytorch-geometric",
        provider: "PyG",
        description: "Graph neural network library for PyTorch",
        documentationUrl: "https://pytorch-geometric.readthedocs.io",
        confidence: "high",
        patterns: {
          imports: [/^import\s+torch_geometric/m, /^from\s+torch_geometric\s+import/m],
          dependencies: [/^torch-geometric[=<>~!\s]/m],
        },
      },
      {
        name: "dgl",
        provider: "DGL",
        description: "Deep Graph Library",
        documentationUrl: "https://www.dgl.ai",
        confidence: "high",
        patterns: {
          imports: [/^import\s+dgl/m, /^from\s+dgl\s+import/m],
          dependencies: [/^dgl[=<>~!\s]/m],
        },
      },
      // ========================
      // Feature Engineering
      // ========================
      {
        name: "featuretools",
        provider: "Alteryx",
        description: "Automated feature engineering",
        documentationUrl: "https://featuretools.alteryx.com",
        confidence: "high",
        patterns: {
          imports: [/^import\s+featuretools/m, /^from\s+featuretools\s+import/m],
          dependencies: [/^featuretools[=<>~!\s]/m],
        },
      },
      {
        name: "category-encoders",
        provider: "Category Encoders",
        description: "Categorical variable encoding",
        documentationUrl: "https://contrib.scikit-learn.org/category_encoders",
        confidence: "high",
        patterns: {
          imports: [/^import\s+category_encoders/m, /^from\s+category_encoders\s+import/m],
          dependencies: [/^category-encoders[=<>~!\s]/m],
        },
      },

      // ========================
      // Diffusion Models & Image Generation
      // ========================
      {
        name: "diffusers",
        provider: "HuggingFace",
        description: "Diffusion models library",
        documentationUrl: "https://huggingface.co/docs/diffusers",
        confidence: "high",
        patterns: {
          imports: [/^import\s+diffusers/m, /^from\s+diffusers\s+import/m],
          dependencies: [/^diffusers[=<>~!\s]/m],
        },
      },
      {
        name: "compel",
        provider: "Compel",
        description: "Prompt weighting for diffusion models",
        documentationUrl: "https://github.com/damian0815/compel",
        confidence: "high",
        patterns: {
          imports: [/^import\s+compel/m, /^from\s+compel\s+import/m],
          dependencies: [/^compel[=<>~!\s]/m],
        },
      },

      // ========================
      // Embedding Models
      // ========================
      {
        name: "sentence-transformers",
        provider: "HuggingFace",
        description: "Sentence embeddings library",
        documentationUrl: "https://www.sbert.net",
        confidence: "high",
        patterns: {
          imports: [/^import\s+sentence_transformers/m, /^from\s+sentence_transformers\s+import/m],
          dependencies: [/^sentence-transformers[=<>~!\s]/m],
        },
      },
      {
        name: "fastembed",
        provider: "Qdrant",
        description: "Fast lightweight embedding generation",
        documentationUrl: "https://qdrant.github.io/fastembed",
        confidence: "high",
        patterns: {
          imports: [/^import\s+fastembed/m, /^from\s+fastembed\s+import/m],
          dependencies: [/^fastembed[=<>~!\s]/m],
        },
      },

      // ========================
      // LLM Evaluation
      // ========================
      {
        name: "ragas",
        provider: "Ragas",
        description: "RAG evaluation framework",
        documentationUrl: "https://docs.ragas.io",
        confidence: "high",
        patterns: {
          imports: [/^import\s+ragas/m, /^from\s+ragas\s+import/m],
          dependencies: [/^ragas[=<>~!\s]/m],
        },
      },
      {
        name: "deepeval",
        provider: "DeepEval",
        description: "LLM evaluation framework",
        documentationUrl: "https://docs.deepeval.ai",
        confidence: "high",
        patterns: {
          imports: [/^import\s+deepeval/m, /^from\s+deepeval\s+import/m],
          dependencies: [/^deepeval[=<>~!\s]/m],
        },
      },
      {
        name: "trulens",
        provider: "TruEra",
        description: "LLM app evaluation and tracking",
        documentationUrl: "https://www.trulens.org",
        confidence: "high",
        patterns: {
          imports: [/^import\s+trulens/m, /^from\s+trulens\s+import/m],
          dependencies: [/^trulens[=<>~!\s]/m],
        },
      },

      // ========================
      // Prompt Engineering
      // ========================
      {
        name: "promptflow",
        provider: "Microsoft",
        description: "LLM app development toolkit",
        documentationUrl: "https://microsoft.github.io/promptflow",
        confidence: "high",
        patterns: {
          imports: [/^import\s+promptflow/m, /^from\s+promptflow\s+import/m],
          dependencies: [/^promptflow[=<>~!\s]/m],
        },
      },

      // ========================
      // Monitoring & Observability
      // ========================
      {
        name: "langsmith",
        provider: "LangChain",
        description: "LLM application tracing and monitoring",
        documentationUrl: "https://docs.smith.langchain.com",
        confidence: "high",
        patterns: {
          imports: [/^import\s+langsmith/m, /^from\s+langsmith\s+import/m],
          dependencies: [/^langsmith[=<>~!\s]/m],
        },
      },
      {
        name: "phoenix",
        provider: "Arize",
        description: "ML observability for LLMs",
        documentationUrl: "https://docs.arize.com/phoenix",
        confidence: "high",
        patterns: {
          imports: [/^import\s+phoenix/m, /^from\s+phoenix\s+import/m, /^import\s+arize_phoenix/m],
          dependencies: [/^arize-phoenix[=<>~!\s]/m],
        },
      },
      {
        name: "evidently",
        provider: "Evidently",
        description: "ML model monitoring and testing",
        documentationUrl: "https://docs.evidentlyai.com",
        confidence: "high",
        patterns: {
          imports: [/^import\s+evidently/m, /^from\s+evidently\s+import/m],
          dependencies: [/^evidently[=<>~!\s]/m],
        },
      },

      // ========================
      // Agent Frameworks (extended)
      // ========================
      {
        name: "letta",
        provider: "Letta",
        description: "Persistent memory agents (formerly MemGPT)",
        documentationUrl: "https://docs.letta.ai",
        confidence: "high",
        patterns: {
          imports: [
            /^import\s+letta/m,
            /^from\s+letta\s+import/m,
            /^import\s+memgpt/m,
            /^from\s+memgpt\s+import/m,
          ],
          dependencies: [/^letta[=<>~!\s]/m, /^memgpt[=<>~!\s]/m],
        },
      },
      {
        name: "agentops",
        provider: "AgentOps",
        description: "Agent observability and analytics",
        documentationUrl: "https://docs.agentops.ai",
        confidence: "high",
        patterns: {
          imports: [/^import\s+agentops/m, /^from\s+agentops\s+import/m],
          dependencies: [/^agentops[=<>~!\s]/m],
        },
      },
      {
        name: "composio",
        provider: "Composio",
        description: "AI agent tool integrations",
        documentationUrl: "https://docs.composio.dev",
        confidence: "high",
        patterns: {
          imports: [/^import\s+composio/m, /^from\s+composio\s+import/m],
          dependencies: [/^composio[=<>~!\s]/m],
        },
      },
      {
        name: "e2b",
        provider: "E2B",
        description: "Code interpreter and sandbox for AI",
        documentationUrl: "https://e2b.dev/docs",
        confidence: "high",
        patterns: {
          imports: [/^import\s+e2b/m, /^from\s+e2b\s+import/m],
          dependencies: [/^e2b[=<>~!\s]/m],
        },
      },
      {
        name: "browser-use",
        provider: "Browser Use",
        description: "Browser automation for AI agents",
        documentationUrl: "https://github.com/browser-use/browser-use",
        confidence: "high",
        patterns: {
          imports: [/^import\s+browser_use/m, /^from\s+browser_use\s+import/m],
          dependencies: [/^browser-use[=<>~!\s]/m],
        },
      },
      {
        name: "superagi",
        provider: "SuperAGI",
        description: "Open-source autonomous AI agent framework",
        documentationUrl: "https://superagi.com/docs",
        confidence: "high",
        patterns: {
          imports: [/^import\s+superagi/m, /^from\s+superagi\s+import/m],
          dependencies: [/^superagi[=<>~!\s]/m],
        },
      },
      {
        name: "swarm",
        provider: "OpenAI",
        description: "Multi-agent orchestration framework",
        documentationUrl: "https://github.com/openai/swarm",
        confidence: "high",
        patterns: {
          imports: [/^import\s+swarm/m, /^from\s+swarm\s+import/m],
          dependencies: [/^openai-swarm[=<>~!\s]/m],
        },
      },
      {
        name: "agency-swarm",
        provider: "Agency Swarm",
        description: "AI agent swarm framework",
        documentationUrl: "https://github.com/VRSEN/agency-swarm",
        confidence: "high",
        patterns: {
          imports: [/^import\s+agency_swarm/m, /^from\s+agency_swarm\s+import/m],
          dependencies: [/^agency-swarm[=<>~!\s]/m],
        },
      },
      {
        name: "camel",
        provider: "CAMEL-AI",
        description: "Multi-agent role-playing framework",
        documentationUrl: "https://www.camel-ai.org",
        confidence: "high",
        patterns: {
          imports: [/^import\s+camel/m, /^from\s+camel\s+import/m],
          dependencies: [/^camel-ai[=<>~!\s]/m],
        },
      },

      // ========================
      // Vision & Multimodal (extended)
      // ========================
      {
        name: "segment-anything",
        provider: "Meta",
        description: "Segment Anything Model (SAM)",
        documentationUrl: "https://segment-anything.com",
        confidence: "high",
        patterns: {
          imports: [/^import\s+segment_anything/m, /^from\s+segment_anything\s+import/m],
          dependencies: [/^segment-anything[=<>~!\s]/m],
        },
      },
      {
        name: "clip",
        provider: "OpenAI",
        description: "Contrastive Language-Image Pre-training",
        documentationUrl: "https://github.com/openai/CLIP",
        confidence: "high",
        patterns: {
          imports: [/^import\s+clip/m, /^from\s+clip\s+import/m],
          dependencies: [/^openai-clip[=<>~!\s]/m],
        },
      },
      {
        name: "open-clip",
        provider: "LAION",
        description: "Open-source CLIP implementations",
        documentationUrl: "https://github.com/mlfoundations/open_clip",
        confidence: "high",
        patterns: {
          imports: [/^import\s+open_clip/m, /^from\s+open_clip\s+import/m],
          dependencies: [/^open-clip-torch[=<>~!\s]/m],
        },
      },
      {
        name: "groundingdino",
        provider: "IDEA-Research",
        description: "Open-set object detection with text",
        documentationUrl: "https://github.com/IDEA-Research/GroundingDINO",
        confidence: "high",
        patterns: {
          imports: [/^import\s+groundingdino/m, /^from\s+groundingdino\s+import/m],
          dependencies: [/^groundingdino[=<>~!\s]/m],
        },
      },
      {
        name: "roboflow",
        provider: "Roboflow",
        description: "Computer vision data and model platform",
        documentationUrl: "https://docs.roboflow.com",
        confidence: "high",
        patterns: {
          imports: [/^import\s+roboflow/m, /^from\s+roboflow\s+import/m],
          dependencies: [/^roboflow[=<>~!\s]/m],
        },
      },
      {
        name: "llava",
        provider: "LLaVA",
        description: "Large Language and Vision Assistant",
        documentationUrl: "https://llava-vl.github.io",
        confidence: "high",
        patterns: {
          imports: [/^import\s+llava/m, /^from\s+llava\s+import/m],
          dependencies: [/^llava[=<>~!\s]/m],
        },
      },
      {
        name: "qwen-vl",
        provider: "Alibaba",
        description: "Qwen Vision-Language models",
        documentationUrl: "https://github.com/QwenLM/Qwen-VL",
        confidence: "high",
        patterns: {
          imports: [/^from\s+transformers\s+import\s+.*Qwen.*VL/m],
          dependencies: [/^qwen-vl[=<>~!\s]/m],
        },
      },
      {
        name: "detr",
        provider: "Meta",
        description: "Detection Transformer",
        documentationUrl: "https://github.com/facebookresearch/detr",
        confidence: "high",
        patterns: {
          imports: [/^from\s+transformers\s+import\s+.*Detr/m],
          dependencies: [/^detr[=<>~!\s]/m],
        },
      },
      {
        name: "sam2",
        provider: "Meta",
        description: "Segment Anything Model 2 (video)",
        documentationUrl: "https://github.com/facebookresearch/sam2",
        confidence: "high",
        patterns: {
          imports: [/^import\s+sam2/m, /^from\s+sam2\s+import/m],
          dependencies: [/^sam2[=<>~!\s]/m],
        },
      },

      // ========================
      // Speech & Audio (extended)
      // ========================
      {
        name: "faster-whisper",
        provider: "SYSTRAN",
        description: "Fast Whisper transcription with CTranslate2",
        documentationUrl: "https://github.com/SYSTRAN/faster-whisper",
        confidence: "high",
        patterns: {
          imports: [/^import\s+faster_whisper/m, /^from\s+faster_whisper\s+import/m],
          dependencies: [/^faster-whisper[=<>~!\s]/m],
        },
      },
      {
        name: "whisperx",
        provider: "WhisperX",
        description: "Whisper with word-level timestamps",
        documentationUrl: "https://github.com/m-bain/whisperX",
        confidence: "high",
        patterns: {
          imports: [/^import\s+whisperx/m, /^from\s+whisperx\s+import/m],
          dependencies: [/^whisperx[=<>~!\s]/m],
        },
      },
      {
        name: "bark",
        provider: "Suno",
        description: "Text-to-audio generation model",
        documentationUrl: "https://github.com/suno-ai/bark",
        confidence: "high",
        patterns: {
          imports: [/^import\s+bark/m, /^from\s+bark\s+import/m],
          dependencies: [/^suno-bark[=<>~!\s]/m],
        },
      },
      {
        name: "parler-tts",
        provider: "Parler",
        description: "High-quality text-to-speech",
        documentationUrl: "https://github.com/huggingface/parler-tts",
        confidence: "high",
        patterns: {
          imports: [/^import\s+parler_tts/m, /^from\s+parler_tts\s+import/m],
          dependencies: [/^parler-tts[=<>~!\s]/m],
        },
      },
      {
        name: "nemo-toolkit",
        provider: "NVIDIA",
        description: "Neural Modules toolkit for ASR/NLP/TTS",
        documentationUrl: "https://docs.nvidia.com/nemo-framework",
        confidence: "high",
        patterns: {
          imports: [/^import\s+nemo/m, /^from\s+nemo\s+import/m, /^import\s+nemo_toolkit/m],
          dependencies: [/^nemo-toolkit[=<>~!\s]/m],
        },
      },
      {
        name: "vosk",
        provider: "Alpha Cephei",
        description: "Offline speech recognition toolkit",
        documentationUrl: "https://alphacephei.com/vosk",
        confidence: "high",
        patterns: {
          imports: [/^import\s+vosk/m, /^from\s+vosk\s+import/m],
          dependencies: [/^vosk[=<>~!\s]/m],
        },
      },
      {
        name: "pyttsx3",
        provider: "pyttsx3",
        description: "Text-to-speech conversion library",
        documentationUrl: "https://pyttsx3.readthedocs.io",
        confidence: "medium",
        patterns: {
          imports: [/^import\s+pyttsx3/m, /^from\s+pyttsx3\s+import/m],
          dependencies: [/^pyttsx3[=<>~!\s]/m],
        },
      },
      {
        name: "fish-speech",
        provider: "Fish Speech",
        description: "Zero-shot voice cloning TTS",
        documentationUrl: "https://github.com/fishaudio/fish-speech",
        confidence: "high",
        patterns: {
          imports: [/^import\s+fish_speech/m, /^from\s+fish_speech\s+import/m],
          dependencies: [/^fish-speech[=<>~!\s]/m],
        },
      },

      // ========================
      // Image & Video Generation
      // ========================
      {
        name: "controlnet",
        provider: "lllyasviel",
        description: "Conditional control for diffusion models",
        documentationUrl: "https://github.com/lllyasviel/ControlNet",
        confidence: "high",
        patterns: {
          imports: [
            /^import\s+controlnet/m,
            /^from\s+controlnet\s+import/m,
            /^from\s+diffusers\s+import\s+.*ControlNet/m,
          ],
          dependencies: [/^controlnet[=<>~!\s]/m],
        },
      },
      {
        name: "ip-adapter",
        provider: "Tencent",
        description: "Image prompt adapter for diffusion",
        documentationUrl: "https://github.com/tencent-ailab/IP-Adapter",
        confidence: "high",
        patterns: {
          imports: [/^import\s+ip_adapter/m, /^from\s+ip_adapter\s+import/m],
          dependencies: [/^ip-adapter[=<>~!\s]/m],
        },
      },
      {
        name: "instantid",
        provider: "InstantX",
        description: "Identity-preserving image generation",
        documentationUrl: "https://github.com/InstantID/InstantID",
        confidence: "high",
        patterns: {
          imports: [/^import\s+instantid/m, /^from\s+instantid\s+import/m],
          dependencies: [/^instantid[=<>~!\s]/m],
        },
      },
      {
        name: "animatediff",
        provider: "AnimateDiff",
        description: "Animation generation with diffusion",
        documentationUrl: "https://github.com/guoyww/AnimateDiff",
        confidence: "high",
        patterns: {
          imports: [/^import\s+animatediff/m, /^from\s+animatediff\s+import/m],
          dependencies: [/^animatediff[=<>~!\s]/m],
        },
      },
      {
        name: "comfyui",
        provider: "ComfyUI",
        description: "Node-based Stable Diffusion GUI",
        documentationUrl: "https://github.com/comfyanonymous/ComfyUI",
        confidence: "high",
        patterns: {
          imports: [/^import\s+comfy/m, /^from\s+comfy\s+import/m],
          dependencies: [/^comfyui[=<>~!\s]/m],
        },
      },
      {
        name: "sdxl-turbo",
        provider: "Stability AI",
        description: "Fast SDXL inference",
        documentationUrl: "https://stability.ai/news/stability-ai-sdxl-turbo",
        confidence: "high",
        patterns: {
          imports: [/stabilityai\/sdxl-turbo/m],
          dependencies: [],
        },
      },
      {
        name: "flux",
        provider: "Black Forest Labs",
        description: "Text-to-image generation model",
        documentationUrl: "https://blackforestlabs.ai",
        confidence: "high",
        patterns: {
          imports: [/black-forest-labs\/FLUX/m, /^import\s+flux/m],
          dependencies: [/^flux[=<>~!\s]/m],
        },
      },

      // ========================
      // Safety & Guardrails
      // ========================
      {
        name: "nemoguardrails",
        provider: "NVIDIA",
        description: "LLM safety guardrails",
        documentationUrl: "https://github.com/NVIDIA/NeMo-Guardrails",
        confidence: "high",
        patterns: {
          imports: [/^import\s+nemoguardrails/m, /^from\s+nemoguardrails\s+import/m],
          dependencies: [/^nemoguardrails[=<>~!\s]/m],
        },
      },
      {
        name: "guardrails-ai",
        provider: "Guardrails AI",
        description: "Output validation for LLMs",
        documentationUrl: "https://docs.guardrailsai.com",
        confidence: "high",
        patterns: {
          imports: [/^import\s+guardrails/m, /^from\s+guardrails\s+import/m],
          dependencies: [/^guardrails-ai[=<>~!\s]/m],
        },
      },
      {
        name: "llm-guard",
        provider: "Protect AI",
        description: "Security toolkit for LLMs",
        documentationUrl: "https://llm-guard.com",
        confidence: "high",
        patterns: {
          imports: [/^import\s+llm_guard/m, /^from\s+llm_guard\s+import/m],
          dependencies: [/^llm-guard[=<>~!\s]/m],
        },
      },
      {
        name: "rebuff",
        provider: "Rebuff",
        description: "Prompt injection detection",
        documentationUrl: "https://github.com/protectai/rebuff",
        confidence: "high",
        patterns: {
          imports: [/^import\s+rebuff/m, /^from\s+rebuff\s+import/m],
          dependencies: [/^rebuff[=<>~!\s]/m],
        },
      },
      {
        name: "lakera",
        provider: "Lakera",
        description: "AI security platform",
        documentationUrl: "https://platform.lakera.ai/docs",
        confidence: "high",
        patterns: {
          imports: [/^import\s+lakera/m, /^from\s+lakera\s+import/m],
          dependencies: [/^lakera[=<>~!\s]/m],
        },
      },
      {
        name: "detoxify",
        provider: "Unitary",
        description: "Toxic content detection",
        documentationUrl: "https://github.com/unitaryai/detoxify",
        confidence: "high",
        patterns: {
          imports: [/^import\s+detoxify/m, /^from\s+detoxify\s+import/m],
          dependencies: [/^detoxify[=<>~!\s]/m],
        },
      },
      {
        name: "perspective",
        provider: "Google Jigsaw",
        description: "Toxic comment detection API",
        documentationUrl: "https://perspectiveapi.com",
        confidence: "high",
        patterns: {
          imports: [/from\s+['"]@google-cloud\/perspective['"]/],
          dependencies: [/^perspective-api[=<>~!\s]/m],
        },
      },

      // ========================
      // Observability & MLOps (extended)
      // ========================
      {
        name: "helicone",
        provider: "Helicone",
        description: "LLM observability platform",
        documentationUrl: "https://docs.helicone.ai",
        confidence: "high",
        patterns: {
          imports: [/^import\s+helicone/m, /^from\s+helicone\s+import/m],
          dependencies: [/^helicone[=<>~!\s]/m],
        },
      },
      {
        name: "portkey",
        provider: "Portkey AI",
        description: "LLM gateway and observability",
        documentationUrl: "https://docs.portkey.ai",
        confidence: "high",
        patterns: {
          imports: [/^import\s+portkey/m, /^from\s+portkey\s+import/m],
          dependencies: [/^portkey-ai[=<>~!\s]/m],
        },
      },
      {
        name: "promptlayer",
        provider: "PromptLayer",
        description: "Prompt management and observability",
        documentationUrl: "https://docs.promptlayer.com",
        confidence: "high",
        patterns: {
          imports: [/^import\s+promptlayer/m, /^from\s+promptlayer\s+import/m],
          dependencies: [/^promptlayer[=<>~!\s]/m],
        },
      },
      {
        name: "lunary",
        provider: "Lunary",
        description: "LLM production monitoring",
        documentationUrl: "https://lunary.ai/docs",
        confidence: "high",
        patterns: {
          imports: [/^import\s+lunary/m, /^from\s+lunary\s+import/m],
          dependencies: [/^lunary[=<>~!\s]/m],
        },
      },
      {
        name: "bentoml",
        provider: "BentoML",
        description: "ML model serving framework",
        documentationUrl: "https://docs.bentoml.com",
        confidence: "high",
        patterns: {
          imports: [/^import\s+bentoml/m, /^from\s+bentoml\s+import/m],
          dependencies: [/^bentoml[=<>~!\s]/m],
        },
      },
      {
        name: "clearml",
        provider: "ClearML",
        description: "ML experiment management",
        documentationUrl: "https://clear.ml/docs",
        confidence: "high",
        patterns: {
          imports: [/^import\s+clearml/m, /^from\s+clearml\s+import/m],
          dependencies: [/^clearml[=<>~!\s]/m],
        },
      },
      {
        name: "comet-ml",
        provider: "Comet",
        description: "ML experiment tracking",
        documentationUrl: "https://www.comet.com/docs",
        confidence: "high",
        patterns: {
          imports: [/^import\s+comet_ml/m, /^from\s+comet_ml\s+import/m],
          dependencies: [/^comet-ml[=<>~!\s]/m],
        },
      },
      {
        name: "neptune",
        provider: "Neptune.ai",
        description: "ML metadata store",
        documentationUrl: "https://docs.neptune.ai",
        confidence: "high",
        patterns: {
          imports: [/^import\s+neptune/m, /^from\s+neptune\s+import/m],
          dependencies: [/^neptune[=<>~!\s]/m],
        },
      },
      {
        name: "dvclive",
        provider: "DVC",
        description: "Experiment tracking for ML",
        documentationUrl: "https://dvc.org/doc/dvclive",
        confidence: "high",
        patterns: {
          imports: [/^import\s+dvclive/m, /^from\s+dvclive\s+import/m, /^import\s+dvc/m],
          dependencies: [/^dvclive[=<>~!\s]/m, /^dvc[=<>~!\s]/m],
        },
      },
      {
        name: "aim",
        provider: "Aim",
        description: "ML experiment tracking",
        documentationUrl: "https://aimstack.io",
        confidence: "high",
        patterns: {
          imports: [/^import\s+aim/m, /^from\s+aim\s+import/m],
          dependencies: [/^aim[=<>~!\s]/m],
        },
      },

      // ========================
      // Specialized ML (AutoML, Anomaly Detection, etc.)
      // ========================
      {
        name: "catboost",
        provider: "Yandex",
        description: "Gradient boosting on decision trees",
        documentationUrl: "https://catboost.ai/docs",
        confidence: "high",
        patterns: {
          imports: [/^import\s+catboost/m, /^from\s+catboost\s+import/m],
          dependencies: [/^catboost[=<>~!\s]/m],
        },
      },
      {
        name: "autogluon",
        provider: "AWS",
        description: "AutoML for text, image, and tabular",
        documentationUrl: "https://auto.gluon.ai",
        confidence: "high",
        patterns: {
          imports: [/^import\s+autogluon/m, /^from\s+autogluon\s+import/m],
          dependencies: [/^autogluon[=<>~!\s]/m],
        },
      },
      {
        name: "pycaret",
        provider: "PyCaret",
        description: "Low-code machine learning",
        documentationUrl: "https://pycaret.gitbook.io",
        confidence: "high",
        patterns: {
          imports: [/^import\s+pycaret/m, /^from\s+pycaret\s+import/m],
          dependencies: [/^pycaret[=<>~!\s]/m],
        },
      },
      {
        name: "h2o",
        provider: "H2O.ai",
        description: "Distributed ML platform",
        documentationUrl: "https://docs.h2o.ai",
        confidence: "high",
        patterns: {
          imports: [/^import\s+h2o/m, /^from\s+h2o\s+import/m],
          dependencies: [/^h2o[=<>~!\s]/m],
        },
      },
      {
        name: "flaml",
        provider: "Microsoft",
        description: "Fast and lightweight AutoML",
        documentationUrl: "https://microsoft.github.io/FLAML",
        confidence: "high",
        patterns: {
          imports: [/^import\s+flaml/m, /^from\s+flaml\s+import/m],
          dependencies: [/^flaml[=<>~!\s]/m],
        },
      },
      {
        name: "monai",
        provider: "NVIDIA",
        description: "Medical imaging AI",
        documentationUrl: "https://monai.io",
        confidence: "high",
        patterns: {
          imports: [/^import\s+monai/m, /^from\s+monai\s+import/m],
          dependencies: [/^monai[=<>~!\s]/m],
        },
      },
      {
        name: "deepchem",
        provider: "DeepChem",
        description: "Deep learning for chemistry",
        documentationUrl: "https://deepchem.io",
        confidence: "high",
        patterns: {
          imports: [/^import\s+deepchem/m, /^from\s+deepchem\s+import/m],
          dependencies: [/^deepchem[=<>~!\s]/m],
        },
      },
      {
        name: "pyod",
        provider: "PyOD",
        description: "Outlier and anomaly detection",
        documentationUrl: "https://pyod.readthedocs.io",
        confidence: "high",
        patterns: {
          imports: [/^import\s+pyod/m, /^from\s+pyod\s+import/m],
          dependencies: [/^pyod[=<>~!\s]/m],
        },
      },
      {
        name: "dowhy",
        provider: "Microsoft",
        description: "Causal inference library",
        documentationUrl: "https://www.pywhy.org/dowhy",
        confidence: "high",
        patterns: {
          imports: [/^import\s+dowhy/m, /^from\s+dowhy\s+import/m],
          dependencies: [/^dowhy[=<>~!\s]/m],
        },
      },
      {
        name: "fairlearn",
        provider: "Microsoft",
        description: "ML fairness assessment",
        documentationUrl: "https://fairlearn.org",
        confidence: "high",
        patterns: {
          imports: [/^import\s+fairlearn/m, /^from\s+fairlearn\s+import/m],
          dependencies: [/^fairlearn[=<>~!\s]/m],
        },
      },
      {
        name: "cleanlab",
        provider: "Cleanlab",
        description: "Data-centric AI and label errors",
        documentationUrl: "https://docs.cleanlab.ai",
        confidence: "high",
        patterns: {
          imports: [/^import\s+cleanlab/m, /^from\s+cleanlab\s+import/m],
          dependencies: [/^cleanlab[=<>~!\s]/m],
        },
      },
      {
        name: "argilla",
        provider: "Argilla",
        description: "Data labeling for NLP/LLMs",
        documentationUrl: "https://docs.argilla.io",
        confidence: "high",
        patterns: {
          imports: [/^import\s+argilla/m, /^from\s+argilla\s+import/m],
          dependencies: [/^argilla[=<>~!\s]/m],
        },
      },
      {
        name: "label-studio",
        provider: "Label Studio",
        description: "Data labeling platform",
        documentationUrl: "https://labelstud.io/guide",
        confidence: "high",
        patterns: {
          imports: [/^import\s+label_studio/m, /^from\s+label_studio\s+import/m],
          dependencies: [/^label-studio[=<>~!\s]/m],
        },
      },
      {
        name: "snorkel",
        provider: "Snorkel AI",
        description: "Programmatic data labeling",
        documentationUrl: "https://www.snorkel.org",
        confidence: "high",
        patterns: {
          imports: [/^import\s+snorkel/m, /^from\s+snorkel\s+import/m],
          dependencies: [/^snorkel[=<>~!\s]/m],
        },
      },
      {
        name: "great-ai",
        provider: "Great AI",
        description: "Production-ready AI toolkit",
        documentationUrl: "https://github.com/scaleapi/great_ai",
        confidence: "high",
        patterns: {
          imports: [/^import\s+great_ai/m, /^from\s+great_ai\s+import/m],
          dependencies: [/^great-ai[=<>~!\s]/m],
        },
      },
      {
        name: "alibi-detect",
        provider: "Seldon",
        description: "Drift and outlier detection",
        documentationUrl: "https://docs.seldon.io/projects/alibi-detect",
        confidence: "high",
        patterns: {
          imports: [/^import\s+alibi_detect/m, /^from\s+alibi_detect\s+import/m],
          dependencies: [/^alibi-detect[=<>~!\s]/m],
        },
      },
      {
        name: "river",
        provider: "River",
        description: "Online/streaming machine learning",
        documentationUrl: "https://riverml.xyz",
        confidence: "high",
        patterns: {
          imports: [/^import\s+river/m, /^from\s+river\s+import/m],
          dependencies: [/^river[=<>~!\s]/m],
        },
      },
      {
        name: "imbalanced-learn",
        provider: "Imbalanced-learn",
        description: "Tools for imbalanced datasets",
        documentationUrl: "https://imbalanced-learn.org",
        confidence: "high",
        patterns: {
          imports: [/^import\s+imblearn/m, /^from\s+imblearn\s+import/m],
          dependencies: [/^imbalanced-learn[=<>~!\s]/m],
        },
      },

      // ========================
      // Knowledge Graphs & Reasoning
      // ========================
      {
        name: "neo4j",
        provider: "Neo4j",
        description: "Graph database Python driver",
        documentationUrl: "https://neo4j.com/docs/python-manual",
        confidence: "medium",
        patterns: {
          imports: [/^import\s+neo4j/m, /^from\s+neo4j\s+import/m],
          dependencies: [/^neo4j[=<>~!\s]/m],
        },
      },
      {
        name: "rdflib",
        provider: "RDFLib",
        description: "RDF and knowledge graph library",
        documentationUrl: "https://rdflib.readthedocs.io",
        confidence: "medium",
        patterns: {
          imports: [/^import\s+rdflib/m, /^from\s+rdflib\s+import/m],
          dependencies: [/^rdflib[=<>~!\s]/m],
        },
      },

      // ========================
      // Distributed Computing for ML
      // ========================
      {
        name: "horovod",
        provider: "Horovod",
        description: "Distributed training framework",
        documentationUrl: "https://horovod.ai",
        confidence: "high",
        patterns: {
          imports: [/^import\s+horovod/m, /^from\s+horovod\s+import/m],
          dependencies: [/^horovod[=<>~!\s]/m],
        },
      },
      {
        name: "petals",
        provider: "BigScience",
        description: "Distributed inference for LLMs",
        documentationUrl: "https://petals.dev",
        confidence: "high",
        patterns: {
          imports: [/^import\s+petals/m, /^from\s+petals\s+import/m],
          dependencies: [/^petals[=<>~!\s]/m],
        },
      },

      // ========================
      // AI Code Generation
      // ========================
      {
        name: "codegeex",
        provider: "THUDM",
        description: "Multilingual code generation",
        documentationUrl: "https://codegeex.cn",
        confidence: "high",
        patterns: {
          imports: [/^import\s+codegeex/m, /^from\s+codegeex\s+import/m],
          dependencies: [/^codegeex[=<>~!\s]/m],
        },
      },
      {
        name: "tabby",
        provider: "Tabby",
        description: "Self-hosted AI coding assistant",
        documentationUrl: "https://tabby.tabbyml.com",
        confidence: "high",
        patterns: {
          imports: [/^import\s+tabby/m, /^from\s+tabby\s+import/m],
          dependencies: [/^tabby-client[=<>~!\s]/m],
        },
      },
      {
        name: "continue",
        provider: "Continue",
        description: "Open-source AI code assistant",
        documentationUrl: "https://continue.dev/docs",
        confidence: "high",
        patterns: {
          imports: [/^import\s+continuedev/m, /^from\s+continuedev\s+import/m],
          dependencies: [/^continuedev[=<>~!\s]/m],
        },
      },

      // ========================
      // Recommender Systems
      // ========================
      {
        name: "surprise",
        provider: "Surprise",
        description: "Recommender systems library",
        documentationUrl: "https://surprise.readthedocs.io",
        confidence: "high",
        patterns: {
          imports: [/^import\s+surprise/m, /^from\s+surprise\s+import/m],
          dependencies: [/^scikit-surprise[=<>~!\s]/m],
        },
      },
      {
        name: "lightfm",
        provider: "LightFM",
        description: "Hybrid recommendation algorithms",
        documentationUrl: "https://making.lyst.com/lightfm/docs",
        confidence: "high",
        patterns: {
          imports: [/^import\s+lightfm/m, /^from\s+lightfm\s+import/m],
          dependencies: [/^lightfm[=<>~!\s]/m],
        },
      },
      {
        name: "recbole",
        provider: "RecBole",
        description: "Unified recommendation library",
        documentationUrl: "https://recbole.io",
        confidence: "high",
        patterns: {
          imports: [/^import\s+recbole/m, /^from\s+recbole\s+import/m],
          dependencies: [/^recbole[=<>~!\s]/m],
        },
      },

      // ========================
      // Simulation & Robotics
      // ========================
      {
        name: "isaac-gym",
        provider: "NVIDIA",
        description: "GPU-accelerated robotics simulation",
        documentationUrl: "https://developer.nvidia.com/isaac-gym",
        confidence: "high",
        patterns: {
          imports: [/^import\s+isaacgym/m, /^from\s+isaacgym\s+import/m],
          dependencies: [/^isaacgym[=<>~!\s]/m],
        },
      },
      {
        name: "mujoco",
        provider: "DeepMind",
        description: "Physics simulator for robotics",
        documentationUrl: "https://mujoco.org",
        confidence: "high",
        patterns: {
          imports: [/^import\s+mujoco/m, /^from\s+mujoco\s+import/m],
          dependencies: [/^mujoco[=<>~!\s]/m],
        },
      },
      {
        name: "pybullet",
        provider: "PyBullet",
        description: "Physics simulation for robotics/ML",
        documentationUrl: "https://pybullet.org",
        confidence: "high",
        patterns: {
          imports: [/^import\s+pybullet/m, /^from\s+pybullet\s+import/m],
          dependencies: [/^pybullet[=<>~!\s]/m],
        },
      },
    ],
  },

  // ============================================================================
  // CI/CD & Infrastructure (GitHub Actions, Docker, MCP Config)
  // ============================================================================
  {
    name: "CI/CD & Infrastructure",
    findingType: "library",
    patterns: [
      // ========================
      // GitHub Actions - AI Services
      // ========================
      {
        name: "OpenAI (GitHub Actions)",
        provider: "OpenAI",
        description: "OpenAI API usage in CI/CD pipelines",
        documentationUrl: "https://platform.openai.com/docs",
        confidence: "high",
        patterns: {
          apiCalls: [/uses:\s*openai\//, /\$\{\{.*OPENAI_API_KEY.*\}\}/],
        },
      },
      {
        name: "Anthropic (GitHub Actions)",
        provider: "Anthropic",
        description: "Anthropic Claude API usage in CI/CD pipelines",
        documentationUrl: "https://docs.anthropic.com",
        confidence: "high",
        patterns: {
          apiCalls: [/\$\{\{.*ANTHROPIC_API_KEY.*\}\}/],
        },
      },
      {
        name: "Azure OpenAI (GitHub Actions)",
        provider: "Microsoft",
        description: "Azure OpenAI Service usage in CI/CD pipelines",
        documentationUrl: "https://learn.microsoft.com/azure/ai-services/openai",
        confidence: "high",
        patterns: {
          apiCalls: [/\$\{\{.*AZURE_OPENAI_API_KEY.*\}\}/, /\$\{\{.*AZURE_OPENAI_ENDPOINT.*\}\}/],
        },
      },
      {
        name: "Hugging Face (GitHub Actions)",
        provider: "Hugging Face",
        description: "Hugging Face API or models in CI/CD pipelines",
        documentationUrl: "https://huggingface.co/docs",
        confidence: "high",
        patterns: {
          apiCalls: [
            /uses:\s*huggingface\//,
            /\$\{\{.*HF_TOKEN.*\}\}/,
            /\$\{\{.*HUGGING_FACE_HUB_TOKEN.*\}\}/,
          ],
        },
      },
      {
        name: "Google AI (GitHub Actions)",
        provider: "Google",
        description: "Google AI/Vertex AI usage in CI/CD pipelines",
        documentationUrl: "https://cloud.google.com/vertex-ai/docs",
        confidence: "high",
        patterns: {
          apiCalls: [/\$\{\{.*GOOGLE_AI_API_KEY.*\}\}/, /\$\{\{.*GOOGLE_GENAI_API_KEY.*\}\}/],
        },
      },
      {
        name: "Replicate (GitHub Actions)",
        provider: "Replicate",
        description: "Replicate API usage in CI/CD pipelines",
        documentationUrl: "https://replicate.com/docs",
        confidence: "high",
        patterns: {
          apiCalls: [/\$\{\{.*REPLICATE_API_TOKEN.*\}\}/],
        },
      },
      // ========================
      // Docker - AI/ML Containers
      // ========================
      {
        name: "NVIDIA CUDA (Docker)",
        provider: "NVIDIA",
        description: "NVIDIA CUDA GPU containers for AI/ML workloads",
        documentationUrl: "https://hub.docker.com/r/nvidia/cuda",
        confidence: "high",
        patterns: {
          dependencies: [/FROM\s+nvidia\/cuda/i, /FROM\s+\S*nvcr\.io/i, /runtime:\s*nvidia/],
        },
      },
      {
        name: "PyTorch (Docker)",
        provider: "Meta",
        description: "PyTorch container images for ML training and inference",
        documentationUrl: "https://hub.docker.com/r/pytorch/pytorch",
        confidence: "high",
        patterns: {
          dependencies: [/FROM\s+pytorch\/pytorch/i, /FROM\s+\S*pytorch\S*gpu/i],
        },
      },
      {
        name: "TensorFlow (Docker)",
        provider: "Google",
        description: "TensorFlow container images for ML workloads",
        documentationUrl: "https://hub.docker.com/r/tensorflow/tensorflow",
        confidence: "high",
        patterns: {
          dependencies: [/FROM\s+tensorflow\/tensorflow/i, /FROM\s+\S*tensorflow\S*gpu/i],
        },
      },
      {
        name: "Hugging Face Transformers (Docker)",
        provider: "Hugging Face",
        description: "Hugging Face container images for model inference",
        documentationUrl: "https://huggingface.co/docs/transformers",
        confidence: "high",
        patterns: {
          dependencies: [/FROM\s+huggingface\//i, /ghcr\.io\/huggingface/],
        },
      },
      {
        name: "Ollama (Docker)",
        provider: "Ollama",
        description: "Ollama local LLM server container",
        documentationUrl: "https://ollama.com",
        confidence: "high",
        patterns: {
          dependencies: [/FROM\s+ollama\/ollama/i, /image:\s*ollama\/ollama/],
        },
      },
      {
        name: "vLLM (Docker)",
        provider: "vLLM",
        description: "vLLM high-throughput LLM serving engine container",
        documentationUrl: "https://docs.vllm.ai",
        confidence: "high",
        patterns: {
          dependencies: [/FROM\s+vllm\/vllm/i, /image:\s*vllm\/vllm/],
        },
      },
      {
        name: "Triton Inference Server (Docker)",
        provider: "NVIDIA",
        description: "NVIDIA Triton Inference Server for model serving",
        documentationUrl: "https://developer.nvidia.com/triton-inference-server",
        confidence: "high",
        patterns: {
          dependencies: [
            /FROM\s+nvcr\.io\/nvidia\/tritonserver/i,
            /image:\s*nvcr\.io\/nvidia\/tritonserver/,
          ],
        },
      },
      {
        name: "MLflow (Docker)",
        provider: "Databricks",
        description: "MLflow model tracking and serving container",
        documentationUrl: "https://mlflow.org/docs/latest",
        confidence: "high",
        patterns: {
          dependencies: [/FROM\s+\S*mlflow/i, /image:\s*\S*mlflow/],
        },
      },
    ],
  },

  // ============================================================================
  // Hugging Face Model References
  // ============================================================================
  {
    name: "Model References",
    findingType: "model_ref",
    patterns: [
      {
        name: "Hugging Face Model",
        provider: "Hugging Face",
        description: "Reference to a model hosted on Hugging Face Hub",
        documentationUrl: "https://huggingface.co/docs",
        confidence: "high",
        patterns: {
          modelRefs: [
            // AutoModel.from_pretrained("model-name")
            /AutoModel\.from_pretrained\s*\(\s*["']([^"']+)["']/,
            /AutoModelFor\w+\.from_pretrained\s*\(\s*["']([^"']+)["']/,
            /AutoTokenizer\.from_pretrained\s*\(\s*["']([^"']+)["']/,
            /AutoProcessor\.from_pretrained\s*\(\s*["']([^"']+)["']/,
            /AutoFeatureExtractor\.from_pretrained\s*\(\s*["']([^"']+)["']/,
            /AutoConfig\.from_pretrained\s*\(\s*["']([^"']+)["']/,
            // Specific model classes
            /BertModel\.from_pretrained\s*\(\s*["']([^"']+)["']/,
            /GPT2Model\.from_pretrained\s*\(\s*["']([^"']+)["']/,
            /T5Model\.from_pretrained\s*\(\s*["']([^"']+)["']/,
            /LlamaModel\.from_pretrained\s*\(\s*["']([^"']+)["']/,
            /MistralModel\.from_pretrained\s*\(\s*["']([^"']+)["']/,
            /Qwen2Model\.from_pretrained\s*\(\s*["']([^"']+)["']/,
            /GemmaModel\.from_pretrained\s*\(\s*["']([^"']+)["']/,
            /PhiModel\.from_pretrained\s*\(\s*["']([^"']+)["']/,
            // Pipeline with model
            /pipeline\s*\([^)]*model\s*=\s*["']([^"']+)["']/,
            /pipeline\s*\(\s*["'][^"']+["']\s*,\s*["']([^"']+)["']/,
            /pipeline\s*\(\s*["'][^"']+["']\s*,\s*model\s*=\s*["']([^"']+)["']/,
            // Diffusers
            /DiffusionPipeline\.from_pretrained\s*\(\s*["']([^"']+)["']/,
            /StableDiffusionPipeline\.from_pretrained\s*\(\s*["']([^"']+)["']/,
            /StableDiffusionXLPipeline\.from_pretrained\s*\(\s*["']([^"']+)["']/,
            /AutoPipelineForText2Image\.from_pretrained\s*\(\s*["']([^"']+)["']/,
            /AutoPipelineForImage2Image\.from_pretrained\s*\(\s*["']([^"']+)["']/,
            // Sentence Transformers
            /SentenceTransformer\s*\(\s*["']([^"']+)["']/,
            // PEFT/LoRA
            /PeftModel\.from_pretrained\s*\(\s*[^,]+,\s*["']([^"']+)["']/,
            // TRL
            /AutoModelForCausalLMWithValueHead\.from_pretrained\s*\(\s*["']([^"']+)["']/,
            // Generic from_pretrained with org/model format
            /from_pretrained\s*\(\s*["']([a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+)["']/,
            // Model ID in config/variables (org/model format)
            /model_id\s*[=:]\s*["']([a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+)["']/,
            /model_name\s*[=:]\s*["']([a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+)["']/,
            /base_model\s*[=:]\s*["']([a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+)["']/,
            /pretrained_model_name\s*[=:]\s*["']([a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+)["']/,
          ],
        },
      },
      {
        name: "Ollama Model",
        provider: "Ollama",
        description: "Reference to a locally-hosted Ollama model",
        documentationUrl: "https://ollama.ai",
        confidence: "high",
        patterns: {
          modelRefs: [
            // Ollama Python client
            /ollama\.chat\s*\([^)]*model\s*=\s*["']([^"']+)["']/,
            /ollama\.generate\s*\([^)]*model\s*=\s*["']([^"']+)["']/,
            /ollama\.pull\s*\(\s*["']([^"']+)["']/,
            /ollama\.show\s*\(\s*["']([^"']+)["']/,
            // LangChain Ollama
            /ChatOllama\s*\([^)]*model\s*=\s*["']([^"']+)["']/,
            /Ollama\s*\([^)]*model\s*=\s*["']([^"']+)["']/,
            /OllamaEmbeddings\s*\([^)]*model\s*=\s*["']([^"']+)["']/,
          ],
        },
      },
      {
        name: "OpenAI Model",
        provider: "OpenAI",
        description: "Reference to an OpenAI model",
        documentationUrl: "https://platform.openai.com/docs/models",
        confidence: "high",
        patterns: {
          modelRefs: [
            // Model parameter in API calls
            /model\s*[=:]\s*["'](gpt-4[^"']*|gpt-3\.5[^"']*|o1[^"']*|davinci[^"']*|curie[^"']*|babbage[^"']*|ada[^"']*)["']/,
            // LangChain ChatOpenAI
            /ChatOpenAI\s*\([^)]*model\s*=\s*["']([^"']+)["']/,
            /ChatOpenAI\s*\([^)]*model_name\s*=\s*["']([^"']+)["']/,
          ],
        },
      },
      {
        name: "Anthropic Model",
        provider: "Anthropic",
        description: "Reference to an Anthropic Claude model",
        documentationUrl: "https://docs.anthropic.com/en/docs/models",
        confidence: "high",
        patterns: {
          modelRefs: [
            // Model parameter in API calls
            /model\s*[=:]\s*["'](claude-3[^"']*|claude-2[^"']*|claude-instant[^"']*)["']/,
            // LangChain ChatAnthropic
            /ChatAnthropic\s*\([^)]*model\s*=\s*["']([^"']+)["']/,
            /ChatAnthropic\s*\([^)]*model_name\s*=\s*["']([^"']+)["']/,
          ],
        },
      },
      {
        name: "Google AI Model",
        provider: "Google",
        description: "Reference to a Google Gemini model",
        documentationUrl: "https://ai.google.dev/models",
        confidence: "high",
        patterns: {
          modelRefs: [
            // Gemini models
            /model\s*[=:]\s*["'](gemini-[^"']+)["']/,
            /GenerativeModel\s*\(\s*["'](gemini-[^"']+)["']/,
            /ChatGoogleGenerativeAI\s*\([^)]*model\s*=\s*["']([^"']+)["']/,
          ],
        },
      },
    ],
  },

  // ============================================================================
  // RAG Pipeline Components
  // ============================================================================
  {
    name: "RAG Components",
    findingType: "rag_component",
    patterns: [
      // Vector Databases
      {
        name: "Pinecone",
        provider: "Pinecone",
        description: "Pinecone vector database for similarity search",
        documentationUrl: "https://docs.pinecone.io",
        confidence: "high",
        patterns: {
          imports: [/^import\s+pinecone/m, /^from\s+pinecone\s+import/m],
          dependencies: [
            /^pinecone-client[=<>~!\s]/m,
            /^pinecone[=<>~!\s]/m,
            /"pinecone-client"\s*:/,
          ],
          ragPatterns: [
            /Pinecone\s*\(/,
            /pinecone\.init\s*\(/,
            /pinecone\.Index\s*\(/,
            /\.upsert\s*\(/,
            /\.query\s*\([^)]*vector/,
          ],
        },
      },
      {
        name: "Weaviate",
        provider: "Weaviate",
        description: "Weaviate vector search engine",
        documentationUrl: "https://weaviate.io/developers/weaviate",
        confidence: "high",
        patterns: {
          imports: [/^import\s+weaviate/m, /^from\s+weaviate\s+import/m],
          dependencies: [/^weaviate-client[=<>~!\s]/m, /"weaviate-client"\s*:/],
          ragPatterns: [
            /weaviate\.Client\s*\(/,
            /weaviate\.connect_to/,
            /\.query\.get\s*\(/,
            /\.data\.insert\s*\(/,
          ],
        },
      },
      {
        name: "Chroma",
        provider: "Chroma",
        description: "Chroma open-source embedding database",
        documentationUrl: "https://docs.trychroma.com",
        confidence: "high",
        patterns: {
          imports: [/^import\s+chromadb/m, /^from\s+chromadb\s+import/m],
          dependencies: [/^chromadb[=<>~!\s]/m, /"chromadb"\s*:/],
          ragPatterns: [
            /chromadb\.Client\s*\(/,
            /chromadb\.PersistentClient\s*\(/,
            /chromadb\.HttpClient\s*\(/,
            /\.get_or_create_collection\s*\(/,
            /\.add\s*\([^)]*embeddings/,
          ],
        },
      },
      {
        name: "Qdrant",
        provider: "Qdrant",
        description: "Qdrant vector similarity search engine",
        documentationUrl: "https://qdrant.tech/documentation",
        confidence: "high",
        patterns: {
          imports: [/^from\s+qdrant_client\s+import/m, /^import\s+qdrant_client/m],
          dependencies: [/^qdrant-client[=<>~!\s]/m, /"qdrant-client"\s*:/],
          ragPatterns: [
            /QdrantClient\s*\(/,
            /\.upsert\s*\(/,
            /\.search\s*\([^)]*query_vector/,
            /\.create_collection\s*\(/,
          ],
        },
      },
      {
        name: "Milvus",
        provider: "Milvus",
        description: "Milvus open-source vector database",
        documentationUrl: "https://milvus.io/docs",
        confidence: "high",
        patterns: {
          imports: [/^from\s+pymilvus\s+import/m, /^import\s+pymilvus/m],
          dependencies: [/^pymilvus[=<>~!\s]/m, /"pymilvus"\s*:/],
          ragPatterns: [
            /connections\.connect\s*\(/,
            /Collection\s*\([^)]*schema/,
            /\.insert\s*\(/,
            /\.search\s*\(/,
          ],
        },
      },
      {
        name: "FAISS",
        provider: "Meta",
        description: "Facebook AI Similarity Search library",
        documentationUrl: "https://faiss.ai",
        confidence: "high",
        patterns: {
          imports: [/^import\s+faiss/m, /^from\s+faiss\s+import/m],
          dependencies: [/^faiss-cpu[=<>~!\s]/m, /^faiss-gpu[=<>~!\s]/m],
          ragPatterns: [
            /faiss\.IndexFlatL2\s*\(/,
            /faiss\.IndexIVFFlat\s*\(/,
            /faiss\.IndexHNSW/,
            /\.add\s*\([^)]*np\./,
            /\.search\s*\([^)]*np\./,
          ],
        },
      },
      {
        name: "pgvector",
        provider: "pgvector",
        description: "PostgreSQL vector similarity extension",
        documentationUrl: "https://github.com/pgvector/pgvector",
        confidence: "high",
        patterns: {
          imports: [/^from\s+pgvector\s+import/m],
          dependencies: [/^pgvector[=<>~!\s]/m],
          ragPatterns: [
            /register_vector\s*\(/,
            /CREATE\s+EXTENSION.*vector/i,
            /vector\s*\(\s*\d+\s*\)/,
            /<->\s*'?\[/, // Vector distance operator
          ],
        },
      },
      // Document Loaders & Text Splitters
      {
        name: "LangChain Document Loaders",
        provider: "LangChain",
        description: "LangChain document loading utilities for RAG",
        documentationUrl: "https://python.langchain.com/docs/modules/data_connection",
        confidence: "high",
        patterns: {
          imports: [
            /^from\s+langchain\.document_loaders\s+import/m,
            /^from\s+langchain_community\.document_loaders\s+import/m,
          ],
          ragPatterns: [
            /PyPDFLoader\s*\(/,
            /DirectoryLoader\s*\(/,
            /TextLoader\s*\(/,
            /CSVLoader\s*\(/,
            /UnstructuredFileLoader\s*\(/,
            /WebBaseLoader\s*\(/,
            /RecursiveCharacterTextSplitter\s*\(/,
            /CharacterTextSplitter\s*\(/,
            /\.load_and_split\s*\(/,
          ],
        },
      },
      {
        name: "LlamaIndex Data Loaders",
        provider: "LlamaIndex",
        description: "LlamaIndex data connectors for RAG",
        documentationUrl: "https://docs.llamaindex.ai/en/stable/module_guides/loading",
        confidence: "high",
        patterns: {
          imports: [
            /^from\s+llama_index\.readers\s+import/m,
            /^from\s+llama_index\.core\.readers\s+import/m,
          ],
          ragPatterns: [
            /SimpleDirectoryReader\s*\(/,
            /PDFReader\s*\(/,
            /WikipediaReader\s*\(/,
            /SimpleWebPageReader\s*\(/,
            /\.load_data\s*\(/,
          ],
        },
      },
      // Embedding Models
      {
        name: "OpenAI Embeddings",
        provider: "OpenAI",
        description: "OpenAI embedding models for vector representations",
        documentationUrl: "https://platform.openai.com/docs/guides/embeddings",
        confidence: "high",
        patterns: {
          ragPatterns: [
            /OpenAIEmbeddings\s*\(/,
            /text-embedding-ada-002/,
            /text-embedding-3-small/,
            /text-embedding-3-large/,
            /\.embeddings\.create\s*\(/,
          ],
        },
      },
      {
        name: "Sentence Transformers Embeddings",
        provider: "Hugging Face",
        description: "Sentence Transformers for computing embeddings",
        documentationUrl: "https://www.sbert.net",
        confidence: "high",
        patterns: {
          imports: [/^from\s+sentence_transformers\s+import/m],
          dependencies: [/^sentence-transformers[=<>~!\s]/m],
          ragPatterns: [
            /SentenceTransformer\s*\(/,
            /\.encode\s*\([^)]*sentences/,
            /HuggingFaceEmbeddings\s*\(/,
          ],
        },
      },
      // RAG Frameworks
      {
        name: "LangChain RAG",
        provider: "LangChain",
        description: "LangChain Retrieval-Augmented Generation components",
        documentationUrl: "https://python.langchain.com/docs/use_cases/question_answering",
        confidence: "high",
        patterns: {
          ragPatterns: [
            /RetrievalQA\s*\(/,
            /ConversationalRetrievalChain\s*\(/,
            /create_retrieval_chain\s*\(/,
            /VectorStoreRetriever\s*\(/,
            /\.as_retriever\s*\(/,
            /create_stuff_documents_chain\s*\(/,
          ],
        },
      },
      {
        name: "LlamaIndex RAG",
        provider: "LlamaIndex",
        description: "LlamaIndex query engines and retrievers",
        documentationUrl: "https://docs.llamaindex.ai/en/stable/module_guides/querying",
        confidence: "high",
        patterns: {
          ragPatterns: [
            /VectorStoreIndex\s*\(/,
            /\.as_query_engine\s*\(/,
            /\.as_retriever\s*\(/,
            /RetrieverQueryEngine\s*\(/,
            /SummaryIndex\s*\(/,
            /TreeIndex\s*\(/,
          ],
        },
      },
    ],
  },

  // ============================================================================
  // AI Agents & Autonomous Systems
  // ============================================================================
  {
    name: "AI Agents",
    findingType: "agent",
    patterns: [
      {
        name: "LangChain Agents",
        provider: "LangChain",
        description: "LangChain agent framework for autonomous AI",
        documentationUrl: "https://python.langchain.com/docs/modules/agents",
        confidence: "high",
        patterns: {
          imports: [
            /^from\s+langchain\.agents\s+import/m,
            /^from\s+langchain_core\.agents\s+import/m,
          ],
          agentPatterns: [
            /create_react_agent\s*\(/,
            /create_openai_functions_agent\s*\(/,
            /create_openai_tools_agent\s*\(/,
            /create_structured_chat_agent\s*\(/,
            /AgentExecutor\s*\(/,
            /initialize_agent\s*\(/,
            /Tool\s*\(\s*name\s*=/,
            /StructuredTool\s*\(/,
            /@tool\s*\n/,
          ],
        },
      },
      {
        name: "LangGraph",
        provider: "LangChain",
        description: "LangGraph for building stateful agent workflows",
        documentationUrl: "https://langchain-ai.github.io/langgraph",
        confidence: "high",
        patterns: {
          imports: [
            /^from\s+langgraph\s+import/m,
            /^from\s+langgraph\.graph\s+import/m,
            /^from\s+langgraph\.prebuilt\s+import/m,
          ],
          dependencies: [/^langgraph[=<>~!\s]/m],
          agentPatterns: [
            /StateGraph\s*\(/,
            /MessageGraph\s*\(/,
            /create_react_agent\s*\(/,
            /\.add_node\s*\(/,
            /\.add_edge\s*\(/,
            /\.add_conditional_edges\s*\(/,
            /ToolNode\s*\(/,
          ],
        },
      },
      {
        name: "CrewAI",
        provider: "CrewAI",
        description: "CrewAI multi-agent orchestration framework",
        documentationUrl: "https://docs.crewai.com",
        confidence: "high",
        patterns: {
          imports: [/^from\s+crewai\s+import/m, /^import\s+crewai/m],
          dependencies: [/^crewai[=<>~!\s]/m],
          agentPatterns: [
            /Agent\s*\([^)]*role\s*=/,
            /Task\s*\([^)]*description\s*=/,
            /Crew\s*\([^)]*agents\s*=/,
            /\.kickoff\s*\(/,
            /@agent\b/,
            /@crew\b/,
            /@CrewBase\b/,
            /@flow\b/,
          ],
        },
      },
      {
        name: "AutoGen",
        provider: "Microsoft",
        description: "Microsoft AutoGen multi-agent conversation framework",
        documentationUrl: "https://microsoft.github.io/autogen",
        confidence: "high",
        patterns: {
          imports: [
            /^from\s+autogen\s+import/m,
            /^import\s+autogen/m,
            /^from\s+pyautogen\s+import/m,
          ],
          dependencies: [/^pyautogen[=<>~!\s]/m, /^autogen[=<>~!\s]/m],
          agentPatterns: [
            /AssistantAgent\s*\(/,
            /UserProxyAgent\s*\(/,
            /ConversableAgent\s*\(/,
            /GroupChat\s*\(/,
            /GroupChatManager\s*\(/,
            /\.initiate_chat\s*\(/,
          ],
        },
      },
      {
        name: "Semantic Kernel",
        provider: "Microsoft",
        description: "Microsoft Semantic Kernel AI orchestration SDK",
        documentationUrl: "https://learn.microsoft.com/semantic-kernel",
        confidence: "high",
        patterns: {
          imports: [/^from\s+semantic_kernel\s+import/m, /^import\s+semantic_kernel/m],
          dependencies: [/^semantic-kernel[=<>~!\s]/m],
          agentPatterns: [
            /Kernel\s*\(\)/,
            /kernel\.add_plugin\s*\(/,
            /kernel\.invoke\s*\(/,
            /@kernel_function/,
            /ChatCompletionAgent\s*\(/,
          ],
        },
      },
      {
        name: "OpenAI Assistants",
        provider: "OpenAI",
        description: "OpenAI Assistants API for building AI agents",
        documentationUrl: "https://platform.openai.com/docs/assistants",
        confidence: "high",
        patterns: {
          agentPatterns: [
            /client\.beta\.assistants\.create\s*\(/,
            /client\.beta\.threads\.create\s*\(/,
            /client\.beta\.threads\.runs\.create\s*\(/,
            /openai\.beta\.assistants\./,
            /assistant_id\s*[=:]/,
            /thread_id\s*[=:]/,
          ],
        },
      },
      {
        name: "Phidata",
        provider: "Phidata",
        description: "Phidata framework for building AI assistants",
        documentationUrl: "https://docs.phidata.com",
        confidence: "high",
        patterns: {
          imports: [
            /^from\s+phi\s+import/m,
            /^from\s+phi\.agent\s+import/m,
            /^from\s+phi\.assistant\s+import/m,
          ],
          dependencies: [/^phidata[=<>~!\s]/m],
          agentPatterns: [
            /Agent\s*\([^)]*model\s*=/,
            /Assistant\s*\([^)]*llm\s*=/,
            /\.run\s*\([^)]*stream\s*=/,
          ],
        },
      },
      {
        name: "Haystack Agents",
        provider: "Haystack",
        description: "Haystack agent components for building AI pipelines",
        documentationUrl: "https://docs.haystack.deepset.ai/docs/agents",
        confidence: "high",
        patterns: {
          imports: [
            /^from\s+haystack\.agents\s+import/m,
            /^from\s+haystack_experimental\.components\.agents\s+import/m,
          ],
          agentPatterns: [/Agent\s*\([^)]*tools\s*=/, /ToolInvoker\s*\(/],
        },
      },
      {
        name: "MCP Server",
        provider: "Anthropic",
        description: "Model Context Protocol server implementation",
        documentationUrl: "https://modelcontextprotocol.io",
        confidence: "high",
        patterns: {
          imports: [
            /^from\s+mcp\s+import/m,
            /^from\s+mcp\.server\s+import/m,
            /^import.*@modelcontextprotocol\/sdk/,
            /require\s*\(\s*['"]@modelcontextprotocol\/sdk['"]\s*\)/,
          ],
          dependencies: [/^mcp[=<>~!\s]/m, /"@modelcontextprotocol\/sdk"\s*:/, /"mcpServers"\s*:/],
          agentPatterns: [
            /Server\s*\(\s*\{[^}]*name\s*:/,
            /McpServer\s*\(/,
            /\.tool\s*\(\s*\{[^}]*name\s*:/,
            /\.resource\s*\(\s*\{[^}]*uri\s*:/,
            /\.prompt\s*\(\s*\{[^}]*name\s*:/,
            /server\.setRequestHandler/,
          ],
        },
      },
      {
        name: "LlamaIndex Agents",
        provider: "LlamaIndex",
        description: "LlamaIndex agent framework",
        documentationUrl: "https://docs.llamaindex.ai/en/stable/module_guides/deploying/agents",
        confidence: "high",
        patterns: {
          imports: [
            /^from\s+llama_index\.agent\s+import/m,
            /^from\s+llama_index\.core\.agent\s+import/m,
          ],
          agentPatterns: [
            /OpenAIAgent\s*\(/,
            /ReActAgent\s*\(/,
            /FunctionCallingAgent\s*\(/,
            /AgentRunner\s*\(/,
            /FunctionTool\s*\(/,
            /QueryEngineTool\s*\(/,
          ],
        },
      },
      {
        name: "Pydantic AI",
        provider: "Pydantic",
        description: "Pydantic AI agent framework with type safety",
        documentationUrl: "https://ai.pydantic.dev",
        confidence: "high",
        patterns: {
          imports: [/^from\s+pydantic_ai\s+import/m],
          dependencies: [/^pydantic-ai[=<>~!\s]/m],
          agentPatterns: [
            /Agent\s*\([^)]*model\s*=/,
            /@agent\.tool/,
            /@agent\.system_prompt/,
            /\.run\s*\(/,
            /\.run_sync\s*\(/,
          ],
        },
      },
      {
        name: "Swarm",
        provider: "OpenAI",
        description: "OpenAI Swarm multi-agent orchestration (experimental)",
        documentationUrl: "https://github.com/openai/swarm",
        confidence: "high",
        patterns: {
          imports: [/^from\s+swarm\s+import/m],
          dependencies: [/^openai-swarm[=<>~!\s]/m, /^git\+.*openai\/swarm/],
          agentPatterns: [
            /Swarm\s*\(\)/,
            /Agent\s*\([^)]*name\s*=/,
            /\.run\s*\([^)]*agent\s*=/,
            /handoff_to\s*\(/,
          ],
        },
      },
    ],
  },
];

/**
 * Get all patterns flattened into a single array
 */
export function getAllPatterns(): DetectionPattern[] {
  const patterns: DetectionPattern[] = [];
  for (const category of AI_DETECTION_PATTERNS) {
    patterns.push(...category.patterns);
  }
  return patterns;
}

/**
 * Get patterns by confidence level
 */
export function getPatternsByConfidence(confidence: "high" | "medium" | "low"): DetectionPattern[] {
  return getAllPatterns().filter((p) => p.confidence === confidence);
}

/**
 * Get pattern by name (case-insensitive)
 */
export function getPatternByName(name: string): DetectionPattern | undefined {
  return getAllPatterns().find((p) => p.name.toLowerCase() === name.toLowerCase());
}
