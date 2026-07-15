import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the network layer so we can control timing and count underlying GETs.
vi.mock("../networkServices", () => ({
  apiServices: {
    get: vi.fn(),
  },
}));

import { apiServices } from "../networkServices";
import { getDeduped } from "../inflightGet";

const mockedGet = apiServices.get as unknown as ReturnType<typeof vi.fn>;

/** A promise plus its resolve/reject handles, so the test controls settlement. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("getDeduped", () => {
  beforeEach(() => {
    mockedGet.mockReset();
  });

  it("collapses concurrent identical GETs into a single underlying request", async () => {
    const d = deferred<{ data: number }>();
    mockedGet.mockReturnValueOnce(d.promise);

    const a = getDeduped("/projects");
    const b = getDeduped("/projects");

    expect(mockedGet).toHaveBeenCalledTimes(1);

    d.resolve({ data: 42 });
    const [ra, rb] = await Promise.all([a, b]);
    expect(ra).toBe(rb);
    expect(ra.data).toBe(42);
  });

  it("issues a new request once the previous one has settled", async () => {
    mockedGet.mockResolvedValueOnce({ data: 1 }).mockResolvedValueOnce({ data: 2 });

    const first = await getDeduped("/projects");
    const second = await getDeduped("/projects");

    expect(mockedGet).toHaveBeenCalledTimes(2);
    expect(first.data).toBe(1);
    expect(second.data).toBe(2);
  });

  it("keys by params so different queries are not collapsed together", () => {
    mockedGet.mockReturnValue(deferred().promise);

    getDeduped("/list", { params: { page: 1 } });
    getDeduped("/list", { params: { page: 2 } });

    expect(mockedGet).toHaveBeenCalledTimes(2);
  });

  it("never dedupes abortable calls so they keep independent fate", () => {
    mockedGet.mockReturnValue(deferred().promise);

    const controller = new AbortController();
    getDeduped("/projects", { signal: controller.signal });
    getDeduped("/projects", { signal: controller.signal });

    // Each abortable caller gets its own request; no shared promise.
    expect(mockedGet).toHaveBeenCalledTimes(2);
  });

  it("shares fate among concurrent callers when the request rejects", async () => {
    const d = deferred<unknown>();
    mockedGet.mockReturnValueOnce(d.promise);

    const a = getDeduped("/projects");
    const b = getDeduped("/projects");

    d.reject(new Error("boom"));

    await expect(a).rejects.toThrow("boom");
    await expect(b).rejects.toThrow("boom");
    expect(mockedGet).toHaveBeenCalledTimes(1);
  });

  it("clears the in-flight entry after rejection so a later call retries fresh", async () => {
    const d = deferred<unknown>();
    mockedGet.mockReturnValueOnce(d.promise).mockResolvedValueOnce({ data: "ok" });

    const failing = getDeduped("/projects");
    d.reject(new Error("transient"));
    await expect(failing).rejects.toThrow("transient");

    const retry = await getDeduped("/projects");
    expect(retry.data).toBe("ok");
    expect(mockedGet).toHaveBeenCalledTimes(2);
  });
});
