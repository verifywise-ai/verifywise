import { getVendorResearchConfig, isSearchConfigured } from "../config";

describe("getVendorResearchConfig", () => {
  it("returns the documented defaults when nothing is set", () => {
    expect(getVendorResearchConfig({})).toEqual({
      searchProvider: null,
      tavilyApiKey: null,
      autoRun: true,
      manualCooldownMinutes: 10,
      dailyRunCap: 50,
    });
  });

  describe("search provider and key", () => {
    it("reads the provider name and the key, ignoring case and surrounding spaces", () => {
      const config = getVendorResearchConfig({
        VENDOR_RESEARCH_SEARCH_PROVIDER: " Tavily ",
        TAVILY_API_KEY: "k",
      });

      expect(config.searchProvider).toBe("tavily");
      expect(config.tavilyApiKey).toBe("k");
      expect(isSearchConfigured(config)).toBe(true);
    });

    it("trims spaces around the key", () => {
      const config = getVendorResearchConfig({
        VENDOR_RESEARCH_SEARCH_PROVIDER: "tavily",
        TAVILY_API_KEY: "  k \n",
      });

      expect(config.tavilyApiKey).toBe("k");
    });

    it.each([[undefined], [""], ["   "]])("is not configured when the key is %p", (key) => {
      const config = getVendorResearchConfig({
        VENDOR_RESEARCH_SEARCH_PROVIDER: "tavily",
        TAVILY_API_KEY: key,
      });

      expect(config.tavilyApiKey).toBeNull();
      expect(isSearchConfigured(config)).toBe(false);
    });

    it("is not configured when there is a key but no provider", () => {
      const config = getVendorResearchConfig({ TAVILY_API_KEY: "k" });

      expect(config.searchProvider).toBeNull();
      expect(isSearchConfigured(config)).toBe(false);
    });

    it("treats a provider other than tavily as none, whatever the key", () => {
      const config = getVendorResearchConfig({
        VENDOR_RESEARCH_SEARCH_PROVIDER: "bing",
        TAVILY_API_KEY: "k",
      });

      expect(config.searchProvider).toBeNull();
      expect(isSearchConfigured(config)).toBe(false);
    });
  });

  describe("automatic runs", () => {
    it.each([["false"], ["FALSE"], [" False "]])("are off for %p", (value) => {
      expect(getVendorResearchConfig({ VENDOR_RESEARCH_AUTO_RUN: value }).autoRun).toBe(false);
    });

    it.each([["true"], ["TRUE"], ["0"], [""], ["no"], [undefined]])("stay on for %p", (value) => {
      expect(getVendorResearchConfig({ VENDOR_RESEARCH_AUTO_RUN: value }).autoRun).toBe(true);
    });
  });

  describe("manual cooldown minutes", () => {
    it.each([
      ["0", 0],
      ["25", 25],
      [" 25 ", 25],
    ])("reads %p as %p", (value, expected) => {
      expect(
        getVendorResearchConfig({ VENDOR_RESEARCH_MANUAL_COOLDOWN_MINUTES: value })
          .manualCooldownMinutes,
      ).toBe(expected);
    });

    // An empty or blank value must not read as 0, which would switch the cooldown off.
    it.each([
      [undefined],
      [""],
      ["   "],
      ["abc"],
      ["-5"],
      ["1.5"],
      ["1e3"],
      ["0x10"],
      ["10abc"],
      ["99999999999999999999"],
    ])("falls back to 10 for %p", (value) => {
      expect(
        getVendorResearchConfig({ VENDOR_RESEARCH_MANUAL_COOLDOWN_MINUTES: value })
          .manualCooldownMinutes,
      ).toBe(10);
    });
  });

  describe("daily run cap", () => {
    it.each([
      ["7", 7],
      ["1", 1],
      [" 200 ", 200],
    ])("reads %p as %p", (value, expected) => {
      expect(getVendorResearchConfig({ VENDOR_RESEARCH_DAILY_RUN_CAP: value }).dailyRunCap).toBe(
        expected,
      );
    });

    it.each([[undefined], [""], ["   "], ["abc"], ["-5"], ["0"], ["2.5"], ["1e3"]])(
      "falls back to 50 for %p",
      (value) => {
        expect(getVendorResearchConfig({ VENDOR_RESEARCH_DAILY_RUN_CAP: value }).dailyRunCap).toBe(
          50,
        );
      },
    );
  });
});

describe("isSearchConfigured", () => {
  const base = getVendorResearchConfig({});

  it("needs both the tavily provider and a key", () => {
    expect(isSearchConfigured({ ...base, searchProvider: "tavily", tavilyApiKey: "k" })).toBe(true);
    expect(isSearchConfigured({ ...base, searchProvider: "tavily", tavilyApiKey: null })).toBe(
      false,
    );
    expect(isSearchConfigured({ ...base, searchProvider: null, tavilyApiKey: "k" })).toBe(false);
  });

  it("does not accept an empty key in a hand-built config", () => {
    expect(isSearchConfigured({ ...base, searchProvider: "tavily", tavilyApiKey: "" })).toBe(false);
  });
});

describe("reading process.env when called with no arguments", () => {
  const realEnv = process.env;

  // The tests replace process.env and must never write to the real one.
  afterEach(() => {
    jest.restoreAllMocks();
    // A boolean, so that a failure cannot print the real environment.
    expect(process.env === realEnv).toBe(true);
  });

  it("falls back to the defaults and reports search as not configured when nothing is set", () => {
    jest.replaceProperty(process, "env", {});

    expect(getVendorResearchConfig()).toEqual({
      searchProvider: null,
      tavilyApiKey: null,
      autoRun: true,
      manualCooldownMinutes: 10,
      dailyRunCap: 50,
    });
    expect(isSearchConfigured()).toBe(false);
  });

  it("reads the variables that are set", () => {
    jest.replaceProperty(process, "env", {
      VENDOR_RESEARCH_SEARCH_PROVIDER: "tavily",
      TAVILY_API_KEY: "k",
    });

    expect(getVendorResearchConfig()).toEqual({
      searchProvider: "tavily",
      tavilyApiKey: "k",
      autoRun: true,
      manualCooldownMinutes: 10,
      dailyRunCap: 50,
    });
    expect(isSearchConfigured()).toBe(true);
  });

  it("reads a blank cooldown as the default, not as 0", () => {
    jest.replaceProperty(process, "env", { VENDOR_RESEARCH_MANUAL_COOLDOWN_MINUTES: "" });

    expect(getVendorResearchConfig().manualCooldownMinutes).toBe(10);
  });
});
