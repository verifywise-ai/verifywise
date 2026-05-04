/**
 * Model Inventory specific validation utilities
 * Contains validation schemas and functions specifically for model inventory operations
 */

import {
  validateString,
  validateEnum,
  validateDate,
  validateForeignKey,
  validateSchema,
  ValidationResult,
  ValidationError,
} from "./validation.utils";

/**
 * Validation constants for model inventories
 */
export const MODEL_INVENTORY_VALIDATION_LIMITS = {
  PROVIDER_MODEL: { MIN: 2, MAX: 255 },
  PROVIDER: { MIN: 2, MAX: 100 },
  MODEL: { MIN: 2, MAX: 100 },
  VERSION: { MIN: 1, MAX: 50 },
  CAPABILITIES: { MIN_ITEMS: 1, MAX_ITEMS: 10 },
  // SECURITY_ASSESSMENT is now a boolean field
  // APPROVER is now a foreign key integer (user ID)
} as const;

/**
 * Model inventory status enum values
 *
 * Status Flow:
 * - Pending: Initial status for new models awaiting review
 * - Approved: Models that have passed all security and compliance checks (security_assessment = true required)
 * - Restricted: Models approved with limited usage restrictions (security_assessment = true required)
 * - Blocked: Models that have failed review or pose security risks (security_assessment may be false)
 */
export const MODEL_INVENTORY_STATUS_ENUM = [
  "Approved",
  "Restricted",
  "Pending",
  "Blocked",
] as const;

/**
 * Model capabilities enum values
 *
 * Capabilities are organized into categories:
 * - Primary modalities: Vision, Audio, Video, Text Generation
 * - Specialized tasks: Translation, Summarization, Question Answering, etc.
 * - Technical features: Caching, Tools, Code, Multimodal
 * - Analysis capabilities: Sentiment Analysis, Named Entity Recognition, etc.
 * - Prediction capabilities: Recommendation, Anomaly Detection, Forecasting
 */
export const MODEL_CAPABILITIES_ENUM = [
  "Vision",
  "Caching",
  "Tools",
  "Code",
  "Multimodal",
  "Audio",
  "Video",
  "Text Generation",
  "Translation",
  "Summarization",
  "Question Answering",
  "Sentiment Analysis",
  "Named Entity Recognition",
  "Image Classification",
  "Object Detection",
  "Speech Recognition",
  "Text-to-Speech",
  "Recommendation",
  "Anomaly Detection",
  "Forecasting",
] as const;

/**
 * AI model provider enum values
 */
export const MODEL_PROVIDER_ENUM = [
  "OpenAI",
  "Anthropic",
  "Google",
  "Microsoft",
  "Amazon",
  "Meta",
  "Hugging Face",
  "Cohere",
  "Stability AI",
  "Mistral AI",
  "Internal",
  "Custom",
  "Other",
] as const;

/**
 * Validates provider model field
 */
export const validateProviderModel = (value: any): ValidationResult => {
  if (value === undefined || value === null || value === "") {
    return { isValid: true }; // Optional field
  }
  return validateString(value, "Provider model", {
    required: false,
    minLength: MODEL_INVENTORY_VALIDATION_LIMITS.PROVIDER_MODEL.MIN,
    maxLength: MODEL_INVENTORY_VALIDATION_LIMITS.PROVIDER_MODEL.MAX,
    trimWhitespace: true,
  });
};

/**
 * Validates provider field
 */
export const validateProvider = (value: any): ValidationResult => {
  return validateString(value, "Provider", {
    required: true,
    minLength: MODEL_INVENTORY_VALIDATION_LIMITS.PROVIDER.MIN,
    maxLength: MODEL_INVENTORY_VALIDATION_LIMITS.PROVIDER.MAX,
    trimWhitespace: true,
  });
};

/**
 * Validates model field
 */
export const validateModel = (value: any): ValidationResult => {
  return validateString(value, "Model", {
    required: true,
    minLength: MODEL_INVENTORY_VALIDATION_LIMITS.MODEL.MIN,
    maxLength: MODEL_INVENTORY_VALIDATION_LIMITS.MODEL.MAX,
    trimWhitespace: true,
  });
};

/**
 * Validates version field
 */
export const validateVersion = (value: any): ValidationResult => {
  return validateString(value, "Version", {
    required: true,
    minLength: MODEL_INVENTORY_VALIDATION_LIMITS.VERSION.MIN,
    maxLength: MODEL_INVENTORY_VALIDATION_LIMITS.VERSION.MAX,
    trimWhitespace: true,
  });
};

