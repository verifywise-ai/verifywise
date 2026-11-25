import { getVendorResearchConfig } from "../config";

const DEFAULTS = {
  autoRun: true,
  manualCooldownMinutes: 10,
  dailyRunCap: 50,
  workerConcurrency: 5,
  headless: false,
  records: true,
};

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

  describe("headless rendering", () => {
    // A browser is a heavier thing to run than anything else the agent does, so it is off until
    // an operator turns it on, and only a clear "true" turns it on.
    it.each([["true"], ["TRUE"], [" True "]])("is on for %p", (value) => {
      expect(getVendorResearchConfig({ VENDOR_RESEARCH_HEADLESS: value }).headless).toBe(true);
    });

    it.each([["false"], ["FALSE"], ["1"], ["yes"], ["on"], ["0"], [""], ["   "], [undefined]])(
      "stays off for %p",
      (value) => {
        expect(getVendorResearchConfig({ VENDOR_RESEARCH_HEADLESS: value }).headless).toBe(false);
      },
    );
  });

  describe("the records of public databases", () => {
    // The lookup asks three public hosts. It is on unless an operator turns it off, for a host
    // that cannot reach them; only a clear "false" does.
    it.each([["false"], ["FALSE"], [" False "]])("is off for %p", (value) => {
      expect(getVendorResearchConfig({ VENDOR_RESEARCH_RECORDS: value }).records).toBe(false);
    });

    it.each([["true"], ["0"], ["no"], ["off"], [""], ["   "], [undefined]])(
      "stays on for %p",
      (value) => {
        expect(getVendorResearchConfig({ VENDOR_RESEARCH_RECORDS: value }).records).toBe(true);
      },
    );
  });

  describe("the vendor risk database is always on", () => {
    // It has no switch of its own: it is on whenever the records are (VENDOR_RESEARCH_RECORDS, above),
    // and the variable of the earlier versions, VENDOR_RESEARCH_VRDB, is read by nothing: no flag is
    // read (M3 Part B1).
    it.each([
      ["true"],
      ["TRUE"],
      [" True "],
      ["false"],
      ["1"],
      ["yes"],
      [""],
      ["   "],
      [undefined],
    ])("ignores VENDOR_RESEARCH_VRDB, whatever it holds: %p", (value) => {
      const config = getVendorResearchConfig({ VENDOR_RESEARCH_VRDB: value });

      expect(config).toEqual(DEFAULTS);
      expect(config).not.toHaveProperty("vrdb");
    });

    it("is on with no variable set, and off only when the records are", () => {
      expect(getVendorResearchConfig({}).records).toBe(true);
      expect(getVendorResearchConfig({ VENDOR_RESEARCH_VRDB: "false" }).records).toBe(true);
      expect(getVendorResearchConfig({ VENDOR_RESEARCH_RECORDS: "false" }).records).toBe(false);
      expect(
        getVendorResearchConfig({ VENDOR_RESEARCH_RECORDS: "false", VENDOR_RESEARCH_VRDB: "true" })
          .records,
      ).toBe(false);
    });
  });

  describe("worker concurrency", () => {
    it.each([
      ["1", 1],
      ["8", 8],
      [" 12 ", 12],
    ])("reads %p as %p", (value, expected) => {
      expect(
        getVendorResearchConfig({ VENDOR_RESEARCH_WORKER_CONCURRENCY: value }).workerConcurrency,
      ).toBe(expected);
    });

    // 0 would give BullMQ a worker that takes no job, so research would silently never start.
    it.each([[undefined], [""], ["   "], ["abc"], ["-5"], ["0"], ["2.5"], ["1e3"]])(
      "falls back to 5 for %p",
      (value) => {
        expect(
          getVendorResearchConfig({ VENDOR_RESEARCH_WORKER_CONCURRENCY: value }).workerConcurrency,
        ).toBe(5);
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
      VENDOR_RESEARCH_WORKER_CONCURRENCY: "2",
      VENDOR_RESEARCH_HEADLESS: "true",
    });

    expect(getVendorResearchConfig()).toEqual({
      autoRun: false,
      manualCooldownMinutes: 3,
      dailyRunCap: 9,
      workerConcurrency: 2,
      headless: true,
      records: true,
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
