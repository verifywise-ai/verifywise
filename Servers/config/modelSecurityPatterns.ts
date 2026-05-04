/**
 * @fileoverview Model Security Patterns Configuration
 *
 * Defines dangerous operators and modules for detecting malicious code
 * in serialized ML model files (PKL, PT, H5, SafeTensors).
 *
 * Based on research from:
 * - ProtectAI ModelScan (https://github.com/protectai/modelscan)
 * - Trail of Bits Fickling (https://github.com/trailofbits/fickling)
 * - Hugging Face Security Documentation
 *
 * @module config/modelSecurityPatterns
 */

// ============================================================================
// Types
// ============================================================================

export type SecuritySeverity = "critical" | "high" | "medium" | "low";

export interface DangerousOperator {
  /** Module name (e.g., 'os', 'subprocess') */
  module: string;
  /** Specific operators or '*' for all */
  operators: string[] | "*";
  /** Security severity level */
  severity: SecuritySeverity;
  /** Human-readable description of the risk */
  description: string;
}

export interface ComplianceReference {
  /** CWE ID (e.g., 'CWE-502') */
  cweId: string;
  /** CWE name */
  cweName: string;
  /** OWASP ML Top 10 ID (e.g., 'ML06') */
  owaspMlId: string;
  /** OWASP ML name */
  owaspMlName: string;
  /** Optional NIST AI RMF reference */
  nistAiRmf?: string;
}

export interface ThreatTypeMapping {
  /** Threat type identifier */
  threatType: string;
  /** Human-readable name */
  name: string;
  /** Description of the threat */
  description: string;
  /** Compliance references */
  compliance: ComplianceReference;
}

// ============================================================================
// Dangerous Operators by Severity
// ============================================================================

/**
 * CRITICAL severity operators - immediate code execution risk
 * These can execute arbitrary commands on the system
 */
