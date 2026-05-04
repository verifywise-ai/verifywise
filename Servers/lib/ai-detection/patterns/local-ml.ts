/**
 * @fileoverview Local ML Library Detection Patterns
 * @module lib/ai-detection/patterns/local-ml
 *
 * Libraries that run locally without sending data to cloud APIs.
 * These are lower risk as data stays on-premises.
 */

import type { DetectionPattern } from "../types";

/**
 * Local ML library patterns
 * These libraries process data locally without cloud API calls
 */
export const LOCAL_ML_PATTERNS: DetectionPattern[] = [
  // ============================================================================
  // PyTorch
  // ============================================================================
  {
    name: "pytorch",
    provider: "PyTorch",
    description: "Open source deep learning framework developed by Meta AI",
    documentationUrl: "https://pytorch.org/docs/",
    confidence: "high",
    keywords: ["torch", "pytorch"],
    patterns: {
      imports: [/import\s+torch\b/, /from\s+torch\b/, /from\s+torch\./],
      dependencies: [/torch[>=<~^]/, /"torch":\s*"/, /pytorch[>=<~^]/],
    },
  },

  // ============================================================================
  // TensorFlow
  // ============================================================================
  {
    name: "tensorflow",
    provider: "TensorFlow",
    description: "End-to-end open source ML platform by Google",
    documentationUrl: "https://www.tensorflow.org/api_docs",
    confidence: "high",
    keywords: ["tensorflow", "tf."],
    patterns: {
      imports: [/import\s+tensorflow/, /from\s+tensorflow/, /import\s+tf\b/],
      dependencies: [
        /tensorflow[>=<~^]/,
        /tensorflow-gpu[>=<~^]/,
        /"tensorflow":\s*"/,
        /"@tensorflow\/tfjs":\s*"/,
      ],
    },
  },

  // ============================================================================
  // Keras
  // ============================================================================
  {
    name: "keras",
    provider: "Keras",
    description: "High-level neural networks API",
    documentationUrl: "https://keras.io/api/",
    confidence: "high",
    keywords: ["keras"],
    patterns: {
      imports: [/import\s+keras/, /from\s+keras/, /from\s+tensorflow\.keras/],
      dependencies: [/keras[>=<~^]/, /"keras":\s*"/],
    },
  },

  // ============================================================================
  // scikit-learn
  // ============================================================================
  {
    name: "scikit-learn",
    provider: "scikit-learn",
    description: "Machine learning library for Python",
    documentationUrl: "https://scikit-learn.org/stable/",
    confidence: "high",
    keywords: ["sklearn", "scikit-learn", "scikit_learn"],
    patterns: {
      imports: [/import\s+sklearn/, /from\s+sklearn/, /import\s+scikit-learn/],
      dependencies: [/scikit-learn[>=<~^]/, /"scikit-learn":\s*"/],
    },
  },

  // ============================================================================
  // Hugging Face Transformers (Local)
  // ============================================================================
  {
    name: "transformers",
    provider: "Transformers",
    description: "State-of-the-art ML library for transformers models",
    documentationUrl: "https://huggingface.co/docs/transformers/",
    confidence: "high",
    keywords: ["transformers", "autotokenizer", "automodel"],
    patterns: {
      imports: [/from\s+transformers\s+import/, /import\s+transformers/],
      dependencies: [
        /transformers[>=<~^]/,
        /"transformers":\s*"/,
        /"@huggingface\/transformers":\s*"/,
      ],
      apiCalls: [
        // Local model loading (not inference API)
        /AutoModel\s*\.\s*from_pretrained\s*\(/,
        /AutoTokenizer\s*\.\s*from_pretrained\s*\(/,
        /pipeline\s*\(\s*["'][^"']+["']/,
      ],
    },
  },

  // ============================================================================
  // Ollama
  // ============================================================================
  {
    name: "ollama",
    provider: "Ollama",
    description: "Run large language models locally",
    documentationUrl: "https://ollama.ai/",
    confidence: "high",
    keywords: ["ollama", "localhost:11434"],
    patterns: {
      imports: [/import\s+ollama/, /from\s+ollama/, /require\s*\(\s*["']ollama["']\s*\)/],
      dependencies: [/"ollama":\s*"/, /ollama[>=<~^]/],
      apiCalls: [
        // Local Ollama API
        /localhost:11434/,
        /127\.0\.0\.1:11434/,
        /ollama\s*\.\s*chat\s*\(/,
        /ollama\s*\.\s*generate\s*\(/,
        /ollama\s*\.\s*embeddings\s*\(/,
      ],
    },
  },

  // ============================================================================
  // llama.cpp / llama-cpp-python
  // ============================================================================
  {
    name: "llama-cpp",
    provider: "llama.cpp",
    description: "Port of LLaMA model in C/C++ for local inference",
    documentationUrl: "https://github.com/ggerganov/llama.cpp",
    confidence: "high",
    keywords: ["llama_cpp", "llama-cpp", "llamacpp"],
    patterns: {
      imports: [/from\s+llama_cpp/, /import\s+llama_cpp/],
      dependencies: [/llama-cpp-python[>=<~^]/, /"llama-cpp-python":\s*"/, /"node-llama-cpp":\s*"/],
      apiCalls: [/Llama\s*\(\s*model_path/, /LlamaCpp\s*\(/],
    },
  },

  // ============================================================================
  // vLLM
  // ============================================================================
  {
    name: "vllm",
    provider: "vLLM",
    description: "High-throughput LLM serving engine",
    documentationUrl: "https://docs.vllm.ai/",
    confidence: "high",
    keywords: ["vllm"],
    patterns: {
      imports: [/from\s+vllm/, /import\s+vllm/],
      dependencies: [/vllm[>=<~^]/, /"vllm":\s*"/],
      apiCalls: [/LLM\s*\(\s*model\s*=/, /SamplingParams\s*\(/],
    },
  },

  // ============================================================================
  // ONNX Runtime
  // ============================================================================
  {
    name: "onnxruntime",
    provider: "ONNX",
    description: "Cross-platform inference engine for ONNX models",
    documentationUrl: "https://onnxruntime.ai/docs/",
    confidence: "high",
    keywords: ["onnxruntime", "onnx"],
    patterns: {
      imports: [/import\s+onnxruntime/, /from\s+onnxruntime/, /import\s+onnx/, /from\s+onnx/],
      dependencies: [
        /onnxruntime[>=<~^]/,
        /onnxruntime-gpu[>=<~^]/,
        /"onnxruntime":\s*"/,
        /"onnxruntime-node":\s*"/,
      ],
    },
  },

  // ============================================================================
  // JAX
  // ============================================================================
  {
    name: "jax",
    provider: "JAX",
    description: "High-performance numerical computing by Google",
    documentationUrl: "https://jax.readthedocs.io/",
    confidence: "high",
    keywords: ["jax"],
    patterns: {
      imports: [/import\s+jax/, /from\s+jax/],
      dependencies: [/jax[>=<~^]/, /jaxlib[>=<~^]/, /"jax":\s*"/],
    },
  },

  // ============================================================================
  // XGBoost
  // ============================================================================
  {
    name: "xgboost",
    provider: "XGBoost",
    description: "Gradient boosting framework for ML",
    documentationUrl: "https://xgboost.readthedocs.io/",
    confidence: "high",
    keywords: ["xgboost", "xgb"],
    patterns: {
      imports: [/import\s+xgboost/, /from\s+xgboost/, /import\s+xgb\b/],
      dependencies: [/xgboost[>=<~^]/, /"xgboost":\s*"/],
    },
  },

  // ============================================================================
  // LightGBM
  // ============================================================================
  {
    name: "lightgbm",
    provider: "LightGBM",
    description: "Gradient boosting framework by Microsoft",
    documentationUrl: "https://lightgbm.readthedocs.io/",
    confidence: "high",
    keywords: ["lightgbm", "lgb"],
    patterns: {
      imports: [/import\s+lightgbm/, /from\s+lightgbm/, /import\s+lgb\b/],
      dependencies: [/lightgbm[>=<~^]/, /"lightgbm":\s*"/],
    },
  },

  // ============================================================================
  // CatBoost
  // ============================================================================
  {
    name: "catboost",
    provider: "CatBoost",
    description: "Gradient boosting library by Yandex",
    documentationUrl: "https://catboost.ai/docs/",
    confidence: "high",
    keywords: ["catboost"],
    patterns: {
      imports: [/import\s+catboost/, /from\s+catboost/],
      dependencies: [/catboost[>=<~^]/, /"catboost":\s*"/],
    },
  },

  // ============================================================================
  // spaCy
  // ============================================================================
  {
    name: "spacy",
    provider: "spaCy",
    description: "Industrial-strength NLP library",
    documentationUrl: "https://spacy.io/api",
    confidence: "high",
    keywords: ["spacy"],
    patterns: {
      imports: [/import\s+spacy/, /from\s+spacy/],
      dependencies: [/spacy[>=<~^]/, /"spacy":\s*"/],
    },
  },

  // ============================================================================
  // NLTK
  // ============================================================================
  {
    name: "nltk",
    provider: "NLTK",
    description: "Natural Language Toolkit for Python",
    documentationUrl: "https://www.nltk.org/",
    confidence: "high",
    keywords: ["nltk"],
    patterns: {
      imports: [/import\s+nltk/, /from\s+nltk/],
      dependencies: [/nltk[>=<~^]/, /"nltk":\s*"/],
    },
  },

  // ============================================================================
  // NumPy (ML support)
  // ============================================================================
  {
    name: "numpy",
    provider: "NumPy",
    description: "Fundamental package for scientific computing",
    documentationUrl: "https://numpy.org/doc/",
    confidence: "medium",
    keywords: ["numpy", "np."],
    patterns: {
      imports: [/import\s+numpy/, /from\s+numpy/],
      dependencies: [/numpy[>=<~^]/, /"numpy":\s*"/],
    },
  },

  // ============================================================================
  // Pandas
  // ============================================================================
  {
    name: "pandas",
    provider: "Pandas",
    description: "Data analysis and manipulation library",
    documentationUrl: "https://pandas.pydata.org/docs/",
    confidence: "medium",
    keywords: ["pandas", "pd."],
    patterns: {
      imports: [/import\s+pandas/, /from\s+pandas/],
      dependencies: [/pandas[>=<~^]/, /"pandas":\s*"/],
    },
  },

  // ============================================================================
  // Accelerate (Hugging Face)
  // ============================================================================
  {
    name: "accelerate",
    provider: "Accelerate",
    description: "Training and inference at scale made simple",
    documentationUrl: "https://huggingface.co/docs/accelerate/",
    confidence: "high",
    keywords: ["accelerate"],
    patterns: {
      imports: [/from\s+accelerate/, /import\s+accelerate/],
      dependencies: [/accelerate[>=<~^]/, /"accelerate":\s*"/],
    },
  },

  // ============================================================================
  // PEFT (Parameter-Efficient Fine-Tuning)
  // ============================================================================
  {
    name: "peft",
    provider: "PEFT",
    description: "Parameter-efficient fine-tuning of large models",
    documentationUrl: "https://huggingface.co/docs/peft/",
    confidence: "high",
    keywords: ["peft", "lora"],
    patterns: {
      imports: [/from\s+peft/, /import\s+peft/],
      dependencies: [/peft[>=<~^]/, /"peft":\s*"/],
    },
  },

  // ============================================================================
  // MLflow
  // ============================================================================
  {
    name: "mlflow",
    provider: "MLflow",
    description: "Platform for the ML lifecycle",
    documentationUrl: "https://mlflow.org/docs/latest/",
    confidence: "high",
    keywords: ["mlflow"],
    patterns: {
      imports: [/import\s+mlflow/, /from\s+mlflow/],
      dependencies: [/mlflow[>=<~^]/, /"mlflow":\s*"/],
    },
  },

  // ============================================================================
  // Weights & Biases (Local mode)
  // ============================================================================
  {
    name: "wandb",
    provider: "Weights & Biases",
    description: "ML experiment tracking and visualization",
    documentationUrl: "https://docs.wandb.ai/",
    confidence: "high",
    keywords: ["wandb"],
    patterns: {
      imports: [/import\s+wandb/, /from\s+wandb/],
      dependencies: [/wandb[>=<~^]/, /"wandb":\s*"/],
    },
  },
];
