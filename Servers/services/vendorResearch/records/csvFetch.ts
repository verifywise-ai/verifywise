/**
 * The default way to get a list that a public body publishes as a CSV file (the sanctions list of
 * the Treasury): a guarded GET read whole, as fetchJson does for a document of JSON. The file is
 * big and sits behind a redirect to a store, so it has more time than a page; a file that was cut
 * cannot be read to the end.
 */
import { FetchError, guardedFetch } from "../../webResearch/guardedFetch";
import { decodeBody } from "../../webResearch/readPage";
import type { FetchText } from "./types";

const CSV_TYPES = ["text/csv", "text/plain"];
/** A file of 7 MB on a slow link: past the 20 seconds of a page. */
const CSV_TOTAL_TIMEOUT_MS = 40_000;

export const fetchCsv: FetchText = async (url, { maxBytes, signal }) => {
  const response = await guardedFetch(url, {
    allowedContentTypes: CSV_TYPES,
    maxBytes,
    totalTimeoutMs: CSV_TOTAL_TIMEOUT_MS,
    signal,
  });
  if (response.truncated) throw new FetchError("unsupported_type");
  return decodeBody(response.body, response.contentType);
};
