// Servers/utils/aiTrustIndexHash.ts
import { createHash } from "crypto";
import { ITrustIndexAppData } from "../domain.layer/interfaces/i.aiTrustIndex";

/** Recursively sort object keys and unordered arrays so the hash is order-independent. */
export function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    const items = value.map(canonicalize);
    // Sort by stable JSON of each item so element order never affects the hash.
    return items
      .map((v) => ({ v, k: JSON.stringify(v) }))
      .sort((a, b) => (a.k < b.k ? -1 : a.k > b.k ? 1 : 0))
      .map((x) => x.v);
  }
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) out[key] = canonicalize(obj[key]);
    return out;
  }
  return value;
}

/** Strip query string and fragment from a URL; return original on parse failure. */
function stripUrlNoise(url: string): string {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`;
  } catch {
    return url;
  }
}

function sha256(input: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(input)))
    .digest("hex");
}

export function computeHashes(app: ITrustIndexAppData): {
  materialHash: string;
  fullHash: string;
} {
  const material = {
    scoreOutOf100: app.scoreOutOf100,
    letterGrade: app.letterGrade,
    displayedGrade: app.displayedGrade,
    dealbreakerFlags: app.dealbreakerFlags ?? [],
    policyLastUpdated: app.policyLastUpdated ?? null,
    processesBiometrics: app.processesBiometrics,
  };
  // Full = everything that renders/stores, minus volatile/derived fields, with policyUrl
  // noise stripped. Excluded:
  //  - iconUrl: derived from domain (cosmetic).
  //  - history (feedVersion 2+): a per-app object with volatile timestamps
  //    (lastChecked updates on every re-check even with no real change), so including
  //    it would churn last_changed_at every week. Not part of the current-state snapshot.
  const {
    iconUrl: _iconUrl,
    history: _history,
    ...rest
  } = app as ITrustIndexAppData & {
    history?: unknown;
  };
  const full = {
    ...rest,
    // Normalize slug the same way it's normalized for the DB key, so a feed
    // changing only slug casing/whitespace (same app) doesn't churn the hash
    // and fire a spurious "changed" notification.
    slug: String(app.slug ?? "")
      .trim()
      .toLowerCase(),
    policyUrl: app.policyUrl == null ? null : stripUrlNoise(app.policyUrl),
  };
  return { materialHash: sha256(material), fullHash: sha256(full) };
}
