import { getVendorResearchConfig } from "../config";

const DEFAULTS = { autoRun: true, manualCooldownMinutes: 10, dailyRunCap: 50 };

describe("getVendorResearchConfig", () => {
  it("returns the documented defaults when nothing is set", () => {
    expect(getVendorResearchConfig({})).toEqual(DEFAULTS);
  });

  // The agent searches the web by itself now: a search provider and its key are no setting any
  // more, and an install that still has them in its environment must see no change.
  it("ignores the search provider variables of earlier versions", () => {
    expect(
      getVendorResearchConfig({
        VENDOR_RESEARCH_SEARCH_PROVIDER: "tavily",
        TAVILY_API_KEY: "k",
      }),
    ).toEqual(DEFAULTS);
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

describe("reading process.env when called with no arguments", () => {
  const realEnv = process.env;

  // The tests replace process.env and must never write to the real one.
  afterEach(() => {
    jest.restoreAllMocks();
    // A boolean, so that a failure cannot print the real environment.
    expect(process.env === realEnv).toBe(true);
  });

  it("falls back to the defaults when nothing is set", () => {
    jest.replaceProperty(process, "env", {});

    expect(getVendorResearchConfig()).toEqual(DEFAULTS);
  });

  it("reads the variables that are set", () => {
    jest.replaceProperty(process, "env", {
      VENDOR_RESEARCH_AUTO_RUN: "false",
      VENDOR_RESEARCH_MANUAL_COOLDOWN_MINUTES: "3",
      VENDOR_RESEARCH_DAILY_RUN_CAP: "9",
    });

    expect(getVendorResearchConfig()).toEqual({
      autoRun: false,
      manualCooldownMinutes: 3,
      dailyRunCap: 9,
    });
  });

  it("ignores the search provider variables of earlier versions", () => {
    jest.replaceProperty(process, "env", {
      VENDOR_RESEARCH_SEARCH_PROVIDER: "tavily",
      TAVILY_API_KEY: "k",
    });

    expect(getVendorResearchConfig()).toEqual(DEFAULTS);
  });

  it("reads a blank cooldown as the default, not as 0", () => {
    jest.replaceProperty(process, "env", { VENDOR_RESEARCH_MANUAL_COOLDOWN_MINUTES: "" });

    expect(getVendorResearchConfig().manualCooldownMinutes).toBe(10);
  });
});
