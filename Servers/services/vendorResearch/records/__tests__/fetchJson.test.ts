import { RESEARCH_CATEGORIES } from "../../../../domain.layer/interfaces/i.vendorResearch";
import { FetchError, GuardedResponse, guardedFetch } from "../../../webResearch/guardedFetch";
import { buildTarget } from "../../target";
import { HIBP_MAX_BYTES } from "../hibp";
import { createRecordsLookup, fetchJson } from "../index";
import { STATUS_FEED_MAX_BYTES } from "../statuspage";

jest.mock("../../../webResearch/guardedFetch", () => ({
  ...jest.requireActual("../../../webResearch/guardedFetch"),
  guardedFetch: jest.fn(),
}));

const guarded = guardedFetch as jest.MockedFunction<typeof guardedFetch>;
const answer = (body: string, over: Partial<GuardedResponse> = {}): GuardedResponse => ({
  url: "https://db.example/x",
  status: 200,
  contentType: "application/json",
  body: Buffer.from(body),
  truncated: false,
  ...over,
});
const signal = new AbortController().signal;

beforeEach(() => guarded.mockReset());

describe("fetchJson", () => {
  it("asks for a JSON document within the size it is given, and parses it", async () => {
    guarded.mockResolvedValue(answer('{"a":[1,2]}'));

    await expect(fetchJson("https://db.example/x", { maxBytes: 99, signal })).resolves.toEqual({
      a: [1, 2],
    });
    expect(guarded).toHaveBeenCalledWith("https://db.example/x", {
      allowedContentTypes: ["application/json"],
      maxBytes: 99,
      signal,
    });
  });

  it("asks with the User-Agent a caller gives, and with the bot's when none is given", async () => {
    guarded.mockResolvedValue(answer("{}"));
    const userAgent = "VerifyWise sec@company.example";

    await fetchJson("https://db.example/x", { maxBytes: 99, signal, userAgent });
    await fetchJson("https://db.example/x", { maxBytes: 99, signal });

    expect(guarded.mock.calls.map(([, options]) => options)).toEqual([
      { allowedContentTypes: ["application/json"], maxBytes: 99, signal, userAgent },
      { allowedContentTypes: ["application/json"], maxBytes: 99, signal },
    ]);
    expect(guarded.mock.calls[1][1]).not.toHaveProperty("userAgent");
  });

  it("does not read a document that was cut, even when what is left parses", async () => {
    guarded.mockResolvedValue(answer('{"a":1}', { truncated: true }));

    await expect(fetchJson("https://db.example/x", { maxBytes: 7, signal })).rejects.toMatchObject({
      reason: "unsupported_type",
    });
  });

  it("answers a document that is not JSON as one in a format that cannot be read", async () => {
    guarded.mockResolvedValue(answer("<html>not json</html>"));

    const failure = await fetchJson("https://db.example/x", { maxBytes: 99, signal }).catch(
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(FetchError);
    expect(failure).toMatchObject({ reason: "unsupported_type" });
  });
});

describe("the lookup with its own fetch", () => {
  it("reads each database within the size limit of that database", async () => {
    guarded.mockImplementation(async (url) => {
      const address = String(url);
      if (address.includes("haveibeenpwned")) return answer("[]");
      return answer('{"vulnerabilities":[]}');
    });
    const lookup = createRecordsLookup();
    const target = buildTarget({
      vendor_name: "Brise Networks, Inc.",
      website: "https://www.brisenetworks.example",
      vendor_provides: "Network gear",
    });

    await lookup({
      target,
      researchable: RESEARCH_CATEGORIES,
      now: new Date("2026-10-28T12:00:00Z"),
      signal,
    });

    // Only the two databases a run asks itself: the catalog, the NVD, the SEC and the sanctions
    // lists are the vendor risk database's.
    const limits = Object.fromEntries(
      guarded.mock.calls.map(([url, options]) => [
        new URL(String(url)).hostname,
        options?.maxBytes,
      ]),
    );
    expect(limits).toEqual({
      "haveibeenpwned.com": HIBP_MAX_BYTES,
      "status.brisenetworks.example": STATUS_FEED_MAX_BYTES,
      "brisenetworks.statuspage.io": STATUS_FEED_MAX_BYTES,
      "brisenetworksstatus.com": STATUS_FEED_MAX_BYTES,
    });
  });
});
