import {
  JiraAssetsClient,
  JiraUpstreamError,
  MAX_PAGES,
  PAGE_SIZE,
  PICKER_MAX_RESULTS,
} from "../jira.client";
import { safeFetch } from "../../../utils/safeOutboundUrl";

jest.mock("../../../utils/safeOutboundUrl", () => ({
  safeFetch: jest.fn(),
  assertSafeOutboundUrl: jest.fn((url: string) => url.replace(/\/+$/, "")),
}));

const mockFetch = safeFetch as jest.Mock;

const ok = (body: unknown) => ({
  ok: true,
  json: async () => body,
  text: async () => "",
});

const objects = (from: number, count: number) =>
  Array.from({ length: count }, (_, i) => ({ id: String(from + i), objectKey: `K-${from + i}` }));

const cloud = () => new JiraAssetsClient("https://x.atlassian.net", "ws-1", "a@b.co", "t", "cloud");
const datacenter = () =>
  new JiraAssetsClient("https://jira.example.com", "3", "user", "t", "datacenter");

/** Calls to the objects endpoint (cloud also fetches attribute definitions first). */
const objectCalls = () =>
  mockFetch.mock.calls.filter(([url]) => /object\/aql|iql\/objects/.test(String(url)));

/** Cloud: attribute definitions first, then the given object pages. */
function cloudPages(...pages: unknown[]) {
  mockFetch.mockResolvedValueOnce(ok([]));
  for (const page of pages) mockFetch.mockResolvedValueOnce(ok(page));
}

beforeEach(() => {
  mockFetch.mockReset();
});

describe("cloud pagination (startAt / maxResults / isLast)", () => {
  it("follows pages until isLast and reports a complete fetch", async () => {
    cloudPages(
      { values: objects(0, PAGE_SIZE), isLast: false, total: 70 },
      { values: objects(PAGE_SIZE, 20), isLast: true, total: 70 },
    );

    const result = await cloud().getAllObjects("42");

    expect(result.complete).toBe(true);
    expect(result.objects).toHaveLength(PAGE_SIZE + 20);
    const urls = objectCalls().map(([url]) => String(url));
    expect(urls[0]).toContain(`object/aql?startAt=0&maxResults=${PAGE_SIZE}`);
    expect(urls[1]).toContain(`startAt=${PAGE_SIZE}`);
    expect(JSON.parse(objectCalls()[0][1].body)).toEqual({ qlQuery: "objectTypeId = 42" });
  });

  it("sends a per-request abort signal", async () => {
    cloudPages({ values: objects(0, 1), isLast: true });

    await cloud().getAllObjects("42");

    expect(objectCalls()[0][1].signal).toBeInstanceOf(AbortSignal);
  });

  it("ignores a capped total: total=1000 with isLast=false at 1000 objects is not the end", async () => {
    const pages = Array.from({ length: 1000 / PAGE_SIZE }, (_, i) => ({
      values: objects(i * PAGE_SIZE, PAGE_SIZE),
      isLast: false,
      total: 1000,
    }));
    // The type really has more; Jira just stops answering with rows here.
    cloudPages(...pages, { values: [], isLast: false, total: 1000 });

    const result = await cloud().getAllObjects("42");

    expect(result.complete).toBe(false);
    expect(result.objects).toHaveLength(1000);
    // It kept paging past the reported total instead of stopping at it.
    expect(objectCalls()).toHaveLength(1000 / PAGE_SIZE + 1);
  });

  it.each([null, undefined, 3])(
    "without isLast, a short page proves nothing (total=%p)",
    async (total) => {
      cloudPages({ values: objects(0, 3), total }, { values: [], total });

      const result = await cloud().getAllObjects("42");

      expect(result.complete).toBe(false);
      expect(result.objects).toHaveLength(3);
    },
  );

  it("advances by the rows returned when the server caps the page size", async () => {
    cloudPages(
      { values: objects(0, 25), isLast: false },
      { values: objects(25, 15), isLast: true },
    );

    const result = await cloud().getAllObjects("42");

    expect(result.complete).toBe(true);
    expect(String(objectCalls()[1][0])).toContain("startAt=25");
  });

  it("is incomplete when an empty page arrives before the reported total", async () => {
    cloudPages(
      { values: objects(0, PAGE_SIZE), isLast: false, total: 200 },
      { values: [], isLast: false, total: 200 },
    );

    expect((await cloud().getAllObjects("42")).complete).toBe(false);
  });

  it("calls onPage once per page so the sync can heartbeat", async () => {
    cloudPages(
      { values: objects(0, PAGE_SIZE), isLast: false },
      { values: objects(PAGE_SIZE, 1), isLast: true },
    );
    const onPage = jest.fn(async () => undefined);

    await cloud().getAllObjects("42", { onPage });

    expect(onPage).toHaveBeenCalledTimes(2);
  });

  it("stops at MAX_PAGES and reports the fetch as incomplete", async () => {
    mockFetch.mockImplementation(async (url: string) =>
      String(url).includes("attributes")
        ? ok([])
        : ok({ values: objects(0, PAGE_SIZE), isLast: false }),
    );

    const result = await cloud().getAllObjects("42");

    expect(result.complete).toBe(false);
    expect(objectCalls()).toHaveLength(MAX_PAGES);
  });

  it("returns an incomplete fetch, flagged, when the overall deadline passes", async () => {
    const controller = new AbortController();
    mockFetch
      .mockResolvedValueOnce(ok([]))
      .mockResolvedValueOnce(ok({ values: objects(0, PAGE_SIZE), isLast: false }))
      .mockImplementationOnce(async () => {
        controller.abort();
        throw Object.assign(new Error("aborted"), { name: "AbortError" });
      });

    const result = await cloud().getAllObjects("42", { deadline: controller.signal });

    expect(result).toMatchObject({ complete: false, stoppedReason: "deadline" });
    expect(result.objects).toHaveLength(PAGE_SIZE);
  });
});

