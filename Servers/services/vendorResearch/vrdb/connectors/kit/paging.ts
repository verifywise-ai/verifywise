/**
 * The helpers of a list that is fetched in several requests (a connector that gives `fetchFiles`
 * to the factory, kit/fileConnector.ts), where a list that is partial is worse than no list: a
 * snapshot that lacks a page marks every record of that page as gone.
 *
 * - `pinnedFetch` wraps the sync's fetch so that every answer is checked as the factory checks the
 *   answer to a file of its own: it must come from the operator's host after the redirects
 *   (`isPinned`), a 304 included, or the request fails as not allowed, naming no address (it can
 *   carry a token); and a body that was cut at its limit fails as too large. A connector that
 *   builds the address of a page (or takes it from an answer) asks through it, and need not check.
 * - `fetchAllPages` asks the pages of a list one after the other and gives all the items or none.
 *   The pages are numbered from 0 and each says which is next, or that none is, so that a list
 *   that is cut short, goes round, grows without end, or says more than it gives, is a failure
 *   and never a shorter list: past `maxPages` the download fails as too large, a page that does
 *   not say where the list goes on (or goes back to a page that was asked) is not the list, and a
 *   list that gives fewer items than a page says it holds is unreachable (it may have been cut,
 *   and it will be asked again).
 */
import { FetchError } from "../../../../webResearch/guardedFetch";
import { BodyTooLargeError, type ConnectorFetch, NotTheListError } from "../types";
import { type Pin, isPinned } from "./address";
import { isObject } from "./clean";

/**
 * The fetch with every answer checked against the pin: not allowed when an answer (a 304 too) came
 * from elsewhere, too large when a body was cut. What the wrapped fetch fails with goes through.
 */
export function pinnedFetch(fetch: ConnectorFetch, pin: Pin): ConnectorFetch {
  return async (url, validators, limits) => {
    const response = await fetch(url, validators, limits);
    // The error holds no address: it can carry a token.
    if (!isPinned(response.url, pin)) throw new FetchError("not_allowed");
    if (!response.notModified && response.truncated) throw new BodyTooLargeError();
    return response;
  };
}

const isCount = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0;

/**
 * All the items of a list of pages, in the order that the pages were asked. Page 0 is asked first,
 * and then the page that each answer names as `next`, until one names none (`null`). It fails
 * as too large when `maxPages` pages were asked and the last names another (a `maxPages` that is
 * not a number above zero lets none be asked); as not the list when an answer has no items, names
 * a next that is not a page number or that was asked already, or gives a total that is no count;
 * and as unreachable when a page gave a `total` and the items are fewer at the end (the largest
 * total that any page gave counts). A failure of `ask` goes through. Never a part of the items.
 */
export async function fetchAllPages<T>(
  ask: (page: number) => Promise<{ items: T[]; next: number | null; total?: number }>,
  maxPages: number,
): Promise<T[]> {
  const limit = maxPages >= 0 ? Math.floor(maxPages) : 0;
  const items: T[] = [];
  const asked = new Set<number>();
  let total: number | undefined;

  let page: number | null = 0;
  // The pages asked are counted apart from the set of their numbers, so that the limit holds
  // whatever a page says is next.
  for (let count = 0; page !== null; count += 1) {
    if (count >= limit) throw new BodyTooLargeError();
    asked.add(page);
    const answer: unknown = await ask(page);
    if (!isObject(answer) || !Array.isArray(answer.items)) throw new NotTheListError();
    // A loop and not a spread: a page may hold more items than a call can be given.
    for (const item of answer.items as T[]) items.push(item);

    const { total: given, next } = answer;
    if (given !== undefined && given !== null) {
      if (!isCount(given)) throw new NotTheListError();
      total = Math.max(total ?? 0, given);
    }
    if (next === null) {
      page = null;
    } else if (!isCount(next) || asked.has(next)) {
      throw new NotTheListError();
    } else {
      page = next;
    }
  }

  if (total !== undefined && items.length < total) throw new FetchError("unreachable");
  return items;
}
