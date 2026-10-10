import { describe, it, expect } from "vitest";
import { translations } from "../../../i18n/translations";
import { LANGS } from "../../../test/i18nHelpers";
import { APIError } from "../../tools/error";
import { alertForStartFailure, alertForStarted } from "../vendorResearchAlerts";

/**
 * What the repository throws for a refused call: an APIError with the status, and the
 * response body (`{ message, data }`) on the original error, as `readVendorResearchError` reads it.
 */
const refusal = (status: number, data?: unknown) =>
  new APIError("refused", status, data === undefined ? undefined : { response: { data } });

const GENERIC = {
  variant: "error",
  body: "The research could not be started. Try again.",
} as const;

describe("alertForStarted", () => {
  it("says the research started and where the findings will appear", () => {
    expect(alertForStarted({ alreadyRunning: false }, "Acme Cloud")).toEqual({
      variant: "success",
      body: "Research started for Acme Cloud. Findings appear on the Risks tab.",
    });
  });

  it("says when the vendor is being researched already", () => {
    expect(alertForStarted({ alreadyRunning: true }, "Acme Cloud")).toEqual({
      variant: "info",
      body: "Research is already running for Acme Cloud.",
    });
  });
});

describe("alertForStartFailure", () => {
  it.each([
    [1, 1],
    [59, 1],
    [60, 1],
    [61, 2],
    [540, 9],
    [600, 10],
  ])("asks to wait about a minute more per started minute: %i s is %i min", (seconds, minutes) => {
    expect(
      alertForStartFailure(refusal(429, { code: "cooldown", retryAfterSeconds: seconds })),
    ).toEqual({
      variant: "warning",
      body: `Research ran recently. Try again in ${minutes} min.`,
    });
  });

  it("never shows NaN or zero minutes when the wait is missing or unreadable", () => {
    for (const data of [
      { code: "cooldown" },
      { code: "cooldown", retryAfterSeconds: 0 },
      { code: "cooldown", retryAfterSeconds: -30 },
      { code: "cooldown", retryAfterSeconds: Number.NaN },
      { code: "cooldown", retryAfterSeconds: "soon" },
    ]) {
      expect(alertForStartFailure(refusal(429, data))).toEqual({
        variant: "warning",
        body: "Research ran recently. Try again in 1 min.",
      });
    }
  });

  it("says the daily limit was reached", () => {
    expect(alertForStartFailure(refusal(429, { code: "daily_cap" }))).toEqual({
      variant: "warning",
      body: "The daily research limit for your organization was reached. Try again tomorrow.",
    });
  });

  it("does not guess at a 429 that names no known limit", () => {
    expect(alertForStartFailure(refusal(429))).toEqual(GENERIC);
    expect(alertForStartFailure(refusal(429, "Too many requests"))).toEqual(GENERIC);
    expect(alertForStartFailure(refusal(429, { code: "something_new" }))).toEqual(GENERIC);
  });

  it.each(["search_not_configured", "llm_key_missing"])(
    "says research is not set up for a 409 with the code %s",
    (code) => {
      expect(alertForStartFailure(refusal(409, { code }))).toEqual({
        variant: "warning",
        body: "Vendor research is not set up.",
      });
    },
  );

  it("says the queue is down for a 503, which carries no code", () => {
    expect(alertForStartFailure(refusal(503))).toEqual({
      variant: "error",
      body: "The research could not be started because the job queue is unavailable. Try again later.",
    });
  });

  it.each([400, 403, 404, 500, 502])("gives the generic message for a %i", (status) => {
    expect(alertForStartFailure(refusal(status))).toEqual(GENERIC);
  });

  it("gives the generic message for a network error and for anything unknown", () => {
    for (const odd of [
      new Error("Network Error"),
      new APIError("Network Error"),
      "boom",
      null,
      undefined,
      42,
    ]) {
      expect(alertForStartFailure(odd)).toEqual(GENERIC);
    }
  });
});

describe("translation", () => {
  /** Every key the helpers look up, over every alert they can build. */
  const keysRequested = () => {
    const keys = new Set<string>();
    const t = (key: string) => {
      keys.add(key);
      return key;
    };
    alertForStarted({ alreadyRunning: false }, "Acme", t);
    alertForStarted({ alreadyRunning: true }, "Acme", t);
    for (const failure of [
      refusal(429, { code: "cooldown", retryAfterSeconds: 120 }),
      refusal(429, { code: "daily_cap" }),
      refusal(409, { code: "llm_key_missing" }),
      refusal(503),
      refusal(500),
    ]) {
      alertForStartFailure(failure, t);
    }
    return [...keys];
  };

  it("looks up the dictionary for every message, so that the check below has something to check", () => {
    expect(keysRequested()).toEqual(
      expect.arrayContaining([
        "Research started for {vendorName}. Findings appear on the Risks tab.",
        "Research is already running for {vendorName}.",
        "Research ran recently. Try again in {minutes} min.",
        "The daily research limit for your organization was reached. Try again tomorrow.",
        "Vendor research is not set up.",
        "The research could not be started because the job queue is unavailable. Try again later.",
        "The research could not be started. Try again.",
      ]),
    );
  });

  it.each(LANGS)("has a %s entry for every message", (lang) => {
    const missing = keysRequested().filter((key) => translations[lang][key] === undefined);
    expect(missing).toEqual([]);
  });

  it.each(LANGS)("fills the vendor and the minutes into the %s sentence", (lang) => {
    const t = (key: string) => translations[lang][key] ?? key;
    const started = alertForStarted({ alreadyRunning: false }, "Acme Cloud", t);
    expect(started.body).toContain("Acme Cloud");
    expect(started.body).not.toContain("{vendorName}");
    const cooldown = alertForStartFailure(
      refusal(429, { code: "cooldown", retryAfterSeconds: 540 }),
      t,
    );
    expect(cooldown.body).toContain("9");
    expect(cooldown.body).not.toContain("{minutes}");
  });
});
