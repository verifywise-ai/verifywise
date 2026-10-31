/**
 * Thin fetch-based wrapper around the JIRA Service Management Assets API.
 *
 * Supports both cloud (api.atlassian.com/jsm/assets/workspace/{id}/v1) and
 * datacenter (`{baseUrl}/rest/insight/1.0`) deployments. All authentication
 * is Basic email:api_token.
 *
 * SSRF hardening: the datacenter path composes URLs from a user-provided
 * `baseUrl`, and `workspaceId` is user-provided even on cloud. Both go
 * through `utils/safeOutboundUrl.ts` before hitting `fetch()` — protocol
 * check, cloud-metadata block, ReDoS-safe trailing-slash trim.
 */

import { assertSafeOutboundUrl, safeFetch } from "../../utils/safeOutboundUrl";
import {
  EXTERNAL_SYNC_DEADLINE_MS,
  describeFetchError,
  requestSignal,
} from "../../utils/outboundFetch.utils";

export type JiraDeploymentType = "cloud" | "datacenter";

// JIRA workspace IDs are UUIDs (e.g. "12345678-1234-1234-1234-123456789012").
// Constrained here so a malicious value can't inject additional path
// segments into the composed cloud URL.
const WORKSPACE_ID_PATTERN = /^[a-zA-Z0-9-]{1,64}$/;

/** Objects requested per page when listing an object type. */
export const PAGE_SIZE = 50;
/** Hard stop: 500 pages × 50 = 25,000 objects. Past this the fetch is incomplete. */
export const MAX_PAGES = 500;
/** Per-request timeout for every call to Jira. */
export const REQUEST_TIMEOUT_SECONDS = 30;
/** Objects per import-picker page (GET .../objects); "Load more" asks for the next one. */
export const PICKER_MAX_RESULTS = 1000;
/**
 * Overall deadline for walking every object of a type in the worker (manual
 * and scheduled sync). Well inside the 15-minute stale window: the sync
 * heartbeats after every page, and each request has its own 30 s timeout.
 */
export const WORKER_SYNC_DEADLINE_MS = 10 * 60 * 1000;

/**
 * Jira (or the network path to it) failed: non-2xx response, timeout, DNS,
 * TLS. Controllers map it to 502 with this message.
 */
export class JiraUpstreamError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JiraUpstreamError";
  }
}

/** One import-picker page. `nextStartAt` is the offset for "Load more". */
export interface ObjectPage {
  objects: JiraObject[];
  hasMore: boolean;
  nextStartAt: number;
}

export interface ObjectFetchResult {
  objects: JiraObject[];
  /** True only when the API confirmed the last page (see getAllObjects). */
  complete: boolean;
  /** Set when the overall deadline stopped the walk. */
  stoppedReason?: "deadline";
}

/** A finite number from an API field, or null when it is absent or not numeric. */
function knownNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export interface JiraSchema {
  id: string;
  name: string;
  objectSchemaKey?: string;
  description?: string;
}

export interface JiraObjectType {
  id: string;
  name: string;
  description?: string;
  iconId?: string;
  objectCount?: number;
}

export interface JiraAttribute {
  id: string;
  name: string;
  type: number;
  typeValue?: string;
  defaultType?: unknown;
  description?: string;
}

export interface JiraObject {
  id: string;
  objectKey: string;
  label: string;
  objectType: { id: string; name: string };
  attributes: Array<{
    objectAttributeValues: Array<{ value: unknown; displayValue?: string }>;
    objectTypeAttribute: { id: string; name: string };
  }>;
  created: string;
  updated: string;
}

export class JiraAssetsClient {
  private baseUrl: string;
  private workspaceId: string;
  private authHeader: string;
  private deploymentType: JiraDeploymentType;

  constructor(
    baseUrl: string,
    workspaceId: string,
    email: string,
    apiToken: string,
    deploymentType: JiraDeploymentType = "cloud",
  ) {
    if (!WORKSPACE_ID_PATTERN.test(workspaceId)) {
      throw new Error("JIRA workspace ID has an invalid format");
    }
    // For datacenter, validate baseUrl now so the constructor fails fast
    // instead of every request. Cloud ignores baseUrl but we still normalize
    // to keep this.baseUrl predictable.
    if (deploymentType === "datacenter") {
      this.baseUrl = assertSafeOutboundUrl(baseUrl);
    } else {
      this.baseUrl = baseUrl.replace(/\/{1,32}$/, "");
    }
    this.workspaceId = workspaceId;
    this.deploymentType = deploymentType;
    const credentials = Buffer.from(`${email}:${apiToken}`).toString("base64");
    this.authHeader = `Basic ${credentials}`;
  }

