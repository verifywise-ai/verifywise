/**
 * Simulated Jira Cloud REST v3, for the jira-incidents integration tests and
 * local manual runs (start.ts). Shapes follow Atlassian's published v3
 * reference; it proves our behaviour against our reading of that API, not
 * against Jira itself. Not loaded by the application.
 */
import http from "http";
import { AddressInfo } from "net";
import {
  decodePageToken,
  defaultState,
  encodePageToken,
  MockIssue,
  MockState,
  parseJiraTimestamp,
  parseJql,
  toJiraTimestamp,
  zonedMinuteToInstant,
} from "./store";

export interface JiraCloudMock {
  url: string;
  state: MockState;
  addIssue(partial: Partial<MockIssue> & { summary: string }): MockIssue;
  setStatus(issueId: string, statusId: string, at?: Date): void;
  reset(): void;
  close(): Promise<void>;
}

type Reply = { status: number; body?: unknown; headers?: Record<string, string> };
type Handler = (url: URL, body: any, m: RegExpExecArray) => Reply;

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

/** Missing, non-numeric or < 1 falls back to 50; capped at 100 so paging always advances. */
const pageSize = (raw: unknown): number => {
  const n = Math.floor(Number(raw));
  if (raw === undefined || raw === null || !Number.isFinite(n) || n < 1) return DEFAULT_PAGE_SIZE;
  return Math.min(n, MAX_PAGE_SIZE);
};

/**
 * Every matching entry counts the call down; the first matching entry whose
 * countdown was already spent (or absent) before this call fires and is removed.
 */
const consumeFailure = (queue: MockState["failNext"], pathname: string) => {
  let fire: MockState["failNext"][number] | undefined;
  for (const entry of [...queue]) {
    if (entry.path && !pathname.startsWith(entry.path)) continue;
    if (entry.afterCalls && entry.afterCalls > 0) entry.afterCalls -= 1;
    else if (!fire) fire = entry;
  }
  if (fire) queue.splice(queue.indexOf(fire), 1);
  return fire;
};
const ok = (body?: unknown): Reply => ({ status: 200, body });
const notFound = (): Reply => ({ status: 404, body: { errorMessages: ["Not found"] } });
const badRequest = (message: string): Reply => ({
  status: 400,
  body: { errorMessages: [message] },
});

