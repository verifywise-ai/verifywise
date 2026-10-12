import {
  MAX_URL_CHARS,
  UnsafeUrlError,
  UnsafeUrlReason,
  isOnDomain,
  isPublicAddress,
  parsePublicUrl,
} from "../publicUrl";

const ACCEPTED: Array<[string, string]> = [
  ["https://example.com/a?b=1#frag", "https://example.com/a?b=1"],
  ["http://Example.COM:80/x", "http://example.com/x"],
  ["https://example.com:443/", "https://example.com/"],
  ["https://example.com./x", "https://example.com/x"],
  ["https://sub.example.co.uk/path", "https://sub.example.co.uk/path"],
  ["https://bücher.example/", "https://xn--bcher-kva.example/"],
];

const REFUSED: Array<[string, UnsafeUrlReason]> = [
  ["file:///etc/passwd", "scheme"],
  ["ftp://example.com/", "scheme"],
  ["javascript:alert(1)", "scheme"],
  ["http://user:pw@example.com/", "credentials"],
  ["https://example.com:8080/", "port"],
  ["https://example.com:22/", "port"],
  ["http://127.0.0.1/", "ip_literal"],
  ["http://2130706433/", "ip_literal"],
  ["http://0x7f.1/", "ip_literal"],
  ["http://[::1]/", "ip_literal"],
  ["http://[::ffff:127.0.0.1]/", "ip_literal"],
  ["http://169.254.169.254/latest/meta-data/", "ip_literal"],
  ["http://0.0.0.0/", "ip_literal"],
  ["http://10.0.0.5/", "ip_literal"],
  ["http://93.184.216.34/", "ip_literal"],
  ["http://localhost/", "reserved_host"],
  ["http://app.localhost/", "reserved_host"],
  ["http://printer.local/", "reserved_host"],
  ["http://db.internal/", "reserved_host"],
  ["http://router.home.arpa/", "reserved_host"],
  ["http://intranet/", "reserved_host"],
  ["not a url", "invalid_url"],
  ["", "invalid_url"],
  [`https://${"a".repeat(2100)}.example/`, "invalid_url"],
];

const PUBLIC = [
  "93.184.216.34",
  "8.8.8.8",
  "1.1.1.1",
  "11.0.0.1",
  "126.255.255.255",
  "128.0.0.1",
  "169.253.255.255",
  "172.15.255.255",
  "172.32.0.1",
  "100.63.255.255",
  "100.128.0.1",
  "198.17.255.255",
  "198.20.0.1",
  "192.0.1.1",
  "223.255.255.255",
  "2606:4700:4700::1111",
  "2001:4860:4860::8888",
  "2a00:1450:4001:81b::200e",
];

const NOT_PUBLIC = [
  "0.0.0.0",
  "0.255.255.255",
  "10.0.0.5",
  "10.255.255.255",
  "100.64.0.0",
  "100.127.255.255",
  "127.0.0.1",
  "127.255.255.254",
  "169.254.0.1",
  "169.254.169.254",
  "172.16.0.0",
  "172.31.255.255",
  "192.0.0.1",
  "192.0.2.5",
  "192.168.1.1",
  "198.18.0.1",
  "198.19.255.255",
  "198.51.100.7",
  "203.0.113.9",
  "224.0.0.1",
  "239.255.255.255",
  "240.0.0.1",
  "255.255.255.255",
  "::",
  "::1",
  "::ffff:127.0.0.1",
  "::ffff:8.8.8.8",
  "64:ff9b::808:808",
  "100::1",
  "2001:db8::1",
  "fc00::1",
  "fdff::1",
  "fe80::1",
  "febf::1",
  "ff02::1",
  "",
  "abc",
  "1.2.3",
  "999.1.1.1",
];

/** A short label for a test name: the long URL of the length case would fill the report. */
function preview(text: string): string {
  return text.length > 60 ? `${text.slice(0, 40)}... (${text.length} characters)` : text;
}

function refusalOf(raw: unknown): UnsafeUrlError {
  try {
    parsePublicUrl(raw as string);
  } catch (error) {
    if (error instanceof UnsafeUrlError) return error;
    throw error;
  }
  throw new Error("the URL was accepted");
}

describe("parsePublicUrl", () => {
  it("allows 2048 characters and no more", () => {
    expect(MAX_URL_CHARS).toBe(2048);
    const prefix = "https://example.com/";
    expect(() => parsePublicUrl(prefix + "a".repeat(MAX_URL_CHARS - prefix.length))).not.toThrow();
    expect(refusalOf(prefix + "a".repeat(MAX_URL_CHARS - prefix.length + 1)).reason).toBe(
      "invalid_url",
    );
  });

  it.each(ACCEPTED)("accepts %s as %s", (raw, href) => {
    expect(parsePublicUrl(raw).href).toBe(href);
  });

  it.each(REFUSED.map(([raw, reason]) => [preview(raw), reason, raw] as const))(
    "refuses %s with the reason %s",
    (_label, reason, raw) => {
      expect(refusalOf(raw).reason).toBe(reason);
    },
  );

  it("refuses an input that is not a string", () => {
    expect(refusalOf(undefined).reason).toBe("invalid_url");
    expect(refusalOf(null).reason).toBe("invalid_url");
    expect(refusalOf(42).reason).toBe("invalid_url");
  });

  it("drops an empty fragment as well", () => {
    expect(parsePublicUrl("https://example.com/#").href).toBe("https://example.com/");
  });

  it("accepts port 80 on https and port 443 on http", () => {
    expect(parsePublicUrl("https://example.com:80/").href).toBe("https://example.com:80/");
    expect(parsePublicUrl("http://example.com:443/").href).toBe("http://example.com:443/");
  });

  it("refuses a reserved name when it has a trailing dot or is home.arpa itself", () => {
    expect(refusalOf("http://printer.local./").reason).toBe("reserved_host");
    expect(refusalOf("http://home.arpa/").reason).toBe("reserved_host");
  });

  it("refuses an address that has a trailing dot", () => {
    expect(refusalOf("http://127.0.0.1./").reason).toBe("ip_literal");
  });

  it("gives the error a name and a message that holds no part of the URL", () => {
    const error = refusalOf("http://user:secret-pw@example.com/");
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("UnsafeUrlError");
    expect(error.message).not.toContain("secret-pw");
    expect(error.message.length).toBeGreaterThan(0);
  });
});

describe("isPublicAddress", () => {
  it.each(PUBLIC)("%s is public", (address) => {
    expect(isPublicAddress(address)).toBe(true);
  });

  it.each(NOT_PUBLIC)("%j is not public", (address) => {
    expect(isPublicAddress(address)).toBe(false);
  });

  it("is not public for an address with a zone id", () => {
    expect(isPublicAddress("2606:4700:4700::1111%eth0")).toBe(false);
  });
});

describe("isOnDomain", () => {
  it.each([
    ["acme.com", "acme.com"],
    ["docs.acme.com", "acme.com"],
    ["ACME.com.", "acme.com"],
  ])("%s is on %s", (host, domain) => {
    expect(isOnDomain(host, domain)).toBe(true);
  });

  it.each([
    ["acme.com.evil.example", "acme.com"],
    ["notacme.com", "acme.com"],
    ["acme.co", "acme.com"],
    ["", "acme.com"],
    ["acme.com", ""],
  ])("%j is not on %j", (host, domain) => {
    expect(isOnDomain(host, domain)).toBe(false);
  });
});
