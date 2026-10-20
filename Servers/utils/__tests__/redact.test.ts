import { describe, it, expect, jest } from "@jest/globals";
import { redactRowText, redactSensitiveInfo, UNSCANNABLE_PLACEHOLDER } from "../logger/redact";

describe("redactSensitiveInfo", () => {
  it.each([
    // Existing coverage, unchanged.
    ["OpenAI-style key", "key sk-abcdefghijklmnop1234 rejected", "key [REDACTED] rejected"],
    [
      "Authorization Bearer",
      "Authorization: Bearer abc.def.ghi failed",
      "Authorization: Bearer [REDACTED]",
    ],
    ["password=", "login password=hunter2 refused", "login password=[REDACTED] refused"],
    ["quoted password=", "login password='hunter2' refused", "login password=[REDACTED] refused"],
    ["camelCase accessToken", "accessToken: abc123 expired", "accessToken=[REDACTED] expired"],
    [
      'JSON "password"',
      '{"password":"hunter2","user":"a"}',
      '{"password":"[REDACTED]","user":"a"}',
    ],
    // snake_case and prefixed keys
    ["client_secret", "client_secret=abc123 is wrong", "client_secret=[REDACTED] is wrong"],
    ["access_token", "access_token: xyz789 expired", "access_token=[REDACTED] expired"],
    ["refresh_token", "refresh_token=r-1 revoked", "refresh_token=[REDACTED] revoked"],
    ["db_password", "db_password=pa55 bad", "db_password=[REDACTED] bad"],
    [
      'JSON "refresh_token"',
      '{"refresh_token":"r-1","ok":false}',
      '{"refresh_token":"[REDACTED]","ok":false}',
    ],
    ['JSON "client_secret"', "{'client_secret': 'abc'}", "{'client_secret':'[REDACTED]'}"],
    // headers
    ["x-api-key header", "x-api-key: abcdef123456 denied", "x-api-key=[REDACTED] denied"],
    // URL credentials keep scheme, user and host
    [
      "URL credentials",
      "connect postgres://admin:s3cr3t@db.internal:5432/vw failed",
      "connect postgres://admin:[REDACTED]@db.internal:5432/vw failed",
    ],
    // bare tokens
    [
      "bare JWT",
      "token eyJhbGciOiJIUzI1NiJ9.eyJpZCI6MX0.c2lnbmF0dXJlLXZhbHVl was invalid",
      "token [REDACTED] was invalid",
    ],
    [
      "GitHub classic token",
      "push with ghp_abcdefghijklmnopqrstuvwxyz0123 failed",
      "push with [REDACTED] failed",
    ],
    [
      "GitHub fine-grained token",
      "use github_pat_11ABCDEFG0123456789_abcdefghijklmnop now",
      "use [REDACTED] now",
    ],
    [
      "Vercel gateway key",
      "gateway key vck_abcdefghij1234567890 rejected",
      "gateway key [REDACTED] rejected",
    ],
    // suffixed key names
    [
      "AWS_SECRET_ACCESS_KEY",
      "AWS_SECRET_ACCESS_KEY=abc set",
      "AWS_SECRET_ACCESS_KEY=[REDACTED] set",
    ],
    ["secret_key", "secret_key=abc set", "secret_key=[REDACTED] set"],
    ["private_key", "private_key=abc set", "private_key=[REDACTED] set"],
    ["passphrase", "passphrase=hunter2 set", "passphrase=[REDACTED] set"],
    // URL credentials, harder shapes
    [
      "password-only URL",
      "redis://:s3cr3tpw@localhost:6379 refused",
      "redis://:[REDACTED]@localhost:6379 refused",
    ],
    [
      "password with /",
      "postgres://user:ab/cd+ef@db:5432/x refused",
      "postgres://user:[REDACTED]@db:5432/x refused",
    ],
    [
      "password with @",
      "postgres://user:p@ss@db/x refused",
      "postgres://user:[REDACTED]@db/x refused",
    ],
    // host:port@ is indistinguishable from user:password@, so it is redacted.
    ["host:port@ (safe side)", "http://host:8080@foo", "http://host:[REDACTED]@foo"],
    // unsigned JWT
    ["JWT with empty signature", "got eyJhbGc.eyJzdWI. back", "got [REDACTED] back"],
    // scheme chains: the scheme may follow ":" or "/"
    [
      "jdbc:postgresql URL",
      "connect jdbc:postgresql://u:p@h:5432/db failed",
      "connect jdbc:postgresql://u:[REDACTED]@h:5432/db failed",
    ],
    ["URL: prefix", "URL:postgres://u:p@h", "URL:postgres://u:[REDACTED]@h"],
    [
      "env-style URL",
      "DATABASE_URL=postgres://u:p@h/db",
      "DATABASE_URL=postgres://u:[REDACTED]@h/db",
    ],
    // several URLs in one token
    [
      "credentialed URL after a plain one in one JSON token",
      '{"a":"https://ok.example","b":"postgres://u:pw@db/x"}',
      '{"a":"https://ok.example","b":"postgres://u:[REDACTED]@db/x"}',
    ],
    [
      "two credentialed URLs in one token",
      "postgres://u:p1@a,redis://:p2@b",
      // One rule: the password runs to the last "@" (over-redaction accepted).
      "postgres://u:[REDACTED]@b",
    ],
    // host:port then "@" in the path is indistinguishable too (safe side).
    ["port then @ in the path (safe side)", "http://host:8080/a@b", "http://host:[REDACTED]@b"],
    // A port ends only at "/" or the end of the token. Anything else after
    // the digits is read as a password: token-level rules that let quotes
    // or punctuation end a port could not tell JSON structure from a
    // password containing the same characters, and leaked.
    ["digits then a quote", 'x "postgres://u:1234"secret y', 'x "postgres://u:[REDACTED] y'],
    ["digits then #", "x postgres://u:2024#Pass y", "x postgres://u:[REDACTED] y"],
    ["digits then !", "x postgres://admin:2024! y", "x postgres://admin:[REDACTED] y"],
    [
      "digits then a closer and more",
      "x (postgres://admin:1234).RealPass y",
      "x (postgres://admin:[REDACTED] y",
    ],
    [
      "quote, comma, quote in a password",
      'x "postgres://u:1234","hunter2 y',
      'x "postgres://u:[REDACTED] y',
    ],
    [
      "stringified quote and comma in a password",
      JSON.stringify({ dsn: 'postgres://u:1234","hunter2' }),
      '{"dsn":"postgres://u:[REDACTED]',
    ],
    // Accepted over-redaction (fail closed): a host:port followed by a quote,
    // query, fragment or punctuation loses the rest of its token, which in a
    // compact JSON line is the rest of the line.
    [
      "port inside a JSON value (safe side)",
      JSON.stringify({ target: "http://localhost:8000", status: 502 }),
      '{"target":"http://localhost:[REDACTED]',
    ],
    [
      "port then a query (safe side)",
      "GET http://localhost:3000?x=1",
      "GET http://localhost:[REDACTED]",
    ],
    [
      "port then a period (safe side)",
      "Listening on http://localhost:3000.",
      "Listening on http://localhost:[REDACTED]",
    ],
    // passwords containing characters that used to end the URL early
    ["password with {", "postgres://u:ab{cd@h/db", "postgres://u:[REDACTED]@h/db"],
    ['password with "', 'postgres://u:ab"cd@h/db', "postgres://u:[REDACTED]@h/db"],
    ["password with ]", "postgres://u:ab]cd@h/db", "postgres://u:[REDACTED]@h/db"],
    ["password with ://", "postgres://u:pa://ss@h/db", "postgres://u:[REDACTED]@h/db"],
    // "@" in the user part
    [
      "user part containing @",
      "postgres://admin@srv:secret@host/db",
      "postgres://admin@srv:[REDACTED]@host/db",
    ],
    // no "@" after the userinfo ":" (fail closed)
    ["password with no @", "postgres://u:secretpw", "postgres://u:[REDACTED]"],
    [
      "password with no @ in JSON",
      '{"db":"postgres://u:secretpw"}',
      '{"db":"postgres://u:[REDACTED]',
    ],
    // apostrophe inside an unquoted value
    ["unquoted value with an apostrophe", "password=abc'def set", "password=[REDACTED] set"],
    // key names are found whatever precedes them
    [
      "six prefix segments",
      "a_b_c_d_e_f_password=hunter2 set",
      "a_b_c_d_e_f_password=[REDACTED] set",
    ],
    ["camelCase prefix", "dbPassword=hunter2 set", "dbPassword=[REDACTED] set"],
    // quoted, spaced and unterminated values
    ["quoted value with spaces", 'password="two words" set', "password=[REDACTED] set"],
    ["wide whitespace", `password=${" ".repeat(20)}hunter2 set`, "password=[REDACTED] set"],
    ["unterminated JSON value", '{"password":"hunter2', '{"password":"[REDACTED]"'],
    [
      "JSON value with escaped quote",
      '{"password":"a\\"b","ok":1}',
      '{"password":"[REDACTED]","ok":1}',
    ],
    // key prefixes and JWTs right after "-" (header names, env-style keys)
    ["sk- key after -", "x-sk-abcdefghijklmnop1234 sent", "x-[REDACTED] sent"],
    ["vck_ key after -", "api-vck_abcdefghij1234567890 sent", "api-[REDACTED] sent"],
    ["JWT after -", "key-eyJhbGciOiJIUzI1NiJ9.eyJpZCI6MX0.c2ln sent", "key-[REDACTED] sent"],
    ["JWT after .", "a.eyJhbGc.eyJzdWI.sig b", "a.[REDACTED] b"],
    // Authorization headers in JSON, util.inspect and escaped forms, and Basic
    [
      "JSON authorization header",
      '{"authorization":"Bearer abc.def","ok":1}',
      '{"authorization":"Bearer [REDACTED]',
    ],
    [
      "util.inspect Authorization header",
      "{ Authorization: 'Bearer abc.def' }",
      "{ Authorization: 'Bearer [REDACTED]",
    ],
    [
      "Basic credentials",
      "Authorization: Basic dXNlcjpwYXNz= failed",
      "Authorization: Basic [REDACTED]",
    ],
    [
      "JSON Basic credentials",
      '{"Authorization":"Basic dXNlcjpwYXNz"}',
      '{"Authorization":"Basic [REDACTED]',
    ],
    [
      "escaped JSON authorization header",
      '{"h":"{\\"authorization\\":\\"Bearer abc\\"}"}',
      '{"h":"{\\"authorization\\":\\"Bearer [REDACTED]',
    ],
    // JSON nested as an escaped string: the value runs to the end of the
    // enclosing string (fail closed)
    [
      "escaped nested JSON",
      '{"msg":"{\\"password\\":\\"hunter2\\"}"}',
      '{"msg":"{\\"password\\":\\"[REDACTED]\\""}',
    ],
    [
      "double-escaped nested JSON",
      '{"a":"{\\\\\\"token\\\\\\":\\\\\\"t0k\\\\\\"}"}',
      '{"a":"{\\\\\\"token\\\\\\":\\\\\\"[REDACTED]\\\\\\""}',
    ],
    // a backslash before a real newline does not end the quoted value
    ['quoted value with "\\" + newline', 'password="ab\\\ncd" set', "password=[REDACTED] set"],
    ['JSON value with "\\" + newline', '{"password":"ab\\\ncd"}', '{"password":"[REDACTED]"}'],
    // "=>" separators
    ["=> separator", "password => abc set", "password=[REDACTED] set"],
    ['quoted "=>" separator', '{"password"=>"x", "a"=>1}', '{"password":"[REDACTED]", "a"=>1}'],
    // suffixed password keys
    [
      "password_confirmation",
      "password_confirmation=hunter2 set",
      "password_confirmation=[REDACTED] set",
    ],
    ["password2", "password2=hunter2 set", "password2=[REDACTED] set"],
    [
      'JSON "password_confirmation"',
      '{"password_confirmation":"x","ok":1}',
      '{"password_confirmation":"[REDACTED]","ok":1}',
    ],
    // array and non-string values
    ["JSON array value", '{"password": ["x", "y"],"ok":1}', '{"password":"[REDACTED]","ok":1}'],
    ["inspect array value", "{ password: [ 'x' ] }", "{ password=[REDACTED] }"],
    ["JSON numeric value", '{"token":123456,"ok":1}', '{"token":"[REDACTED]","ok":1}'],
    // review round 5: other Authorization schemes, object values, hash keys
    [
      "Authorization with another scheme",
      "Authorization: Token abc123secret",
      "Authorization: [REDACTED]",
    ],
    [
      "JSON Authorization with another scheme",
      '{"authorization":"Token abc123","ok":1}',
      '{"authorization":"[REDACTED]',
    ],
    [
      "Digest Authorization",
      'Authorization: Digest username="u", response="deadbeef"',
      "Authorization: [REDACTED]",
    ],
    ['"Bearer:" Authorization', "Authorization: Bearer: abc", "Authorization: [REDACTED]"],
    [
      "JSON object value",
      '{"secret": { "value": "abc" },"ok":1}',
      '{"secret":"[REDACTED]","ok":1}',
    ],
    ["inspect object value", "{ secret: { value: 'abc' } }", "{ secret=[REDACTED] }"],
    // quoted values run to the end of the line: inner quotes, escapes, spaces
    [
      "inspect Token with an inner quoted token",
      `{ authorization: 'Token token="abc123"' }`,
      "{ authorization: '[REDACTED]",
    ],
    [
      "JSON Digest with escaped quotes",
      '{"Authorization":"Digest username=\\"u\\", response=\\"deadbeef\\""}',
      '{"Authorization":"[REDACTED]',
    ],
    [
      "quoted Bearer with a space",
      '{"authorization":"Bearer abc def"}',
      '{"authorization":"Bearer [REDACTED]',
    ],
    [
      "quoted Basic with an escaped /",
      '{"authorization":"Basic YWJj\\/ZGVm"}',
      '{"authorization":"Basic [REDACTED]',
    ],
    // Authorization runs to the end of the line, quoted or not
    [
      "unquoted Basic with a quote",
      "Authorization: Basic dXNl'cjpw",
      "Authorization: Basic [REDACTED]",
    ],
    [
      "unquoted Bearer with a backslash",
      "Authorization: Bearer abc\\def",
      "Authorization: Bearer [REDACTED]",
    ],
    [
      "quoted value starting with a newline",
      '{"authorization":"\nBearer abc"}',
      '{"authorization":"\nBearer [REDACTED]',
    ],
    [
      "only the line is redacted",
      "Authorization: Token x\nnext line",
      "Authorization: [REDACTED]\nnext line",
    ],
    // Bearer/Basic credentials under other keys or none
    ["auth key", "headers: { auth: 'Bearer opaque123' }", "headers: { auth: 'Bearer [REDACTED]' }"],
    ["authHeader key", '{"authHeader":"Bearer opaque123"}', '{"authHeader":"Bearer [REDACTED]"}'],
    [
      "bare Bearer token",
      "retrying with Bearer abc123def now",
      "retrying with Bearer [REDACTED] now",
    ],
    [
      "bare Basic token with an escaped /",
      '{"msg":"sent Basic YWJj1\\/ZGVm"}',
      '{"msg":"sent Basic [REDACTED]"}',
    ],
    // the Bearer/Authorization passes must not move the boundaries of an
    // enclosing secret value
    [
      "Bearer inside an escaped-quoted secret",
      '{"client_secret":"pre \\"Bearer ab1\\" REALSECRET"}',
      '{"client_secret":"[REDACTED]"}',
    ],
    [
      "Basic inside escaped JSON in a secret",
      '{"secret":"{\\"auth\\":\\"Basic dXNlcjE6cGFzcw==\\",\\"pw\\":\\"hunter2\\"}"}',
      '{"secret":"[REDACTED]"}',
    ],
    [
      "Bearer before an escaped apostrophe in a secret",
      "secret: 'see Bearer a1\\' still secret'",
      "secret=[REDACTED]",
    ],
    [
      "Authorization inside a quoted secret, then a token on the next line",
      'password="pw Authorization: Bearer x1"\nnote token: "abc"',
      "password=[REDACTED]\nnote token=[REDACTED]",
    ],
    [
      "escaped quote after a bare Bearer token stays escaped",
      '{"msg":"header \\"Bearer abc1\\" sent"}',
      '{"msg":"header \\"Bearer [REDACTED]\\" sent"}',
    ],
    // review: every rule sees the original input (span union)
    ["unquoted Bearer under a key", "token=Bearer abc1", "token=[REDACTED] [REDACTED]"],
    ["X-Auth-Token header", "X-Auth-Token: Bearer abc123", "X-Auth-Token=[REDACTED] [REDACTED]"],
    [
      "Authorization after ;",
      "token=x;Authorization: Basic dXNlcjpwYXNz",
      "token=[REDACTED] Basic [REDACTED]",
    ],
    [
      "Authorization inside a quoted secret with inner quotes",
      'secret="Authorization: Token token="abc123", realm=x"',
      "secret=[REDACTED]",
    ],
    [
      "Authorization inside a bracketed secret",
      "password: [Authorization: Digest a=[x] RESTCRED]",
      "password=[REDACTED]",
    ],
    ["depth-2 escaped / in a Basic token", "auth: Basic YWJj1\\\\/ZGVm", "auth: Basic [REDACTED]"],
    ["NBSP before a Bearer token", "auth: Bearer abc1", "auth: Bearer [REDACTED]"],
    ["bare Basic without digits", "sent Basic dXNlcjpwYXNz", "sent Basic [REDACTED]"],
    // a Bearer/Basic token running into a later scheme word
    ["token then another scheme", "Basic abcDef/Bearer xyz9secret", "Basic [REDACTED] [REDACTED]"],
    [
      "token with = then another scheme",
      "auth: Basic dXNlcg==.Bearer abc123secret",
      "auth: Basic [REDACTED] [REDACTED]",
    ],
    [
      "NBSP token then another scheme",
      "Bearer\u00a0x1/Bearer realSecret9",
      "Bearer\u00a0[REDACTED] [REDACTED]",
    ],
    // scheme words in any casing
    ["mixed-case Bearer", "auth BeArEr abc123", "auth BeArEr [REDACTED]"],
    ["mixed-case Basic", "auth bASIC abc123", "auth bASIC [REDACTED]"],
    ["empty URL password next to a key", "token=http://u:", "token=[REDACTED]"],
    ["password_hash", "password_hash=abc set", "password_hash=[REDACTED] set"],
    ["passwordHash", "passwordHash: abc set", "passwordHash=[REDACTED] set"],
    ["password_digest", "password_digest=abc set", "password_digest=[REDACTED] set"],
    ["single-quoted numeric value", "{'token': 123456}", "{'token':'[REDACTED]'}"],
  ])("redacts %s", (_label, input, expected) => {
    expect(redactSensitiveInfo(input)).toBe(expected);
  });

  it.each([
    "Created vendor Acme",
    "token budget exceeded for this month",
    "max_tokens=4096 was applied",
    "token_count=12 recorded",
    "Risk 42 updated by user 7",
    "Failed to update risk: risk not found (id=42)",
    "Visit https://verifywise.ai/docs for help",
    "Secret santa planning task created",
    "Fetched http://host:8080/path ok",
    "Listening on http://localhost:3000",
    "Cloning git@github.com:org/repo.git",
    "ssh://git@github.com:22/org/repo.git",
    '{"url":"http://host:8080/x"}',
    "Profile https://example.com/@user linked",
    '{"u":"https://example.com/users/@me","n":1}',
    '{"a":"https://ok.example","b":"me@mail.example"}',
    "Request 3f2b9c1e-1234-4abc-8def-0123456789ab completed",
    "Authorization failed for user 7",
    "passwordless login enabled",
    "risk-sk-low updated",
    "Basic authentication failed",
    "Bearer token expired for user 7",
    "Bearer\n2 users",
  ])("leaves %j unchanged", (input) => {
    expect(redactSensitiveInfo(input)).toBe(input);
  });

  // Never fail open on length: over-long secrets are redacted in full.
  it.each([
    [
      "a 10KB JWT",
      `eyJ${"a".repeat(3400)}.eyJ${"b".repeat(3400)}.${"c".repeat(3400)}`,
      "[REDACTED]",
    ],
    [
      "a JWT whose segments exceed 8KB",
      `eyJ${"a".repeat(9000)}.eyJ${"b".repeat(9000)}.${"c".repeat(9000)}`,
      "[REDACTED]",
    ],
    [
      "a 10KB JSON secret value",
      `{"password":"${"s".repeat(10_000)}"}`,
      '{"password":"[REDACTED]"}',
    ],
    ["a 1KB URL password", `postgres://u:${"p".repeat(1024)}@db/x`, "postgres://u:[REDACTED]@db/x"],
    ["a 10KB key=value secret", `token=${"t".repeat(10_000)} end`, "token=[REDACTED] end"],
  ])("redacts %s in full", (_label, input, expected) => {
    expect(redactSensitiveInfo(input)).toBe(expected);
  });

  // Every sink passes whatever it was given, so coercion to text happens
  // here, once, and a value that cannot be coerced fails closed too.
  it.each([
    ["a number", 42, "42"],
    ["null", null, "null"],
    [
      "an object with a secret in toString",
      { toString: () => "password=x set" },
      "password=[REDACTED] set",
    ],
  ])("coerces %s to redacted text", (_label, input, expected) => {
    expect(redactSensitiveInfo(input)).toBe(expected);
  });

  it.each([
    ["a null-prototype object", Object.create(null)],
    [
      "an engine limit while scanning",
      {
        toString() {
          throw new RangeError("Maximum call stack size exceeded");
        },
      },
    ],
  ])("fails closed on %s", (_label, input) => {
    expect(redactSensitiveInfo(input)).toBe(UNSCANNABLE_PLACEHOLDER);
  });

  it("fails closed when a pattern throws while scanning", () => {
    const matchAll = jest.spyOn(String.prototype, "matchAll").mockImplementation(() => {
      throw new RangeError("Maximum call stack size exceeded");
    });
    let result: string;
    try {
      result = redactSensitiveInfo("password=hunter2");
    } finally {
      matchAll.mockRestore();
    }
    // Asserted after the restore, so Jest's failure message runs unpatched.
    expect(result).toBe(UNSCANNABLE_PLACEHOLDER);
  });
});

