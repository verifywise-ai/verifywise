import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import dns from "node:dns";
import http from "node:http";
import type { AddressInfo } from "node:net";
import {
  assertSafeOutboundUrl,
  blockedAddressReason,
  composeSafeOutboundUrl,
  guardedLookup,
  safeFetch,
  UnsafeOutboundUrlError,
} from "./safeOutboundUrl";

const ENV_FLAGS = ["OUTBOUND_ALLOW_LOOPBACK", "OUTBOUND_BLOCK_PRIVATE_NETWORKS"] as const;
const savedEnv: Record<string, string | undefined> = {};
beforeEach(() => {
  for (const name of ENV_FLAGS) {
    savedEnv[name] = process.env[name];
    delete process.env[name];
  }
});
afterEach(() => {
  for (const name of ENV_FLAGS) {
    if (savedEnv[name] === undefined) delete process.env[name];
    else process.env[name] = savedEnv[name];
  }
  jest.restoreAllMocks();
});

const refused = (url: string, reason: RegExp) => {
  expect(() => assertSafeOutboundUrl(url)).toThrow(UnsafeOutboundUrlError);
  expect(() => assertSafeOutboundUrl(url)).toThrow(reason);
};

describe("assertSafeOutboundUrl", () => {
  it("accepts a normal https URL and preserves the path", () => {
    expect(assertSafeOutboundUrl("https://mlflow.example.com")).toBe("https://mlflow.example.com");
    expect(assertSafeOutboundUrl("https://mlflow.example.com/api/v1")).toBe(
      "https://mlflow.example.com/api/v1",
    );
  });

  it("accepts http:// too — many internal on-prem deployments use it", () => {
    expect(assertSafeOutboundUrl("http://mlflow.internal:5000")).toBe(
      "http://mlflow.internal:5000",
    );
  });

  it("preserves query strings and fragments verbatim", () => {
    expect(
      assertSafeOutboundUrl("https://api.example.com/deployments?api-version=v1&limit=1"),
    ).toBe("https://api.example.com/deployments?api-version=v1&limit=1");
    expect(assertSafeOutboundUrl("https://api.example.com/x#frag")).toBe(
      "https://api.example.com/x#frag",
    );
  });

  it("trims trailing slashes with a bounded quantifier (ReDoS-safe)", () => {
    expect(assertSafeOutboundUrl("https://mlflow.example.com/")).toBe("https://mlflow.example.com");
    // Even a pathological input finishes quickly and normalizes.
    const bomb = "https://mlflow.example.com" + "/".repeat(1000);
    const start = Date.now();
    const out = assertSafeOutboundUrl(bomb);
    const elapsed = Date.now() - start;
    expect(out.startsWith("https://mlflow.example.com")).toBe(true);
    expect(elapsed).toBeLessThan(200); // orders of magnitude below any polynomial-blowup threshold
  });

  it("rejects non-http(s) protocols", () => {
    for (const bad of [
      "file:///etc/passwd",
      "gopher://x.example.com",
      "ftp://x.example.com",
      "javascript:alert(1)",
      "data:text/plain;base64,SGVsbG8=",
      "jar:http://x.example.com!/foo",
      "dict://x.example.com",
    ]) {
      expect(() => assertSafeOutboundUrl(bad)).toThrow(UnsafeOutboundUrlError);
    }
  });

  it("rejects cloud metadata endpoints", () => {
    // AWS/GCP IMDS
    expect(() => assertSafeOutboundUrl("http://169.254.169.254/latest/meta-data/")).toThrow(
      UnsafeOutboundUrlError,
    );
    // IPv6 metadata (AWS)
    expect(() => assertSafeOutboundUrl("http://[fd00:ec2::254]/latest")).toThrow(
      UnsafeOutboundUrlError,
    );
  });

  it("rejects kernel-wildcard hosts", () => {
    expect(() => assertSafeOutboundUrl("http://0.0.0.0/")).toThrow(UnsafeOutboundUrlError);
    expect(() => assertSafeOutboundUrl("http://[::]/")).toThrow(UnsafeOutboundUrlError);
  });

  it("rejects URLs embedding credentials", () => {
    expect(() => assertSafeOutboundUrl("https://user:pass@x.example.com/")).toThrow(
      UnsafeOutboundUrlError,
    );
    expect(() => assertSafeOutboundUrl("https://user@x.example.com/")).toThrow(
      UnsafeOutboundUrlError,
    );
  });

  it("rejects unparseable / empty input", () => {
    expect(() => assertSafeOutboundUrl("")).toThrow(UnsafeOutboundUrlError);
    expect(() => assertSafeOutboundUrl("not a url")).toThrow(UnsafeOutboundUrlError);
    // @ts-expect-error – validating runtime input
    expect(() => assertSafeOutboundUrl(null)).toThrow(UnsafeOutboundUrlError);
  });

  it("allows private-network IPs by default — on-prem deployments legitimately need them", () => {
    // These are intentionally NOT blocked because a VerifyWise install
    // often needs to reach an internal MLflow/JIRA server on RFC1918
    // space. If policy changes, this test locks the current stance.
    expect(assertSafeOutboundUrl("http://10.0.0.5:5000")).toBe("http://10.0.0.5:5000");
    expect(assertSafeOutboundUrl("http://192.168.1.10")).toBe("http://192.168.1.10");
    expect(assertSafeOutboundUrl("http://172.16.0.1")).toBe("http://172.16.0.1");
    expect(assertSafeOutboundUrl("http://100.64.0.1")).toBe("http://100.64.0.1");
    expect(assertSafeOutboundUrl("http://[fd12::1]")).toBe("http://[fd12::1]");
  });

  it("refuses loopback addresses and names", () => {
    for (const url of [
      "http://127.0.0.1:3000",
      "http://127.1.2.3",
      "http://[::1]:8080",
      "http://localhost:5000",
      "http://LOCALHOST.",
      "http://api.localhost",
      // Integer, hex and short IPv4 forms are canonicalised by URL parsing.
      "http://2130706433/",
      "http://0x7f000001/",
      "http://127.1/",
      // IPv4-mapped, IPv4-compatible and NAT64 forms.
      "http://[::ffff:127.0.0.1]/",
      "http://[::ffff:7f00:1]/",
      "http://[::127.0.0.1]/",
      "http://[64:ff9b::127.0.0.1]/",
    ]) {
      refused(url, /resolves to a loopback address/);
    }
  });

  it("refuses link-local addresses, including the metadata and ECS task endpoints", () => {
    for (const url of [
      "http://169.254.169.254/latest/meta-data/",
      "http://169.254.170.2/v2/credentials",
      "http://0251.0376.0251.0376/",
      "http://[fe80::1]/",
      "http://[::ffff:169.254.169.254]/",
      "http://[::ffff:a9fe:a9fe]/",
      "http://[64:ff9b::a9fe:a9fe]/",
    ]) {
      refused(url, /resolves to a link-local address/);
    }
  });

  it("refuses cloud metadata targets by address and by name", () => {
    refused("http://[fd00:ec2::254]/latest", /cloud metadata address/);
    refused("http://metadata.google.internal/computeMetadata/v1/", /cloud metadata address/);
    refused("http://METADATA.google.internal./", /cloud metadata address/);
  });

  it("refuses unspecified addresses", () => {
    refused("http://0.0.0.0/", /unspecified address/);
    refused("http://0.1.2.3/", /unspecified address/);
    refused("http://[::]/", /unspecified address/);
    refused("http://[::ffff:0.0.0.0]/", /unspecified address/);
  });

  it("never names the address in the error", () => {
    expect(() => assertSafeOutboundUrl("http://[::ffff:a9fe:a9fe]/")).toThrow(
      "The URL resolves to a link-local address, which is not allowed",
    );
  });

  it("allows loopback, and only loopback, with OUTBOUND_ALLOW_LOOPBACK", () => {
    process.env.OUTBOUND_ALLOW_LOOPBACK = "true";
    expect(assertSafeOutboundUrl("http://127.0.0.1:3000")).toBe("http://127.0.0.1:3000");
    expect(assertSafeOutboundUrl("http://localhost:4010")).toBe("http://localhost:4010");
    expect(assertSafeOutboundUrl("http://[::1]:4010")).toBe("http://[::1]:4010");
    refused("http://169.254.169.254/", /link-local/);
    refused("http://[fd00:ec2::254]/", /cloud metadata/);
    refused("http://metadata.google.internal/", /cloud metadata/);
    refused("http://0.0.0.0/", /unspecified/);
  });

  it("refuses private ranges with OUTBOUND_BLOCK_PRIVATE_NETWORKS", () => {
    process.env.OUTBOUND_BLOCK_PRIVATE_NETWORKS = "true";
    for (const url of [
      "http://10.0.0.5:5000",
      "http://172.16.0.1",
      "http://172.31.255.255",
      "http://192.168.1.10",
      "http://100.64.0.1",
      "http://[fc00::1]",
      "http://[fd12::1]",
      "http://[::ffff:10.0.0.1]",
    ]) {
      refused(url, /private network address, which this deployment blocks/);
    }
    // Public addresses and the edges of the ranges stay allowed.
    expect(assertSafeOutboundUrl("http://8.8.8.8")).toBe("http://8.8.8.8");
    expect(assertSafeOutboundUrl("http://172.32.0.1")).toBe("http://172.32.0.1");
    expect(assertSafeOutboundUrl("http://100.128.0.1")).toBe("http://100.128.0.1");
  });
});