describe("errors thrown by onPage", () => {
  it("propagate unchanged, even after the deadline fired (not a deadline stop)", async () => {
    class Superseded extends Error {}
    const controller = new AbortController();
    cloudPages({ values: objects(0, PAGE_SIZE), isLast: false });

    const err = await cloud()
      .getAllObjects("42", {
        deadline: controller.signal,
        onPage: async () => {
          controller.abort();
          throw new Superseded("run closed");
        },
      })
      .catch((e) => e);

    expect(err).toBeInstanceOf(Superseded);
  });
});

describe("data center pagination (page / resultPerPage / pageSize)", () => {
  it("is complete at the reported last page when it is short", async () => {
    mockFetch
      .mockResolvedValueOnce(
        ok({ objectEntries: objects(0, PAGE_SIZE), pageSize: 2, totalFilterCount: 60 }),
      )
      .mockResolvedValueOnce(
        ok({ objectEntries: objects(PAGE_SIZE, 10), pageSize: 2, totalFilterCount: 60 }),
      );

    const result = await datacenter().getAllObjects("42");

    expect(result.complete).toBe(true);
    expect(result.objects).toHaveLength(60);
    const urls = objectCalls().map(([url]) => String(url));
    expect(urls).toHaveLength(2);
    expect(urls[0]).toContain(`page=1&resultPerPage=${PAGE_SIZE}`);
    expect(urls[1]).toContain("page=2");
    expect(urls[0]).toContain(`iql=${encodeURIComponent("objectTypeId=42")}`);
  });

  describe("a 73-object server that answers past the end with page 2 again", () => {
    const page1 = objects(0, PAGE_SIZE);
    const page2 = objects(PAGE_SIZE, 73 - PAGE_SIZE);
    function server(signals: Record<string, unknown>) {
      mockFetch.mockImplementation(async (url: string) => {
        const page = Number(/[?&]page=(\d+)/.exec(String(url))![1]);
        return ok({ objectEntries: page === 1 ? page1 : page2, ...signals });
      });
    }

    it("is complete from pageSize and totalFilterCount, without asking past the end", async () => {
      server({ pageSize: 2, totalFilterCount: 73 });

      const result = await datacenter().getAllObjects("42");

      expect(result).toMatchObject({ complete: true });
      expect(result.objects).toHaveLength(73);
      expect(objectCalls()).toHaveLength(2);
    });

    it("is complete from totalFilterCount alone", async () => {
      server({ totalFilterCount: 73 });

      const result = await datacenter().getAllObjects("42");

      expect(result.complete).toBe(true);
      expect(result.objects).toHaveLength(73);
    });

    it("is incomplete from pageSize alone: the page count is never trusted", async () => {
      server({ pageSize: 2 });

      const result = await datacenter().getAllObjects("42");

      expect(result.complete).toBe(false);
      expect(result.objects).toHaveLength(73);
      expect(objectCalls()).toHaveLength(3);
    });

    it("is incomplete with no signal: the repeated page proves nothing", async () => {
      server({});

      const result = await datacenter().getAllObjects("42");

      expect(result.complete).toBe(false);
      expect(result.objects).toHaveLength(73);
      expect(objectCalls()).toHaveLength(3);
    });
  });

  it("a repeated page after the reported last page, with no total, is incomplete", async () => {
    mockFetch
      .mockResolvedValueOnce(ok({ objectEntries: objects(0, PAGE_SIZE), pageSize: 2 }))
      .mockResolvedValue(ok({ objectEntries: objects(PAGE_SIZE, PAGE_SIZE), pageSize: 2 }));

    const result = await datacenter().getAllObjects("42");

    expect(result.complete).toBe(false);
    expect(result.objects).toHaveLength(2 * PAGE_SIZE);
    expect(objectCalls()).toHaveLength(3);
  });

  describe("a 200-object server that caps pages at 25 but reports pageSize from 50", () => {
    function server(signals: Record<string, unknown>) {
      mockFetch.mockImplementation(async (url: string) => {
        const page = Number(/[?&]page=(\d+)/.exec(String(url))![1]);
        const from = (page - 1) * 25;
        return ok({
          objectEntries: objects(from, Math.max(0, Math.min(25, 200 - from))),
          ...signals,
        });
      });
    }

    it("is complete only once totalFilterCount is reached, not at the reported page 4", async () => {
      server({ pageSize: 4, totalFilterCount: 200 });

      const result = await datacenter().getAllObjects("42");

      expect(result.complete).toBe(true);
      expect(result.objects).toHaveLength(200);
      expect(objectCalls()).toHaveLength(8);
    });

    it("without a total, walks on to the empty page", async () => {
      server({ pageSize: 4 });

      const result = await datacenter().getAllObjects("42");

      expect(result.complete).toBe(true);
      expect(result.objects).toHaveLength(200);
      expect(objectCalls()).toHaveLength(9);
    });
  });

  it("does not trust a total reached on a full page (it may be capped)", async () => {
    mockFetch
      .mockResolvedValueOnce(ok({ objectEntries: objects(0, PAGE_SIZE), totalFilterCount: 50 }))
      .mockResolvedValueOnce(ok({ objectEntries: objects(PAGE_SIZE, 5), totalFilterCount: 50 }));

    const result = await datacenter().getAllObjects("42");

    expect(result.complete).toBe(true);
    expect(result.objects).toHaveLength(PAGE_SIZE + 5);
    expect(objectCalls()).toHaveLength(2);
  });

  it("a short page is not the end: a server capping resultPerPage is walked to the empty page", async () => {
    // The server caps pages at 20 rows although PAGE_SIZE were asked for.
    mockFetch
      .mockResolvedValueOnce(ok({ objectEntries: objects(0, 20) }))
      .mockResolvedValueOnce(ok({ objectEntries: objects(20, 20) }))
      .mockResolvedValueOnce(ok({ objectEntries: objects(40, 5) }))
      .mockResolvedValueOnce(ok({ objectEntries: [] }));

    const result = await datacenter().getAllObjects("42");

    expect(result.complete).toBe(true);
    expect(result.objects).toHaveLength(45);
    expect(objectCalls()).toHaveLength(4);
  });

  it("never reports a short page as complete when the next request fails", async () => {
    mockFetch
      .mockResolvedValueOnce(ok({ objectEntries: objects(0, 3) }))
      .mockRejectedValueOnce(new Error("socket hang up"));

    await expect(datacenter().getAllObjects("42")).rejects.toBeInstanceOf(JiraUpstreamError);
  });

  it("exact multiple of the page size: the empty page proves the end", async () => {
    mockFetch
      .mockResolvedValueOnce(ok({ objectEntries: objects(0, PAGE_SIZE), pageSize: 2 }))
      .mockResolvedValueOnce(ok({ objectEntries: objects(PAGE_SIZE, PAGE_SIZE), pageSize: 2 }))
      .mockResolvedValueOnce(ok({ objectEntries: [], pageSize: 2 }));

    const result = await datacenter().getAllObjects("42");

    expect(result.complete).toBe(true);
    expect(result.objects).toHaveLength(2 * PAGE_SIZE);
    expect(objectCalls()).toHaveLength(3);
    expect(String(objectCalls()[2][0])).toContain("page=3");
  });

  it("keeps going when the page count was understated", async () => {
    mockFetch
      .mockResolvedValueOnce(ok({ objectEntries: objects(0, PAGE_SIZE), pageSize: 1 }))
      .mockResolvedValueOnce(ok({ objectEntries: objects(PAGE_SIZE, PAGE_SIZE), pageSize: 1 }))
      .mockResolvedValueOnce(ok({ objectEntries: objects(2 * PAGE_SIZE, 7), pageSize: 1 }))
      .mockResolvedValueOnce(ok({ objectEntries: [], pageSize: 1 }));

    const result = await datacenter().getAllObjects("42");

    expect(result.complete).toBe(true);
    expect(result.objects).toHaveLength(2 * PAGE_SIZE + 7);
  });

  it("is incomplete when the server repeats its last page instead of returning an empty one", async () => {
    mockFetch
      .mockResolvedValueOnce(ok({ objectEntries: objects(0, 7) }))
      .mockResolvedValue(ok({ objectEntries: objects(0, 7) }));

    const result = await datacenter().getAllObjects("42");

    expect(result.complete).toBe(false);
    expect(result.objects).toHaveLength(7);
    expect(objectCalls()).toHaveLength(2);
  });

  it("is incomplete when the walk hits MAX_PAGES with full pages", async () => {
    let page = 0;
    mockFetch.mockImplementation(async () =>
      ok({ objectEntries: objects(page++ * PAGE_SIZE, PAGE_SIZE) }),
    );

    const result = await datacenter().getAllObjects("42");

    expect(result.complete).toBe(false);
    expect(objectCalls()).toHaveLength(MAX_PAGES);
  });
});