export const CRITICAL_OPERATORS: DangerousOperator[] = [
  // Built-in dangerous functions (Python 3)
  {
    module: "builtins",
    operators: [
      "eval",
      "exec",
      "compile",
      "open",
      "__import__",
      "breakpoint",
      "getattr",
      "setattr",
      "delattr",
    ],
    severity: "critical",
    description: "Built-in functions that can execute arbitrary code or access system resources",
  },
  // Built-in dangerous functions (Python 2 - legacy but still found in many pickle files)
  {
    module: "__builtin__",
    operators: [
      "eval",
      "exec",
      "compile",
      "open",
      "__import__",
      "execfile",
      "file",
      "input",
      "raw_input",
    ],
    severity: "critical",
    description:
      "Python 2 built-in functions that can execute arbitrary code or access system resources",
  },
  // OS module - full system access
  {
    module: "os",
    operators: "*",
    severity: "critical",
    description:
      "Operating system interface - can execute commands, modify files, access environment",
  },
  // NT module (Windows-specific os)
  {
    module: "nt",
    operators: "*",
    severity: "critical",
    description: "Windows NT system interface",
  },
  // POSIX module (Unix-specific os)
  {
    module: "posix",
    operators: "*",
    severity: "critical",
    description: "POSIX system interface",
  },
  // Subprocess - command execution
  {
    module: "subprocess",
    operators: "*",
    severity: "critical",
    description: "Subprocess module - can spawn arbitrary processes",
  },
  // Socket - network access
  {
    module: "socket",
    operators: "*",
    severity: "critical",
    description: "Socket module - can establish network connections",
  },
  // System module
  {
    module: "sys",
    operators: "*",
    severity: "critical",
    description: "System-specific parameters and functions",
  },
  // Code execution via runpy
  {
    module: "runpy",
    operators: "*",
    severity: "critical",
    description: "Run Python modules as scripts",
  },
  // Async subprocess creation
  {
    module: "asyncio",
    operators: ["create_subprocess_shell", "create_subprocess_exec"],
    severity: "critical",
    description: "Async subprocess creation",
  },
  // Code module - interactive interpreter
  {
    module: "code",
    operators: "*",
    severity: "critical",
    description: "Interactive interpreter - can execute arbitrary code",
  },
  // Commands module (deprecated but still dangerous)
  {
    module: "commands",
    operators: "*",
    severity: "critical",
    description: "Legacy command execution module",
  },
  // Popen
  {
    module: "popen2",
    operators: "*",
    severity: "critical",
    description: "Legacy process spawning",
  },
  // PTY module - spawn bypass (CVE-2025-67748)
  {
    module: "pty",
    operators: "*",
    severity: "critical",
    description: "Pseudo-terminal utilities - can spawn shells and bypass security controls",
  },
  // Pickle modules - recursive deserialization attacks
  {
    module: "pickle",
    operators: "*",
    severity: "critical",
    description: "Recursive pickle deserialization can execute arbitrary code",
  },
  {
    module: "_pickle",
    operators: "*",
    severity: "critical",
    description: "C-accelerated pickle module - same risks as pickle",
  },
  // Python debuggers - can execute code
  {
    module: "bdb",
    operators: "*",
    severity: "critical",
    description: "Python debugger framework - can execute arbitrary code",
  },
  {
    module: "pdb",
    operators: "*",
    severity: "critical",
    description: "Python debugger - can execute arbitrary code interactively",
  },
  // Marshal module - code serialization (CVE-2025-67747)
  {
    module: "marshal",
    operators: "*",
    severity: "critical",
    description: "Internal Python object serialization - can deserialize code objects",
  },
  // Types module - FunctionType allows code injection (CVE-2025-67747)
  {
    module: "types",
    operators: ["FunctionType", "CodeType", "LambdaType", "GeneratorType", "CoroutineType"],
    severity: "critical",
    description: "Type constructors that can create executable code objects",
  },
  // Operator module - attrgetter enables code execution
  {
    module: "operator",
    operators: ["attrgetter", "itemgetter", "methodcaller"],
    severity: "critical",
    description: "Operator functions that can be used to access and call arbitrary methods",
  },
  // Apply function (Python 2)
  {
    module: "apply",
    operators: "*",
    severity: "critical",
    description: "Python 2 apply function - can call arbitrary functions",
  },
  // YAML unsafe loaders - equivalent to pickle in risk
  {
    module: "yaml",
    operators: ["load", "unsafe_load", "full_load", "Loader", "UnsafeLoader", "FullLoader"],
    severity: "critical",
    description: "YAML unsafe loaders can execute arbitrary Python code via !!python tags",
  },
  {
    module: "ruamel.yaml",
    operators: ["load", "load_all"],
    severity: "critical",
    description: "ruamel.yaml loaders can execute arbitrary code when using unsafe settings",
  },
];

/**
 * HIGH severity operators - indirect code execution or data exfiltration risk
 */