// Known gap: URL credentials are scanned per whitespace-separated token, so
// the part of a password after whitespace leaks, and all of it when the first
// part reads as a port. These pin today's output, so both a regression and a
// fix break them; a fix should move them to the redaction table above with
// fully redacted expectations.
describe("redactSensitiveInfo: password containing whitespace (known gap)", () => {
  it.each([
    [
      "the part after the space leaks",
      "x postgres://u:abc def@db/x",
      "x postgres://u:[REDACTED] def@db/x",
    ],
    [
      "a digits first part leaks it all",
      "x postgres://u:2024 5678@db/x",
      "x postgres://u:2024 5678@db/x",
    ],
    [
      "a digits-then-word password leaks",
      "connect postgres://app:1234 hunter2@db failed",
      "connect postgres://app:1234 hunter2@db failed",
    ],
    ["digits then / leaks", "x postgres://u:12/34 x@db/x", "x postgres://u:12/34 x@db/x"],
    [
      "redacted only to the token's last @",
      "x postgres://u:a@b c@db/x",
      "x postgres://u:[REDACTED]@b c@db/x",
    ],
  ])("%s", (_name, input, current) => {
    expect(redactSensitiveInfo(input)).toBe(current);
  });
});

describe("redactRowText", () => {
  it("redacts description, old_value and new_value and keeps everything else", () => {
    const row = {
      id: 1,
      description: "failed: password=x",
      old_value: "token=y",
      new_value: null,
      entry_hash: "token=z",
    };
    expect(redactRowText(row)).toEqual({
      id: 1,
      description: "failed: password=[REDACTED]",
      old_value: "token=[REDACTED]",
      new_value: null,
      entry_hash: "token=z",
    });
    expect(row.description).toBe("failed: password=x");
  });
});

