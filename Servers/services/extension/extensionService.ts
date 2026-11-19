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
import { isEmail } from "../../utils/validations/email.utils";
import {
  STORED_SECRET_MESSAGES,
  checkStoredSecrets,
  isFilled,
  withoutKeys,
} from "./storedSecretGuard";

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

    // Merge input with any previously-stored config so re-enable keeps the
    // fields the caller didn't repeat in the enable payload (same rules as
    // updateConfiguration, see mergeAndEncrypt).
    const previous = existing
      ? this.reusableConfiguration(
          key,
          inputConfiguration,
          existing.configuration ?? {},
          configFields,
        )
      : null;
    const merged = this.mergeAndEncrypt(inputConfiguration, previous ?? {}, configFields);
    this.validate(merged, configFields);

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
    const previous = this.reusableConfiguration(
      key,
      inputConfiguration,
      existing.configuration ?? {},
      configFields,
    );
    const merged = this.mergeAndEncrypt(inputConfiguration, previous, configFields);
    this.validate(merged, configFields);
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
   * config field definitions, per-org state, a redacted configuration, and
   * `secretsSet`: the keys of the secret fields that hold a stored value
   * (never the value), so a form can say a secret is set and offer to clear it.
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
      secretsSet: configFields
        .filter((f) => f.is_secret && isFilled(configuration[f.field_key]))
        .map((f) => f.field_key),
      // toJSON leaves out the stored configuration (it holds the secrets as
      // ciphertext); the redacted top-level `configuration` is the only copy
      // clients get.
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
   * The stored configuration a save may carry secrets over from. A stored
   * secret is never kept for a changed address or identity (see
   * storedSecretGuard.ts): the save is refused with "Enter the <secret> again:
   * the <field> changed." when the new configuration would send it, and the
   * stale secret is dropped when it would not.
   *
   * The fields compared are the ones the save would store: a field missing
   * from the input keeps its stored value, so it is no change; `null` or ""
   * clears it. A secret the input clears (`null`) is never carried over, so
   * it cannot block the save.
   *
   * Only the extension's current config fields are checked. Jira Assets keeps
   * its connection in `jira_assets_config` (guarded by its own `saveConfig`)
   * and has no config fields here, so an old enablement row still holding
   * `api_token` / `jira_base_url` does not block re-enabling it; those keys
   * are not carried over by mergeAndEncrypt either.
   */
  private static reusableConfiguration(
    key: string,
    input: Record<string, unknown>,
    stored: Record<string, unknown>,
    configFields: IExtensionConfigField[],
  ): Record<string, unknown> {
    const submitted = input ?? {};
    const fieldKeys = new Set(configFields.map((f) => f.field_key));
    const cleared = configFields
      .filter((f) => f.is_secret && submitted[f.field_key] === null)
      .map((f) => f.field_key);
    const reusable = withoutKeys(stored, cleared);
    const next: Record<string, unknown> = { ...reusable };
    for (const [k, v] of Object.entries(submitted)) {
      if (v !== undefined) next[k] = v;
    }
    const check = checkStoredSecrets(key, reusable, next, submitted, fieldKeys);
    if (check.blocked) throw new ValidationException(STORED_SECRET_MESSAGES[check.blocked]);
    return withoutKeys(reusable, check.drop);
  }

  /**
   * Merge the incoming config onto the stored one and encrypt any secret the
   * caller supplied. Only the extension's config fields are kept. A field
   * absent from the input keeps its stored value, so a caller may send only
   * the fields it changed:
   *
   * | Input value      | Non-secret field | Secret field                   |
   * |------------------|------------------|--------------------------------|
   * | absent           | stored value     | stored ciphertext              |
   * | `""`             | cleared          | stored ciphertext ("leave blank to keep") |
   * | `null`           | cleared          | cleared                        |
   * | anything else    | the new value    | the new value, encrypted       |
   *
   * `existing` is the stored configuration after reusableConfiguration, so a
   * secret the stored-secret rule dropped is not carried over.
   */
  private static mergeAndEncrypt(
    input: Record<string, unknown>,
    existing: Record<string, unknown>,
    configFields: IExtensionConfigField[],
  ): Record<string, unknown> {
    const submitted = input ?? {};
    const merged: Record<string, unknown> = {};
    for (const field of configFields) {
      const k = field.field_key;
      const sent = Object.prototype.hasOwnProperty.call(submitted, k) && submitted[k] !== undefined;
      const value = sent ? submitted[k] : undefined;
      if (sent && value === null) continue;
      if (sent && field.is_secret && value !== "") {
        merged[k] = encrypt(String(value));
        continue;
      }
      if (sent && !field.is_secret) {
        if (value !== "") merged[k] = value;
        continue;
      }
      // Absent, or a blank secret: keep what is stored.
      if (isFilled(existing[k])) merged[k] = existing[k];
    }
    return merged;
  }

  /**
   * Validate a merged config payload against the extension's config field
   * schema. The merge already carries kept secrets over, so a required secret
   * the caller cleared (`null`) fails here as missing.
   */
  private static validate(
    configuration: Record<string, unknown>,
    configFields: IExtensionConfigField[],
  ): void {
    for (const field of configFields) {
      const value = configuration[field.field_key];
      const isPresent = isFilled(value);

      if (field.is_required && !isPresent) {
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
    if (!isEmail(value)) {
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
