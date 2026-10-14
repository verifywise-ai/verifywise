/**
 * Import and missing-use-case removal send at most BATCH_SIZE ids per request
 * (the server's IMPORT_MAX_OBJECTS / REMOVE_MISSING_MAX_IDS). A bigger
 * selection is sent as sequential batches; the first error stops the rest.
 *
 * Messages are static sentences with the counts kept apart, so the DOM
 * translation layer can translate them.
 */
import { getApiErrorReason } from "../../../../application/utils/apiErrorReason";
import { RUN_CODES, SYNC_RUNNING_MESSAGE, REMOVAL_INTERRUPTED_MESSAGE } from "./runOutcome";

/** Most ids one request may carry; matches the server limit. */
export const BATCH_SIZE = 100;

export interface BatchProgress {
  /** 1-based position of the first item in the batch being sent. */
  from: number;
  /** 1-based position of its last item. */
  to: number;
  total: number;
}

export interface BatchRun<T, R> {
  /** The batches that succeeded, with what the server answered for each. */
  done: Array<{ batch: T[]; result: R }>;
  /** Batches that failed with an error the run was told to continue past. */
  failed: Array<{ batch: T[]; error: unknown }>;
  /** The error that stopped the run, if any. */
  error?: unknown;
}

/** Send `items` in batches of `size`, one request at a time, stopping at the first error. */
export async function runInBatches<T, R>(
  items: T[],
  send: (batch: T[]) => Promise<R>,
  onProgress?: (progress: BatchProgress) => void,
  size: number = BATCH_SIZE,
): Promise<BatchRun<T, R>> {
  const batches: T[][] = [];
  for (let start = 0; start < items.length; start += size) {
    batches.push(items.slice(start, start + size));
  }
  return runBatches(batches, send, onProgress);
}

/**
 * Send prepared batches one request at a time. An error stops the run unless
 * `continueOn(error)` says it only concerns that batch (it is then recorded in
 * `failed` and the next batch is sent).
 */
export async function runBatches<T, R>(
  batches: T[][],
  send: (batch: T[]) => Promise<R>,
  onProgress?: (progress: BatchProgress) => void,
  continueOn: (error: unknown) => boolean = () => false,
): Promise<BatchRun<T, R>> {
  const total = batches.reduce((sum, b) => sum + b.length, 0);
  const done: BatchRun<T, R>["done"] = [];
  const failed: BatchRun<T, R>["failed"] = [];
  let from = 1;
  for (const batch of batches) {
    onProgress?.({ from, to: from + batch.length - 1, total });
    try {
      done.push({ batch, result: await send(batch) });
    } catch (error) {
      if (!continueOn(error)) return { done, failed, error };
      failed.push({ batch, error });
    }
    from += batch.length;
  }
  return { done, failed };
}

/**
 * Batches that keep every group whole: ids of one group (the links of one
 * project) always go in the same request, because a removal deletes a project
 * only when all its links are in the request. Groups are packed into batches
 * of up to `size` ids in the order they first appear; a group larger than
 * `size` goes alone (the server accepts that: its limit is on projects per
 * request). Ids without a group are their own group.
 */
