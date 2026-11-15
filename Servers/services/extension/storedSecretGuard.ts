import { assertSafeOutboundUrl } from "../../utils/safeOutboundUrl";

/**
 * A stored secret is never sent to a new address.
 *
 * Secret fields are write-only: an Admin who leaves one blank keeps the stored
 * value. Without this guard, someone who does not know a stored MLflow token,
 * Azure key or Jira Assets token could type only a new URL (or user name),
 * press Test connection or Save, and the server would send the stored secret
 * to that new host.
 *
 * Rule: when a field that decides where a secret goes (address: URL, endpoint,
 * base URL; identity: user name, email; for Jira Assets also the workspace and
 * deployment type) differs from the stored value and no new secret is
 * submitted, the stored secret is not used. Test connection answers a failed
 * result and a save answers 400, both with "Enter the <secret> again: the
 * <field> changed." Unchanged fields keep the stored secret, as before.
 * A stale secret the next configuration would not send anyway (MLflow's
 * password under token auth, say) is dropped instead of blocking.
 *
 * Jira incidents follows the same rule in its own config module
 * (`extensions/jira-incidents/jiraIncidents.config.ts`, TOKEN_AGAIN).
 */

/**
 * Every refusal, as a lookup map: the i18n scanner sees each message, so the
 * extensions save path (ValidationException → translateError) answers in the
 * user's language. Test-connection results stay English like every other
 * test result.
 */
export const STORED_SECRET_MESSAGES = {
  mlflowPasswordUrl: "Enter the password again: the tracking server URL changed.",
  mlflowPasswordUsername: "Enter the password again: the username changed.",
  mlflowTokenUrl: "Enter the API token again: the tracking server URL changed.",
  azureKeyEndpoint: "Enter the API key again: the project endpoint changed.",
  jiraTokenBaseUrl: "Enter the API token again: the Jira base URL changed.",
  jiraTokenWorkspace: "Enter the API token again: the workspace ID changed.",
  jiraTokenEmail: "Enter the API token again: the email changed.",
  jiraTokenDeploymentType: "Enter the API token again: the deployment type changed.",
} as const;

export type StoredSecretMessage = keyof typeof STORED_SECRET_MESSAGES;

interface Trigger {
  key: string;
  /** Compare as a URL: normalized through assertSafeOutboundUrl, so a trailing slash is no change. */
  url?: boolean;
  /** Value the extension uses when the field is empty (Jira Assets deployment type). */
  fallback?: string;
  /** The refusal when this field changed. */
  message: StoredSecretMessage;
}

interface GuardedSecret {
  key: string;
  triggers: Trigger[];
  /** Whether the next configuration would send this secret; default always. */
  inUse?: (next: Record<string, unknown>) => boolean;
}

/**
 * Per extension: each secret field and the fields whose change invalidates it.
 * Field keys come from the catalog seed (`database/migrations/
 * 20260811102307-extensions-migration.js`, `extension_config_fields`) for
 * MLflow and Azure, and from `jira_assets_config` for Jira Assets. Kept
 * explicit rather than guessed from field names or types.
 */
export const STORED_SECRET_FIELDS: Record<string, GuardedSecret[]> = {
  mlflow: [
    {
      // Basic auth sends username + password.
      key: "password",
      inUse: (next) => next.auth_method === "basic",
      triggers: [
        {
          key: "tracking_server_url",
          url: true,
          message: "mlflowPasswordUrl",
        },
        { key: "username", message: "mlflowPasswordUsername" },
      ],
    },
    {
      // Token auth sends the bearer token only; the username is not part of it.
      key: "api_token",
      inUse: (next) => next.auth_method === "token",
      triggers: [
        {
          key: "tracking_server_url",
          url: true,
          message: "mlflowTokenUrl",
        },
      ],
    },
  ],
  // subscription_id, resource_group and resource_name are labels only; every
  // call goes to the project endpoint.
  "azure-ai-foundry": [
    {
      key: "api_key",
      triggers: [
        {
          key: "project_endpoint",
          url: true,
          message: "azureKeyEndpoint",
        },
      ],
    },
  ],
  "jira-assets": [
    {
      key: "api_token",
      triggers: [
        {
          key: "jira_base_url",
          url: true,
          message: "jiraTokenBaseUrl",
        },
        {
          key: "workspace_id",
          message: "jiraTokenWorkspace",
        },
        { key: "email", message: "jiraTokenEmail" },
        {
          key: "deployment_type",
          fallback: "cloud",
          message: "jiraTokenDeploymentType",
        },
      ],
    },
  ],
};

const isFilled = (v: unknown): boolean => v !== undefined && v !== null && v !== "";

function normalize(value: unknown, trigger: Trigger): string {
  const raw = isFilled(value) ? String(value).trim() : (trigger.fallback ?? "");
  if (!trigger.url || raw === "") return raw;
  try {
    return assertSafeOutboundUrl(raw);
  } catch {
    // An unusable URL still counts as a change when it differs; the caller's
    // own URL check reports what is wrong with it.
    return raw;
  }
}

export interface StoredSecretCheck {
  /**
   * Set when a stored secret would be sent to a changed address: refuse with
   * STORED_SECRET_MESSAGES[blocked].
   */
  blocked: StoredSecretMessage | null;
  /** Stale stored secrets the next configuration would not send: drop them. */
  drop: string[];
}

/**
 * @param key        extension key
 * @param stored     the stored configuration (null when none); only whether a
 *                   secret is present is read, so encrypted values are fine
 * @param next       the configuration that would be used (non-secret values)
 * @param submitted  what the caller sent; a filled secret here is a new secret
 */
export function checkStoredSecrets(
  key: string,
  stored: Record<string, unknown> | null | undefined,
  next: Record<string, unknown>,
  submitted: Record<string, unknown>,
): StoredSecretCheck {
  const result: StoredSecretCheck = { blocked: null, drop: [] };
  if (!stored) return result;
  for (const secret of STORED_SECRET_FIELDS[key] ?? []) {
    if (!isFilled(stored[secret.key]) || isFilled(submitted[secret.key])) continue;
    const changed = secret.triggers.find(
      (t) => normalize(stored[t.key], t) !== normalize(next[t.key], t),
    );
    if (!changed) continue;
    if (secret.inUse && !secret.inUse(next)) {
      result.drop.push(secret.key);
    } else if (!result.blocked) {
      result.blocked = changed.message;
    }
  }
  return result;
}

/** A copy of `config` without the given keys. */
export function withoutKeys(
  config: Record<string, unknown>,
  keys: string[],
): Record<string, unknown> {
  if (keys.length === 0) return config;
  const out = { ...config };
  for (const k of keys) delete out[k];
  return out;
}
