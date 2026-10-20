/**
 * Defense-in-depth redaction for accidentally-logged secrets.
 * Applied to every file log message before it reaches the transport, and by
 * logEvent / getEventsQuery to event descriptions (event_logs and the audit
 * ledger).
 *
 * Three rules hold for every pattern here:
 * - Independent. Every pattern matches the original input and the union
 *   of their matches is redacted (redactPatterns), so no pattern can undo
 *   or narrow another by rewriting the text it reads.
 * - Linear time. This runs on every log line, so nothing may backtrack
 *   across a long run: token patterns only start at the beginning of a run
 *   (a lookbehind for the run's own characters), and JWTs and URL
 *   credentials are found per run or token with string scans, not a regex.
 * - Never fail open on length. No repetition that guards a secret is
 *   capped, so an over-long secret is still redacted in full.
 * redact.test.ts times pathological inputs and covers over-long secrets.
 */

// A sensitive key word. Matched on the word itself, whatever comes before
// it (client_secret, AWS_SECRET_ACCESS_KEY, a_b_c_d_e_f_password,
// dbPassword), so a long or unusual prefix cannot hide it; the prefix stays
// in the output. The word must end at a word boundary, which keeps
// "tokens", "max_tokens" and "token_count" out. Password keys also take a
// short list of suffixes (password_confirmation, password2, passwordHash);
// a list rather than any \w*, which would make every failed attempt rescan
// the word.
const KEY =
  "(?:(?:password|passwd|passphrase)(?:[_-]?(?:confirmation|confirm|repeat|current|old|new|hash|digest|\\d+))?|secret[_-]?key|private[_-]?key|access[_-]?key|api[_-]?key|apikey|secret|token)";

// A double- or single-quoted value, escape-aware, to the closing quote or
// the end of the input (an unterminated value is still redacted). Written
// as an unrolled loop (plain runs between escapes) rather than (a|b)*,
// which overflows V8's regex stack on multi-megabyte values. An escape is a
// backslash and any next character, newlines included.
const DOUBLE_QUOTED = String.raw`"[^"\\]*(?:\\[\s\S][^"\\]*)*"?`;
const SINGLE_QUOTED = String.raw`'[^'\\]*(?:\\[\s\S][^'\\]*)*'?`;
// An array or object value, to its first "]" or "}" (the innermost close,
// so every nested value before it is covered) or the end of the input.
const NESTED = String.raw`\[[^\]]*\]?|\{[^}]*\}?`;
// key: value, key=value and Perl/Ruby-style key => value.
const SEP = String.raw`\s*(?:=>|[:=])\s*`;

const KEY_VALUE = new RegExp(
  // The quoted forms are tried first; an unquoted value may contain "'".
  String.raw`(${KEY})\b${SEP}(?:${DOUBLE_QUOTED}|${SINGLE_QUOTED}|${NESTED}|[^\s&,"{}]+)`,
  "gi",
);
// A quoted key's value may also be nested, a number, true/false or null.
const JSON_DOUBLE = new RegExp(
  String.raw`(${KEY})"${SEP}(?:${DOUBLE_QUOTED}|${NESTED}|[^\s,}\]]+)`,
  "gi",
);
const JSON_SINGLE = new RegExp(
  String.raw`(${KEY})'${SEP}(?:${SINGLE_QUOTED}|${NESTED}|[^\s,}\]]+)`,
  "gi",
);
// JSON nested as an escaped string: {"msg":"{\"password\":\"x\"}"}, at
// any escape depth. The value runs to the end of the enclosing string (an
// unescaped quote), so a value with deeper escaped quotes is still covered.
const JSON_ESCAPED = new RegExp(
  String.raw`(${KEY})(\\+)"\s*:\s*\\+"[^"\\]*(?:\\[\s\S][^"\\]*)*`,
  "gi",
);

