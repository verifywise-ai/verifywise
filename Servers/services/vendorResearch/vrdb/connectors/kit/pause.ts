/**
 * The pause between two requests of one connector to one host (spec D4.14, section 6.4 of the
 * consolidation). A connector that makes more than one request waits the Crawl-delay or the rate
 * limit that the host asks for between them. `Connector.download` gets no AbortSignal, so the wait
 * is a plain promise, and it is injectable: a test hands the connector a sleep that does not wait.
 *
 * Every multi-request connector is built by a factory that takes the sleep, with the real one as
 * its default (`createXConnector({ sleep = realSleep } = {})`), and exports the connector made with
 * the default.
 */

/** A pause between two requests to one host; injectable, so that a test does not wait. */
export type Sleep = (ms: number) => Promise<void>;

export const realSleep: Sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** The pause each host asks for between two requests (its Crawl-delay, or its rate limit). */
export const HOST_PAUSE_MS = {
  "open.canada.ca": 20_000,
  "www.ftc.gov": 5_000,
  "www.datos.gov.co": 1_000,
  "www.gov.uk": 400,
} as const;

export type PausedHost = keyof typeof HOST_PAUSE_MS;

/** Waits the pause of `host`. */
export function pauseFor(host: PausedHost, sleep: Sleep = realSleep): Promise<void> {
  return sleep(HOST_PAUSE_MS[host]);
}