export const HIGH_OPERATORS: DangerousOperator[] = [
  // Web browser - can open URLs
  {
    module: "webbrowser",
    operators: "*",
    severity: "high",
    description: "Can open arbitrary URLs in the user's browser",
  },
  // HTTP libraries - network access
  {
    module: "httplib",
    operators: "*",
    severity: "high",
    description: "HTTP client library - can send data to external servers",
  },
  {
    module: "http.client",
    operators: "*",
    severity: "high",
    description: "HTTP client library - can send data to external servers",
  },
  {
    module: "urllib",
    operators: "*",
    severity: "high",
    description: "URL handling module - can fetch remote resources",
  },
  {
    module: "urllib.request",
    operators: "*",
    severity: "high",
    description: "URL request module - can fetch remote resources",
  },
  {
    module: "urllib2",
    operators: "*",
    severity: "high",
    description: "Legacy URL handling module",
  },
  {
    module: "requests",
    operators: "*",
    severity: "high",
    description: "HTTP library - can send data to external servers",
  },
  {
    module: "requests.api",
    operators: "*",
    severity: "high",
    description: "Requests API module",
  },
  {
    module: "aiohttp",
    operators: "*",
    severity: "high",
    description: "Async HTTP client - can send data to external servers",
  },
  {
    module: "aiohttp.client",
    operators: "*",
    severity: "high",
    description: "Async HTTP client module",
  },
  // File operations - shutil (all operations for comprehensive protection)
  {
    module: "shutil",
    operators: "*",
    severity: "high",
    description: "File operations that can copy, move, or delete files and directories",
  },
  {
    module: "pathlib",
    operators: ["unlink", "rmdir", "rename", "replace", "write_bytes", "write_text"],
    severity: "high",
    description: "Path operations that can modify files",
  },
  // TensorFlow file operations
  {
    module: "tensorflow.io",
    operators: ["read_file", "write_file"],
    severity: "high",
    description: "TensorFlow file I/O operations",
  },
  {
    module: "tensorflow.io.gfile",
    operators: "*",
    severity: "high",
    description: "TensorFlow GFile operations",
  },
  // Ctypes - can call C functions
  {
    module: "ctypes",
    operators: "*",
    severity: "high",
    description: "Foreign function library - can call arbitrary C code",
  },
  // Tempfile - used for staging file drops
  {
    module: "tempfile",
    operators: "*",
    severity: "high",
    description: "Temporary file utilities - commonly used for staging malicious payloads",
  },
  // ML Model loaders - common attack vectors
  {
    module: "torch",
    operators: ["load", "jit.load", "package.load_pickle"],
    severity: "high",
    description: "PyTorch model loading - uses pickle internally, can execute arbitrary code",
  },
  {
    module: "torch.serialization",
    operators: ["load"],
    severity: "high",
    description: "PyTorch serialization - can execute arbitrary code during deserialization",
  },
  {
    module: "onnx",
    operators: ["load", "load_model", "load_from_string"],
    severity: "high",
    description: "ONNX model loading - can contain custom operators",
  },
  {
    module: "xgboost",
    operators: ["Booster", "load_model"],
    severity: "high",
    description: "XGBoost model loading - can use pickle internally",
  },
  {
    module: "lightgbm",
    operators: ["Booster", "load_model", "model_from_string"],
    severity: "high",
    description: "LightGBM model loading - can use pickle internally",
  },
  {
    module: "sklearn.externals.joblib",
    operators: ["load"],
    severity: "high",
    description: "Legacy scikit-learn joblib - uses unsafe serialization",
  },
  // Delayed execution gadgets - sandbox evasion
  {
    module: "atexit",
    operators: ["register", "unregister"],
    severity: "high",
    description: "Deferred execution on interpreter exit - used for sandbox evasion",
  },
  {
    module: "signal",
    operators: ["signal", "alarm", "setitimer"],
    severity: "high",
    description: "Signal handlers - can defer execution or interrupt flow",
  },
  {
    module: "weakref",
    operators: ["finalize", "ref"],
    severity: "high",
    description: "Weak reference finalizers - execute when objects are garbage collected",
  },
  {
    module: "sched",
    operators: ["scheduler", "enter", "enterabs"],
    severity: "high",
    description: "Event scheduler - can defer malicious code execution",
  },
];

/**
 * MEDIUM severity operators - potentially dangerous depending on context
 */
