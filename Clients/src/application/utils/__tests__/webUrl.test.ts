import { describe, it, expect } from "vitest";
import { isWebUrl } from "../webUrl";

describe("isWebUrl", () => {
  it.each(["https://example.com", "http://example.com/path?q=1", "HTTPS://EXAMPLE.COM"])(
    "accepts %s",
    (value) => {
      expect(isWebUrl(value)).toBe(true);
    },
  );

  it.each([
    "javascript:alert(1)",
    "mailto:a@b.c",
    "ftp://example.com",
    "https:example.com",
    "http:/example.com",
    "  https://example.com  ",
    "example.com",
    "",
  ])("rejects %s", (value) => {
    expect(isWebUrl(value)).toBe(false);
  });
});
