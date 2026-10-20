import { assertSafeOutboundUrl, safeFetch } from "../../utils/safeOutboundUrl";
import {
  describeFetchError,
  EXTERNAL_SYNC_DEADLINE_MS,
  requestSignal,
} from "../../utils/outboundFetch.utils";
import {
  MAX_RETRY_AFTER_SECONDS,
  REQUEST_TIMEOUT_SECONDS,
  REQUIRED_PERMISSIONS,
  SEARCH_PAGE_SIZE,
  TOKEN_REJECTED_MESSAGE,
} from "./jiraIncidents.constants";
import {
  JiraAuthError,
  JiraHttpError,
  JiraNotFoundError,
  JiraRateLimitError,
  JiraUnreachableError,
} from "./jiraIncidents.errors";
import type { JiraPriority, JiraStatus } from "./mapping";
import type { JiraTransition } from "./decide";

const FORBIDDEN_MESSAGE =
  "Jira refused access for the service account. Check its project permissions.";
const PICKER_PAGE_SIZE = 50;
const PICKER_MAX_PAGES = 20;
const LABEL_PAGE_SIZE = 100;
const LABEL_MAX = 1000;
const LABEL_RESULTS = 50;
const CHANGELOG_PAGE_SIZE = 100;

export interface JiraIssueSummary {
  id: string;
  key: string;
  summary: string;
  description: unknown;
  priorityId: string | null;
  statusId: string;
  statusName: string;
  created: Date;
}

export interface SearchPage {
  issues: JiraIssueSummary[];
  nextPageToken: string | null;
}

interface JiraProject {
  id: string;
  key: string;
  name: string;
}

function parseRetryAfter(raw: string | null): number | null {
  if (raw === null) return null;
  const value = raw.trim();
  if (/^\d+$/.test(value)) return Number(value);
  const at = Date.parse(value);
  if (Number.isNaN(at)) return null;
  return Math.max(0, Math.floor((at - Date.now()) / 1000));
}

function requireBody<T>(raw: T | undefined | null): T {
  if (raw === undefined || raw === null || typeof raw !== "object") {
    throw new JiraUnreachableError("Could not read Jira's response");
  }
  return raw;
}

function parseIssue(raw: any): JiraIssueSummary {
  requireBody(raw);
  const fields = raw?.fields ?? {};
  return {
    id: String(raw.id),
    key: String(raw.key),
    summary: typeof fields.summary === "string" ? fields.summary : "",
    description: fields.description ?? null,
    priorityId: fields.priority?.id != null ? String(fields.priority.id) : null,
    statusId: String(fields.status?.id ?? ""),
    statusName: String(fields.status?.name ?? ""),
    created: new Date(fields.created),
  };
}