/**
 * Validates approver field (user foreign key)
 */
export const validateApprover = (value: any): ValidationResult => {
  return validateForeignKey(value, "Approver", false);
};

/**
 * Validates capabilities field (array of enum values)
 */
export const validateCapabilities = (value: any): ValidationResult => {
  if (value === undefined || value === null) {
    return { isValid: true }; // Optional field
  }

  if (!Array.isArray(value)) {
    return {
      isValid: false,
      message: "Capabilities must be an array",
      code: "INVALID_CAPABILITIES_TYPE",
    };
  }

  // Allow empty array (optional field)
  if (value.length === 0) {
    return { isValid: true };
  }

  if (value.length > MODEL_INVENTORY_VALIDATION_LIMITS.CAPABILITIES.MAX_ITEMS) {
    return {
      isValid: false,
      message: `Capabilities array cannot exceed ${MODEL_INVENTORY_VALIDATION_LIMITS.CAPABILITIES.MAX_ITEMS} items`,
      code: "TOO_MANY_CAPABILITIES",
    };
  }

  // Validate each capability
  for (let i = 0; i < value.length; i++) {
    const capability = value[i];
    if (!MODEL_CAPABILITIES_ENUM.includes(capability as any)) {
      return {
        isValid: false,
        message: `Invalid capability: "${capability}". Must be one of: ${MODEL_CAPABILITIES_ENUM.join(", ")}`,
        code: "INVALID_CAPABILITY",
      };
    }
  }

  // Check for duplicates
  const uniqueCapabilities = [...new Set(value)];
  if (uniqueCapabilities.length !== value.length) {
    return {
      isValid: false,
      message: "Capabilities array cannot contain duplicates",
      code: "DUPLICATE_CAPABILITIES",
    };
  }

  return { isValid: true };
};

/**
 * Validates security assessment field (boolean)
 */
export const validateSecurityAssessment = (value: any): ValidationResult => {
  // Security assessment is now a boolean field
  if (value === undefined || value === null) {
    return {
      isValid: false,
      message: "Security assessment is required",
      code: "REQUIRED_FIELD",
    };
  }

  if (typeof value !== "boolean") {
    return {
      isValid: false,
      message: "Security assessment must be a boolean value",
      code: "INVALID_TYPE",
    };
  }

  return { isValid: true };
};

/**
 * Validates model inventory status field
 */
export const validateModelInventoryStatus = (value: any): ValidationResult => {
  return validateEnum(value, "Model inventory status", MODEL_INVENTORY_STATUS_ENUM, true);
};

/**
 * Validates status date field
 */
export const validateStatusDate = (value: any): ValidationResult => {
  return validateDate(value, "Status date", { required: true });
};

/**
 * Validates is demo field
 */
export const validateIsDemo = (value: any): ValidationResult => {
  // Optional field - no validation if not provided
  if (value === undefined || value === null) {
    return { isValid: true };
  }

  if (typeof value !== "boolean") {
    return {
      isValid: false,
      message: "Is demo must be a boolean value",
      code: "INVALID_TYPE",
    };
  }

  return { isValid: true };
};

/**
 * Validates model inventory ID parameter
 */
export const validateModelInventoryIdParam = (id: any): ValidationResult => {
  return validateForeignKey(id, "Model inventory ID", true);
};

/**
 * Validation schema for creating a new model inventory
 */
export const createModelInventorySchema = {
  provider_model: validateProviderModel,
  provider: validateProvider,
  model: validateModel,
  version: validateVersion,
  approver: validateApprover,
  capabilities: validateCapabilities,
  security_assessment: validateSecurityAssessment,
  status: validateModelInventoryStatus,
  status_date: validateStatusDate,
  is_demo: validateIsDemo,
};

/**
 * Validation schema for updating a model inventory
 * All fields are required for updates based on the controller logic
 */
export const updateModelInventorySchema = {
  provider_model: validateProviderModel,
  provider: validateProvider,
  model: validateModel,
  version: validateVersion,
  approver: validateApprover,
  capabilities: validateCapabilities,
  security_assessment: validateSecurityAssessment,
  status: validateModelInventoryStatus,
  status_date: validateStatusDate,
  is_demo: validateIsDemo,
};

/**
 * Validates a complete model inventory object for creation
 */
export const validateCompleteModelInventory = (data: any): ValidationError[] => {
  return validateSchema(data, createModelInventorySchema);
};

/**
 * Validates a model inventory object for updates
 */
export const validateUpdateModelInventory = (data: any): ValidationError[] => {
  return validateSchema(data, updateModelInventorySchema);
};

