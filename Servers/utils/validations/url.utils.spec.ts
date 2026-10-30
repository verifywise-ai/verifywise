import { isWebUrl } from "./url.utils";

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
    "data:text/html,hi",
    "foo:bar",
    "example.com",
    "",
  ])("rejects %s", (value) => {
    expect(isWebUrl(value)).toBe(false);
  });

  it("rejects values that are not strings", () => {
    expect(isWebUrl(42)).toBe(false);
    expect(isWebUrl(null)).toBe(false);
  });
});
