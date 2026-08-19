import { ExtensionModel } from "../../domain.layer/models/extension/extension.model";
import { ExtensionConfigFieldModel } from "../../domain.layer/models/extension/extensionConfigField.model";
import { ExtensionEnablementModel } from "../../domain.layer/models/extension/extensionEnablement.model";
import {
  IExtension,
  IExtensionConfigField,
  IExtensionEnablement,
} from "../../domain.layer/interfaces/i.extension";
import {
  NotFoundException,
  ValidationException,
} from "../../domain.layer/exceptions/custom.exception";
import { decrypt, encrypt } from "../../utils/encryption.utils";

/**
 * Registry-layer service. Reads the extensions catalog + per-org enablements,
 * validates and encrypts configuration payloads on write, strips secret
 * values from read responses.
 *
 * Per-extension business logic (per-extension routes like `/mlflow/sync`)
 * is NOT in this file — that lives in per-extension routers registered
 * separately.
 */
export class ExtensionService {
  static async listAll(
    organizationId: number,
    category?: string,
  ): Promise<Record<string, unknown>[]> {
    const [extensions, enablements] = await Promise.all([
      ExtensionModel.findAll(category),
      ExtensionEnablementModel.findAllForOrg(organizationId),
    ]);
    const byExtensionId = new Map(enablements.map((e) => [e.extension_id, e]));
    // Load config fields for every extension in one pass so we can strip
    // secrets from the returned configuration.
    const configFieldsByExtId = new Map<number, IExtensionConfigField[]>();
    for (const ext of extensions) {
      configFieldsByExtId.set(ext.id, await ExtensionConfigFieldModel.findByExtensionId(ext.id));
    }
    return extensions.map((ext) =>
      this.assemble(ext, configFieldsByExtId.get(ext.id) ?? [], byExtensionId.get(ext.id) ?? null),
    );
  }

  static async getByKey(key: string, organizationId: number): Promise<Record<string, unknown>> {
    const extension = await ExtensionModel.findByKey(key);
    if (!extension) {
      throw new NotFoundException("Extension not found", "extension", key);
    }
    const [configFields, enablement] = await Promise.all([
      ExtensionConfigFieldModel.findByExtensionId(extension.id),
      ExtensionEnablementModel.findByExtensionId(extension.id, organizationId),
    ]);
    return this.assemble(extension, configFields, enablement);
  }

  static async enable(
    key: string,
    organizationId: number,
    userId: number,
    inputConfiguration: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const extension = await ExtensionModel.findByKey(key);
    if (!extension) {
      throw new NotFoundException("Extension not found", "extension", key);
    }
    const configFields = await ExtensionConfigFieldModel.findByExtensionId(extension.id);
    const existing = await ExtensionEnablementModel.findByExtensionId(extension.id, organizationId);

    // Merge input with any previously-stored config so re-enable preserves
    // fields the caller didn't repeat in the enable payload (matches the
    // update-configuration semantics).
    const merged = this.mergeAndEncrypt(
      inputConfiguration,
      existing?.configuration ?? {},
      configFields,
    );
    this.validate(merged, configFields, existing?.configuration ?? null);

    const enablement = await ExtensionEnablementModel.enable(
      extension.id,
      organizationId,
      userId,
      merged,
    );
    return this.assemble(extension, configFields, enablement);
  }

  static async disable(key: string, organizationId: number): Promise<Record<string, unknown>> {
    const extension = await ExtensionModel.findByKey(key);
    if (!extension) {
      throw new NotFoundException("Extension not found", "extension", key);
    }
    const existing = await ExtensionEnablementModel.findByExtensionId(extension.id, organizationId);
    if (!existing) {
      throw new NotFoundException(
        "Extension is not enabled for this organization",
        "extension_enablement",
        key,
      );
    }
    const enablement = await ExtensionEnablementModel.disable(extension.id, organizationId);
    const configFields = await ExtensionConfigFieldModel.findByExtensionId(extension.id);
    return this.assemble(extension, configFields, enablement);
  }

  static async updateConfiguration(
    key: string,
    organizationId: number,
    inputConfiguration: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const extension = await ExtensionModel.findByKey(key);
    if (!extension) {
      throw new NotFoundException("Extension not found", "extension", key);
    }
    const existing = await ExtensionEnablementModel.findByExtensionId(extension.id, organizationId);
    if (!existing) {
      throw new NotFoundException(
        "Extension is not enabled for this organization",
        "extension_enablement",
        key,
      );
    }
    const configFields = await ExtensionConfigFieldModel.findByExtensionId(extension.id);
    const merged = this.mergeAndEncrypt(
      inputConfiguration,
      existing.configuration ?? {},
      configFields,
    );
    this.validate(merged, configFields, existing.configuration ?? null);
    const enablement = await ExtensionEnablementModel.updateConfiguration(
      extension.id,
      organizationId,
      merged,
    );
    return this.assemble(extension, configFields, enablement);
  }