export const MEDIUM_OPERATORS: DangerousOperator[] = [
  // Keras Lambda layers
  {
    module: "keras.layers",
    operators: ["Lambda"],
    severity: "medium",
    description: "Keras Lambda layers can contain arbitrary Python code",
  },
  {
    module: "tensorflow.keras.layers",
    operators: ["Lambda"],
    severity: "medium",
    description: "TensorFlow Keras Lambda layers can contain arbitrary code",
  },
  {
    module: "keras.layers.core",
    operators: ["Lambda"],
    severity: "medium",
    description: "Keras core Lambda layer",
  },
  // NumPy load with allow_pickle
  {
    module: "numpy",
    operators: ["load"],
    severity: "medium",
    description: "NumPy load can execute code when allow_pickle=True",
  },
  {
    module: "numpy.lib.npyio",
    operators: ["load"],
    severity: "medium",
    description: "NumPy load function",
  },
  // Joblib - often uses unsafe serialization
  {
    module: "joblib",
    operators: ["load"],
    severity: "medium",
    description: "Joblib load can execute arbitrary code",
  },
  // Dill - extended serialization
  {
    module: "dill",
    operators: ["load", "loads"],
    severity: "medium",
    description: "Dill extended serialization - can execute code",
  },
  // Cloudpickle
  {
    module: "cloudpickle",
    operators: ["load", "loads"],
    severity: "medium",
    description: "CloudPickle - can execute code during deserialization",
  },
  // Functools partial - can wrap dangerous functions
  {
    module: "functools",
    operators: ["partial"],
    severity: "medium",
    description: "Can wrap and defer execution of dangerous functions",
  },
  // Importlib - dynamic imports
  {
    module: "importlib",
    operators: ["import_module", "__import__"],
    severity: "medium",
    description: "Dynamic module import - can load arbitrary code",
  },
  // Multiprocessing
  {
    module: "multiprocessing",
    operators: ["Process"],
    severity: "medium",
    description: "Can spawn new processes",
  },
  // Threading
  {
    module: "threading",
    operators: ["Thread"],
    severity: "medium",
    description: "Can spawn new threads",
  },
  // Obfuscation primitives - used to hide embedded payloads
  {
    module: "base64",
    operators: ["b64decode", "b64encode", "decodebytes", "decodestring", "urlsafe_b64decode"],
    severity: "medium",
    description: "Base64 decoding - commonly used to obfuscate embedded malicious payloads",
  },
  {
    module: "zlib",
    operators: ["decompress", "decompressobj"],
    severity: "medium",
    description: "Zlib decompression - used to hide compressed malicious code",
  },
  {
    module: "bz2",
    operators: ["decompress", "BZ2Decompressor"],
    severity: "medium",
    description: "BZ2 decompression - used to hide compressed malicious code",
  },
  {
    module: "lzma",
    operators: ["decompress", "LZMADecompressor"],
    severity: "medium",
    description: "LZMA decompression - used to hide compressed malicious code",
  },
  {
    module: "gzip",
    operators: ["decompress", "GzipFile"],
    severity: "medium",
    description: "Gzip decompression - used to hide compressed malicious code",
  },
  {
    module: "codecs",
    operators: ["decode", "getdecoder", "open"],
    severity: "medium",
    description: "Codec operations - can be used for payload obfuscation",
  },
  // Struct/binary manipulation - can hide payloads in binary data
  {
    module: "struct",
    operators: ["unpack", "unpack_from"],
    severity: "medium",
    description: "Binary unpacking - can extract hidden code from binary data",
  },
];

/**
 * All dangerous operators combined for easy lookup
 */
export const ALL_DANGEROUS_OPERATORS: DangerousOperator[] = [
  ...CRITICAL_OPERATORS,
  ...HIGH_OPERATORS,
  ...MEDIUM_OPERATORS,
];

// ============================================================================
// Threat Type Mappings
// ============================================================================

