/**
 * @fileoverview License Detection Utilities
 *
 * Functions to extract license information from:
 * - package.json (npm packages)
 * - requirements.txt / pyproject.toml (Python packages)
 * - Hugging Face model cards (via API)
 */

import * as path from "path";
import { getLicenseInfo, LicenseRisk } from "../config/licenseRiskMatrix";

// ============================================================================
// Types
// ============================================================================

export interface ExtractedLicense {
  licenseId: string;
  licenseName: string;
  licenseRisk: LicenseRisk;
  licenseSource: "package" | "huggingface" | "pypi" | "npm";
}

export interface PackageJsonLicense {
  name: string;
  license?: string | { type?: string; url?: string };
  licenses?: Array<{ type?: string; url?: string }>;
}

// ============================================================================
// Package.json License Extraction
// ============================================================================

/**
 * Extract license from package.json content
 */
export function extractLicenseFromPackageJson(content: string): Map<string, ExtractedLicense> {
  const licenses = new Map<string, ExtractedLicense>();

  try {
    const pkg = JSON.parse(content) as PackageJsonLicense & {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    // Extract main package license
    if (pkg.license) {
      const licenseStr = typeof pkg.license === "string" ? pkg.license : pkg.license.type || "";
      if (licenseStr && pkg.name) {
        const info = getLicenseInfo(licenseStr);
        licenses.set(pkg.name, {
          licenseId: info.spdxId,
          licenseName: info.name,
          licenseRisk: info.risk,
          licenseSource: "npm",
        });
      }
    } else if (pkg.licenses && Array.isArray(pkg.licenses) && pkg.licenses.length > 0) {
      const licenseStr = pkg.licenses[0].type || "";
      if (licenseStr && pkg.name) {
        const info = getLicenseInfo(licenseStr);
        licenses.set(pkg.name, {
          licenseId: info.spdxId,
          licenseName: info.name,
          licenseRisk: info.risk,
          licenseSource: "npm",
        });
      }
    }
  } catch {
    // Invalid JSON, ignore
  }

  return licenses;
}

// ============================================================================
// Python Package License Extraction
// ============================================================================

/**
 * Extract licenses from pyproject.toml content
 */
export function extractLicenseFromPyproject(content: string): Map<string, ExtractedLicense> {
  const licenses = new Map<string, ExtractedLicense>();

  try {
    // Simple TOML parsing for license field
    // Format: license = "MIT" or license = {text = "MIT"}
    const licenseMatch = content.match(/license\s*=\s*["']([^"']+)["']/);
    const nameMatch = content.match(/name\s*=\s*["']([^"']+)["']/);

    if (licenseMatch && nameMatch) {
      const licenseStr = licenseMatch[1];
      const pkgName = nameMatch[1];
      const info = getLicenseInfo(licenseStr);
      licenses.set(pkgName, {
        licenseId: info.spdxId,
        licenseName: info.name,
        licenseRisk: info.risk,
        licenseSource: "pypi",
      });
    }

    // Also check for license in [project] section
    // Note: Using [^[]* instead of 's' flag for ES5 compatibility
    const projectLicenseMatch = content.match(/\[project\][\s\S]*?license\s*=\s*["']([^"']+)["']/);
    if (projectLicenseMatch && nameMatch) {
      const licenseStr = projectLicenseMatch[1];
      const pkgName = nameMatch[1];
      const info = getLicenseInfo(licenseStr);
      licenses.set(pkgName, {
        licenseId: info.spdxId,
        licenseName: info.name,
        licenseRisk: info.risk,
        licenseSource: "pypi",
      });
    }
  } catch {
    // Parse error, ignore
  }

  return licenses;
}

/**
 * Extract licenses from setup.py content
 */
export function extractLicenseFromSetupPy(content: string): Map<string, ExtractedLicense> {
  const licenses = new Map<string, ExtractedLicense>();

  try {
    // Match license='MIT' or license="MIT"
    const licenseMatch = content.match(/license\s*=\s*["']([^"']+)["']/);
    const nameMatch = content.match(/name\s*=\s*["']([^"']+)["']/);

    if (licenseMatch && nameMatch) {
      const licenseStr = licenseMatch[1];
      const pkgName = nameMatch[1];
      const info = getLicenseInfo(licenseStr);
      licenses.set(pkgName, {
        licenseId: info.spdxId,
        licenseName: info.name,
        licenseRisk: info.risk,
        licenseSource: "pypi",
      });
    }
  } catch {
    // Parse error, ignore
  }

  return licenses;
}

// ============================================================================
// Hugging Face License Detection
// ============================================================================

/**
 * Known Hugging Face model prefixes and their typical licenses
 * This is used as a fallback when API calls are not available
 */
const HF_MODEL_LICENSE_HINTS: Record<string, string> = {
  // Meta models
  "meta-llama/": "Llama2",
  "meta-llama/Llama-3": "Llama3",
  // Mistral models
  "mistralai/": "Apache-2.0",
  // Stability AI
  "stabilityai/": "MIT",
  // Google models
  "google/gemma": "Gemma",
  "google/t5": "Apache-2.0",
  "google/bert": "Apache-2.0",
  // OpenAI (generally not on HF, but just in case)
  "openai/": "MIT",
  // Anthropic
  "anthropic/": "MIT",
  // Common open models
  "EleutherAI/": "Apache-2.0",
  "bigscience/bloom": "OpenRAIL-M",
  "bigscience/": "Apache-2.0",
  "microsoft/": "MIT",
  "facebook/": "MIT",
  "sentence-transformers/": "Apache-2.0",
};

/**
 * Try to infer license from Hugging Face model ID
 * Uses known prefixes as hints
 */
export function inferHuggingFaceLicense(modelId: string): ExtractedLicense | null {
  const normalizedId = modelId.toLowerCase();

  for (const [prefix, license] of Object.entries(HF_MODEL_LICENSE_HINTS)) {
    if (normalizedId.startsWith(prefix.toLowerCase())) {
      const info = getLicenseInfo(license);
      return {
        licenseId: info.spdxId,
        licenseName: info.name,
        licenseRisk: info.risk,
        licenseSource: "huggingface",
      };
    }
  }

  return null;
}

/**
 * Fetch license from Hugging Face API
 * Note: This requires network access during scan
 */
export async function fetchHuggingFaceLicense(modelId: string): Promise<ExtractedLicense | null> {
  try {
    const response = await fetch(`https://huggingface.co/api/models/${modelId}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(5000), // 5 second timeout
    });

    if (!response.ok) {
      return inferHuggingFaceLicense(modelId);
    }

    const data = (await response.json()) as { cardData?: { license?: string }; license?: string };
    const license = data.cardData?.license || data.license;

    if (license) {
      const info = getLicenseInfo(license);
      return {
        licenseId: info.spdxId,
        licenseName: info.name,
        licenseRisk: info.risk,
        licenseSource: "huggingface",
      };
    }

    // Fallback to inference
    return inferHuggingFaceLicense(modelId);
  } catch {
    // Network error or timeout, use inference
    return inferHuggingFaceLicense(modelId);
  }
}

// ============================================================================
// Pattern-Based License Extraction from Code
// ============================================================================

/**
 * Try to extract license from import statements or model loading code
 */
export function extractLicenseFromCode(content: string, provider: string): ExtractedLicense | null {
  // Check for Hugging Face model loading with specific model IDs
  const hfModelPatterns = [
    /from_pretrained\s*\(\s*["']([^"']+)["']/g,
    /AutoModel\.from_pretrained\s*\(\s*["']([^"']+)["']/g,
    /pipeline\s*\([^)]*["']([a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+)["']/g,
  ];

  for (const pattern of hfModelPatterns) {
    const matches = content.matchAll(pattern);
    for (const match of matches) {
      const modelId = match[1];
      if (modelId && modelId.includes("/")) {
        const license = inferHuggingFaceLicense(modelId);
        if (license) return license;
      }
    }
  }

  // Check for specific library licenses based on provider
  const providerLicenses: Record<string, string> = {
    OpenAI: "MIT",
    Anthropic: "MIT",
    Google: "Apache-2.0",
    "Google AI": "Apache-2.0",
    Cohere: "MIT",
    Mistral: "Apache-2.0",
    "Hugging Face": "Apache-2.0", // Default for HF library itself
    LangChain: "MIT",
    LlamaIndex: "MIT",
  };

  if (provider && providerLicenses[provider]) {
    const info = getLicenseInfo(providerLicenses[provider]);
    return {
      licenseId: info.spdxId,
      licenseName: info.name,
      licenseRisk: info.risk,
      licenseSource: "package",
    };
  }

  return null;
}

// ============================================================================
// Aggregated License Detection
// ============================================================================

/**
 * Detect license from file content based on file type
 */
export function detectLicenseFromFile(
  filePath: string,
  content: string,
): Map<string, ExtractedLicense> {
  const fileName = path.basename(filePath).toLowerCase();

  if (fileName === "package.json") {
    return extractLicenseFromPackageJson(content);
  }

  if (fileName === "pyproject.toml") {
    return extractLicenseFromPyproject(content);
  }

  if (fileName === "setup.py") {
    return extractLicenseFromSetupPy(content);
  }

  return new Map();
}

/**
 * Get license info for a finding based on provider and name
 */
export async function getLicenseForFinding(
  name: string,
  provider: string,
  codeContent?: string,
): Promise<ExtractedLicense | null> {
  // Try to extract from code content first
  if (codeContent) {
    const codeLicense = extractLicenseFromCode(codeContent, provider);
    if (codeLicense) return codeLicense;
  }

  // Check if name looks like a Hugging Face model ID
  if (name.includes("/") && provider === "Hugging Face") {
    return await fetchHuggingFaceLicense(name);
  }

  // Use provider-based defaults
  const providerDefaults: Record<string, string> = {
    // Major AI providers
    OpenAI: "MIT",
    Anthropic: "MIT",
    Google: "Apache-2.0",
    "Google AI": "Apache-2.0",
    Cohere: "MIT",
    Mistral: "Apache-2.0",
    "Hugging Face": "Apache-2.0",
    HuggingFace: "Apache-2.0", // Alternative spelling
    // Deep learning frameworks
    Meta: "BSD-3-Clause", // PyTorch
    PyTorch: "BSD-3-Clause",
    TensorFlow: "Apache-2.0",
    Keras: "Apache-2.0",
    JAX: "Apache-2.0",
    "Lightning AI": "Apache-2.0",
    // Frameworks
    LangChain: "MIT",
    LlamaIndex: "MIT",
    // Cloud providers
    "AWS Bedrock": "Apache-2.0",
    AWS: "Apache-2.0",
    "Azure OpenAI": "MIT",
    Microsoft: "MIT",
    // Local/self-hosted
    Ollama: "MIT",
    "Local LLM runtime": "MIT",
    vLLM: "Apache-2.0",
    "Text Generation Inference": "Apache-2.0",
    LocalAI: "MIT",
    NVIDIA: "Apache-2.0",
    // Vector databases
    Pinecone: "Apache-2.0",
    Weaviate: "BSD-3-Clause",
    Qdrant: "Apache-2.0",
    Milvus: "Apache-2.0",
    Chroma: "Apache-2.0",
    FAISS: "MIT",
    pgvector: "PostgreSQL",
    LanceDB: "Apache-2.0",
    Zilliz: "Apache-2.0",
    // RAG frameworks
    "RAG Framework": "MIT",
    deepset: "Apache-2.0",
    Haystack: "Apache-2.0",
    // ML tools and utilities
    "scikit-learn": "BSD-3-Clause",
    "Weights & Biases": "MIT",
    wandb: "MIT",
    MLflow: "Apache-2.0",
    Optuna: "MIT",
    // NLP libraries
    NLTK: "Apache-2.0",
    spaCy: "MIT",
    Explosion: "MIT",
    Gensim: "LGPL-2.1",
    // Computer vision
    OpenCV: "Apache-2.0",
    Albumentations: "MIT",
    Ultralytics: "AGPL-3.0",
    OpenMMLab: "Apache-2.0",
    Roboflow: "Apache-2.0",
    // Audio
    librosa: "ISC",
    SpeechBrain: "Apache-2.0",
    pyannote: "MIT",
    // Data processing
    Pydantic: "MIT",
    "Pydantic AI": "MIT",
    Instructor: "MIT",
    // Other providers
    Replicate: "Apache-2.0",
    Together: "Apache-2.0",
    "Together AI": "Apache-2.0",
    Groq: "Apache-2.0",
    Perplexity: "Apache-2.0",
    "Perplexity AI": "Apache-2.0",
    Fireworks: "Apache-2.0",
    "Fireworks AI": "Apache-2.0",
    Anyscale: "Apache-2.0",
    DeepInfra: "Apache-2.0",
    Modal: "Apache-2.0",
    Cerebras: "Apache-2.0",
    SambaNova: "Apache-2.0",
    "AI21 Labs": "MIT",
    "Stability AI": "MIT",
    Writer: "Apache-2.0",
    LiteLLM: "MIT",
    DeepSeek: "MIT",
    "Lepton AI": "Apache-2.0",
    Baseten: "Apache-2.0",
    RunPod: "MIT",
    AssemblyAI: "MIT",
    ElevenLabs: "MIT",
    "Reka AI": "Apache-2.0",
    "Voyage AI": "Apache-2.0",
    "Jina AI": "Apache-2.0",
    Jina: "Apache-2.0",
    "Nomic AI": "Apache-2.0",
    OctoAI: "Apache-2.0",
    CrewAI: "MIT",
    AgentOps: "MIT",
    Composio: "MIT",
    E2B: "Apache-2.0",
    "Browser Use": "MIT",
    SuperAGI: "MIT",
    "Agency Swarm": "MIT",
    "CAMEL-AI": "Apache-2.0",
    Letta: "Apache-2.0",
  };

  if (providerDefaults[provider]) {
    const info = getLicenseInfo(providerDefaults[provider]);
    return {
      licenseId: info.spdxId,
      licenseName: info.name,
      licenseRisk: info.risk,
      licenseSource: "package",
    };
  }

  return null;
}