describe("import picker page", () => {
  it("makes one cloud request from startAt and reports hasMore from isLast", async () => {
    cloudPages({ values: objects(0, 5), isLast: false, total: 1000 });

    const page = await cloud().getObjectsPage("42", 1000);

    expect(page).toMatchObject({ hasMore: true, nextStartAt: 1005 });
    expect(page.objects).toHaveLength(5);
    expect(objectCalls()).toHaveLength(1);
    expect(String(objectCalls()[0][0])).toContain(`startAt=1000&maxResults=${PICKER_MAX_RESULTS}`);
  });

  it("reports no more on cloud when isLast is true", async () => {
    cloudPages({ values: objects(0, 5), isLast: true });

    expect(await cloud().getObjectsPage("42")).toMatchObject({ hasMore: false });
  });

  it("maps startAt to a data center page and reports hasMore from the page count", async () => {
    mockFetch.mockResolvedValueOnce(ok({ objectEntries: objects(0, 2), pageSize: 3 }));

    const page = await datacenter().getObjectsPage("42", PICKER_MAX_RESULTS);

    expect(objectCalls()).toHaveLength(1);
    expect(String(objectCalls()[0][0])).toContain(`page=2&resultPerPage=${PICKER_MAX_RESULTS}`);
    expect(page).toMatchObject({ hasMore: true, nextStartAt: 2 * PICKER_MAX_RESULTS });
  });
});