/**
 * Business rule validation for model inventory creation
 */
export const validateModelInventoryCreationBusinessRules = (data: any): ValidationError[] => {
  const errors: ValidationError[] = [];

  // Validate version format (should follow semantic versioning)
  if (data.version) {
    const versionPattern = /^v?\d+(\.\d+)*(-[a-zA-Z0-9-]+)?(\+[a-zA-Z0-9-]+)?$/;
    if (!versionPattern.test(data.version)) {
      errors.push({
        field: "version",
        message:
          'Version should follow semantic versioning format (e.g., "1.0.0", "v2.1.3", "1.0.0-beta")',
        code: "INVALID_VERSION_FORMAT",
      });
    }
  }

  // Validate provider and model consistency
  if (data.provider && data.model) {
    const providerModelCombinations = {
      OpenAI: ["gpt-3.5-turbo", "gpt-4", "gpt-4-turbo", "dall-e", "whisper", "text-embedding"],
      Anthropic: ["claude-3", "claude-2", "claude-instant"],
      Google: ["gemini", "palm", "bard", "vertex-ai"],
      Microsoft: ["copilot", "azure-openai"],
      Amazon: ["bedrock", "sagemaker"],
      Meta: ["llama", "llama-2"],
      "Hugging Face": ["transformers", "diffusers"],
      "Stability AI": ["stable-diffusion"],
      "Mistral AI": ["mistral-7b", "mistral-8x7b"],
    };

    const validModels =
      providerModelCombinations[data.provider as keyof typeof providerModelCombinations];
    if (
      validModels &&
      !validModels.some((validModel) => data.model.toLowerCase().includes(validModel.toLowerCase()))
    ) {
      errors.push({
        field: "model",
        message: `Model "${data.model}" may not be associated with provider "${data.provider}". Please verify this combination.`,
        code: "PROVIDER_MODEL_MISMATCH",
      });
    }
  }

  // Validate status transitions for new models
  if (data.status) {
    const validInitialStatuses = ["Pending"];
    if (!validInitialStatuses.includes(data.status)) {
      errors.push({
        field: "status",
        message: 'New model inventory items should start with "Pending" status',
        code: "INVALID_INITIAL_STATUS",
      });
    }
  }

  // Security assessment is no longer required for any status

  // Validate capabilities selection
  if (data.capabilities && Array.isArray(data.capabilities) && data.capabilities.length > 0) {
    // Check for logical capability combinations
    const hasVision = data.capabilities.includes("Vision");
    const hasMultimodal = data.capabilities.includes("Multimodal");
    const hasAudio = data.capabilities.includes("Audio");
    const hasVideo = data.capabilities.includes("Video");

    // If model has Vision, it should probably be Multimodal too (unless it's vision-only)
    if (
      hasVision &&
      !hasMultimodal &&
      !data.capabilities.includes("Image Classification") &&
      !data.capabilities.includes("Object Detection")
    ) {
      // This is just a warning-level validation, not an error
    }

    // Validate that multimodal models have at least 2 modalities
    if (hasMultimodal) {
      const modalityCount = [
        hasVision,
        hasAudio,
        hasVideo,
        data.capabilities.includes("Text Generation"),
      ].filter(Boolean).length;
      if (modalityCount < 2) {
        errors.push({
          field: "capabilities",
          message: "Multimodal models should have capabilities for at least 2 different modalities",
          code: "INSUFFICIENT_MULTIMODAL_CAPABILITIES",
        });
      }
    }

    // Validate common capability combinations
    if (data.capabilities.includes("Object Detection") && !data.capabilities.includes("Vision")) {
      errors.push({
        field: "capabilities",
        message: "Object Detection requires Vision capability",
        code: "MISSING_VISION_FOR_OBJECT_DETECTION",
      });
    }

    if (
      data.capabilities.includes("Image Classification") &&
      !data.capabilities.includes("Vision")
    ) {
      errors.push({
        field: "capabilities",
        message: "Image Classification requires Vision capability",
        code: "MISSING_VISION_FOR_IMAGE_CLASSIFICATION",
      });
    }

    if (data.capabilities.includes("Speech Recognition") && !data.capabilities.includes("Audio")) {
      errors.push({
        field: "capabilities",
        message: "Speech Recognition requires Audio capability",
        code: "MISSING_AUDIO_FOR_SPEECH_RECOGNITION",
      });
    }

    if (data.capabilities.includes("Text-to-Speech") && !data.capabilities.includes("Audio")) {
      errors.push({
        field: "capabilities",
        message: "Text-to-Speech requires Audio capability",
        code: "MISSING_AUDIO_FOR_TTS",
      });
    }

    // Validate that models have at least one primary capability
    const primaryCapabilities = [
      "Text Generation",
      "Vision",
      "Audio",
      "Video",
      "Code",
      "Translation",
      "Summarization",
      "Question Answering",
      "Image Classification",
      "Object Detection",
      "Speech Recognition",
      "Text-to-Speech",
      "Recommendation",
      "Anomaly Detection",
      "Forecasting",
    ];
    const hasPrimaryCapability = data.capabilities.some((cap: string) =>
      primaryCapabilities.includes(cap),
    );
    if (!hasPrimaryCapability) {
      errors.push({
        field: "capabilities",
        message:
          "Model must have at least one primary capability (not just auxiliary capabilities like Caching, Tools)",
        code: "MISSING_PRIMARY_CAPABILITY",
      });
    }
  }

  // Validate demo flag consistency
  if (data.is_demo === true && data.status === "Approved") {
    errors.push({
      field: "is_demo",
      message: "Demo models cannot have Approved status",
      code: "DEMO_APPROVED_CONFLICT",
    });
  }

  // Security assessment is no longer enforced for any status transitions

  // Approver is now a user ID (foreign key), so no format validation needed

  return errors;
};

