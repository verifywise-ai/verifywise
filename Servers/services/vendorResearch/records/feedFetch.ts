/**
 * The default way to get a feed from the website of a vendor: a guarded GET that asks the robots.txt
 * of the site first, as the page reader does for a page, for the first address and for every hop
 * of a redirect. The robots.txt of an origin is asked once for a call and kept for nothing more:
 * the callers keep the feeds they got (see records/index.ts), and a feed is asked for rarely.
 *
 * A missing robots.txt, and a site that refuses to show it, disallow nothing; a robots.txt that
 * cannot be reached disallows everything (RFC 9309, 2.3.1), and the fetch fails as
 * `blocked_by_robots`.
 */
import {
  ANY_CONTENT_TYPE,
  BOT_TOKEN,
  FetchError,
  guardedFetch,
} from "../../webResearch/guardedFetch";
import { decodeBody } from "../../webResearch/readPage";
import { createRobotsChecker } from "../../webResearch/robots";
import type { FetchText } from "./types";

/** Atom, as Statuspage and incident.io serve it, and the XML types a site may serve it as. */
const FEED_TYPES = ["application/atom+xml", "application/xml", "text/xml"];
const ROBOTS_MAX_BYTES = 65_536;
const ROBOTS_TIMEOUT_MS = 5_000;

export const fetchFeed: FetchText = async (url, { maxBytes, signal }) => {
  const robots = createRobotsChecker(async (robotsUrl) => {
    try {
      const answer = await guardedFetch(robotsUrl, {
        // Any type is parsed: RFC 9309 makes no condition on it.
        allowedContentTypes: ["text/plain", ANY_CONTENT_TYPE],
        maxBytes: ROBOTS_MAX_BYTES,
        headerTimeoutMs: ROBOTS_TIMEOUT_MS,
        totalTimeoutMs: ROBOTS_TIMEOUT_MS,
        signal,
      });
      return { status: 200, text: decodeBody(answer.body, answer.contentType) };
    } catch (error) {
      // A missing file, and a site that refuses to show it, are a 4xx: nothing is disallowed.
      if (
        error instanceof FetchError &&
        (error.reason === "not_found" || error.reason === "blocked_by_site")
      ) {
        return { status: 404, text: "" };
      }
      throw error;
    }
  }, BOT_TOKEN);

  const response = await guardedFetch(url, {
    allowedContentTypes: FEED_TYPES,
    maxBytes,
    signal,
    beforeRequest: async (hop) => {
      if (!(await robots.isAllowed(hop))) throw new FetchError("blocked_by_robots");
    },
  });
  // A feed that was cut cannot be read to the end.
  if (response.truncated) throw new FetchError("unsupported_type");
  return decodeBody(response.body, response.contentType);
};
