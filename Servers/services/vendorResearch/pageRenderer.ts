/**
 * The headless browser that vendor research runs share (see webResearch/renderPage.ts), or none:
 * it is off unless VENDOR_RESEARCH_HEADLESS is `true`.
 *
 * The renderer is one for the process, built when a job first asks for it. The runs of a worker
 * then share the one browser, the limit on the pages rendered at once, and the memory of a browser
 * that could not be started. Building it starts nothing: Chromium is started on the first page
 * that needs it, so a process that never meets a page built by a script never runs a browser.
 */
import logger from "../../utils/logger/fileLogger";
import { type PageRenderer, createChromiumRenderer } from "../webResearch/renderPage";
import { type VendorResearchConfig, getVendorResearchConfig } from "./config";

/**
 * @param deps.create Replaces the renderer of the toolkit, for tests.
 * @param deps.warn Replaces the log, for tests. It hears a failure to start the browser, once.
 */
export function createSharedPageRenderer(
  deps: {
    create?: typeof createChromiumRenderer;
    warn?: (message: string) => void;
  } = {},
): PageRenderer {
  const create = deps.create ?? createChromiumRenderer;
  const warn = deps.warn ?? ((message: string) => logger.warn(message));
  return create({ log: warn });
}

let shared: PageRenderer | undefined;

/**
 * The renderer of the process, or undefined when the headless browser is not turned on.
 *
 * @param config Replaces the settings read from the environment, for tests.
 */
export function sharedPageRenderer(
  config: Pick<VendorResearchConfig, "headless"> = getVendorResearchConfig(),
): PageRenderer | undefined {
  if (!config.headless) return undefined;
  shared ??= createSharedPageRenderer();
  return shared;
}
