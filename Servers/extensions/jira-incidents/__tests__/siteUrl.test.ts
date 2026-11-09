import { localSiteUrlAllowed, normalizeSiteUrl, warnIfLocalOverrideIgnored } from "../siteUrl";

const prod = {
  NODE_ENV: "production",
  JIRA_INCIDENTS_ALLOW_LOCAL_SITE_URL: "true",
} as NodeJS.ProcessEnv;
const dev = {
  NODE_ENV: "development",
  JIRA_INCIDENTS_ALLOW_LOCAL_SITE_URL: "true",
} as NodeJS.ProcessEnv;
const test = { NODE_ENV: "test", JIRA_INCIDENTS_ALLOW_LOCAL_SITE_URL: "true" } as NodeJS.ProcessEnv;
const plain = { NODE_ENV: "development" } as NodeJS.ProcessEnv;

describe("normalizeSiteUrl", () => {
  it("normalises an Atlassian site URL", () => {
    expect(normalizeSiteUrl(" https://ACME.atlassian.net/jira/your-work/ ", plain)).toBe(
      "https://acme.atlassian.net",
    );
  });
  it.each([
    "http://acme.atlassian.net",
    "https://acme.atlassian.net.evil.com",
    "https://atlassian.net",
    "https://evil.com/acme.atlassian.net",
    "https://user:pw@acme.atlassian.net",
    "ftp://acme.atlassian.net",
    "",
    42,
  ])("rejects %p", (raw) => {
    expect(() => normalizeSiteUrl(raw, plain)).toThrow(/atlassian\.net/);
  });
  it("allows localhost only with the override in development or test", () => {
    expect(normalizeSiteUrl("http://localhost:4010", dev)).toBe("http://localhost:4010");
    expect(normalizeSiteUrl("http://127.0.0.1:4010/", test)).toBe("http://127.0.0.1:4010");
    expect(() => normalizeSiteUrl("http://localhost:4010", prod)).toThrow();
    expect(() => normalizeSiteUrl("http://localhost:4010", plain)).toThrow();
    expect(() => normalizeSiteUrl("http://10.0.0.5:4010", dev)).toThrow();
  });
  it("reports whether the override is active", () => {
    expect(localSiteUrlAllowed(dev)).toBe(true);
    expect(localSiteUrlAllowed(test)).toBe(true);
    expect(localSiteUrlAllowed(prod)).toBe(false);
    expect(
      localSiteUrlAllowed({
        NODE_ENV: "development",
        JIRA_INCIDENTS_ALLOW_LOCAL_SITE_URL: "1",
      } as any),
    ).toBe(false);
  });
  it("warns when the override is set outside development and test", () => {
    const warn = jest.fn();
    warnIfLocalOverrideIgnored(prod, warn);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("JIRA_INCIDENTS_ALLOW_LOCAL_SITE_URL"),
    );
    warn.mockClear();
    warnIfLocalOverrideIgnored(dev, warn);
    expect(warn).not.toHaveBeenCalled();
  });
});