describe("UnsafeOutboundUrlError code", () => {
  const codeOf = (url: string) => {
    try {
      assertSafeOutboundUrl(url);
    } catch (err) {
      return (err as UnsafeOutboundUrlError).code;
    }
    return null;
  };

  it.each([
    ["", "invalid-url"],
    ["not a url", "invalid-url"],
    ["ftp://jira.example.com", "invalid-url"],
    ["https://user:pass@jira.example.com", "credentials"],
    ["http://127.0.0.1", "blocked-address"],
    ["http://169.254.169.254", "blocked-address"],
    ["http://metadata.google.internal", "blocked-address"],
    ["https://jira.example.com", null],
  ])("%p refused as %p", (url, code) => {
    expect(codeOf(url)).toBe(code);
  });
});

describe("blockedAddressReason", () => {
  it("classifies addresses", () => {
    expect(blockedAddressReason("127.0.0.1", {})).toBe("loopback");
    expect(blockedAddressReason("::1", {})).toBe("loopback");
    expect(blockedAddressReason("169.254.170.2", {})).toBe("link-local");
    expect(blockedAddressReason("fd00:ec2::254", {})).toBe("metadata");
    expect(blockedAddressReason("::", {})).toBe("unspecified");
    expect(blockedAddressReason("10.1.2.3", {})).toBeNull();
    expect(blockedAddressReason("10.1.2.3", { OUTBOUND_BLOCK_PRIVATE_NETWORKS: "true" })).toBe(
      "private",
    );
    expect(blockedAddressReason("::1", { OUTBOUND_ALLOW_LOOPBACK: "true" })).toBeNull();
    expect(blockedAddressReason("93.184.216.34", {})).toBeNull();
    expect(blockedAddressReason("not an ip", {})).toBeNull();
  });
});

