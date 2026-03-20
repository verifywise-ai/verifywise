/**
 * @fileoverview Evaluation LLM API Key Model
 *
 * Manages encrypted storage of LLM provider API keys for running evaluations.
 * Each organization can store one API key per provider.
 *
 * Security Features:
 * - Automatic encryption/decryption of API keys
 * - Keys are never stored in plain text
 * - Unique constraint prevents duplicate providers per organization
 *
 * Supported Providers:
 * - openai: OpenAI GPT models
 * - anthropic: Anthropic Claude models
 * - google: Google Gemini models
 * - xai: xAI Grok models
 * - mistral: Mistral AI models
 * - huggingface: Hugging Face models
 * - openrouter: OpenRouter (multi-provider gateway)
 *
 * @module domain.layer/models/evaluationLlmApiKey
 */

import { Column, DataType, Model, Table } from 'sequelize-typescript';
import { IEvaluationLlmApiKey } from '../../interfaces/i.evalutationLlmApiKey';

export type LLMProvider = 'openai' | 'anthropic' | 'google' | 'xai' | 'mistral' | 'huggingface' | 'openrouter';

export const VALID_PROVIDERS: LLMProvider[] = [
  'openai',
  'anthropic',
  'google',
  'xai',
  'mistral',
  'huggingface',
  'openrouter',
];

/**
 * API key format patterns for each provider
 * These are used to validate that the user entered a valid-looking API key
 */
export const API_KEY_PATTERNS: Record<LLMProvider, { pattern: RegExp; example: string; description: string }> = {
  openai: {
    pattern: /^sk-(proj-)?[a-zA-Z0-9_-]{20,}$/,
    example: 'sk-... or sk-proj-...',
    description: 'OpenAI keys start with "sk-" or "sk-proj-"',
  },
  anthropic: {
    pattern: /^sk-ant-(api\d+-)?[a-zA-Z0-9_-]{20,}$/,
    example: 'sk-ant-api03-...',
    description: 'Anthropic keys start with "sk-ant-" (typically "sk-ant-api03-")',
  },
  google: {
    pattern: /^AIza[a-zA-Z0-9_-]{35,}$/,
    example: 'AIza...',
    description: 'Google API keys start with "AIza"',
  },
  xai: {
    pattern: /^xai-[a-zA-Z0-9_-]{20,}$/,
    example: 'xai-...',
    description: 'xAI keys start with "xai-"',
  },
  mistral: {
    pattern: /^[a-zA-Z0-9]{32,}$/,
    example: '32+ character alphanumeric string',
    description: 'Mistral keys are alphanumeric strings (32+ characters)',
  },
  huggingface: {
    pattern: /^hf_[a-zA-Z0-9]{20,}$/,
    example: 'hf_...',
    description: 'Hugging Face keys start with "hf_"',
  },
  openrouter: {
    pattern: /^sk-or-v1-[a-zA-Z0-9]{40,}$/,
    example: 'sk-or-v1-...',
    description: 'OpenRouter keys start with "sk-or-v1-"',
  },
};

/**
 * Validate API key format for a specific provider
 * @returns null if valid, or error message if invalid
 */
export function validateApiKeyFormat(provider: LLMProvider, apiKey: string): string | null {
  const config = API_KEY_PATTERNS[provider];
  if (!config) {
    return null; // Unknown provider, skip format validation
  }

  const trimmedKey = apiKey.trim();

  if (!config.pattern.test(trimmedKey)) {
    return `Invalid ${provider} API key format. ${config.description}. Expected format: ${config.example}`;
  }

  return null; // Valid
}

@Table({
  tableName: 'llm_evals_api_keys',
  timestamps: true,
  underscored: true,
})
export class EvaluationLlmApiKeyModel extends Model<EvaluationLlmApiKeyModel> implements IEvaluationLlmApiKey {
  @Column({
    type: DataType.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  })
  id?: number;

  @Column({
    type: DataType.STRING(50),
    allowNull: false,
  })
  provider!: LLMProvider;

  @Column({
    type: DataType.TEXT,
    allowNull: false,
    field: 'api_key_encrypted',
  })
  api_key_encrypted!: string;

  @Column({
    type: DataType.DATE,
  })
  created_at?: Date;

  @Column({
    type: DataType.DATE,
  })
  updated_at?: Date;

  // /**
  //  * Set API key (encrypts automatically)
  //  */
  // setApiKey(plainKey: string): void {
  //   if (!plainKey || plainKey.trim().length === 0) {
  //     throw new ValidationException('API key cannot be empty', 'apiKey', plainKey);
  //   }
  //   this.encrypted_api_key = encrypt(plainKey.trim());
  // }