// Authorization header values in header, JSON, util.inspect and escaped
// JSON forms: everything after the key, a leading quote and a Bearer/Basic
// scheme word is redacted to the end of the line. One rule, fail closed: a
// value can hold quotes, escapes and spaces (Token token="x", Digest
// a=\"b\", Basic YWJj\/ZGVm), so no stop character inside the line is safe.
// Whitespace is allowed after the quote only (one \s* before it), so the
// pattern cannot backtrack between two whitespace runs.
const AUTHORIZATION =
  /(\bAuthorization(?:\\*["'])?\s*[:=]\s*(?:\\*["']\s*)?(?:(?:Bearer|Basic)\s+)?)[^\r\n]+/gi;

// A Bearer or Basic credential under any other key or none ({ auth:
// 'Bearer x1' }). It ends where the RFC 6750/7617 token alphabet ends, so
// stopping there cannot leak part of it. Backslashes count only before "/"
// (a JSON-escaped "\/" at any depth), never before a quote. The scheme and
// token are separated by non-newline whitespace (NBSP included). A token
// must contain a digit, "=" or a lower-to-upper case change, as base64 and
// opaque tokens do, which keeps prose such as "Basic authentication
// failed" readable.
//
// The scheme is found by a lookbehind, not consumed, so a token that runs
// into a later scheme word ("abcDef/Bearer x9") does not hide the
// credential after it: the next match still sees "Bearer " behind it. The
// leading (?=[...]) keeps the lookbehind to token starts, which is linear.
// The regex is case-sensitive so that [a-z][A-Z] is a real case change;
// the scheme words take any casing (RFC 7235) through per-letter classes.
const TOKEN_CHARS = "A-Za-z0-9._~+/=-";
const SCHEME_WORD = "(?:[Bb][Ee][Aa][Rr][Ee][Rr]|[Bb][Aa][Ss][Ii][Cc])";
const BEARER_TOKEN = new RegExp(
  String.raw`(?=[${TOKEN_CHARS}])(?<=\b${SCHEME_WORD}[^\S\r\n]+)()` +
    String.raw`(?=[A-Za-z._~+/=\\-]*(?:\d|[a-z][A-Z]|=))` +
    String.raw`[${TOKEN_CHARS}]+(?:\\+\/[${TOKEN_CHARS}]*)*`,
  "g",
);

// Fixed-prefix tokens. The empty group marks where the redacted span starts.
const SK_KEY = /(?<![A-Za-z0-9_])()sk-[A-Za-z0-9_-]{10,}/g; // a "-" may precede (x-sk-...)
const GITHUB_TOKEN =
  /(?<![A-Za-z0-9_])()(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})/g;
const VERCEL_KEY = /(?<![A-Za-z0-9_])()vck_[A-Za-z0-9_-]{10,}/g;

/** A region of the input to replace with `text`. */
interface Span {
  start: number;
  end: number;
  text: string;
}

/**
 * Adds a span per match of `re` on the input. Group 1 is the prefix that
 * stays (a key, a scheme word); the rest of the match is replaced.
 */
function addMatches(
  spans: Span[],
  input: string,
  re: RegExp,
  text: string | ((m: RegExpMatchArray) => string),
): void {
  for (const m of input.matchAll(re)) {
    const start = m.index! + m[1].length;
    const end = m.index! + m[0].length;
    if (end > start) spans.push({ start, end, text: typeof text === "string" ? text : text(m) });
  }
}

/**
 * Bare JWTs: header.payload.signature, both JSON parts base64url ("eyJ"),
 * the signature possibly empty (unsigned tokens). `run` is a maximal run of
 * [A-Za-z0-9_.-] starting at `offset`. A JWT starts at the start of a
 * "."-separated segment or right after a "-" (x-token-eyJ...), never after
 * a letter, digit or "_".
 *
 * Linear: each segment is scanned once for a start, and a match resumes
 * after the signature segment.
 */
function addJwtSpans(spans: Span[], run: string, offset: number): void {
  const segments = run.split(".");
  let pos = offset;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const start = jwtStart(seg);
    const payload = segments[i + 1];
    if (
      start !== -1 &&
      i + 2 < segments.length &&
      payload.length > 3 &&
      payload.startsWith("eyJ")
    ) {
      const end = pos + seg.length + 1 + payload.length + 1 + segments[i + 2].length;
      spans.push({ start: pos + start, end, text: "[REDACTED]" });
      pos = end + 1;
      i += 2; // header, payload and signature consumed
    } else {
      pos += seg.length + 1;
    }
  }
}

/** Index of the first JWT header start in `seg`, or -1. */
function jwtStart(seg: string): number {
  for (let p = seg.indexOf("eyJ"); p !== -1; p = seg.indexOf("eyJ", p + 1)) {
    if (p + 3 >= seg.length) return -1; // the header needs a character after "eyJ"
    if (p === 0 || seg[p - 1] === "-") return p;
  }
  return -1;
}

// A "/", "?" or "#" before the first ":" after "://" means that ":" is in
// a path or query, not in userinfo. A quote there means the ":" belongs to
// the surrounding JSON (e.g. {"a":"https://ok","b":"me@mail"}), which keeps
// plain URLs inside JSON lines unchanged. "@" is allowed: an ambiguous user
// part such as admin@srv over-redacts rather than leaking.
const NOT_IN_USER = /[/?#"']/;
const SCHEME_CHAR = /[A-Za-z0-9+.-]/;
/**
 * True when `token` has a port at `from`: one or more digits, then "/" or
 * the end of the token. A plain scan rather than a sticky regex, so it is
 * visibly linear.
 */
function isPortAt(token: string, from: number): boolean {
  let i = from;
  while (i < token.length && token[i] >= "0" && token[i] <= "9") i++;
  return i > from && (i === token.length || token[i] === "/");
}

/**
 * scheme://<user>:<password>@host inside one whitespace-separated token
 * starting at `offset`. One fail-closed rule: once a URL's userinfo ":" is
 * seen, the password runs to the LAST "@" in the token, whatever lies
 * between (quotes, brackets, "://", more URLs). With no "@" after it, the
 * password runs to the end of the token, unless what follows the ":" is a
 * port (digits, then "/" or the end). Over-redaction (host:port@path, a
 * second URL in the same token) is accepted; under-redaction is not. Keeps
 * scheme, user and whatever follows the last "@".
 *
 * Known gap: a password containing whitespace is split across tokens. In
 * the first token the password is redacted to the token's last "@" or its
 * end, or not at all when that part reads as a port (digits, then "/" or
 * the end); the parts in later tokens are not redacted. The "known gap"
 * cases in redact.test.ts pin today's output.
 *
 * Linear: "://" positions are visited in order, and each user part is
 * scanned only up to the next ":" (which is at or before the next "://").
 */
function addUrlCredentialSpans(spans: Span[], token: string, offset: number): void {
  const lastAt = token.lastIndexOf("@");
  let covered = 0;
  for (let sep = token.indexOf("://"); sep !== -1; sep = token.indexOf("://", sep + 3)) {
    if (sep < covered) continue; // inside a region already redacted
    if (sep === 0 || !SCHEME_CHAR.test(token[sep - 1])) continue;
    const start = sep + 3;
    const colon = token.indexOf(":", start);
    if (colon === -1) break; // no ":" left, so no userinfo and no later "://"
    if (NOT_IN_USER.test(token.slice(start, colon))) continue;
    if (lastAt > colon) {
      spans.push({ start: offset + colon + 1, end: offset + lastAt, text: "[REDACTED]" });
      covered = lastAt;
      continue;
    }
    if (isPortAt(token, colon + 1)) continue; // host:port with no "@" after it
    // An empty password ("scheme://u:" at the end of the token) has nothing
    // to redact.
    if (colon + 1 < token.length) {
      spans.push({ start: offset + colon + 1, end: offset + token.length, text: "[REDACTED]" });
    }
    break;
  }
}

/** Returned when the input could not be scanned: fail closed, never raw. */
export const UNSCANNABLE_PLACEHOLDER = "[REDACTED: message could not be scanned for secrets]";

/**
 * Redacts secrets from anything a log sink was given. Coercion to text
 * happens here, once, so every sink (file printf, logStructured, logEvent)
 * treats a non-string the same way; a value that cannot be coerced (a
 * null-prototype object) fails closed like an engine limit.
 */
export function redactSensitiveInfo(input: unknown): string {
  try {
    return redactPatterns(typeof input === "string" ? input : String(input));
  } catch {
    // A regex engine limit (e.g. stack size on a pathological multi-MB
    // input) must neither crash the logger nor let the raw text through.
    return UNSCANNABLE_PLACEHOLDER;
  }
}

/**
 * Every rule matches the ORIGINAL input and contributes spans; the union of
 * the spans is redacted. No rule sees another's output, so no rule can move
 * the quote or line boundaries another relies on, and a secret covered by
 * any rule is redacted whatever the others do. Overlapping spans merge, and
 * the earliest one's replacement text is kept.
 */
function redactPatterns(input: string): string {
  const spans: Span[] = [];
  addMatches(spans, input, SK_KEY, "[REDACTED]");
  addMatches(spans, input, GITHUB_TOKEN, "[REDACTED]");
  addMatches(spans, input, VERCEL_KEY, "[REDACTED]");
  addMatches(spans, input, AUTHORIZATION, "[REDACTED]");
  addMatches(spans, input, BEARER_TOKEN, "[REDACTED]");
  // Bare JWTs and URL credentials are scanned per run or token, and only on
  // lines that can contain them.
  if (input.includes("eyJ")) {
    for (const m of input.matchAll(/[A-Za-z0-9_.-]+/g)) {
      if (m[0].includes("eyJ")) addJwtSpans(spans, m[0], m.index!);
    }
  }
  if (input.includes("://")) {
    for (const m of input.matchAll(/\S+/g)) {
      if (m[0].includes("://")) addUrlCredentialSpans(spans, m[0], m.index!);
    }
  }
  // key=value or key: value style sensitive fields
  addMatches(spans, input, KEY_VALUE, "=[REDACTED]");
  // JSON double- and single-quoted sensitive fields
  addMatches(spans, input, JSON_DOUBLE, '":"[REDACTED]"');
  addMatches(spans, input, JSON_SINGLE, "':'[REDACTED]'");
  // JSON nested as an escaped string, keeping its escape depth
  addMatches(spans, input, JSON_ESCAPED, (m) => `${m[2]}":${m[2]}"[REDACTED]${m[2]}"`);
  return applySpans(input, spans);
}

function applySpans(input: string, spans: Span[]): string {
  if (spans.length === 0) return input;
  spans.sort((a, b) => a.start - b.start || b.end - a.end);
  let out = "";
  let copied = 0;
  let current = spans[0];
  for (let i = 1; i <= spans.length; i++) {
    const next = spans[i];
    if (next && next.start < current.end) {
      current = { ...current, end: Math.max(current.end, next.end) };
      continue;
    }
    out += input.slice(copied, current.start) + current.text;
    copied = current.end;
    if (next) current = next;
  }
  return out + input.slice(copied);
}

/** Row columns that can carry logged text (error messages, field values). */
const ROW_TEXT_FIELDS = ["description", "old_value", "new_value"] as const;

/**
 * Redacts the text columns of an event_logs or audit_ledger row on read.
 * Rows written before write-time redaction may hold raw secrets, and the
 * ledger is hash-chained, so they cannot be rewritten. Non-string and
 * missing columns are left as they are. The ledger's verifyChain and its
 * CSV export read the stored text, so their hashes still verify.
 */
export function redactRowText<T extends object>(row: T): T {
  const out = { ...row } as Record<string, unknown>;
  for (const field of ROW_TEXT_FIELDS) {
    if (typeof out[field] === "string") out[field] = redactSensitiveInfo(out[field]);
  }
  return out as T;
}