  /**
   * One call to the Assets API, with a per-request timeout and an overall
   * deadline (EXTERNAL_SYNC_DEADLINE_MS unless the caller passes its own, as
   * getAllObjects does for the whole walk). Every failure — connecting,
   * a non-2xx status, reading or parsing the body, either timeout — becomes a
   * JiraUpstreamError with a readable reason. getAllObjects tells a deadline
   * stop apart by checking its own signal, not the error type.
   */
  private async request<T>(
    endpoint: string,
    method: string = "GET",
    body?: any,
    deadline: AbortSignal = AbortSignal.timeout(EXTERNAL_SYNC_DEADLINE_MS),
  ): Promise<T> {
    // Both branches feed the composed URL through safeFetch so the
    // outbound call site lives in utils/safeOutboundUrl.ts, not here.
    // The cloud host is fixed (api.atlassian.com); the validation is
    // defence-in-depth in case someone later parameterises it.
    const rawUrl =
      this.deploymentType === "cloud"
        ? `https://api.atlassian.com/jsm/assets/workspace/${this.workspaceId}/v1/${endpoint}`
        : `${this.baseUrl}/rest/insight/1.0/${endpoint}`;
    let response: Response;
    try {
      response = await safeFetch(rawUrl, {
        method,
        headers: {
          Authorization: this.authHeader,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: requestSignal(REQUEST_TIMEOUT_SECONDS, deadline),
      });
    } catch (err) {
      throw new JiraUpstreamError(
        `Could not reach Jira: ${describeFetchError(err, REQUEST_TIMEOUT_SECONDS)}`,
      );
    }
    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new JiraUpstreamError(
        `Jira returned ${response.status}: ${errorText.slice(0, 500) || "no details"}`,
      );
    }
    try {
      return (await response.json()) as T;
    } catch (err) {
      // The body can time out (per-request or overall deadline), be cut off
      // mid-read, or not be JSON.
      throw new JiraUpstreamError(
        `Could not read Jira's response: ${describeFetchError(err, REQUEST_TIMEOUT_SECONDS)}`,
      );
    }
  }

  async getSchemas(): Promise<JiraSchema[]> {
    if (this.deploymentType === "datacenter") {
      const result = await this.request<JiraSchema[]>("objectschema/list");
      return Array.isArray(result) ? result : [];
    }
    const result = await this.request<{ values: JiraSchema[] }>("objectschema/list");
    return result.values || [];
  }

  async getObjectTypes(schemaId: string): Promise<JiraObjectType[]> {
    if (this.deploymentType === "datacenter") {
      const result = await this.request<JiraObjectType[]>(
        `objectschema/${schemaId}/objecttypes/flat`,
      );
      return Array.isArray(result) ? result : [];
    }
    const result = await this.request<any>(`objectschema/${schemaId}/objecttypes`);
    if (Array.isArray(result)) return result;
    return result?.values || [];
  }

  async getAttributes(objectTypeId: string): Promise<JiraAttribute[]> {
    const result = await this.request<JiraAttribute[]>(`objecttype/${objectTypeId}/attributes`);
    return Array.isArray(result) ? result : [];
  }

  /** id→name map for an object type's attributes, attached to each object as `_attrIdToName`. */
  private async attributeNames(objectTypeId: string, deadline?: AbortSignal) {
    const result = await this.request<JiraAttribute[]>(
      `objecttype/${objectTypeId}/attributes`,
      "GET",
      undefined,
      deadline,
    );
    const attrIdToName: Record<string, string> = {};
    for (const attr of Array.isArray(result) ? result : []) attrIdToName[attr.id] = attr.name;
    return attrIdToName;
  }

  /**
   * One page of objects for the import picker, starting at `startAt`. Never
   * walks further pages; the caller asks again with `nextStartAt` ("Load
   * more"). `hasMore` is the API's own last-page signal where it has one
   * (cloud `isLast`, Data Center page count); otherwise a full page is taken
   * to mean there may be more. Nothing destructive depends on it.
   */
  async getObjectsPage(objectTypeId: string, startAt: number = 0): Promise<ObjectPage> {
    const offset = Math.max(0, Math.floor(startAt) || 0);
    if (this.deploymentType === "datacenter") {
      const page = Math.floor(offset / PICKER_MAX_RESULTS) + 1;
      const iql = encodeURIComponent(`objectTypeId=${objectTypeId}`);
      const result = await this.request<any>(
        `iql/objects?objectSchemaId=${encodeURIComponent(this.workspaceId)}&iql=${iql}` +
          `&page=${page}&resultPerPage=${PICKER_MAX_RESULTS}&includeAttributes=true`,
      );
      const objects: JiraObject[] = result?.objectEntries || [];
      const pageCount = knownNumber(result?.pageSize);
      const hasMore =
        objects.length > 0 &&
        (pageCount !== null ? page < pageCount : objects.length >= PICKER_MAX_RESULTS);
      return { objects, hasMore, nextStartAt: page * PICKER_MAX_RESULTS };
    }
    const attrIdToName = await this.attributeNames(objectTypeId);
    const result = await this.request<any>(
      `object/aql?startAt=${offset}&maxResults=${PICKER_MAX_RESULTS}&includeAttributes=true`,
      "POST",
      { qlQuery: `objectTypeId = ${objectTypeId}` },
    );
    const objects: JiraObject[] = result?.values || [];
    for (const obj of objects) (obj as any)._attrIdToName = attrIdToName;
    const hasMore =
      objects.length > 0 &&
      (result?.isLast === false ||
        (result?.isLast !== true && objects.length >= PICKER_MAX_RESULTS));
    return { objects, hasMore, nextStartAt: offset + objects.length };
  }

