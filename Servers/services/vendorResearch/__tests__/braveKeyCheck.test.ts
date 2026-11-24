/**
 * The Brave Search key check: one request to each endpoint a run asks (LLM Context and news), with a
 * fake fetch, and how the answers are read together. The key must never reach a log line.
 */
jest.mock("../../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { debug: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));
// The real safeFetch opens a network agent; the tests always pass a fake.
jest.mock("../../../utils/safeOutboundUrl", () => ({ safeFetch: jest.fn() }));

import logger from "../../../utils/logger/fileLogger";
import {
  BRAVE_API_BASE,
  MAX_BODY_BYTES,
  checkBraveKey,
  isPlausibleBraveKey,
} from "../braveKeyCheck";
import { braveUrlOf } from "../../webResearch/braveSearch";

const KEY = "BSAsentinelKey0123456789";

const answer = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers });

type Reply = () => Response | Error;

/** A fetch whose web (LLM Context) and news endpoints each answer with their own reply. */
const endpoints = (web: Reply, news: Reply) =>
  jest.fn(async (url: string, _init?: RequestInit) => {
    const reply = url.startsWith(`${BRAVE_API_BASE}/news/`) ? news() : web();
    if (reply instanceof Error) throw reply;
    return reply;
  });

/** A fetch whose two endpoints both answer with the same reply (a new Response each time). */
const fakeFetch = (reply: Reply) => endpoints(reply, reply);

const braveError = (status: number, code: string) => ({
  type: "ErrorResponse",
  error: { status, code, detail: "detail" },
});

const loggedText = () =>
  JSON.stringify([
    (logger.debug as jest.Mock).mock.calls,
    (logger.error as jest.Mock).mock.calls,
    (logger.info as jest.Mock).mock.calls,
    (logger.warn as jest.Mock).mock.calls,
  ]);

beforeEach(() => jest.clearAllMocks());

describe("isPlausibleBraveKey", () => {
  it.each([
    ["a printable key", KEY, true],
    ["ten characters", "a".repeat(10), true],
    ["200 characters", "a".repeat(200), true],
    ["nine characters", "a".repeat(9), false],
    ["201 characters", "a".repeat(201), false],
    ["a space inside", "BSA sentinel key", false],
    ["a tab", "BSAsentinel\tkey", false],
    ["a line break", "BSAsentinelkey\n", false],
    ["a control character", "BSAsentinel\u0000key", false],
    ["a curly quote", "BSAsentinel“key", false],
    ["a non-ASCII letter", "BSAsentinelkéy", false],
    ["not a string", 1234567890123, false],
  ])("%s", (_label, key, expected) => {
    expect(isPlausibleBraveKey(key)).toBe(expected);
  });
});

