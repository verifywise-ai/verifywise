import {
  SOURCE_KEY_RE,
  extractSourceKey,
  generateSourceKey,
  hashSourceKey,
  orgIdFromKey,
} from "../sourceKey";
import { normalizeIp } from "../ip";

const KEY = `vwsl_12_${"ab01".repeat(12)}`;

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

  it("finds the key in the middle", () => {
    expect(extractSourceKey(`user=a@b.co vw_source=${KEY} dst=x.com`)).toEqual({
      key: KEY,
      rest: "user=a@b.co dst=x.com",
    });
  });

  it("finds the key at the end", () => {
    expect(extractSourceKey(`user=a@b.co dst=x.com vw_source=${KEY}`)).toEqual({
      key: KEY,
      rest: "user=a@b.co dst=x.com",
    });
  });

  it("finds a quoted key", () => {
    expect(extractSourceKey(`a=1 vw_source="${KEY}" b=2`)).toEqual({
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
});
