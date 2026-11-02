import { parseLine } from "../parsers";

const RECEIVED = new Date("2026-02-10T00:00:00.000Z");
// Near the 2024 epoch used in the Squid and epoch examples.
const RECEIVED_2024 = new Date("2024-02-10T00:00:00.000Z");

describe("parseLine", () => {
  describe("zscaler", () => {
    it("parses the guide example", () => {
      expect(
        parseLine(
          "zscaler",
          "user=alice@company.com dst=chat.openai.com method=POST uri=https://chat.openai.com/v1/chat action=allowed department=Engineering",
        ),
      ).toEqual({
        ok: true,
        event: expect.objectContaining({
          user_email: "alice@company.com",
          destination: "chat.openai.com",
          uri_path: "/v1/chat",
          http_method: "POST",
          action: "allowed",
          department: "Engineering",
        }),
      });
    });

    it("accepts quoted values", () => {
      const r = parseLine(
        "zscaler",
        'user="alice@company.com" dst=chat.openai.com department="Data Science"',
      );
      expect(r).toEqual({
        ok: true,
        event: expect.objectContaining({
          user_email: "alice@company.com",
          department: "Data Science",
        }),
      });
    });

    it("falls back to the host of uri when dst is missing", () => {
      const r = parseLine("zscaler", "user=a@b.co uri=https://[2001:db8::1]:8443/x action=blocked");
      expect(r).toEqual({
        ok: true,
        event: expect.objectContaining({
          destination: "2001:db8::1",
          uri_path: "/x",
          action: "blocked",
        }),
      });
    });

    it("drops a line with no pairs as unparseable", () => {
      expect(parseLine("zscaler", "hello world")).toEqual({
        ok: false,
        reason: "unparseable",
      });
    });
  });

  describe("netskope", () => {
    const json =
      '{"user":"alice@company.com","url":"https://chat.openai.com/v1/chat","method":"POST","activity":"allowed","department":"Engineering","timestamp":"2026-02-09T14:32:00Z"}';

    it("parses the guide example", () => {
      expect(parseLine("netskope", json, undefined, RECEIVED)).toEqual({
        ok: true,
        event: {
          user_email: "alice@company.com",
          destination: "chat.openai.com",
          uri_path: "/v1/chat",
          http_method: "POST",
          action: "allowed",
          department: "Engineering",
          timestamp: "2026-02-09T14:32:00.000Z",
        },
      });
    });

    it("accepts a prefix before the JSON", () => {
      expect(parseLine("netskope", `vendor ${json}`).ok).toBe(true);
    });

    it("accepts an epoch-seconds timestamp", () => {
      const r = parseLine(
        "netskope",
        '{"user":"a@b.co","url":"https://x.com","timestamp":1707489120}',
        undefined,
        RECEIVED_2024,
      );
      expect(r).toEqual({
        ok: true,
        event: expect.objectContaining({
          timestamp: "2024-02-09T14:32:00.000Z",
        }),
      });
    });

    it("drops broken JSON as unparseable", () => {
      expect(parseLine("netskope", "{not json")).toEqual({
        ok: false,
        reason: "unparseable",
      });
      expect(parseLine("netskope", "no json here")).toEqual({
        ok: false,
        reason: "unparseable",
      });
    });
  });

  describe("squid", () => {
    it("parses the guide example", () => {
      expect(
        parseLine(
          "squid",
          "1707489120.000 200 10.0.0.1 TCP_MISS/200 1024 POST https://chat.openai.com/v1/chat alice@company.com DIRECT/chat.openai.com",
          undefined,
          RECEIVED_2024,
        ),
      ).toEqual({
        ok: true,
        event: expect.objectContaining({
          user_email: "alice@company.com",
          destination: "chat.openai.com",
          timestamp: "2024-02-09T14:32:00.000Z",
          http_method: "POST",
          uri_path: "/v1/chat",
        }),
      });
    });

    it("drops a dash user as no_user", () => {
      expect(
        parseLine(
          "squid",
          "1707489120.000 200 10.0.0.1 TCP_TUNNEL/200 0 CONNECT chat.openai.com:443 - HIER_DIRECT/1.2.3.4",
        ),
      ).toEqual({ ok: false, reason: "no_user" });
    });

    it("reads the host from a CONNECT line", () => {
      const r = parseLine(
        "squid",
        "1707489120.000 200 10.0.0.1 TCP_TUNNEL/200 0 CONNECT chat.openai.com:443 bob@x.io HIER_DIRECT/1.2.3.4",
      );
      expect(r).toEqual({
        ok: true,
        event: expect.objectContaining({ destination: "chat.openai.com" }),
      });
      if (r.ok) expect(r.event.uri_path).toBeUndefined();
    });

    it("reads an IPv6 CONNECT target", () => {
      const r = parseLine(
        "squid",
        "1707489120.000 200 10.0.0.1 TCP_TUNNEL/200 0 CONNECT [2001:db8::1]:443 bob@x.io HIER_DIRECT/1.2.3.4",
      );
      expect(r).toEqual({
        ok: true,
        event: expect.objectContaining({ destination: "2001:db8::1" }),
      });
    });

    it("drops short or non-squid lines as unparseable", () => {
      expect(parseLine("squid", "too few fields")).toEqual({
        ok: false,
        reason: "unparseable",
      });
      expect(parseLine("squid", "a b c d e f g h")).toEqual({
        ok: false,
        reason: "unparseable",
      });
    });
  });

  describe("generic_kv", () => {
    it("parses the guide example", () => {
      expect(
        parseLine(
          "generic_kv",
          "suser=alice@company.com dhost=chat.openai.com requestMethod=POST act=blocked",
        ),
      ).toEqual({
        ok: true,
        event: expect.objectContaining({
          user_email: "alice@company.com",
          destination: "chat.openai.com",
          http_method: "POST",
          action: "blocked",
        }),
      });
    });

    it("reads pairs after a CEF header", () => {
      const r = parseLine(
        "generic_kv",
        "CEF:0|Vendor|Product|1.0|100|Name|3|suser=a@b.co dhost=x.com request=https://x.com/p act=allowed",
      );
      expect(r).toEqual({
        ok: true,
        event: expect.objectContaining({ uri_path: "/p", action: "allowed" }),
      });
    });

    it("drops a missing user", () => {
      expect(parseLine("generic_kv", "dhost=chat.openai.com")).toEqual({
        ok: false,
        reason: "no_user",
      });
    });

    it("drops a user that is not an email", () => {
      expect(parseLine("generic_kv", "suser=alice dhost=x.com")).toEqual({
        ok: false,
        reason: "no_user",
      });
    });

    it("drops a missing destination", () => {
      expect(parseLine("generic_kv", "suser=a@b.co")).toEqual({
        ok: false,
        reason: "no_destination",
      });
    });
  });

  describe("timestamp fallback", () => {
    const line = "suser=a@b.co dhost=x.com";

    it("uses the header timestamp when the payload has none", () => {
      const r = parseLine("generic_kv", line, "2026-02-09T14:32:00.000Z", RECEIVED);
      expect(r).toEqual({
        ok: true,
        event: expect.objectContaining({
          timestamp: "2026-02-09T14:32:00.000Z",
        }),
      });
    });

    it("uses the receive time when neither exists", () => {
      const r = parseLine("generic_kv", line, undefined, RECEIVED);
      expect(r).toEqual({
        ok: true,
        event: expect.objectContaining({ timestamp: RECEIVED.toISOString() }),
      });
    });

    it("prefers the payload timestamp over the header", () => {
      const r = parseLine(
        "squid",
        "1707489120.000 200 10.0.0.1 TCP_MISS/200 1024 GET https://x.com/ a@b.co DIRECT/x.com",
        "2024-02-01T00:00:00.000Z",
        RECEIVED_2024,
      );
      expect(r).toEqual({
        ok: true,
        event: expect.objectContaining({
          timestamp: "2024-02-09T14:32:00.000Z",
        }),
      });
    });
  });

  describe("column bounds", () => {
    const long = (n: number) => "a".repeat(n);

    it("drops an email longer than 255 characters as no_user", () => {
      const user = `${long(64)}@${long(63)}.${long(63)}.${long(63)}.${long(20)}.com`;
      expect(user.length).toBeGreaterThan(255);
      expect(parseLine("generic_kv", `suser=${user} dhost=x.com`)).toEqual({
        ok: false,
        reason: "no_user",
      });
    });

    it("drops a destination longer than 512 characters as no_destination", () => {
      expect(parseLine("generic_kv", `suser=a@b.co dhost=${long(513)}.com`)).toEqual({
        ok: false,
        reason: "no_destination",
      });
      const host = Array.from({ length: 9 }, () => long(60)).join(".");
      expect(parseLine("generic_kv", `suser=a@b.co request=https://${host}/x`)).toEqual({
        ok: false,
        reason: "no_destination",
      });
    });

    it("keeps a destination of exactly 512 characters", () => {
      const r = parseLine("generic_kv", `suser=a@b.co dhost=${long(512)}`);
      expect(r.ok && r.event.destination.length).toBe(512);
    });

    it("leaves out a method longer than 10 characters", () => {
      const r = parseLine("generic_kv", "suser=a@b.co dhost=x.com requestMethod=PROPPATCHXX");
      expect(r.ok).toBe(true);
      expect(r.ok && r.event.http_method).toBeUndefined();
      const ok = parseLine("generic_kv", "suser=a@b.co dhost=x.com requestMethod=MKCALENDAR");
      expect(ok.ok && ok.event.http_method).toBe("MKCALENDAR");
    });

    it("leaves out a uri path longer than 2048 characters", () => {
      const tooLong = parseLine("generic_kv", `suser=a@b.co request=https://x.com/${long(2048)}`);
      expect(tooLong.ok && tooLong.event.destination).toBe("x.com");
      expect(tooLong.ok && tooLong.event.uri_path).toBeUndefined();
      const fits = parseLine("generic_kv", `suser=a@b.co request=https://x.com/${long(2047)}`);
      expect(fits.ok && fits.event.uri_path?.length).toBe(2048);
    });

    it("truncates a department to 255 characters", () => {
      const r = parseLine("generic_kv", `suser=a@b.co dhost=x.com department=${"é".repeat(300)}`);
      expect(r.ok && r.event.department).toBe("é".repeat(255));
    });

    it("strips NUL characters from every string field", () => {
      const r = parseLine(
        "netskope",
        JSON.stringify({
          user: "a@b.co\u0000",
          url: "https://x.com/p\u0000ath",
          method: "PO\u0000ST",
          department: "R\u0000D",
        }),
        undefined,
        RECEIVED,
      );
      expect(r).toEqual({
        ok: true,
        event: {
          user_email: "a@b.co",
          destination: "x.com",
          uri_path: "/p%00ath",
          http_method: "POST",
          department: "RD",
          timestamp: RECEIVED.toISOString(),
        },
      });
      const kv = parseLine(
        "generic_kv",
        "suser=a@b.co dhost=x.\u0000com department=\u0000",
        undefined,
        RECEIVED,
      );
      expect(kv).toEqual({
        ok: true,
        event: { user_email: "a@b.co", destination: "x.com", timestamp: RECEIVED.toISOString() },
      });
    });

    it("falls back to the receive time for a far-future epoch", () => {
      const r = parseLine(
        "netskope",
        '{"user":"a@b.co","url":"https://x.com","timestamp":8640000000000}',
        undefined,
        RECEIVED,
      );
      expect(r).toEqual({
        ok: true,
        event: expect.objectContaining({ timestamp: RECEIVED.toISOString() }),
      });
    });

    it("ignores timestamps more than a year from the receive time", () => {
      const line = "suser=a@b.co dhost=x.com timestamp=2020-01-01T00:00:00Z";
      expect(parseLine("generic_kv", line, "2026-02-01T00:00:00.000Z", RECEIVED)).toEqual({
        ok: true,
        event: expect.objectContaining({ timestamp: "2026-02-01T00:00:00.000Z" }),
      });
      expect(parseLine("generic_kv", line, "2099-01-01T00:00:00.000Z", RECEIVED)).toEqual({
        ok: true,
        event: expect.objectContaining({ timestamp: RECEIVED.toISOString() }),
      });
    });

    it("keeps a timestamp just inside a year of the receive time", () => {
      const line = "suser=a@b.co dhost=x.com timestamp=2025-02-11T00:00:00.000Z";
      expect(parseLine("generic_kv", line, undefined, RECEIVED)).toEqual({
        ok: true,
        event: expect.objectContaining({ timestamp: "2025-02-11T00:00:00.000Z" }),
      });
    });
  });

  describe("kv field injection", () => {
    it("rejects duplicate user keys", () => {
      expect(
        parseLine("zscaler", "ua=Mozilla user=victim@x.co dst=evil.com user=me@x.co dst=real.com"),
      ).toEqual({ ok: false, reason: "unparseable" });
    });

    it("rejects duplicate destination aliases of the same key", () => {
      expect(parseLine("generic_kv", "suser=a@b.co dhost=a.com dhost=b.com")).toEqual({
        ok: false,
        reason: "unparseable",
      });
    });

    it("rejects duplicate action keys", () => {
      expect(parseLine("zscaler", "user=a@b.co dst=x.com action=allowed action=blocked")).toEqual({
        ok: false,
        reason: "unparseable",
      });
    });

    it("does not read fields out of an escaped quote inside a quoted value", () => {
      expect(parseLine("zscaler", 'ua="a \\" user=victim@x.co \\"" dst=x.com')).toEqual({
        ok: false,
        reason: "no_user",
      });
    });

    it("unescapes a quoted value", () => {
      expect(parseLine("zscaler", 'user="a@b.co" dst=x.com department="R\\"D"')).toEqual({
        ok: true,
        event: expect.objectContaining({ department: 'R"D' }),
      });
    });

    it("parses a CEF line with escaped equals", () => {
      expect(
        parseLine(
          "generic_kv",
          "CEF:0|V|P|1|100|Web|3|suser=a@b.co dhost=chat.openai.com requestMethod=GET act=Allowed cs1=a\\=b",
        ),
      ).toEqual({
        ok: true,
        event: expect.objectContaining({ user_email: "a@b.co", destination: "chat.openai.com" }),
      });
    });
  });
});