// Redaction runs on every log line and event, so it must stay linear.
// Each input is 50-120KB; a quadratic pattern takes seconds on them (the
// UUID chain took ~1.8s and "a-" x32000 ~8.7s with the earlier unbounded
// key prefix). Measured locally (Node 22, best of 3): 0.2-3.3ms each, worst
// the 100KB random text. The bound is the best of three runs, so a busy CI
// machine does not flake it.
describe("redactSensitiveInfo performance", () => {
  const prng = (seed: number) => () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  const random = prng(42);
  const alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_=:/@.\" '{}&,";
  const randomText = Array.from(
    { length: 100_000 },
    () => alphabet[Math.floor(random() * alphabet.length)],
  ).join("");
  const uuids = Array.from(
    { length: 2000 },
    (_, i) =>
      `${((i * 2654435761) >>> 0).toString(16).padStart(8, "0")}-1234-4abc-8def-0123456789ab`,
  ).join("-");

  const bestOfThree = (input: string) => {
    let best = Infinity;
    for (let i = 0; i < 3; i++) {
      const start = performance.now();
      redactSensitiveInfo(input);
      best = Math.min(best, performance.now() - start);
    }
    return best;
  };

  it.each([
    ["2000 UUIDs joined by -", uuids],
    ['"a-" x32000', "a-".repeat(32000)],
    ["100KB random text", randomText],
    ['"eyJ-" x25000', "eyJ-".repeat(25000)],
    ['"sk-" x30000', "sk-".repeat(30000)],
    ['"x://a:" x15000', "x://a:".repeat(15000)],
    ['"x://a:@@" x15000', "x://a:@@".repeat(15000)],
    ['"x://a:;" x15000', "x://a:;".repeat(15000)],
    ['"\\"password\\":\\"" x8000', '"password":"'.repeat(8000)],
    ['"Authorization: " x8000', "Authorization: ".repeat(8000)],
    ["'password=\"x ' x8000 (unterminated quotes)", 'password="x '.repeat(8000)],
    ["'password\"' x10000", 'password"'.repeat(10000)],
    ['"eyJa.eyJ-" x20000', "eyJa.eyJ-".repeat(20000)],
    ['"a://b:c@" x15000 in one token', "a://b:c@".repeat(15000)],
    ["a 100KB token with :// and @", `x://${"y".repeat(100_000)}@`],
    ['\'"https://x.y","\' x8000 then @', `${'"https://x.y","'.repeat(8000)}@`],
    ['"x://@" x20000', "x://@".repeat(20000)],
    ['"x://u:p@" x15000', "x://u:p@".repeat(15000)],
    ['"-eyJa.eyJ" x20000', "-eyJa.eyJ".repeat(20000)],
    ['"a-eyJ" x25000', "a-eyJ".repeat(25000)],
    ['"x-sk-" x25000', "x-sk-".repeat(25000)],
    ['"password" x12000', "password".repeat(12000)],
    ['"password2" x12000', "password2".repeat(12000)],
    ['"password_confirm" x6000', "password_confirm".repeat(6000)],
    ['"\\"password\\": [" x8000', '"password": ['.repeat(8000)],
    ['"password\\\\\\"" x10000', 'password\\"'.repeat(10000)],
    ['"authorization\\":\\"" x8000', 'authorization":"'.repeat(8000)],
    ['"Authorization: Basic " x6000', "Authorization: Basic ".repeat(6000)],
    ['"Authorization:" + 100K newlines', `Authorization:${"\n".repeat(100_000)}`],
    ['"Authorization: \\"" + 100K spaces', `Authorization: \\"${" ".repeat(100_000)}`],
    ['"Bearer " x15000', "Bearer ".repeat(15000)],
    ['"Bearer a" x15000', "Bearer a".repeat(15000)],
    ["Bearer + a 100KB letter run", `Bearer ${"a".repeat(100_000)}`],
    ['"Bearer " + 100K NBSP then a token', `Bearer${"\u00a0".repeat(100_000)}x1`],
    ['"Bearer x1/" x10000', "Bearer x1/".repeat(10000)],
    ["a 100KB backslash run after a key", `password${"\\".repeat(100_000)}`],
  ])("redacts %s in under 50ms", (_label, input) => {
    expect(bestOfThree(input)).toBeLessThan(50);
  });
});