type LookupEntry = { address: string; family: number };

/** Make dns.lookup answer `answers[host]` for the named hosts. */
function mockDns(answers: Record<string, LookupEntry[]>) {
  const real = dns.lookup.bind(dns);
  return jest.spyOn(dns, "lookup").mockImplementation(((
    host: string,
    options: dns.LookupAllOptions,
    callback: (err: NodeJS.ErrnoException | null, addresses: LookupEntry[]) => void,
  ) => {
    const answer = answers[host];
    if (answer) process.nextTick(() => callback(null, answer));
    else (real as any)(host, options, callback);
  }) as any);
}

function lookup(host: string, options: dns.LookupOptions) {
  return new Promise<{ err: Error | null; address: unknown; family?: number }>((resolve) =>
    guardedLookup(host, options as any, (err, address, family) =>
      resolve({ err, address, family }),
    ),
  );
}

describe("guardedLookup (connect-time DNS check)", () => {
  it("refuses a name that resolves to a loopback address", async () => {
    mockDns({ "evil.example.com": [{ address: "127.0.0.1", family: 4 }] });
    const { err } = await lookup("evil.example.com", {});
    expect(err).toBeInstanceOf(UnsafeOutboundUrlError);
    expect(err?.message).toBe("The URL resolves to a loopback address, which is not allowed");
  });

  it("refuses a name when any of its addresses is blocked", async () => {
    mockDns({
      "mixed.example.com": [
        { address: "93.184.216.34", family: 4 },
        { address: "::ffff:169.254.169.254", family: 6 },
      ],
    });
    const { err } = await lookup("mixed.example.com", { all: true });
    expect(err?.message).toMatch(/link-local/);
  });

  it("refuses metadata even with the loopback override", async () => {
    process.env.OUTBOUND_ALLOW_LOOPBACK = "true";
    mockDns({ "imds.example.com": [{ address: "169.254.169.254", family: 4 }] });
    const { err } = await lookup("imds.example.com", {});
    expect(err).toBeInstanceOf(UnsafeOutboundUrlError);
  });

  it("refuses a private address only with the flag", async () => {
    mockDns({ "mlflow.corp": [{ address: "10.0.0.5", family: 4 }] });
    expect((await lookup("mlflow.corp", {})).err).toBeNull();
    process.env.OUTBOUND_BLOCK_PRIVATE_NETWORKS = "true";
    expect((await lookup("mlflow.corp", {})).err?.message).toMatch(/private network/);
  });

  it("answers in the shape the caller asked for", async () => {
    const answer = [
      { address: "93.184.216.34", family: 4 },
      { address: "2606:2800:220:1::1", family: 6 },
    ];
    mockDns({ "public.example.com": answer });
    expect(await lookup("public.example.com", {})).toEqual({
      err: null,
      address: "93.184.216.34",
      family: 4,
    });
    const all = await lookup("public.example.com", { all: true });
    expect(all.err).toBeNull();
    expect(all.address).toEqual(answer);
  });
});