export function planBatches<T>(
  ids: T[],
  groupOf: (id: T) => number | string | null | undefined,
  size: number = BATCH_SIZE,
): T[][] {
  const groups = new Map<unknown, T[]>();
  let ungrouped = 0;
  for (const id of ids) {
    const key = groupOf(id) ?? `__single_${ungrouped++}`;
    const group = groups.get(key);
    if (group) group.push(id);
    else groups.set(key, [id]);
  }
  const batches: T[][] = [];
  let current: T[] = [];
  for (const group of groups.values()) {
    if (group.length > size) {
      // Keep the order: flush what is packed so far, then the big group alone.
      if (current.length > 0) batches.push(current);
      current = [];
      batches.push(group);
      continue;
    }
    if (current.length + group.length > size) {
      batches.push(current);
      current = [];
    }
    current.push(...group);
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

/** A count shown after a message, with its own label. */
export interface MessageCount {
  label: string;
  value: number;
}

/** What the panel shows when a batched run ends, and which ids to deselect. */
export interface BatchSummary<T> {
  type: "success" | "warning" | "error";
  text: string;
  counts: MessageCount[];
  /**
   * Ids that were handled (imported, already imported, removed, or no longer
   * flagged) and leave the selection. Unsent and failed ids stay selected,
   * so a retry is one click.
   */
  doneIds: T[];
}

export const IMPORT_FINISHED_MESSAGE = "Import finished.";
export const IMPORT_PARTLY_FAILED_MESSAGE =
  "Import finished, but some objects could not be imported. They are still selected; import again to retry.";
export const IMPORTED_LABEL = "Objects imported:";
export const NOT_IMPORTED_LABEL = "Objects not imported:";
export const IMPORTED_BEFORE_STOP_LABEL = "Objects imported before it stopped:";
export const IMPORT_INTERRUPTED_MESSAGE =
  "The import was interrupted because another sync took over.";
export const IMPORT_FAILED_MESSAGE = "The import failed.";

export const REMOVAL_FINISHED_MESSAGE = "Missing use cases removed.";
export const REMOVED_LABEL = "Use cases removed:";
export const REMOVED_BEFORE_STOP_LABEL = "Use cases removed before it stopped:";
export const UNLINKED_LABEL = "Links cleaned up:";
export const NOT_REMOVED_LABEL = "Use cases not removed:";
export const SKIPPED_GONE_LABEL = "Skipped, no longer missing or no longer there:";
export const SKIPPED_LIVE_LABEL = "Skipped, still linked to an object in Jira:";
export const SKIPPED_CHANGED_LABEL = "Skipped, changed during the removal:";
export const SKIPPED_OTHER_LABEL = "Skipped, other reason:";
export const LINKS_REMOVED_LABEL = "Jira links removed:";
export const SKIPPED_NOT_SELECTED_LABEL =
  "Skipped, other missing items of the same use case not selected:";
export const REMOVAL_NOT_SELECTED_MESSAGE =
  "Removal finished, but some use cases were not removed because other missing items of the same use case were not selected. They are still selected; select the rest to remove it.";
export const REMOVAL_LIVE_LINK_MESSAGE =
  "Removal finished. Some use cases were not removed because their use case is still linked to an object that exists in Jira.";
export const REMOVAL_PARTLY_SKIPPED_MESSAGE =
  "Removal finished. Some use cases were not removed because they are no longer missing in Jira or no longer exist.";
export const REMOVAL_KEPT_MESSAGE =
  "Removal finished, but some use cases were not removed. They are still selected.";
export const REMOVAL_FAILED_MESSAGE = "Failed to remove use cases";
/** An interrupted batch after earlier batches removed some ("nothing was removed" would mislead). */
export const REMOVAL_INTERRUPTED_PARTIAL_MESSAGE =
  "The removal was interrupted before it finished. Try again for the rest.";

type ApiError = { status?: number; message?: string; response?: { data?: any } };

/**
 * The one classification of the error that stopped a run. "interrupted" is a
 * 409 whose code says this run lost its claim part-way; any other 409 means a
 * sync (or another run) is going.
 */
function classifyStop(
  error: unknown,
  interruptedCode: string,
): { kind: "interrupted" | "sync_running" | "failed"; error: ApiError } {
  const e = error as ApiError;
  if (e?.status === 409) {
    return {
      kind: e.response?.data?.code === interruptedCode ? "interrupted" : "sync_running",
      error: e,
    };
  }
  return { kind: "failed", error: e };
}

interface ImportResponse {
  success?: boolean;
  imported?: number;
  errors?: string[];
  failed_ids?: string[];
  error?: string;
}

/** Import `ids` in batches through `send` (POST /import with one batch). */
export async function importInBatches(
  ids: string[],
  send: (batch: string[]) => Promise<ImportResponse>,
  onProgress?: (progress: BatchProgress) => void,
): Promise<BatchSummary<string>> {
  const run = await runInBatches(
    ids,
    async (batch) => {
      const response = await send(batch);
      // A response without success is a failure too; stop there.
      if (!response?.success) throw new Error(response?.error || IMPORT_FAILED_MESSAGE);
      return response;
    },
    onProgress,
  );

  let imported = 0;
  let failed = 0;
  const doneIds: string[] = [];
  for (const { batch, result } of run.done) {
    imported += result.imported ?? 0;
    const failedIds = new Set(result.failed_ids ?? []);
    const errorCount = result.errors?.length ?? 0;
    failed += Math.max(failedIds.size, errorCount);
    // Without per-object ids the failed ones cannot be told apart: keep the
    // whole batch here. finishImport then drops the ones that were imported
    // (they leave the picker), so only the failed ones stay selected.
    if (failedIds.size === 0 && errorCount > 0) continue;
    doneIds.push(...batch.filter((id) => !failedIds.has(id)));
  }

  if (!run.error) {
    const counts = [{ label: IMPORTED_LABEL, value: imported }];
    if (failed > 0) counts.push({ label: NOT_IMPORTED_LABEL, value: failed });
    return {
      type: failed > 0 ? "warning" : "success",
      text: failed > 0 ? IMPORT_PARTLY_FAILED_MESSAGE : IMPORT_FINISHED_MESSAGE,
      counts,
      doneIds,
    };
  }

  const stop = classifyStop(run.error, RUN_CODES.importInterrupted);
  if (stop.kind === "interrupted") {
    // The interrupted batch imported some objects before it stopped; which
    // ones is unknown, so its ids stay selected (a retry skips them).
    const partial = stop.error.response?.data?.imported;
    if (typeof partial === "number") imported += partial;
  }
  const counts = [{ label: IMPORTED_BEFORE_STOP_LABEL, value: imported }];
  if (failed > 0) counts.push({ label: NOT_IMPORTED_LABEL, value: failed });
  return {
    type: "error",
    text:
      stop.kind === "interrupted"
        ? IMPORT_INTERRUPTED_MESSAGE
        : stop.kind === "sync_running"
          ? SYNC_RUNNING_MESSAGE
          : getApiErrorReason(stop.error) || stop.error?.message || IMPORT_FAILED_MESSAGE,
    counts,
    doneIds,
  };
}

/**
 * Why the server did not remove a requested use case. Mirrors
 * REMOVAL_SKIP_REASONS in Servers/extensions/jira-assets/jiraAssets.service.ts
 * (there is no package shared by Servers and Clients); a reason this list does
 * not know is handled explicitly below (kept selected, generic message).
 */
export type RemovalSkipReason =
  "no_longer_missing" | "not_found" | "changed" | "has_live_links" | "other_links_not_selected";

interface RemoveResponse {
  /** Use cases (projects) deleted. */
  removed?: number;
  /** Jira links that went with them; more than `removed` when a project had several. */
  links_removed?: number;
  /** Links whose project is not in this organization; only the link was deleted. */
  unlinked?: number;
  skipped_items?: Array<{ id: number; reason: RemovalSkipReason | string }>;
}

/**
 * What a skip means for the selection. no_longer_missing, not_found and
 * has_live_links settle the id (it leaves the "Missing in Jira" list, or is
 * backed by an object Jira still has): deselected. changed (still flagged,
 * worth another try) and other_links_not_selected (select the rest of the use
 * case to remove it) stay selected. An unknown reason is kept too.
 */
function skipBucket(reason: string): "gone" | "live" | "notSelected" | "changed" | "other" {
  switch (reason) {
    case "other_links_not_selected":
      return "notSelected";
    case "no_longer_missing":
    case "not_found":
      return "gone";
    case "has_live_links":
      return "live";
    case "changed":
      return "changed";
    default:
      return "other";
  }
}

/** Remove the use cases `ids` in batches through `send` (POST /use-cases/remove-missing). */
export async function removeInBatches(
  ids: number[],
  send: (batch: number[]) => Promise<RemoveResponse>,
  onProgress?: (progress: BatchProgress) => void,
  /** The project (use case) of each link, so all its links go in one request. */
  projectOf: (id: number) => number | null | undefined = () => null,
): Promise<BatchSummary<number>> {
  // A batch the server rejects as invalid (400) only concerns that batch:
  // report it and go on. A sync running or a lost claim (409) and anything
  // else stop the run.
  const run = await runBatches(
    planBatches(ids, projectOf),
    send,
    onProgress,
    (error) => (error as ApiError)?.status === 400,
  );
  const notRemoved = run.failed.reduce((sum, f) => sum + f.batch.length, 0);
  const firstFailure = run.failed[0]?.error as ApiError | undefined;
  let removed = 0;
  let linksRemoved = 0;
  let unlinked = 0;
  const skips = { gone: 0, live: 0, notSelected: 0, changed: 0, other: 0 };
  const doneIds: number[] = [];
  for (const { batch, result } of run.done) {
    removed += result?.removed ?? 0;
    linksRemoved += result?.links_removed ?? result?.removed ?? 0;
    unlinked += result?.unlinked ?? 0;
    const kept = new Set<number>();
    for (const { id, reason } of result?.skipped_items ?? []) {
      const bucket = skipBucket(reason);
      skips[bucket]++;
      if (bucket === "changed" || bucket === "other" || bucket === "notSelected") kept.add(id);
    }
    doneIds.push(...batch.filter((id) => !kept.has(id)));
  }
  const removedCounts = (label: string): MessageCount[] => [
    { label, value: removed },
    ...(linksRemoved !== removed ? [{ label: LINKS_REMOVED_LABEL, value: linksRemoved }] : []),
  ];
  const extraCounts: MessageCount[] = [
    ...(unlinked > 0 ? [{ label: UNLINKED_LABEL, value: unlinked }] : []),
    ...(skips.gone > 0 ? [{ label: SKIPPED_GONE_LABEL, value: skips.gone }] : []),
    ...(skips.live > 0 ? [{ label: SKIPPED_LIVE_LABEL, value: skips.live }] : []),
    ...(skips.notSelected > 0
      ? [{ label: SKIPPED_NOT_SELECTED_LABEL, value: skips.notSelected }]
      : []),
    ...(skips.changed > 0 ? [{ label: SKIPPED_CHANGED_LABEL, value: skips.changed }] : []),
    ...(skips.other > 0 ? [{ label: SKIPPED_OTHER_LABEL, value: skips.other }] : []),
    ...(notRemoved > 0 ? [{ label: NOT_REMOVED_LABEL, value: notRemoved }] : []),
  ];
  if (!run.error && firstFailure) {
    // Failed batches stay selected (not in doneIds); the others went through.
    return {
      type: "error",
      text: getApiErrorReason(firstFailure) || firstFailure?.message || REMOVAL_FAILED_MESSAGE,
      counts: [...removedCounts(REMOVED_LABEL), ...extraCounts],
      doneIds,
    };
  }
  if (!run.error) {
    const keptAny = skips.changed + skips.other > 0;
    const text = keptAny
      ? REMOVAL_KEPT_MESSAGE
      : skips.notSelected > 0
        ? REMOVAL_NOT_SELECTED_MESSAGE
        : skips.live > 0
          ? REMOVAL_LIVE_LINK_MESSAGE
          : skips.gone > 0
            ? REMOVAL_PARTLY_SKIPPED_MESSAGE
            : REMOVAL_FINISHED_MESSAGE;
    return {
      type: keptAny || skips.notSelected + skips.live + skips.gone > 0 ? "warning" : "success",
      text,
      counts: [...removedCounts(REMOVED_LABEL), ...extraCounts],
      doneIds,
    };
  }
  const stop = classifyStop(run.error, RUN_CODES.removalInterrupted);
  const text =
    stop.kind === "interrupted"
      ? removed + unlinked > 0
        ? REMOVAL_INTERRUPTED_PARTIAL_MESSAGE
        : stop.error.response?.data?.message || REMOVAL_INTERRUPTED_MESSAGE
      : stop.kind === "sync_running"
        ? SYNC_RUNNING_MESSAGE
        : // A failed delete names the use case in the 500 body's reason.
          getApiErrorReason(stop.error) || stop.error?.message || REMOVAL_FAILED_MESSAGE;
  return {
    type: "error",
    text,
    counts: [...removedCounts(REMOVED_BEFORE_STOP_LABEL), ...extraCounts],
    doneIds,
  };
}

/** A panel message: text plus labelled counts. */
export interface PanelMessage {
  type: "success" | "warning" | "error";
  text: string;
  counts?: MessageCount[];
}

/** The summary as a panel message. */
export function summaryMessage<T>(summary: BatchSummary<T>): PanelMessage {
  return { type: summary.type, text: summary.text, counts: summary.counts };
}

/** The selection without the ids a run handled; unsent and failed ids stay. */
export function deselectDone<T>(selected: Set<T>, doneIds: T[]): Set<T> {
  const done = new Set(doneIds);
  return new Set([...selected].filter((id) => !done.has(id)));
}

/** Picker objects without those now imported (from a fresh /use-cases load). */
export function withoutImported<O extends { id: string }>(
  objects: O[],
  importedObjectIds: Set<string> | null,
): O[] {
  if (!importedObjectIds) return objects;
  const next = objects.filter((obj) => !importedObjectIds.has(obj.id));
  return next.length === objects.length ? objects : next;
}

/**
 * Generations of picker requests. A reset, an object-type change or a fresh
 * load starts a new generation; a response from an older one (a "Load more"
 * still in flight) is dropped, objects and paging state alike.
 */
export function createRequestGate() {
  let generation = 0;
  return {
    /** Start a new generation (reset, type change, refresh). */
    bump: () => ++generation,
    /** The generation a request belongs to; call when it is sent. */
    current: () => generation,
    /** Whether a response from `token`'s generation may still be applied. */
    isCurrent: (token: number) => token === generation,
  };
}

export type RequestGate = ReturnType<typeof createRequestGate>;

/**
 * One picker request with its loading flag. A fresh load starts a new
 * generation; "Load more" joins the current one. A response from an older
 * generation is dropped. The loading flag is always cleared: by this request
 * when it is still current, by the reset that superseded it (resetPicker
 * clears it), and after an error even if the error handler reset the picker.
 */
export async function runPickerRequest<T>(opts: {
  gate: RequestGate;
  append: boolean;
  setLoading: (loading: boolean) => void;
  fetch: () => Promise<T>;
  onResult: (result: T) => void;
  onError: (error: unknown) => void;
}): Promise<void> {
  const { gate, append, setLoading } = opts;
  const token = append ? gate.current() : gate.bump();
  setLoading(true);
  try {
    const result = await opts.fetch();
    if (!gate.isCurrent(token)) return;
    opts.onResult(result);
    setLoading(false);
  } catch (error) {
    if (!gate.isCurrent(token)) return;
    opts.onError(error);
    setLoading(false);
  }
}

export interface PickerPage<O> {
  objects: O[];
  hasMore: boolean;
  nextStartAt: number;
}

/** Most pages a refresh reloads; ticks on objects past them are dropped. */
export const MAX_REFRESH_PAGES = 5;

/**
 * Load the picker from the start up to `depth` pages (at least one, at most
 * MAX_REFRESH_PAGES), so a refresh shows as much as was loaded before and
 * keeps the ticks on objects from "Load more" pages. Past MAX_REFRESH_PAGES
 * only the first pages are reloaded, and the panel then keeps only ticks on
 * objects in them. Objects are de-duplicated by id across pages. The walk
 * stops when there is no more, or when the server's next offset is missing,
 * not a number, or does not move forward.
 */
export async function loadPages<O extends { id: string }>(
  fetchPage: (startAt: number) => Promise<PickerPage<O>>,
  depth: number,
): Promise<PickerPage<O> & { pages: number }> {
  const limit = Math.min(Math.max(1, depth), MAX_REFRESH_PAGES);
  const objects: O[] = [];
  const seen = new Set<string>();
  let startAt = 0;
  let hasMore: boolean;
  let pages = 0;
  for (;;) {
    const page = await fetchPage(startAt);
    for (const obj of page.objects) {
      if (seen.has(obj.id)) continue;
      seen.add(obj.id);
      objects.push(obj);
    }
    pages++;
    hasMore = page.hasMore;
    const next = page.nextStartAt;
    const advances = typeof next === "number" && Number.isFinite(next) && next > startAt;
    if (!advances) {
      // No usable next offset: report no more rather than loop or go back.
      hasMore = false;
      break;
    }
    startAt = next;
    if (!hasMore || pages >= limit) break;
  }
  return { objects, hasMore, nextStartAt: startAt, pages };
}

/**
 * The picker after a "Load more" page arrives: the page is appended without
 * duplicates and without objects already imported. `importedObjectIds` is
 * read when the page arrives (not when it was requested), so a page that
 * lands after an import never brings the just-imported objects back.
 */
export function appendPage<O extends { id: string }>(
  prev: O[],
  page: O[],
  importedObjectIds: Set<string>,
): O[] {
  const seen = new Set(prev.map((obj) => obj.id));
  return [...prev, ...page.filter((obj) => !seen.has(obj.id) && !importedObjectIds.has(obj.id))];
}

/**
 * The selection restricted to the objects shown in the picker. The panel
 * derives its effective selection with this at render, so a selected id is
 * never invisible, not even for one frame: this is the one place the
 * selection is derived from the objects. Returns the same set when nothing
 * changes.
 */
export function keepShown<O extends { id: string }>(selected: Set<string>, objects: O[]) {
  const shown = new Set(objects.map((obj) => obj.id));
  const next = new Set([...selected].filter((id) => shown.has(id)));
  return next.size === selected.size ? selected : next;
}

/**
 * How the panel's state changes after an import, as state updaters applied
 * to the latest state (so a "Load more" or a toggle made during the import is
 * kept), from the summary and the freshly loaded imported use cases (not the
 * ones the import started with): imported objects leave the picker and
 * handled ids leave the selection. keepShown (at render) restricts the
 * selection to what the picker still shows, so imported ids of a batch kept whole
 * (errors without ids, or interrupted part-way) leave it too. The handler
 * applies this once, after reloading, so no reload can clear the outcome.
 */
export function finishImport<O extends { id: string }>(
  summary: BatchSummary<string>,
  importedObjectIds: Set<string> | null,
): {
  objects: (prev: O[]) => O[];
  selected: (prev: Set<string>) => Set<string>;
  message: PanelMessage;
} {
  return {
    objects: (prev) => withoutImported(prev, importedObjectIds),
    // Pruned in the same step as the objects: imported ids leave both.
    selected: (prev) => {
      const next = deselectDone(prev, summary.doneIds);
      return importedObjectIds
        ? new Set([...next].filter((id) => !importedObjectIds.has(id)))
        : next;
    },
    message: summaryMessage(summary),
  };
}