export const THREAT_TYPES: Record<string, ThreatTypeMapping> = {
  deserialization: {
    threatType: "deserialization",
    name: "Deserialization Attack",
    description: "Malicious code hidden in serialized model file that executes during loading",
    compliance: {
      cweId: "CWE-502",
      cweName: "Deserialization of Untrusted Data",
      owaspMlId: "ML06",
      owaspMlName: "AI Supply Chain Attacks",
      nistAiRmf: "MAP 3.4",
    },
  },
  lambda_injection: {
    threatType: "lambda_injection",
    name: "Lambda Layer Injection",
    description: "Arbitrary Python code embedded in Keras Lambda layers",
    compliance: {
      cweId: "CWE-94",
      cweName: "Improper Control of Generation of Code",
      owaspMlId: "ML06",
      owaspMlName: "AI Supply Chain Attacks",
    },
  },
  code_execution: {
    threatType: "code_execution",
    name: "Arbitrary Code Execution",
    description: "Direct execution of arbitrary code through dangerous operators",
    compliance: {
      cweId: "CWE-94",
      cweName: "Improper Control of Generation of Code",
      owaspMlId: "ML06",
      owaspMlName: "AI Supply Chain Attacks",
    },
  },
  network_access: {
    threatType: "network_access",
    name: "Unauthorized Network Access",
    description: "Code that can establish network connections or exfiltrate data",
    compliance: {
      cweId: "CWE-918",
      cweName: "Server-Side Request Forgery (SSRF)",
      owaspMlId: "ML06",
      owaspMlName: "AI Supply Chain Attacks",
    },
  },
  file_manipulation: {
    threatType: "file_manipulation",
    name: "File System Manipulation",
    description: "Code that can read, write, or delete files on the system",
    compliance: {
      cweId: "CWE-73",
      cweName: "External Control of File Name or Path",
      owaspMlId: "ML06",
      owaspMlName: "AI Supply Chain Attacks",
    },
  },
  dos_attack: {
    threatType: "dos_attack",
    name: "Denial of Service",
    description: "Malformed data that can cause resource exhaustion or crashes",
    compliance: {
      cweId: "CWE-400",
      cweName: "Uncontrolled Resource Consumption",
      owaspMlId: "ML06",
      owaspMlName: "AI Supply Chain Attacks",
    },
  },
  polyglot_attack: {
    threatType: "polyglot_attack",
    name: "Polyglot File Attack",
    description: "File that is valid in multiple formats, potentially hiding malicious content",
    compliance: {
      cweId: "CWE-434",
      cweName: "Unrestricted Upload of File with Dangerous Type",
      owaspMlId: "ML06",
      owaspMlName: "AI Supply Chain Attacks",
    },
  },
  unknown_operator: {
    threatType: "unknown_operator",
    name: "Unknown Operator",
    description: "Unrecognized operator that may pose security risks",
    compliance: {
      cweId: "CWE-502",
      cweName: "Deserialization of Untrusted Data",
      owaspMlId: "ML06",
      owaspMlName: "AI Supply Chain Attacks",
    },
  },
  obfuscation: {
    threatType: "obfuscation",
    name: "Payload Obfuscation",
    description: "Use of encoding or compression to hide malicious content",
    compliance: {
      cweId: "CWE-506",
      cweName: "Embedded Malicious Code",
      owaspMlId: "ML06",
      owaspMlName: "AI Supply Chain Attacks",
    },
  },
  sandbox_evasion: {
    threatType: "sandbox_evasion",
    name: "Sandbox Evasion",
    description: "Techniques to bypass security sandboxing through deferred execution",
    compliance: {
      cweId: "CWE-693",
      cweName: "Protection Mechanism Failure",
      owaspMlId: "ML06",
      owaspMlName: "AI Supply Chain Attacks",
    },
  },
  yaml_deserialization: {
    threatType: "yaml_deserialization",
    name: "YAML Deserialization Attack",
    description: "Unsafe YAML loading that can execute arbitrary Python code",
    compliance: {
      cweId: "CWE-502",
      cweName: "Deserialization of Untrusted Data",
      owaspMlId: "ML06",
      owaspMlName: "AI Supply Chain Attacks",
    },
  },
  pickle_lifecycle: {
    threatType: "pickle_lifecycle",
    name: "Pickle Lifecycle Hook",
    description: "Magic methods like __reduce__ that execute during deserialization",
    compliance: {
      cweId: "CWE-502",
      cweName: "Deserialization of Untrusted Data",
      owaspMlId: "ML06",
      owaspMlName: "AI Supply Chain Attacks",
    },
  },
};

// ============================================================================
// Model File Extensions
// ============================================================================

/**
 * Model file extensions and their associated risk levels
 */
export const MODEL_FILE_EXTENSIONS: Record<string, { risk: SecuritySeverity; scanner: string }> = {
  // Python serialization - CRITICAL risk
  ".pkl": { risk: "critical", scanner: "serialized" },
  ".pickle": { risk: "critical", scanner: "serialized" },

  // PyTorch - CRITICAL risk (uses Python serialization internally)
  ".pt": { risk: "critical", scanner: "serialized" },
  ".pth": { risk: "critical", scanner: "serialized" },
  ".bin": { risk: "critical", scanner: "serialized" },

  // Keras/TensorFlow - HIGH risk (Lambda layers)
  ".h5": { risk: "high", scanner: "h5" },
  ".keras": { risk: "high", scanner: "h5" },
  ".hdf5": { risk: "high", scanner: "h5" },

  // SafeTensors - LOW risk (designed to be safe)
  ".safetensors": { risk: "low", scanner: "safetensors" },

  // ONNX - MEDIUM risk (custom operators possible)
  ".onnx": { risk: "medium", scanner: "onnx" },

  // GGUF/GGML - LOW risk (for LLMs)
  ".gguf": { risk: "low", scanner: "gguf" },
  ".ggml": { risk: "low", scanner: "gguf" },
};

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Check if a module/operator combination is dangerous
 * @param moduleName - The module name (e.g., 'os')
 * @param operatorName - The operator/function name (e.g., 'system')
 * @returns The matching DangerousOperator or null if not dangerous
 */