/**
 * Business rule validation for model inventory updates
 */
export const validateModelInventoryUpdateBusinessRules = (
  data: any,
  existingData?: any,
): ValidationError[] => {
  const errors: ValidationError[] = [];

  // Validate status transitions
  if (data.status && existingData?.status) {
    const invalidTransitions = [
      {
        from: "Approved",
        to: "Pending",
        message: "Cannot move approved model back to pending",
      },
      {
        from: "Blocked",
        to: "Approved",
        message: "Blocked models cannot be moved to approved without review",
      },
      {
        from: "Blocked",
        to: "Restricted",
        message: "Blocked models cannot be moved to restricted without review",
      },
    ];

    // Additional validation for new status model
    if (existingData.status === "Pending" && data.status === "Blocked") {
      // Allow this transition but log it for auditing
    }

    if (existingData.status === "Pending" && data.status === "Approved") {
      // Allow approval without security assessment requirement
    }

    if (existingData.status === "Pending" && data.status === "Restricted") {
      // This is a valid transition
    }

    if (existingData.status === "Restricted" && data.status === "Approved") {
      // Restricted models can be promoted to approved after review
    }

    if (existingData.status === "Restricted" && data.status === "Blocked") {
      // Restricted models can be blocked if issues are found
    }

    const invalidTransition = invalidTransitions.find(
      (t) => t.from === existingData.status && t.to === data.status,
    );

    if (invalidTransition) {
      errors.push({
        field: "status",
        message: invalidTransition.message,
        code: "INVALID_STATUS_TRANSITION",
      });
    }
  }

  // Validate version format
  if (data.version) {
    const versionPattern = /^v?\d+(\.\d+)*(-[a-zA-Z0-9-]+)?(\+[a-zA-Z0-9-]+)?$/;
    if (!versionPattern.test(data.version)) {
      errors.push({
        field: "version",
        message:
          'Version should follow semantic versioning format (e.g., "1.0.0", "v2.1.3", "1.0.0-beta")',
        code: "INVALID_VERSION_FORMAT",
      });
    }
  }

  // Security assessment is no longer required for approved status

  // Validate demo flag changes
  if (data.is_demo !== undefined && existingData?.is_demo !== undefined) {
    if (
      existingData.is_demo === false &&
      data.is_demo === true &&
      existingData.status === "Approved"
    ) {
      errors.push({
        field: "is_demo",
        message: "Cannot mark approved model as demo without changing status first",
        code: "APPROVED_TO_DEMO_INVALID",
      });
    }
  }

  return errors;
};

/**
 * Complete validation for model inventory creation with business rules
 */
export const validateCompleteModelInventoryCreation = (data: any): ValidationError[] => {
  const validationErrors = validateCompleteModelInventory(data);
  const businessErrors = validateModelInventoryCreationBusinessRules(data);

  return [...validationErrors, ...businessErrors];
};

/**
 * Complete validation for model inventory updates with business rules
 */
export const validateCompleteModelInventoryUpdate = (
  data: any,
  existingData?: any,
): ValidationError[] => {
  const validationErrors = validateUpdateModelInventory(data);
  const businessErrors = validateModelInventoryUpdateBusinessRules(data, existingData);

  return [...validationErrors, ...businessErrors];
};