async function withServer(
  handler: http.RequestListener,
  run: (port: number) => Promise<void>,
): Promise<void> {
  const server = http.createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    await run((server.address() as AddressInfo).port);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

describe("safeFetch", () => {
  it("checks the resolved address when it connects", async () => {
    mockDns({ "mlflow.test": [{ address: "127.0.0.1", family: 4 }] });
    await withServer(
      (_req, res) => res.end("ok"),
      async (port) => {
        // The name passes the static check; the connect-time lookup refuses it.
        expect(assertSafeOutboundUrl(`http://mlflow.test:${port}`)).toBe(
          `http://mlflow.test:${port}`,
        );
        await expect(safeFetch(`http://mlflow.test:${port}/`)).rejects.toThrow(
          new UnsafeOutboundUrlError(
            "The URL resolves to a loopback address, which is not allowed",
            "blocked-address",
          ),
        );

        process.env.OUTBOUND_ALLOW_LOOPBACK = "true";
        const response = await safeFetch(`http://mlflow.test:${port}/`);
        expect(response.status).toBe(200);
        expect(await response.text()).toBe("ok");
      },
    );
  });

  it("refuses to follow a redirect", async () => {
    process.env.OUTBOUND_ALLOW_LOOPBACK = "true";
    let hits = 0;
    await withServer(
      (req, res) => {
        hits += 1;
        if (req.url === "/start") {
          res.writeHead(307, { Location: "/target" });
          res.end();
        } else {
          res.end("target");
        }
      },
      async (port) => {
        await expect(safeFetch(`http://127.0.0.1:${port}/start`)).rejects.toThrow(
          new UnsafeOutboundUrlError(
            "The server answered with a redirect (HTTP 307), which is not followed",
            "redirect",
          ),
        );
        expect(hits).toBe(1);
      },
    );
  });

  it("refuses an IP literal before any request is made", async () => {
    await expect(safeFetch("http://169.254.169.254/latest/meta-data/")).rejects.toBeInstanceOf(
      UnsafeOutboundUrlError,
    );
  });
});

describe("composeSafeOutboundUrl", () => {
  it("appends a path to a validated base", () => {
    expect(
      composeSafeOutboundUrl("https://mlflow.example.com", "/api/2.0/mlflow/experiments/search"),
    ).toBe("https://mlflow.example.com/api/2.0/mlflow/experiments/search");
  });

  it("prepends a leading slash if the caller omitted it", () => {
    expect(
      composeSafeOutboundUrl("https://mlflow.example.com", "api/2.0/mlflow/experiments/search"),
    ).toBe("https://mlflow.example.com/api/2.0/mlflow/experiments/search");
  });

  it("propagates UnsafeOutboundUrlError from the base check", () => {
    expect(() => composeSafeOutboundUrl("http://169.254.169.254", "/latest/meta-data/")).toThrow(
      UnsafeOutboundUrlError,
    );
  });
});