  /**
   * Fetch every object of a type, following the Assets API pagination.
   *
   * - Cloud: `POST object/aql?startAt=&maxResults=&includeAttributes=true`
   *   with `{ qlQuery }`; the response carries `values`, `isLast`, `total`.
   *   Only `isLast === true` proves the end: `total` is capped (at 1,000) for
   *   larger result sets, so reaching it proves nothing, and the server may
   *   return fewer rows than asked for, so a short page proves nothing either.
   *   The walk advances by the rows returned.
   * - Data Center: `GET iql/objects?...&page=&resultPerPage=`; the response
   *   carries `objectEntries`, `pageSize` (the number of pages) and
   *   `totalFilterCount`. The server may cap `resultPerPage`, so a short page
   *   alone proves nothing, and `pageSize` is never used: a capping server may
   *   compute it from the size that was asked for. The walk ends complete on:
   *   - an empty page;
   *   - `isLast === true`, if the server sends it;
   *   - as many distinct objects as `totalFilterCount`, on a short or
   *     repeated page (on a full page the count could be capped).
   *   A repeated page (no object not already seen — some servers answer past
   *   the end with their last page) with none of these ends it incomplete.
   *
   * Anything else — on cloud an empty page without isLast, a repeated Data
   * Center page without those signals, MAX_PAGES, the overall deadline —
   * returns `complete: false`, and callers must not flag objects missing from
   * the result as gone from Jira.
   */
  async getAllObjects(
    objectTypeId: string,
    options: { onPage?: () => Promise<void>; deadline?: AbortSignal } = {},
  ): Promise<ObjectFetchResult> {
    const deadline = options.deadline ?? AbortSignal.timeout(WORKER_SYNC_DEADLINE_MS);
    const objects: JiraObject[] = [];
    try {
      if (this.deploymentType === "datacenter") {
        const iql = encodeURIComponent(`objectTypeId=${objectTypeId}`);
        const seen = new Set<string>();
        for (let page = 1; page <= MAX_PAGES; page++) {
          const result = await this.request<any>(
            `iql/objects?objectSchemaId=${encodeURIComponent(this.workspaceId)}&iql=${iql}` +
              `&page=${page}&resultPerPage=${PAGE_SIZE}&includeAttributes=true`,
            "GET",
            undefined,
            deadline,
          );
          const entries: JiraObject[] = result?.objectEntries || [];
          if (options.onPage) await options.onPage();
          // An empty page is the end.
          if (entries.length === 0) return { objects, complete: true };
          const total = knownNumber(result?.totalFilterCount);
          const fresh = entries.filter((obj) => !seen.has(String(obj.id)));
          for (const obj of fresh) seen.add(String(obj.id));
          objects.push(...fresh);
          // The server's own signals that every object has been returned. The
          // total counts only on a short or repeated page: on a full page it
          // could be a capped count with more to come.
          const pageNotFull = entries.length < PAGE_SIZE || fresh.length === 0;
          const reachedTotal =
            total !== null && total > 0 && objects.length >= total && pageNotFull;
          if (result?.isLast === true || reachedTotal) return { objects, complete: true };
          // A repeated page (some servers answer past the end with their last
          // page) with none of the signals above proves nothing.
          if (fresh.length === 0) return { objects, complete: false };
          // pageSize (the page count) is not trusted: a server that caps
          // resultPerPage may compute it from the size that was asked for.
        }
        return { objects, complete: false };
      }

      const attrIdToName = await this.attributeNames(objectTypeId, deadline);
      let startAt = 0;
      for (let page = 0; page < MAX_PAGES; page++) {
        const result = await this.request<any>(
          `object/aql?startAt=${startAt}&maxResults=${PAGE_SIZE}&includeAttributes=true`,
          "POST",
          { qlQuery: `objectTypeId = ${objectTypeId}` },
          deadline,
        );
        const values: JiraObject[] = result?.values || [];
        for (const obj of values) (obj as any)._attrIdToName = attrIdToName;
        objects.push(...values);
        if (options.onPage) await options.onPage();
        if (result?.isLast === true) return { objects, complete: true };
        if (values.length === 0) return { objects, complete: false };
        startAt += values.length;
      }
      return { objects, complete: false };
    } catch (err) {
      // Only a request the deadline cut off is a deadline stop. Anything else
      // — notably an error thrown by onPage (the sync's heartbeat finding the
      // run superseded) — propagates unchanged.
      if (err instanceof JiraUpstreamError && deadline.aborted) {
        return { objects, complete: false, stoppedReason: "deadline" };
      }
      throw err;
    }
  }

  async getObjectById(objectId: string): Promise<JiraObject> {
    return this.request<JiraObject>(`object/${objectId}`);
  }

  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      await this.getSchemas();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