export function checkDangerousOperator(
  moduleName: string,
  operatorName: string,
): DangerousOperator | null {
  // Normalize module name (handle submodules)
  const normalizedModule = moduleName.toLowerCase();

  for (const op of ALL_DANGEROUS_OPERATORS) {
    // Check if module matches (exact or prefix)
    if (
      normalizedModule === op.module.toLowerCase() ||
      normalizedModule.startsWith(op.module.toLowerCase() + ".")
    ) {
      // Check if operator matches
      if (op.operators === "*") {
        return op;
      }
      if (Array.isArray(op.operators) && op.operators.includes(operatorName)) {
        return op;
      }
    }
  }

  return null;
}

/**
 * Get the appropriate scanner for a file extension
 * @param extension - File extension (e.g., '.pkl')
 * @returns Scanner type or null if not a model file
 */
export function getScannerForExtension(extension: string): string | null {
  const ext = extension.toLowerCase();
  return MODEL_FILE_EXTENSIONS[ext]?.scanner || null;
}

/**
 * Get the risk level for a file extension
 * @param extension - File extension (e.g., '.pkl')
 * @returns Risk level or null if not a model file
 */
export function getRiskLevelForExtension(extension: string): SecuritySeverity | null {
  const ext = extension.toLowerCase();
  return MODEL_FILE_EXTENSIONS[ext]?.risk || null;
}

/**
 * Get compliance information for a threat type
 * @param threatType - The threat type identifier
 * @returns ComplianceReference or undefined if not found
 */
export function getComplianceForThreatType(threatType: string): ComplianceReference | undefined {
  return THREAT_TYPES[threatType]?.compliance;
}

/**
 * Check if a file extension is a model file we should scan
 * @param extension - File extension (e.g., '.pkl')
 * @returns true if this is a model file
 */
export function isModelFileExtension(extension: string): boolean {
  return extension.toLowerCase() in MODEL_FILE_EXTENSIONS;
}

/**
 * Get all model file extensions as an array
 * @returns Array of extensions (e.g., ['.pkl', '.pt', ...])
 */
export function getModelFileExtensions(): string[] {
  return Object.keys(MODEL_FILE_EXTENSIONS);
}

// ============================================================================
// Pickle Magic Methods Detection
// ============================================================================

/**
 * Pickle lifecycle hooks that can execute code during deserialization.
 * These magic methods are the primary mechanism for pickle-based attacks.
 */
export const PICKLE_MAGIC_METHODS: string[] = [
  "__reduce__", // Returns callable + args for reconstruction
  "__reduce_ex__", // Extended reduce with protocol version
  "__setstate__", // Called with deserialized state dict
  "__getstate__", // Called during pickling, less dangerous but can leak data
  "__del__", // Destructor - executes on garbage collection
  "__new__", // Object creation hook
  "__init__", // Initialization hook
];

/**
 * Regex pattern to detect pickle magic methods in file content
 */
export const PICKLE_MAGIC_PATTERN = /__(reduce|reduce_ex|setstate|getstate|del|new|init)__/g;

// ============================================================================
// Pickle Opcode Detection
// ============================================================================

/**
 * Critical pickle opcodes that indicate potential code execution.
 *
 * Reference: https://docs.python.org/3/library/pickletools.html
 */