describe("errors", () => {
  it("turns a non-2xx response into a JiraUpstreamError with the status", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401, text: async () => "bad creds" });

    await expect(cloud().getSchemas()).rejects.toThrow(JiraUpstreamError);
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401, text: async () => "bad creds" });
    await expect(cloud().getSchemas()).rejects.toThrow("Jira returned 401: bad creds");
  });

  it("turns an unreadable response body into a JiraUpstreamError", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => {
        throw Object.assign(new Error("terminated"), { name: "TimeoutError" });
      },
      text: async () => "",
    });

    const err = await cloud()
      .getSchemas()
      .catch((e) => e);

    expect(err).toBeInstanceOf(JiraUpstreamError);
    expect(err.message).toContain("Could not read Jira's response: request timed out");
  });

  it("wraps a body read aborted by the overall deadline too", async () => {
    const controller = new AbortController();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => {
        controller.abort();
        throw Object.assign(new Error("aborted"), { name: "AbortError" });
      },
      text: async () => "",
    });

    // Through the picker, which uses the request path directly (no deadline
    // handling of its own), the caller sees a JiraUpstreamError.
    const err = await datacenter()
      .getObjectsPage("42")
      .catch((e) => e);

    expect(err).toBeInstanceOf(JiraUpstreamError);
    expect(err.message).toContain("Could not read Jira's response");
  });

  it("still reports a deadline stop from getAllObjects as an incomplete, flagged fetch", async () => {
    const controller = new AbortController();
    mockFetch
      .mockResolvedValueOnce(ok({ objectEntries: objects(0, PAGE_SIZE) }))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => {
          controller.abort();
          throw Object.assign(new Error("aborted"), { name: "AbortError" });
        },
        text: async () => "",
      });

    const result = await datacenter().getAllObjects("42", { deadline: controller.signal });

    expect(result).toMatchObject({ complete: false, stoppedReason: "deadline" });
  });

  it("turns a network failure into a JiraUpstreamError with the cause", async () => {
    mockFetch.mockRejectedValueOnce(
      Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNREFUSED" } }),
    );

    await expect(cloud().getSchemas()).rejects.toThrow(
      "Could not reach Jira: fetch failed (ECONNREFUSED)",
    );
  });
});
