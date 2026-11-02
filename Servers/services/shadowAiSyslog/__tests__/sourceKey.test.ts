import {
  SOURCE_KEY_RE,
  extractSourceKey,
  generateSourceKey,
  hashSourceKey,
  orgIdFromKey,
} from "../sourceKey";
import { normalizeIp } from "../ip";
import { parseLine } from "../parsers";
import type { ParserType } from "../types";

const KEY = `vwsl_12_${"ab01".repeat(12)}`;
// A valid key of another organization, used as a decoy.
const OTHER = `vwsl_7_${"c".repeat(48)}`;

describe("source key", () => {
  it("generates a key that matches the format", () => {
    const { key, hash, prefix } = generateSourceKey(42);
    expect(key).toMatch(SOURCE_KEY_RE);
    expect(hashSourceKey(key)).toBe(hash);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(orgIdFromKey(key)).toBe(42);
    expect(prefix).toBe(key.slice(0, 16));
  });

  it("generates distinct keys", () => {
    expect(generateSourceKey(1).key).not.toBe(generateSourceKey(1).key);
  });

  it("returns null for the org of a malformed key", () => {
    expect(orgIdFromKey("vwsl_1_short")).toBeNull();
    expect(orgIdFromKey(`vwsl_99999999999999999999_${"a".repeat(48)}`)).toBeNull();
  });
});

describe("extractSourceKey", () => {
  it("finds the key at the start", () => {
    expect(extractSourceKey(`vw_source=${KEY} user=a@b.co dst=x.com`)).toEqual({
      key: KEY,
      rest: "user=a@b.co dst=x.com",
    });
  });

  it("ignores a key in the middle of the line", () => {
    const line = `user=a@b.co vw_source=${KEY} dst=x.com`;
    expect(extractSourceKey(line)).toEqual({ key: null, rest: line });
  });

  it("finds the key at the end before trailing whitespace and CR", () => {
    expect(extractSourceKey(`user=a@b.co dst=x.com vw_source=${KEY} \r`)).toEqual({
      key: KEY,
      rest: "user=a@b.co dst=x.com",
    });
  });

  it("finds a line that is only the key", () => {
    expect(extractSourceKey(`vw_source=${KEY}`)).toEqual({ key: KEY, rest: "" });
  });

  it("accepts the same key at both ends and removes both", () => {
    expect(extractSourceKey(`vw_source=${KEY} user=a@b.co vw_source=${KEY}`)).toEqual({
      key: KEY,
      rest: "user=a@b.co",
    });
  });

  it("refuses two different valid keys at the two ends", () => {
    const line = `vw_source=${KEY} user=a@b.co vw_source=${OTHER}`;
    expect(extractSourceKey(line)).toEqual({ key: null, rest: line });
  });

  it("finds the key at the end", () => {
    expect(extractSourceKey(`user=a@b.co dst=x.com vw_source=${KEY}`)).toEqual({
      key: KEY,
      rest: "user=a@b.co dst=x.com",
    });
  });

  it("finds a quoted key", () => {
    expect(extractSourceKey(`a=1 b=2 vw_source="${KEY}"`)).toEqual({
      key: KEY,
      rest: "a=1 b=2",
    });
  });

  it("finds the key inside JSON and removes the comma", () => {
    const first = extractSourceKey(`{"vw_source":"${KEY}","user":"a@b.co"}`);
    expect(first).toEqual({ key: KEY, rest: '{"user":"a@b.co"}' });
    const last = extractSourceKey(`{"user":"a@b.co", "vw_source": "${KEY}"}`);
    expect(last).toEqual({ key: KEY, rest: '{"user":"a@b.co"}' });
  });

  it("finds the literal before a JSON object", () => {
    expect(extractSourceKey(`vw_source=${KEY} {"user":"a@b.co"}`)).toEqual({
      key: KEY,
      rest: '{"user":"a@b.co"}',
    });
  });

  it("returns null when the field is absent", () => {
    const line = "user=a@b.co dst=x.com";
    expect(extractSourceKey(line)).toEqual({ key: null, rest: line });
  });

  it("returns null and leaves the line alone for a malformed key", () => {
    const line = "user=a@b.co vw_source=vwsl_1_nothex dst=x.com";
    expect(extractSourceKey(line)).toEqual({ key: null, rest: line });
    const json = '{"vw_source":"nope"}';
    expect(extractSourceKey(json)).toEqual({ key: null, rest: json });
  });

  it("ignores a field name that only ends in vw_source", () => {
    const line = `not_vw_source=${KEY}`;
    expect(extractSourceKey(line)).toEqual({ key: null, rest: line });
  });
});