export const PICKLE_OPCODES = {
  // Import operations - load global symbols
  GLOBAL: 0x63, // 'c' - Import module.name (proto 0-2)
  STACK_GLOBAL: 0x93, // proto 4+ - Import from stack
  INST: 0x69, // 'i' - Legacy instantiate (proto 0)

  // Execution operations - actually run code
  REDUCE: 0x52, // 'R' - Call function with args from stack
  BUILD: 0x62, // 'b' - Call __setstate__ with state
  OBJ: 0x6f, // 'o' - Build object
  NEWOBJ: 0x81, // proto 2+ - Build new object
  NEWOBJ_EX: 0x92, // proto 4+ - Build new object with kwargs

  // These indicate end of pickle (used for stacked pickles)
  STOP: 0x2e, // '.' - End of pickle

  // Protocol markers
  PROTO: 0x80, // Protocol version marker
} as const;

/**
 * Opcode severity mappings for detection
 */
export const OPCODE_SEVERITY: Record<number, SecuritySeverity> = {
  [PICKLE_OPCODES.GLOBAL]: "high",
  [PICKLE_OPCODES.STACK_GLOBAL]: "high",
  [PICKLE_OPCODES.REDUCE]: "critical",
  [PICKLE_OPCODES.BUILD]: "high",
  [PICKLE_OPCODES.INST]: "critical",
  [PICKLE_OPCODES.OBJ]: "medium",
  [PICKLE_OPCODES.NEWOBJ]: "medium",
  [PICKLE_OPCODES.NEWOBJ_EX]: "medium",
};

/**
 * Check if a buffer contains critical pickle opcodes
 * @param buffer - Binary buffer to check
 * @returns Object with detected opcodes and their counts
 */
export function detectPickleOpcodes(buffer: Buffer): {
  hasGlobal: boolean;
  hasReduce: boolean;
  hasBuild: boolean;
  hasStackGlobal: boolean;
  opcodes: { opcode: number; count: number; severity: SecuritySeverity }[];
} {
  const result = {
    hasGlobal: false,
    hasReduce: false,
    hasBuild: false,
    hasStackGlobal: false,
    opcodes: [] as { opcode: number; count: number; severity: SecuritySeverity }[],
  };

  const opcodeCounts = new Map<number, number>();

  for (let i = 0; i < buffer.length; i++) {
    const byte = buffer[i];

    if (byte === PICKLE_OPCODES.GLOBAL) {
      result.hasGlobal = true;
      opcodeCounts.set(byte, (opcodeCounts.get(byte) || 0) + 1);
    } else if (byte === PICKLE_OPCODES.STACK_GLOBAL) {
      result.hasStackGlobal = true;
      opcodeCounts.set(byte, (opcodeCounts.get(byte) || 0) + 1);
    } else if (byte === PICKLE_OPCODES.REDUCE) {
      result.hasReduce = true;
      opcodeCounts.set(byte, (opcodeCounts.get(byte) || 0) + 1);
    } else if (byte === PICKLE_OPCODES.BUILD) {
      result.hasBuild = true;
      opcodeCounts.set(byte, (opcodeCounts.get(byte) || 0) + 1);
    } else if (byte in OPCODE_SEVERITY) {
      opcodeCounts.set(byte, (opcodeCounts.get(byte) || 0) + 1);
    }
  }

  for (const [opcode, count] of opcodeCounts) {
    result.opcodes.push({
      opcode,
      count,
      severity: OPCODE_SEVERITY[opcode] || "low",
    });
  }

  return result;
}

/**
 * Determine escalated severity based on opcode combinations
 * @param opcodeResult - Result from detectPickleOpcodes
 * @returns Escalated severity level
 */
export function getEscalatedSeverity(
  opcodeResult: ReturnType<typeof detectPickleOpcodes>,
): SecuritySeverity {
  // GLOBAL + REDUCE = definite code execution
  if ((opcodeResult.hasGlobal || opcodeResult.hasStackGlobal) && opcodeResult.hasReduce) {
    return "critical";
  }

  // GLOBAL + BUILD = __setstate__ execution
  if ((opcodeResult.hasGlobal || opcodeResult.hasStackGlobal) && opcodeResult.hasBuild) {
    return "critical";
  }

  // Just REDUCE without obvious GLOBAL might be obfuscated
  if (opcodeResult.hasReduce) {
    return "high";
  }

  // Just GLOBAL/STACK_GLOBAL
  if (opcodeResult.hasGlobal || opcodeResult.hasStackGlobal) {
    return "high";
  }

  return "low";
}
