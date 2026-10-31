jest.mock("../../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock("../../webResearch/renderPage", () => ({ createChromiumRenderer: jest.fn() }));

import logger from "../../../utils/logger/fileLogger";
import { type PageRenderer, createChromiumRenderer } from "../../webResearch/renderPage";
import { createSharedPageRenderer, sharedPageRenderer } from "../pageRenderer";

const asMock = (fn: unknown) => fn as jest.Mock;

/** A renderer that is only a marker: nothing here renders a page. */
const marker = (): PageRenderer => jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
});

describe("createSharedPageRenderer", () => {
  it("builds the renderer of the toolkit and gives it a log to report to", () => {
    const renderer = marker();
    const create = jest.fn().mockReturnValue(renderer);

    const built = createSharedPageRenderer({ create, warn: jest.fn() });

    expect(built).toBe(renderer);
    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith({ log: expect.any(Function) });
  });

  it("reports to the application's log, as a warning, when it is given no log of its own", () => {
    const create = jest.fn().mockReturnValue(marker());

    createSharedPageRenderer({ create });
    create.mock.calls[0][0].log("the browser could not be started");

    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith("the browser could not be started");
  });

  it("reports to the log it was given, and not to the application's", () => {
    const create = jest.fn().mockReturnValue(marker());
    const warn = jest.fn();

    createSharedPageRenderer({ create, warn });
    create.mock.calls[0][0].log("the browser could not be started");

    expect(warn).toHaveBeenCalledWith("the browser could not be started");
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("starts no browser: the toolkit's renderer starts one on its first page", () => {
    const create = jest.fn().mockReturnValue(marker());

    createSharedPageRenderer({ create });

    // Nothing but the construction of the renderer has happened by now.
    expect(create).toHaveBeenCalledTimes(1);
  });
});

describe("sharedPageRenderer", () => {
  it("is none when the headless browser is off, and builds nothing", () => {
    expect(sharedPageRenderer({ headless: false })).toBeUndefined();
    expect(sharedPageRenderer({ headless: false })).toBeUndefined();

    expect(createChromiumRenderer).not.toHaveBeenCalled();
  });

  it("is one renderer for the whole process when the browser is on, built on first use", () => {
    const renderer = marker();
    asMock(createChromiumRenderer).mockReturnValue(renderer);

    const first = sharedPageRenderer({ headless: true });
    const second = sharedPageRenderer({ headless: true });

    expect(first).toBe(renderer);
    expect(second).toBe(renderer);
    expect(createChromiumRenderer).toHaveBeenCalledTimes(1);
    // The renderer reports to the application's log.
    asMock(createChromiumRenderer).mock.calls[0][0].log("no browser here");
    expect(logger.warn).toHaveBeenCalledWith("no browser here");
  });

  it("is none again when the setting is switched off, though a renderer was built", () => {
    asMock(createChromiumRenderer).mockReturnValue(marker());
    expect(sharedPageRenderer({ headless: true })).toBeDefined();

    expect(sharedPageRenderer({ headless: false })).toBeUndefined();
  });

  describe("without a setting passed in", () => {
    const realEnv = process.env;

    // The tests replace process.env and must never write to the real one.
    afterEach(() => {
      jest.restoreAllMocks();
      // A boolean, so that a failure cannot print the real environment.
      expect(process.env === realEnv).toBe(true);
    });

    it("reads VENDOR_RESEARCH_HEADLESS from the environment", () => {
      asMock(createChromiumRenderer).mockReturnValue(marker());

      jest.replaceProperty(process, "env", {});
      expect(sharedPageRenderer()).toBeUndefined();

      jest.replaceProperty(process, "env", { VENDOR_RESEARCH_HEADLESS: "true" });
      expect(sharedPageRenderer()).toBeDefined();

      jest.replaceProperty(process, "env", { VENDOR_RESEARCH_HEADLESS: "false" });
      expect(sharedPageRenderer()).toBeUndefined();
    });
  });
});
