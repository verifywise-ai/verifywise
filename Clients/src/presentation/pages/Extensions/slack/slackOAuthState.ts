/**
 * Slack OAuth helpers for the "Add to Slack" round trip.
 *
 * Before leaving for Slack the page stores a random `state` in sessionStorage
 * and sends it with the authorize request. Slack sends it back with the
 * authorization `code` to /extensions/slack/settings, and the page only
 * exchanges the code when the returned state matches the stored one. The
 * stored value is removed on every check, so a state works once.
 */

export const SLACK_OAUTH_STATE_KEY = "vw.slack.oauthState";

/** Path Slack returns to. The server builds the same redirect URI from FRONTEND_URL. */
export const SLACK_REDIRECT_PATH = "/extensions/slack/settings";

const SLACK_SCOPE = "incoming-webhook,chat:write";

function safeStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

/** 32 random bytes as hex. */
export function generateSlackOAuthState(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Creates a state, stores it for the return trip and returns it; null when storage is unavailable. */
export function createSlackOAuthState(storage: Storage | null = safeStorage()): string | null {
  if (!storage) return null;
  const state = generateSlackOAuthState();
  try {
    storage.setItem(SLACK_OAUTH_STATE_KEY, state);
  } catch {
    return null;
  }
  return state;
}

/**
 * Whether `received` matches the stored state. The stored state is removed
 * either way, so a second check with the same value fails.
 */
export function consumeSlackOAuthState(
  received: string | null,
  storage: Storage | null = safeStorage(),
): boolean {
  if (!storage) return false;
  let stored: string | null;
  try {
    stored = storage.getItem(SLACK_OAUTH_STATE_KEY);
    storage.removeItem(SLACK_OAUTH_STATE_KEY);
  } catch {
    return false;
  }
  return Boolean(stored) && Boolean(received) && stored === received;
}

export type SlackOAuthReturn =
  | { kind: "none" }
  | { kind: "code"; code: string; state: string | null }
  | { kind: "error"; error: string };

/** Reads what Slack put in the query string of the return URL. */
export function readSlackOAuthReturn(search: string): SlackOAuthReturn {
  const params = new URLSearchParams(search);
  const error = params.get("error");
  if (error) return { kind: "error", error };
  const code = params.get("code");
  if (code) return { kind: "code", code, state: params.get("state") };
  return { kind: "none" };
}

/** The Slack authorize URL for a same-tab redirect. */
export function buildSlackAuthorizeUrl({
  baseUrl,
  clientId,
  origin,
  state,
}: {
  baseUrl: string;
  clientId: string;
  origin: string;
  state: string;
}): string {
  const params = new URLSearchParams({
    client_id: clientId,
    scope: SLACK_SCOPE,
    redirect_uri: `${origin}${SLACK_REDIRECT_PATH}`,
    state,
  });
  return `${baseUrl}?${params}`;
}