export class JiraIncidentsClient {
  private readonly siteUrl: string;
  private readonly authHeader: string;
  private readonly deadline: AbortSignal;
  private waitedForRateLimit = false;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(opts: {
    siteUrl: string;
    email: string;
    apiToken: string;
    deadline?: AbortSignal;
    sleep?: (ms: number) => Promise<void>;
  }) {
    this.siteUrl = assertSafeOutboundUrl(opts.siteUrl);
    this.authHeader = "Basic " + Buffer.from(`${opts.email}:${opts.apiToken}`).toString("base64");
    this.deadline = opts.deadline ?? AbortSignal.timeout(EXTERNAL_SYNC_DEADLINE_MS);
    const deadline = this.deadline;
    this.sleep =
      opts.sleep ??
      ((ms) =>
        new Promise<void>((resolve, reject) => {
          if (deadline.aborted) return reject(deadline.reason);
          const timer = setTimeout(() => {
            deadline.removeEventListener("abort", onAbort);
            resolve();
          }, ms);
          const onAbort = () => {
            clearTimeout(timer);
            reject(deadline.reason);
          };
          deadline.addEventListener("abort", onAbort, { once: true });
        }));
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      let response: Response;
      try {
        response = await safeFetch(`${this.siteUrl}${path}`, {
          method,
          headers: {
            Authorization: this.authHeader,
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: requestSignal(REQUEST_TIMEOUT_SECONDS, this.deadline),
        });
      } catch (err) {
        throw new JiraUnreachableError(
          `Could not reach Jira: ${describeFetchError(err, REQUEST_TIMEOUT_SECONDS)}`,
        );
      }
      if (
        response.status === 429 ||
        (response.status === 503 && response.headers.has("retry-after"))
      ) {
        const retryAfter = parseRetryAfter(response.headers.get("retry-after"));
        if (
          attempt === 0 &&
          !this.waitedForRateLimit &&
          retryAfter !== null &&
          retryAfter <= MAX_RETRY_AFTER_SECONDS
        ) {
          this.waitedForRateLimit = true;
          try {
            await this.sleep(retryAfter * 1000);
          } catch (err) {
            throw new JiraUnreachableError(
              `Could not reach Jira: ${describeFetchError(err, REQUEST_TIMEOUT_SECONDS)}`,
            );
          }
          continue;
        }
        throw new JiraRateLimitError(retryAfter);
      }
      if (response.status === 401) throw new JiraAuthError(401, TOKEN_REJECTED_MESSAGE);
      if (response.status === 403) throw new JiraAuthError(403, FORBIDDEN_MESSAGE);
      if (response.status === 404) {
        throw new JiraNotFoundError(404, `Jira returned 404 for ${path.split("?")[0]}`);
      }
      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new JiraHttpError(
          response.status,
          `Jira returned ${response.status}: ${text.slice(0, 300) || "no details"}`,
        );
      }
      if (response.status === 204) return undefined as T;
      let text: string;
      try {
        text = await response.text();
        return (text ? JSON.parse(text) : undefined) as T;
      } catch {
        throw new JiraUnreachableError("Could not read Jira's response");
      }
    }
  }

  private async pagedValues<T>(path: string, pageSize: number, maxPages: number): Promise<T[]> {
    const out: T[] = [];
    for (let page = 0; page < maxPages; page++) {
      const sep = path.includes("?") ? "&" : "?";
      const data = await this.request<{ values?: T[]; isLast?: boolean }>(
        "GET",
        `${path}${sep}startAt=${page * pageSize}&maxResults=${pageSize}`,
      );
      const values = data?.values ?? [];
      out.push(...values);
      if (data?.isLast !== false || values.length === 0) break;
    }
    return out;
  }

  async myself(): Promise<{ accountId: string; timeZone: string }> {
    const me = requireBody(await this.request<any>("GET", "/rest/api/3/myself"));
    return { accountId: String(me.accountId), timeZone: String(me.timeZone) };
  }

  async missingPermissions(projectId: string): Promise<string[]> {
    const data = await this.request<{
      permissions?: Record<string, { havePermission?: boolean }>;
    }>(
      "GET",
      `/rest/api/3/mypermissions?projectId=${encodeURIComponent(projectId)}&permissions=${REQUIRED_PERMISSIONS.join(",")}`,
    );
    return REQUIRED_PERMISSIONS.filter((key) => data?.permissions?.[key]?.havePermission !== true);
  }

  async getProject(projectId: string): Promise<JiraProject> {
    const p = requireBody(
      await this.request<any>("GET", `/rest/api/3/project/${encodeURIComponent(projectId)}`),
    );
    return { id: String(p.id), key: String(p.key), name: String(p.name ?? p.key) };
  }

  async listProjects(): Promise<JiraProject[]> {
    const values = await this.pagedValues<any>(
      "/rest/api/3/project/search",
      PICKER_PAGE_SIZE,
      PICKER_MAX_PAGES,
    );
    return values.map((p) => ({
      id: String(p.id),
      key: String(p.key),
      name: String(p.name ?? p.key),
    }));
  }

  async listIssueTypes(projectId: string): Promise<Array<{ id: string; name: string }>> {
    const data = await this.request<any[]>(
      "GET",
      `/rest/api/3/issuetype/project?projectId=${encodeURIComponent(projectId)}`,
    );
    return (data ?? []).map((t) => ({ id: String(t.id), name: String(t.name) }));
  }

  async listStatuses(projectId: string, issueTypeId: string): Promise<JiraStatus[]> {
    const data = await this.request<any[]>(
      "GET",
      `/rest/api/3/project/${encodeURIComponent(projectId)}/statuses`,
    );
    const type = (data ?? []).find((t) => String(t.id) === issueTypeId);
    return (type?.statuses ?? []).map((s: any) => ({
      id: String(s.id),
      name: String(s.name),
      categoryKey: String(s.statusCategory?.key ?? ""),
    }));
  }

  async listPriorities(): Promise<JiraPriority[]> {
    const values = await this.pagedValues<any>(
      "/rest/api/3/priority/search",
      PICKER_PAGE_SIZE,
      PICKER_MAX_PAGES,
    );
    return values.map((p) => ({ id: String(p.id), name: String(p.name) }));
  }

  async listLabels(query: string): Promise<string[]> {
    const needle = query.toLowerCase();
    const labels = await this.pagedValues<string>(
      "/rest/api/3/label",
      LABEL_PAGE_SIZE,
      LABEL_MAX / LABEL_PAGE_SIZE,
    );
    return labels
      .slice(0, LABEL_MAX)
      .filter((l) => l.toLowerCase().includes(needle))
      .slice(0, LABEL_RESULTS);
  }

  async searchPage(
    jql: string,
    fields: string[],
    nextPageToken: string | null,
  ): Promise<SearchPage> {
    const data = await this.request<{ issues?: any[]; nextPageToken?: string }>(
      "POST",
      "/rest/api/3/search/jql",
      {
        jql,
        fields,
        maxResults: SEARCH_PAGE_SIZE,
        ...(nextPageToken ? { nextPageToken } : {}),
      },
    );
    return {
      issues: (data?.issues ?? []).map(parseIssue),
      nextPageToken: data?.nextPageToken ?? null,
    };
  }

  async getIssue(issueId: string): Promise<JiraIssueSummary> {
    return parseIssue(
      await this.request<any>("GET", `/rest/api/3/issue/${encodeURIComponent(issueId)}`),
    );
  }

  async latestStatusChangeAt(issueId: string): Promise<Date | null> {
    const base = `/rest/api/3/issue/${encodeURIComponent(issueId)}/changelog`;
    type Page = { values?: any[]; total?: number };
    let data = await this.request<Page>(
      "GET",
      `${base}?startAt=0&maxResults=${CHANGELOG_PAGE_SIZE}`,
    );
    const total = data?.total ?? 0;
    if (total > CHANGELOG_PAGE_SIZE) {
      data = await this.request<Page>(
        "GET",
        `${base}?startAt=${total - CHANGELOG_PAGE_SIZE}&maxResults=${CHANGELOG_PAGE_SIZE}`,
      );
    }
    let latest: Date | null = null;
    for (const entry of data?.values ?? []) {
      const isStatus = (entry.items ?? []).some(
        (item: any) => item.fieldId === "status" || item.field === "status",
      );
      if (!isStatus) continue;
      const at = new Date(entry.created);
      if (Number.isNaN(at.getTime())) continue;
      if (!latest || at > latest) latest = at;
    }
    return latest;
  }

  async listTransitions(issueId: string): Promise<JiraTransition[]> {
    const data = await this.request<{ transitions?: any[] }>(
      "GET",
      `/rest/api/3/issue/${encodeURIComponent(issueId)}/transitions?expand=transitions.fields`,
    );
    return (data?.transitions ?? []).map((t) => ({
      id: String(t.id),
      name: String(t.name),
      toStatusId: String(t.to?.id ?? ""),
      requiredFields: Object.values<any>(t.fields ?? {})
        .filter((f) => f?.required && !f?.hasDefaultValue)
        .map((f) => String(f.name)),
    }));
  }

  async transition(issueId: string, transitionId: string): Promise<void> {
    await this.request<void>(
      "POST",
      `/rest/api/3/issue/${encodeURIComponent(issueId)}/transitions`,
      { transition: { id: transitionId } },
    );
  }

  async upsertRemoteLink(
    issueId: string,
    link: { globalId: string; url: string; title: string },
  ): Promise<void> {
    await this.request<void>(
      "POST",
      `/rest/api/3/issue/${encodeURIComponent(issueId)}/remotelink`,
      { globalId: link.globalId, object: { url: link.url, title: link.title } },
    );
  }

  browseUrl(issueKey: string): string {
    return `${this.siteUrl}/browse/${encodeURIComponent(issueKey)}`;
  }
}