export async function startJiraCloudMock(options: { port?: number } = {}): Promise<JiraCloudMock> {
  const mock = {} as JiraCloudMock;
  mock.state = defaultState();
  let issueCounter = 0;

  mock.addIssue = (partial) => {
    const n = ++issueCounter;
    const now = toJiraTimestamp(new Date());
    const issue: MockIssue = {
      id: String(19999 + n),
      key: `${mock.state.project.key}-${n}`,
      projectId: mock.state.project.id,
      issueTypeId: mock.state.issueTypes[0].id,
      description: null,
      priorityId: "3",
      labels: [],
      statusId: mock.state.statuses[0].id,
      created: now,
      statusChangedAt: now,
      remoteLinks: [],
      deleted: false,
      ...partial,
    };
    mock.state.issues.push(issue);
    return issue;
  };
  mock.setStatus = (issueId, statusId, at = new Date()) => {
    const issue = mock.state.issues.find((i) => i.id === issueId);
    if (!issue) throw new Error(`No mock issue ${issueId}`);
    issue.statusId = statusId;
    issue.statusChangedAt = toJiraTimestamp(at);
  };
  mock.reset = () => {
    mock.state = defaultState();
    issueCounter = 0;
  };

  const liveIssue = (id: string) => mock.state.issues.find((i) => i.id === id && !i.deleted);
  const pageParams = (url: URL) => ({
    startAt: Number(url.searchParams.get("startAt") ?? 0),
    maxResults: pageSize(url.searchParams.get("maxResults")),
  });
  const toFields = (issue: MockIssue, wanted: string[] | undefined) => {
    const s = mock.state;
    const all: Record<string, unknown> = {
      summary: issue.summary,
      description: issue.description,
      priority: issue.priorityId
        ? {
            id: issue.priorityId,
            name: s.priorities.find((p) => p.id === issue.priorityId)?.name ?? issue.priorityId,
          }
        : null,
      status: {
        id: issue.statusId,
        name: s.statuses.find((x) => x.id === issue.statusId)?.name ?? issue.statusId,
      },
      created: issue.created,
      labels: issue.labels,
    };
    if (!wanted) return all;
    return Object.fromEntries(wanted.filter((k) => k in all).map((k) => [k, all[k]]));
  };

  const search: Handler = (_url, body) => {
    let parsed;
    try {
      parsed = parseJql(body?.jql);
    } catch (e) {
      return badRequest((e as Error).message);
    }
    const maxResults = pageSize(body?.maxResults);
    const start = decodePageToken(body?.nextPageToken);
    let matches: MockIssue[] = [];
    if (mock.state.projectReadable) {
      const live = mock.state.issues.filter((i) => !i.deleted);
      if (parsed.kind === "ids") {
        // Like Jira Cloud: naming an issue that doesn't exist fails the whole query.
        const ids = (parsed as { ids: string[] }).ids;
        const missing = ids.find((id) => !live.some((i) => i.id === id));
        if (missing)
          return badRequest(`An issue with key '${missing}' does not exist for field 'id'.`);
        matches = live.filter((i) => ids.includes(i.id));
      } else {
        const from = zonedMinuteToInstant(
          parsed.createdFrom,
          mock.state.account.timeZone,
        ).getTime();
        matches = live
          .filter(
            (i) =>
              i.projectId === parsed.projectId &&
              i.issueTypeId === parsed.issueTypeId &&
              (parsed.label === null || i.labels.includes(parsed.label)) &&
              parseJiraTimestamp(i.created).getTime() >= from,
          )
          .sort(
            (a, b) =>
              parseJiraTimestamp(a.created).getTime() - parseJiraTimestamp(b.created).getTime(),
          );
      }
    }
    const slice = matches.slice(start, start + maxResults);
    const next = start + slice.length;
    return ok({
      issues: slice.map((i) => ({ id: i.id, key: i.key, fields: toFields(i, body?.fields) })),
      ...(next < matches.length ? { nextPageToken: encodePageToken(next) } : {}),
    });
  };

  const availableTransitions = () =>
    mock.state.transitions.filter((t) => !mock.state.blockedTransitions.includes(t.id));

  const routes: Array<[string, RegExp, Handler]> = [
    ["GET", /^\/rest\/api\/3\/myself$/, () => ok(mock.state.account)],
    [
      "GET",
      /^\/rest\/api\/3\/mypermissions$/,
      (url) => {
        const keys = (url.searchParams.get("permissions") ?? "").split(",").filter(Boolean);
        const permissions = Object.fromEntries(
          keys.map((key) => [key, { key, havePermission: mock.state.permissions[key] === true }]),
        );
        return ok({ permissions });
      },
    ],
    [
      "GET",
      /^\/rest\/api\/3\/project\/search$/,
      (url) => {
        const { startAt, maxResults } = pageParams(url);
        return ok({ values: [mock.state.project], isLast: true, startAt, maxResults, total: 1 });
      },
    ],
    [
      "GET",
      /^\/rest\/api\/3\/project\/([^/]+)$/,
      () => (mock.state.projectReadable ? ok(mock.state.project) : notFound()),
    ],
    ["GET", /^\/rest\/api\/3\/issuetype\/project$/, () => ok(mock.state.issueTypes)],
    [
      "GET",
      /^\/rest\/api\/3\/project\/([^/]+)\/statuses$/,
      () =>
        ok(
          mock.state.issueTypes.map((it) => ({
            id: it.id,
            name: it.name,
            statuses: mock.state.statuses.map((s) => ({
              id: s.id,
              name: s.name,
              statusCategory: { key: s.categoryKey },
            })),
          })),
        ),
    ],
    [
      "GET",
      /^\/rest\/api\/3\/priority\/search$/,
      (url) => {
        const { startAt, maxResults } = pageParams(url);
        return ok({
          values: mock.state.priorities,
          isLast: true,
          startAt,
          maxResults,
          total: mock.state.priorities.length,
        });
      },
    ],
    [
      "GET",
      /^\/rest\/api\/3\/label$/,
      (url) => {
        const { startAt, maxResults } = pageParams(url);
        return ok({
          values: mock.state.labels,
          isLast: true,
          startAt,
          maxResults,
          total: mock.state.labels.length,
        });
      },
    ],
    ["POST", /^\/rest\/api\/3\/search\/jql$/, search],
    [
      "GET",
      /^\/rest\/api\/3\/issue\/([^/]+)$/,
      (_url, _body, m) => {
        const issue = liveIssue(m[1]);
        return issue
          ? ok({ id: issue.id, key: issue.key, fields: toFields(issue, undefined) })
          : notFound();
      },
    ],
    [
      "GET",
      /^\/rest\/api\/3\/issue\/([^/]+)\/changelog$/,
      (url, _body, m) => {
        const issue = liveIssue(m[1]);
        if (!issue) return notFound();
        const { startAt, maxResults } = pageParams(url);
        const entry = {
          id: `${issue.id}-1`,
          created: issue.statusChangedAt,
          items: [{ field: "status", fieldId: "status", to: issue.statusId }],
        };
        return ok({ values: [entry], startAt, maxResults, total: 1, isLast: true });
      },
    ],
    [
      "GET",
      /^\/rest\/api\/3\/issue\/([^/]+)\/transitions$/,
      (_url, _body, m) => {
        if (!liveIssue(m[1])) return notFound();
        const transitions = availableTransitions().map((t) => ({
          id: t.id,
          name: t.name,
          to: {
            id: t.toStatusId,
            name: mock.state.statuses.find((s) => s.id === t.toStatusId)?.name ?? t.toStatusId,
          },
          fields: Object.fromEntries(
            t.requiredFields.map((name) => [
              name,
              { required: true, hasDefaultValue: false, name },
            ]),
          ),
        }));
        return ok({ transitions });
      },
    ],
    [
      "POST",
      /^\/rest\/api\/3\/issue\/([^/]+)\/transitions$/,
      (_url, body, m) => {
        const issue = liveIssue(m[1]);
        if (!issue) return notFound();
        const transition = availableTransitions().find(
          (t) => t.id === String(body?.transition?.id),
        );
        if (!transition) return badRequest("Transition is not available for this issue");
        if (transition.requiredFields.length > 0) {
          return badRequest(`Fields required: ${transition.requiredFields.join(", ")}`);
        }
        mock.setStatus(issue.id, transition.toStatusId);
        return { status: 204 };
      },
    ],
    [
      "POST",
      /^\/rest\/api\/3\/issue\/([^/]+)\/remotelink$/,
      (_url, body, m) => {
        const issue = liveIssue(m[1]);
        if (!issue) return notFound();
        const link = {
          globalId: String(body?.globalId),
          url: String(body?.object?.url),
          title: String(body?.object?.title),
        };
        const index = issue.remoteLinks.findIndex((l) => l.globalId === link.globalId);
        if (index >= 0) issue.remoteLinks[index] = link;
        else issue.remoteLinks.push(link);
        const id = String(10000 + (index >= 0 ? index : issue.remoteLinks.length - 1));
        return {
          status: 201,
          body: { id, self: `${mock.url}/rest/api/3/issue/${issue.id}/remotelink/${id}` },
        };
      },
    ],
    ["POST", /^\/__mock\/issues$/, (_url, body) => ok(mock.addIssue(body))],
    [
      "POST",
      /^\/__mock\/issues\/([^/]+)\/status$/,
      (_url, body, m) => {
        if (!mock.state.issues.some((i) => i.id === m[1])) return notFound();
        mock.setStatus(m[1], String(body?.statusId));
        return ok({});
      },
    ],
    [
      "POST",
      /^\/__mock\/reset$/,
      () => {
        mock.reset();
        return ok({});
      },
    ],
    [
      "POST",
      /^\/__mock\/fail-next$/,
      (_url, body) => {
        mock.state.failNext.push(body);
        return ok({});
      },
    ],
  ];

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://mock");
    const send = (status: number, payload?: unknown, headers: Record<string, string> = {}) => {
      res.writeHead(status, { "Content-Type": "application/json", ...headers });
      res.end(payload === undefined ? "" : JSON.stringify(payload));
    };
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const raw = Buffer.concat(chunks).toString("utf8");
    let body: any;
    try {
      body = raw ? JSON.parse(raw) : undefined;
    } catch {
      return send(400, { errorMessages: ["Invalid JSON body"] });
    }
    mock.state.calls.push({ method: req.method ?? "GET", path: url.pathname, body });

    if (!url.pathname.startsWith("/__mock/")) {
      const expected =
        "Basic " + Buffer.from(`${mock.state.email}:${mock.state.token}`).toString("base64");
      if (req.headers.authorization !== expected)
        return send(401, { errorMessages: ["Unauthorized"] });
      const fired = consumeFailure(mock.state.failNext, url.pathname);
      if (fired) {
        return send(
          fired.status,
          { errorMessages: [`Injected ${fired.status}`] },
          fired.retryAfter !== undefined ? { "Retry-After": String(fired.retryAfter) } : {},
        );
      }
    }
    for (const [method, pattern, handler] of routes) {
      const match = req.method === method ? pattern.exec(url.pathname) : null;
      if (match) {
        try {
          const out = handler(url, body, match);
          return send(out.status, out.body, out.headers);
        } catch (e) {
          return send(500, { errorMessages: [(e as Error).message] });
        }
      }
    }
    send(404, { errorMessages: ["Not found"] });
  });
  await new Promise<void>((resolve) => server.listen(options.port ?? 0, "127.0.0.1", resolve));
  mock.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  mock.close = () =>
    new Promise((resolve) => {
      server.close(() => resolve());
      server.closeAllConnections();
    });
  return mock;
}