// The guide's example line for each parser, without the key.
const GUIDE_LINES: [ParserType, string][] = [
  [
    "zscaler",
    "user=alice@company.com dst=chat.openai.com method=POST uri=https://chat.openai.com/v1/chat action=allowed department=Engineering",
  ],
  [
    "squid",
    "1707489120.000 200 10.0.0.1 TCP_MISS/200 1024 POST https://chat.openai.com/v1/chat alice@company.com DIRECT/chat.openai.com",
  ],
  ["generic_kv", "suser=alice@company.com dhost=chat.openai.com requestMethod=POST act=allowed"],
  [
    "netskope",
    '{"user":"alice@company.com","url":"https://chat.openai.com/v1/chat","method":"POST","activity":"allowed","department":"Engineering","timestamp":"2026-02-09T14:32:00Z"}',
  ],
];

describe.each(GUIDE_LINES)("the %s guide example", (parser, line) => {
  const expectParsed = (rest: string) =>
    expect(parseLine(parser, rest)).toEqual({
      ok: true,
      event: expect.objectContaining({
        user_email: "alice@company.com",
        destination: "chat.openai.com",
      }),
    });

  it("parses with the key at the start", () => {
    const out = extractSourceKey(`vw_source=${KEY} ${line}`);
    expect(out.key).toBe(KEY);
    expectParsed(out.rest);
  });

  it("parses with the key at the end", () => {
    const out = extractSourceKey(`${line} vw_source=${KEY}\r`);
    expect(out.key).toBe(KEY);
    expectParsed(out.rest);
  });

  if (parser === "netskope") {
    it("parses with the key as a top-level JSON member", () => {
      const out = extractSourceKey(`${line.slice(0, -1)},"vw_source":"${KEY}"}`);
      expect(out.key).toBe(KEY);
      expect(out.rest).not.toContain(KEY);
      expectParsed(out.rest);
    });
  }
});

