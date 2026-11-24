import { describe, expect, it } from "vitest";
import { CLIENT_DATE_HEADER, clientDate } from "../clientDate";

describe("clientDate", () => {
  it("is the local calendar date, in any time zone", () => {
    // Built from local parts: 20:00 on 24 November wherever the test runs.
    expect(clientDate(new Date(2026, 10, 24, 20, 0))).toBe("2026-11-24");
    expect(clientDate(new Date(2026, 0, 1, 0, 0))).toBe("2026-01-01");
    expect(CLIENT_DATE_HEADER).toBe("X-Client-Date");
  });
});
