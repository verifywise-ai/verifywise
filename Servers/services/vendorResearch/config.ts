/**
 * Settings for the vendor research agent, read from the environment.
 *
 * `process.env` is read only as the default argument of getVendorResearchConfig. Anything that
 * needs other values (tests, mostly) passes an env object instead.
 */

export interface VendorResearchConfig {
  /** Whether research starts by itself after a vendor is created. */
  autoRun: boolean;
  /** Minutes a vendor must wait between two research runs; 0 means no wait. */
  manualCooldownMinutes: number;
  /** Research runs one organization may start in a rolling 24 hours, automatic and manual. */
  dailyRunCap: number;
  /** Research runs one worker process carries out at the same time. */
  workerConcurrency: number;
  /**
   * Whether a page that only a script can build is opened in a headless browser. Off unless an
   * operator turns it on: a browser is the heaviest thing the agent runs, and the host needs one.
   */
  headless: boolean;
  /**
   * Whether the public databases are on. They are one switch: the vendor risk database, which
   * mirrors the lists on a schedule and which a run looks the vendor up in, and the lookups a run
   * still makes itself (breaches, incident reports, status pages). On unless an operator turns it
   * off, for a host that cannot reach the lists, cisa.gov, nist.gov, haveibeenpwned.com and sec.gov.
   * Off, nothing is downloaded and no run looks anything up; the coverage of a run then says that the
   * databases are turned off. The backend reads it to register the schedulers, the worker to run
   * the syncs and the research. The database has no switch of its own.
   */
  records: boolean;
}

const DEFAULT_MANUAL_COOLDOWN_MINUTES = 10;
const DEFAULT_DAILY_RUN_CAP = 50;
/**
 * A run spends nearly all its time waiting for the web and the model, so a process can carry
 * several. The searches of a process go one at a time, a second apart, and a provider key has a
 * rate limit, so more runs at once would mostly wait on each other's searches and calls.
 */
const DEFAULT_WORKER_CONCURRENCY = 5;

/**
 * A whole number of at least `minimum`, or `fallback` for anything else. The text is checked
 * before it is converted because Number("") and Number("  ") are 0, which would quietly turn a
 * blank setting into "no cooldown".
 */
function parseWholeNumber(raw: string | undefined, minimum: number, fallback: number): number {
  const text = (raw ?? "").trim();
  if (!/^\d+$/.test(text)) return fallback;
  const value = Number(text);
  return Number.isSafeInteger(value) && value >= minimum ? value : fallback;
}

export function getVendorResearchConfig(
  env: NodeJS.ProcessEnv = process.env,
): VendorResearchConfig {
  const autoRun = (env.VENDOR_RESEARCH_AUTO_RUN ?? "").trim().toLowerCase();
  const headless = (env.VENDOR_RESEARCH_HEADLESS ?? "").trim().toLowerCase();
  const records = (env.VENDOR_RESEARCH_RECORDS ?? "").trim().toLowerCase();

  return {
    autoRun: autoRun !== "false",
    manualCooldownMinutes: parseWholeNumber(
      env.VENDOR_RESEARCH_MANUAL_COOLDOWN_MINUTES,
      0,
      DEFAULT_MANUAL_COOLDOWN_MINUTES,
    ),
    dailyRunCap: parseWholeNumber(env.VENDOR_RESEARCH_DAILY_RUN_CAP, 1, DEFAULT_DAILY_RUN_CAP),
    workerConcurrency: parseWholeNumber(
      env.VENDOR_RESEARCH_WORKER_CONCURRENCY,
      1,
      DEFAULT_WORKER_CONCURRENCY,
    ),
    headless: headless === "true",
    records: records !== "false",
  };
}