  /**
   * Runtime accessor for per-extension code (per-extension route handlers
   * like `/mlflow/sync`). Returns the full configuration with `is_secret`
   * fields decrypted. Never expose this payload back to the frontend —
   * `listAll`/`getByKey` handle the redacted read path.
   */
  static async getRuntimeConfiguration(
    key: string,
    organizationId: number,
  ): Promise<Record<string, unknown>> {
    const extension = await ExtensionModel.findByKey(key);
    if (!extension) {
      throw new NotFoundException("Extension not found", "extension", key);
    }
    const [configFields, enablement] = await Promise.all([
      ExtensionConfigFieldModel.findByExtensionId(extension.id),
      ExtensionEnablementModel.findByExtensionId(extension.id, organizationId),
    ]);
    if (!enablement) return {};
    const secretKeys = new Set(configFields.filter((f) => f.is_secret).map((f) => f.field_key));
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(enablement.configuration ?? {})) {
      if (secretKeys.has(k) && typeof v === "string" && v.length > 0) {
        try {
          out[k] = decrypt(v);
        } catch (err: any) {
          throw new Error(`Failed to decrypt '${k}' for extension '${key}': ${err.message}`);
        }
      } else {
        out[k] = v;
      }
    }
    return out;
  }

  // ---------------------------------------------------------------------
  // internal helpers
  // ---------------------------------------------------------------------

  /**
   * Build the outward-facing JSON for one extension: catalog metadata,
   * config field definitions, per-org state, and a redacted configuration.
   */
  private static assemble(
    extension: IExtension,
    configFields: IExtensionConfigField[],
    enablement: IExtensionEnablement | null,
  ): Record<string, unknown> {
    const configuration = enablement?.configuration ?? {};
    return {
      ...ExtensionModel.toJSON(extension),
      configFields: configFields.map((f) => ExtensionConfigFieldModel.toJSON(f)),
      enabled: enablement?.enabled ?? false,
      configuration: this.redactSecrets(configuration, configFields),
      enablement: enablement ? ExtensionEnablementModel.toJSON(enablement) : null,
    };
  }

  /**
   * Strip every secret field's value from a configuration blob. Callers
   * outside this service must never see secret values — even in masked
   * form, since length/format can be leaky.
   */
  private static redactSecrets(
    configuration: Record<string, unknown>,
    configFields: IExtensionConfigField[],
  ): Record<string, unknown> {
    const secretKeys = new Set(configFields.filter((f) => f.is_secret).map((f) => f.field_key));
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(configuration)) {
      if (secretKeys.has(k)) continue;
      out[k] = v;
    }
    return out;
  }

  /**
   * Merge incoming config with existing stored config and encrypt any
   * secret values the caller supplied. Secret fields absent from the input
   * fall through to the previously-stored (already-encrypted) value —
   * this is the standard "leave blank to keep unchanged" flow for passwords.
   * Non-secret fields absent from input are dropped (caller controls the
   * full non-secret shape on every write).
   */
  private static mergeAndEncrypt(
    input: Record<string, unknown>,
    existing: Record<string, unknown>,
    configFields: IExtensionConfigField[],
  ): Record<string, unknown> {
    const byKey = new Map(configFields.map((f) => [f.field_key, f]));
    const merged: Record<string, unknown> = {};
    // Start with all non-secret input values that correspond to known fields.
    for (const [k, v] of Object.entries(input ?? {})) {
      const field = byKey.get(k);
      if (!field) continue;
      if (field.is_secret) {
        if (v === undefined || v === null || v === "") continue;
        merged[k] = encrypt(String(v));
      } else {
        merged[k] = v;
      }
    }
    // For secret fields NOT present in input, carry over the existing
    // encrypted value so PATCH doesn't wipe the credential.
    for (const field of configFields) {
      if (!field.is_secret) continue;
      if (Object.prototype.hasOwnProperty.call(merged, field.field_key)) continue;
      if (Object.prototype.hasOwnProperty.call(existing, field.field_key)) {
        merged[field.field_key] = existing[field.field_key];
      }
    }
    return merged;
  }

  /**
   * Validate a config payload against the extension's config field schema.
   * `previous` lets required-secret checks pass when the caller intends to
   * keep the previously-stored value (present in existing, absent from input).
   */
  private static validate(
    configuration: Record<string, unknown>,
    configFields: IExtensionConfigField[],
    previous: Record<string, unknown> | null,
  ): void {
    for (const field of configFields) {
      const value = configuration[field.field_key];
      const isPresent = value !== undefined && value !== null && value !== "";

      if (field.is_required && !isPresent) {
        // Secret: required is satisfied if the previous value carries through.
        if (
          field.is_secret &&
          previous &&
          Object.prototype.hasOwnProperty.call(previous, field.field_key) &&
          previous[field.field_key] !== null &&
          previous[field.field_key] !== ""
        ) {
          continue;
        }
        throw new ValidationException(
          `Field '${field.field_key}' is required`,
          field.field_key,
          value,
        );
      }
      if (!isPresent) continue;

      // Secrets have already been encrypted (into strings). Skip further
      // type/options/validation checks — the encrypted string is opaque.
      if (field.is_secret) continue;

      switch (field.field_type) {
        case "text":
        case "textarea":
        case "url":
        case "email":
          this.assertString(field.field_key, value);
          this.assertLength(field.field_key, String(value), field.validation);
          this.assertPattern(field.field_key, String(value), field.validation);
          if (field.field_type === "url") this.assertUrl(field.field_key, String(value));
          if (field.field_type === "email") this.assertEmail(field.field_key, String(value));
          break;
        case "number":
          this.assertNumber(field.field_key, value);
          this.assertRange(field.field_key, Number(value), field.validation);
          break;
        case "boolean":
          this.assertBoolean(field.field_key, value);
          break;
        case "select":
          this.assertString(field.field_key, value);
          this.assertInOptions(field.field_key, String(value), field.options);
          break;
        case "multiselect":
          this.assertMultiselect(field.field_key, value, field.options);
          break;
      }
    }

    // Reject unknown keys — surface schema drift instead of silently
    // persisting typos.
    const known = new Set(configFields.map((f) => f.field_key));
    for (const k of Object.keys(configuration)) {
      if (!known.has(k)) {
        throw new ValidationException(`Unknown configuration field '${k}'`, k, configuration[k]);
      }
    }
  }

  private static assertString(key: string, value: unknown): void {
    if (typeof value !== "string") {
      throw new ValidationException(`Field '${key}' must be a string`, key, value);
    }
  }
  private static assertNumber(key: string, value: unknown): void {
    if (typeof value === "number") return;
    if (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value))) return;
    throw new ValidationException(`Field '${key}' must be a number`, key, value);
  }
  private static assertBoolean(key: string, value: unknown): void {
    if (typeof value === "boolean") return;
    throw new ValidationException(`Field '${key}' must be a boolean`, key, value);
  }
  private static assertUrl(key: string, value: string): void {
    try {
      new URL(value);
    } catch {
      throw new ValidationException(`Field '${key}' must be a valid URL`, key, value);
    }
  }
  private static assertEmail(key: string, value: string): void {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      throw new ValidationException(`Field '${key}' must be a valid email address`, key, value);
    }
  }
  private static assertInOptions(
    key: string,
    value: string,
    options: IExtensionConfigField["options"],
  ): void {
    if (!options || options.length === 0) return;
    if (!options.some((o) => o.value === value)) {
      throw new ValidationException(
        `Field '${key}' must be one of: ${options.map((o) => o.value).join(", ")}`,
        key,
        value,
      );
    }
  }
  private static assertMultiselect(
    key: string,
    value: unknown,
    options: IExtensionConfigField["options"],
  ): void {
    if (!Array.isArray(value)) {
      throw new ValidationException(`Field '${key}' must be an array`, key, value);
    }
    for (const v of value) {
      if (typeof v !== "string") {
        throw new ValidationException(`Field '${key}' values must be strings`, key, v);
      }
      this.assertInOptions(key, v, options);
    }
  }
  private static assertLength(
    key: string,
    value: string,
    validation: IExtensionConfigField["validation"],
  ): void {
    if (!validation) return;
    if (typeof validation.minLength === "number" && value.length < validation.minLength) {
      throw new ValidationException(
        `Field '${key}' must be at least ${validation.minLength} characters`,
        key,
        value,
      );
    }
    if (typeof validation.maxLength === "number" && value.length > validation.maxLength) {
      throw new ValidationException(
        `Field '${key}' must be at most ${validation.maxLength} characters`,
        key,
        value,
      );
    }
  }
  private static assertPattern(
    key: string,
    value: string,
    validation: IExtensionConfigField["validation"],
  ): void {
    if (!validation?.pattern) return;
    if (!new RegExp(validation.pattern).test(value)) {
      throw new ValidationException(`Field '${key}' does not match required pattern`, key, value);
    }
  }
  private static assertRange(
    key: string,
    value: number,
    validation: IExtensionConfigField["validation"],
  ): void {
    if (!validation) return;
    if (typeof validation.min === "number" && value < validation.min) {
      throw new ValidationException(`Field '${key}' must be >= ${validation.min}`, key, value);
    }
    if (typeof validation.max === "number" && value > validation.max) {
      throw new ValidationException(`Field '${key}' must be <= ${validation.max}`, key, value);
    }
  }
}