  // /**
  //  * Get decrypted API key
  //  */
  // getApiKey(): string {
  //   if (!this.encrypted_api_key) {
  //     throw new Error('No API key stored');
  //   }
  //   return decrypt(this.encrypted_api_key);
  // }

  // /**
  //  * Get masked API key for display
  //  */
  // getMaskedKey(): string {
  //   try {
  //     const plainKey = this.getApiKey();
  //     return maskApiKey(plainKey);
  //   } catch {
  //     return '***';
  //   }
  // }

  // /**
  //  * Validate provider is supported
  //  */
  // static validateProvider(provider: string): void {
  //   if (!VALID_PROVIDERS.includes(provider as LLMProvider)) {
  //     throw new ValidationException(
  //       `Invalid provider. Must be one of: ${VALID_PROVIDERS.join(', ')}`,
  //       'provider',
  //       provider
  //     );
  //   }
  // }

  // /**
  //  * Create a new LLM API key entry
  //  */
  // static async createKey(
  //   organizationId: number,
  //   provider: LLMProvider,
  //   apiKey: string
  // ): Promise<EvaluationLlmApiKeyModel> {
  //   // Validate inputs
  //   if (!organizationId || organizationId < 1) {
  //     throw new ValidationException('Valid organization ID is required', 'organizationId', organizationId);
  //   }

  //   this.validateProvider(provider);

  //   if (!apiKey || apiKey.trim().length === 0) {
  //     throw new ValidationException('API key cannot be empty', 'apiKey', apiKey);
  //   }

  //   // Validate API key format
  //   const formatError = validateApiKeyFormat(provider, apiKey);
  //   if (formatError) {
  //     throw new ValidationException(formatError, 'apiKey', apiKey);
  //   }

  //   // Check if key already exists for this provider
  //   const existing = await this.findOne({
  //     where: {
  //       organization_id: organizationId,
  //       provider,
  //     },
  //   });

  //   if (existing) {
  //     throw new ValidationException(
  //       `API key for provider '${provider}' already exists. Delete it first to add a new one.`,
  //       'provider',
  //       provider
  //     );
  //   }

  //   // Create new key
  //   const keyModel = new EvaluationLlmApiKeyModel();
  //   keyModel.organization_id = organizationId;
  //   keyModel.provider = provider;
  //   keyModel.setApiKey(apiKey);

  //   await keyModel.save();
  //   return keyModel;
  // }

  // /**
  //  * Get all API keys for an organization (returns masked keys)
  //  */
  // static async getKeysForOrganization(organizationId: number): Promise<any[]> {
  //   if (!organizationId || organizationId < 1) {
  //     throw new ValidationException('Valid organization ID is required', 'organizationId', organizationId);
  //   }

  //   const keys = await this.findAll({
  //     where: { organization_id: organizationId },
  //     order: [['created_at', 'DESC']],
  //   });

  //   return keys.map(key => ({
  //     provider: key.provider,
  //     maskedKey: key.getMaskedKey(),
  //     createdAt: key.created_at,
  //     updatedAt: key.updated_at,
  //   }));
  // }

  // /**
  //  * Delete API key for a provider
  //  */
  // static async deleteKey(organizationId: number, provider: LLMProvider): Promise<boolean> {
  //   if (!organizationId || organizationId < 1) {
  //     throw new ValidationException('Valid organization ID is required', 'organizationId', organizationId);
  //   }

  //   this.validateProvider(provider);

  //   const deleted = await this.destroy({
  //     where: {
  //       organization_id: organizationId,
  //       provider,
  //     },
  //   });

  //   return deleted > 0;
  // }

  // /**
  //  * Get decrypted API key for making LLM calls
  //  */
  // static async getDecryptedKey(organizationId: number, provider: LLMProvider): Promise<string | null> {
  //   if (!organizationId || organizationId < 1) {
  //     throw new ValidationException('Valid organization ID is required', 'organizationId', organizationId);
  //   }

  //   this.validateProvider(provider);

  //   const keyModel = await this.findOne({
  //     where: {
  //       organization_id: organizationId,
  //       provider,
  //     },
  //   });

  //   if (!keyModel) {
  //     return null;
  //   }

  //   return keyModel.getApiKey();
  // }

  // /**
  //  * Convert to safe JSON (masks API key)
  //  */
  // toJSON(): any {
  //   return {
  //     id: this.id,
  //     organizationId: this.organization_id,
  //     provider: this.provider,
  //     maskedKey: this.getMaskedKey(),
  //     createdAt: this.created_at,
  //     updatedAt: this.updated_at,
  //   };
  // }
}
