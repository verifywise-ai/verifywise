import { stripSyslogHeader } from "../header";

describe("stripSyslogHeader", () => {
  it("strips an RFC 5424 header and keeps its timestamp", () => {
    expect(stripSyslogHeader('<165>1 2026-02-09T14:32:00Z host app - - [sd@1 a="b"] body')).toEqual(
      { body: "body", headerTimestamp: "2026-02-09T14:32:00.000Z" },
    );
  });

  it("strips an RFC 5424 header with no structured data", () => {
    expect(stripSyslogHeader("<165>1 2026-02-09T14:32:00Z host app 12 ID47 - body")).toEqual({
      body: "body",
      headerTimestamp: "2026-02-09T14:32:00.000Z",
    });
  });

  it("handles a nil RFC 5424 timestamp", () => {
    expect(stripSyslogHeader("<165>1 - host app - - - body")).toEqual({
      body: "body",
      headerTimestamp: undefined,
    });
  });

  it("strips an RFC 3164 header, host and tag", () => {
    const out = stripSyslogHeader(
      "<34>Feb  9 14:32:00 host tag: body",
      new Date("2026-03-01T00:00:00Z"),
    );
    expect(out.body).toBe("body");
    expect(out.headerTimestamp).toBe("2026-02-09T14:32:00.000Z");
  });

  it("strips a tag with a pid", () => {
    expect(stripSyslogHeader("<34>Feb 19 14:32:00 host proxy[123]: a=b").body).toBe("a=b");
  });

  it("uses the previous year for a 3164 date far in the future", () => {
    const out = stripSyslogHeader(
      "<34>Dec 31 23:00:00 host tag: body",
      new Date("2026-01-02T00:00:00Z"),
    );
    expect(out.headerTimestamp).toBe("2025-12-31T23:00:00.000Z");
  });

  it("returns lines without a header unchanged", () => {
    const line = "1707489120.000 200 10.0.0.1 TCP_MISS/200 1024 GET x";
    expect(stripSyslogHeader(line)).toEqual({ body: line });
  });

  describe("tag-less RFC 3164 bodies", () => {
    it("keeps a JSON body", () => {
      expect(stripSyslogHeader('<34>Feb  9 14:32:00 host {"user":"a@b.co"}').body).toBe(
        '{"user":"a@b.co"}',
      );
    });

    it("keeps a KV body that starts with a URL-valued field", () => {
      expect(
        stripSyslogHeader("<34>Feb  9 14:32:00 host uri=https://x.com/p user=a@b.co").body,
      ).toBe("uri=https://x.com/p user=a@b.co");
    });

    it("still strips a tag with a path-like name and pid", () => {
      expect(stripSyslogHeader("<34>Feb  9 14:32:00 host squid-1.2/x[99]: body").body).toBe("body");
    });
  });
});