describe("checkBraveKey", () => {
  it("asks the LLM Context and the news endpoints a run uses, with the key in the subscription header", async () => {
    const fetchImpl = fakeFetch(() => answer(200, {}));

    await expect(checkBraveKey(KEY, { fetchImpl })).resolves.toEqual({ ok: true });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const urls = fetchImpl.mock.calls.map(([url]) => url);
    expect(urls).toEqual([braveUrlOf("test", "web", 1), braveUrlOf("test", "news", 1)]);
    expect(new URL(urls[0]).pathname).toBe("/res/v1/llm/context");
    expect(new URL(urls[1]).pathname).toBe("/res/v1/news/search");
    for (const url of urls) expect(new URL(url).searchParams.get("count")).toBe("1");
    for (const [, init] of fetchImpl.mock.calls) {
      expect(init?.method).toBe("GET");
      expect(init?.headers).toEqual({ Accept: "application/json", "X-Subscription-Token": KEY });
      expect(init?.signal).toBeInstanceOf(AbortSignal);
    }
  });

  it("asks both endpoints at the same time", async () => {
    let release!: () => void;
    const gate = new Promise<void>((done) => {
      release = done;
    });
    const fetchImpl = jest.fn(async (_url: string, _init?: RequestInit) => {
      await gate;
      return answer(200, {});
    });

    const pending = checkBraveKey(KEY, { fetchImpl });
    await Promise.resolve();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    release();
    await expect(pending).resolves.toEqual({ ok: true });
  });

  it.each<[string, Reply, Reply]>([
    ["the web endpoint refuses it", () => answer(402, "Payment required"), () => answer(200, {})],
    ["the news endpoint refuses it", () => answer(200, {}), () => answer(403, "Forbidden")],
    [
      "one endpoint refuses it and the other cannot be reached",
      () => answer(503, "down"),
      () => answer(422, braveError(422, "SUBSCRIPTION_TOKEN_INVALID")),
    ],
  ])("reads the key as invalid when %s", async (_label, web, news) => {
    await expect(checkBraveKey(KEY, { fetchImpl: endpoints(web, news) })).resolves.toEqual({
      ok: false,
      code: "invalid_key",
    });
  });

  it.each<[string, Reply, Reply]>([
    ["the web endpoint cannot be reached", () => new Error("down"), () => answer(200, {})],
    ["the news endpoint answers a 500", () => answer(200, {}), () => answer(500, "error")],
  ])("reads the key as unreachable when %s and the other passes", async (_label, web, news) => {
    await expect(checkBraveKey(KEY, { fetchImpl: endpoints(web, news) })).resolves.toEqual({
      ok: false,
      code: "unreachable",
    });
  });

  it("reads the key as valid when one endpoint passes and the other is rate limited", async () => {
    const fetchImpl = endpoints(
      () => answer(200, {}),
      () => answer(429, braveError(429, "RATE_LIMITED")),
    );

    await expect(checkBraveKey(KEY, { fetchImpl })).resolves.toEqual({ ok: true });
  });

  it("refuses text that cannot be a key without calling Brave", async () => {
    const fetchImpl = fakeFetch(() => answer(200, {}));

    await expect(checkBraveKey("short", { fetchImpl })).resolves.toEqual({
      ok: false,
      code: "invalid_key",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("reads SUBSCRIPTION_TOKEN_INVALID as an invalid key", async () => {
    const fetchImpl = fakeFetch(() => answer(422, braveError(422, "SUBSCRIPTION_TOKEN_INVALID")));

    await expect(checkBraveKey(KEY, { fetchImpl })).resolves.toEqual({
      ok: false,
      code: "invalid_key",
    });
  });

  it.each([401, 402, 403])("reads a %i as an invalid key", async (status) => {
    const fetchImpl = fakeFetch(() => answer(status, "Forbidden"));

    await expect(checkBraveKey(KEY, { fetchImpl })).resolves.toEqual({
      ok: false,
      code: "invalid_key",
    });
  });

  it("reads a 429 as a valid key that is only rate limited", async () => {
    const fetchImpl = fakeFetch(() => answer(429, braveError(429, "RATE_LIMITED")));

    await expect(checkBraveKey(KEY, { fetchImpl })).resolves.toEqual({ ok: true });
  });

  it.each([500, 502, 503])("reads a %i as unreachable", async (status) => {
    const fetchImpl = fakeFetch(() => answer(status, "upstream error"));

    await expect(checkBraveKey(KEY, { fetchImpl })).resolves.toEqual({
      ok: false,
      code: "unreachable",
    });
  });

  it("reads another 422 as unreachable, not as a verdict on the key", async () => {
    const fetchImpl = fakeFetch(() => answer(422, braveError(422, "VALIDATION")));

    await expect(checkBraveKey(KEY, { fetchImpl })).resolves.toEqual({
      ok: false,
      code: "unreachable",
    });
  });

  it("reads a network error or a timeout as unreachable, and logs only the error name", async () => {
    const error = new Error(`connect failed for ${KEY}`);
    error.name = "TimeoutError";
    const fetchImpl = fakeFetch(() => error);

    await expect(checkBraveKey(KEY, { fetchImpl })).resolves.toEqual({
      ok: false,
      code: "unreachable",
    });
    expect(loggedText()).toContain("TimeoutError");
    expect(loggedText()).not.toContain(KEY);
  });

  it("does not read an answer larger than the cap", async () => {
    const big = JSON.stringify(braveError(422, "SUBSCRIPTION_TOKEN_INVALID")).padEnd(
      MAX_BODY_BYTES + 10,
      " ",
    );
    const fetchImpl = fakeFetch(() => answer(422, big));

    // Unread, the answer is a 422 with no known code: unreachable.
    await expect(checkBraveKey(KEY, { fetchImpl })).resolves.toEqual({
      ok: false,
      code: "unreachable",
    });
  });

  it("does not read an answer whose declared length is over the cap", async () => {
    const fetchImpl = fakeFetch(() =>
      answer(200, "{}", { "content-length": String(MAX_BODY_BYTES + 1) }),
    );

    await expect(checkBraveKey(KEY, { fetchImpl })).resolves.toEqual({ ok: true });
  });

  it("never logs the key", async () => {
    for (const reply of [
      () => answer(200, {}),
      () => answer(401, "no"),
      () => answer(500, KEY),
      () => answer(422, braveError(422, "SUBSCRIPTION_TOKEN_INVALID")),
    ]) {
      await checkBraveKey(KEY, { fetchImpl: fakeFetch(reply) });
    }
    expect(loggedText()).not.toContain(KEY);
  });
});