describe("normalizeIp", () => {
  it("unwraps IPv4-mapped IPv6", () => {
    expect(normalizeIp("::ffff:10.0.0.1")).toBe("10.0.0.1");
  });

  it("compresses and lowercases IPv6", () => {
    expect(normalizeIp("2001:DB8:0:0::1")).toBe("2001:db8::1");
  });

  it("keeps IPv4", () => {
    expect(normalizeIp("10.0.0.1")).toBe("10.0.0.1");
  });

  it("rejects hostnames and garbage", () => {
    expect(normalizeIp("proxy-01.corp.com")).toBeNull();
    expect(normalizeIp("")).toBeNull();
    expect(normalizeIp("999.1.1.1")).toBeNull();
  });

  describe("extractSourceKey evasion resistance", () => {
    it("skips an invalid vw_source in a URL query before the real field", () => {
      const line = `uri=https://chat.openai.com/?vw_source=x user=a@b.co dst=chat.openai.com vw_source=${KEY}`;
      const out = extractSourceKey(line);
      expect(out.key).toBe(KEY);
      expect(out.rest).toBe(
        "uri=https://chat.openai.com/?vw_source=x user=a@b.co dst=chat.openai.com",
      );
    });

    it("skips a JSON-looking fragment in a user agent before the real KV field", () => {
      const line = `ua=Mozilla "vw_source":"y" user=a@b.co dst=x.com vw_source=${KEY}`;
      const out = extractSourceKey(line);
      expect(out.key).toBe(KEY);
      expect(out.rest).toBe('ua=Mozilla "vw_source":"y" user=a@b.co dst=x.com');
    });

    it("skips an invalid JSON field before a valid one", () => {
      const line = `{"vw_source":"bad","user":"a@b.co","vw_source":"${KEY}"}`;
      expect(extractSourceKey(line).key).toBe(KEY);
    });

    it("still returns null when no candidate is valid", () => {
      const line = "user=a@b.co vw_source=nope ?vw_source=other";
      expect(extractSourceKey(line)).toEqual({ key: null, rest: line });
    });

    it("ignores a key joined to a CEF header by a pipe", () => {
      const line = `CEF:0|a|b|1|x|y|1|vw_source=${KEY}`;
      expect(extractSourceKey(line)).toEqual({ key: null, rest: line });
    });
  });

  describe("a valid key of another organization as a decoy", () => {
    it("inside a quoted user agent routes by the real key at the end", () => {
      const line = `user=a@b.co ua="Mozilla vw_source=${OTHER}" dst=x.com vw_source=${KEY}`;
      expect(extractSourceKey(line).key).toBe(KEY);
    });

    it("inside a quoted user agent routes by the real key at the start", () => {
      const line = `vw_source=${KEY} user=a@b.co ua="Mozilla vw_source=${OTHER}" dst=x.com`;
      expect(extractSourceKey(line).key).toBe(KEY);
    });

    it("inside a quoted user agent closing the line yields no key", () => {
      // The decoy is quoted to make the last token exactly `vw_source="..."`.
      const line = `vw_source=${KEY} user=a@b.co ua="Mozilla vw_source="${OTHER}""`;
      expect(extractSourceKey(line).key).not.toBe(OTHER);
    });

    it("inside a JSON string value routes by the real top-level member", () => {
      const line = `{"user":"a@b.co","useragent":"x vw_source=${OTHER}","vw_source":"${KEY}"}`;
      const out = extractSourceKey(line);
      expect(out.key).toBe(KEY);
      expect(JSON.parse(out.rest)).toEqual({ user: "a@b.co", useragent: `x vw_source=${OTHER}` });
    });

    it("inside a nested JSON member is not a key", () => {
      const line = `{"user":"a@b.co","meta":{"vw_source":"${OTHER}"}}`;
      expect(extractSourceKey(line)).toEqual({ key: null, rest: line });
    });

    it("inside a JSON string value with the literal after the object routes by the literal", () => {
      const line = `{"user":"a@b.co","useragent":"x vw_source=${OTHER}","url":"https://x.com/"} vw_source=${KEY}`;
      expect(extractSourceKey(line).key).toBe(KEY);
    });

    it("inside a JSON string value with no real key yields no key", () => {
      const line = `{"user":"a@b.co","useragent":"x\\" vw_source=${OTHER}"}`;
      expect(extractSourceKey(line).key).toBeNull();
    });

    it("inside a URL query yields no key", () => {
      const line = `user=a@b.co uri=https://x.com/?vw_source=${OTHER} dst=x.com`;
      expect(extractSourceKey(line)).toEqual({ key: null, rest: line });
    });

    it("joined to a URL by a pipe routes by the real key", () => {
      const line = `1707489120.000 200 10.0.0.1 TCP_MISS/200 1 GET https://x.com/a|vw_source=${OTHER} a@b.co DIRECT/x vw_source=${KEY}`;
      expect(extractSourceKey(line).key).toBe(KEY);
    });

    it("joined to a URL by a pipe with no real key yields no key", () => {
      const line = `1707489120.000 200 10.0.0.1 TCP_MISS/200 1 GET https://x.com/a|vw_source=${OTHER} a@b.co DIRECT/x`;
      expect(extractSourceKey(line).key).toBeNull();
    });
  });
});
