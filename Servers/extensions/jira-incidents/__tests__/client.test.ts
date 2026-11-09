import { startJiraCloudMock, JiraCloudMock } from "../../../tests/mocks/jiraCloud/server";
import { JiraIncidentsClient } from "../jiraIncidents.client";
import {
  JiraAuthError,
  JiraNotFoundError,
  JiraRateLimitError,
  JiraUnreachableError,
} from "../jiraIncidents.errors";

describe("JiraIncidentsClient", () => {
  let mock: JiraCloudMock;
  let sleeps: number[];
  const client = (token = "token-1") =>
    new JiraIncidentsClient({
      siteUrl: mock.url,
      email: "svc@acme.test",
      apiToken: token,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });
  beforeEach(async () => {
    mock = await startJiraCloudMock();
    sleeps = [];
  });
  afterEach(() => mock.close());

  it("reads the service account", async () => {
    expect(await client().myself()).toEqual({ accountId: "svc-1", timeZone: "UTC" });
  });

  it("maps a 401 to the token message", async () => {
    await expect(client("wrong").myself()).rejects.toThrow(
      new JiraAuthError(401, "Jira rejected the API token. It may have expired or been revoked."),
    );
  });

  it("names missing permissions", async () => {
    mock.state.permissions.TRANSITION_ISSUES = false;
    expect(await client().missingPermissions("10000")).toEqual(["TRANSITION_ISSUES"]);
  });

  it("retries once after a short Retry-After, then gives up on a long one", async () => {
    mock.state.failNext.push({ status: 429, retryAfter: 2 });
    await expect(client().myself()).resolves.toBeTruthy();
    expect(sleeps).toEqual([2000]);
    mock.state.failNext.push({ status: 429, retryAfter: 60 });
    await expect(client().myself()).rejects.toBeInstanceOf(JiraRateLimitError);
    mock.state.failNext.push({ status: 503, retryAfter: 1 }, { status: 503, retryAfter: 1 });
    await expect(client().myself()).rejects.toBeInstanceOf(JiraRateLimitError);
  });

  it("pages a search and parses issues", async () => {
    mock.addIssue({ summary: "a", priorityId: "2", created: "2026-10-14T10:00:00.000+0000" });
    mock.addIssue({ summary: "b", priorityId: null, created: "2026-10-14T10:01:00.000+0000" });
    const jql =
      'project = 10000 AND issuetype = 10001 AND created >= "2026-10-14 00:00" ORDER BY created ASC';
    const c = client();
    const first = await c.searchPage(
      jql,
      ["summary", "description", "priority", "status", "created"],
      null,
    );
    expect(first.issues).toHaveLength(2);
    expect(first.issues[0]).toMatchObject({
      summary: "a",
      priorityId: "2",
      statusId: "1",
      statusName: "To Do",
    });
    expect(first.issues[1].priorityId).toBeNull();
    expect(first.issues[0].created.toISOString()).toBe("2026-10-14T10:00:00.000Z");
    expect(first.nextPageToken).toBeNull();
    const call = mock.state.calls.find((x) => x.path === "/rest/api/3/search/jql");
    expect(call?.body.maxResults).toBe(50);
  });

  it("throws JiraNotFoundError for a deleted issue", async () => {
    const issue = mock.addIssue({ summary: "x" });
    issue.deleted = true;
    await expect(client().getIssue(issue.id)).rejects.toBeInstanceOf(JiraNotFoundError);
  });

  it("reads the latest status change time and transitions", async () => {
    const issue = mock.addIssue({ summary: "x" });
    mock.setStatus(issue.id, "3", new Date("2026-10-14T11:00:00Z"));
    const c = client();
    expect((await c.latestStatusChangeAt(issue.id))?.toISOString()).toBe(
      "2026-10-14T11:00:00.000Z",
    );
    mock.state.transitions.push({
      id: "99",
      name: "Resolve",
      toStatusId: "4",
      requiredFields: ["Resolution"],
    });
    const transitions = await c.listTransitions(issue.id);
    expect(transitions.find((t) => t.id === "99")?.requiredFields).toEqual(["Resolution"]);
    await c.transition(issue.id, "13");
    expect(mock.state.issues[0].statusId).toBe("4");
  });

  it("lists statuses for the chosen issue type with categories", async () => {
    expect(await client().listStatuses("10000", "10001")).toEqual([
      { id: "1", name: "To Do", categoryKey: "new" },
      { id: "3", name: "In Progress", categoryKey: "indeterminate" },
      { id: "4", name: "Done", categoryKey: "done" },
    ]);
  });

  it("filters labels by query", async () => {
    expect(await client().listLabels("RISK")).toEqual(["ai-risk"]);
  });

  it("builds a browse URL", () => {
    expect(client().browseUrl("SEC-1")).toBe(`${mock.url}/browse/SEC-1`);
  });

  it("lists projects, issue types, priorities and upserts a remote link", async () => {
    const c = client();
    expect(await c.listProjects()).toEqual([expect.objectContaining({ id: "10000", key: "SEC" })]);
    expect((await c.listIssueTypes("10000"))[0].id).toBe("10001");
    expect((await c.listPriorities()).map((p) => p.id)).toEqual(["2", "3", "4"]);
    expect(await c.getProject("10000")).toMatchObject({ key: "SEC" });
    const issue = mock.addIssue({ summary: "x" });
    const link = { globalId: "vw-1", url: "https://vw.test/i/1", title: "VW" };
    await c.upsertRemoteLink(issue.id, link);
    await c.upsertRemoteLink(issue.id, { ...link, title: "VW 2" });
    expect(issue.remoteLinks).toEqual([{ ...link, title: "VW 2" }]);
  });

  it("waits for a rate limit only once per client", async () => {
    const c = client();
    mock.state.failNext.push({ status: 429, retryAfter: 1 });
    await expect(c.myself()).resolves.toBeTruthy();
    mock.state.failNext.push({ status: 429, retryAfter: 1 });
    await expect(c.listPriorities()).rejects.toBeInstanceOf(JiraRateLimitError);
    expect(sleeps).toEqual([1000]);
  });

  it("ends the rate-limit wait early when the deadline aborts", async () => {
    const controller = new AbortController();
    const c = new JiraIncidentsClient({
      siteUrl: mock.url,
      email: "svc@acme.test",
      apiToken: "token-1",
      deadline: controller.signal,
    });
    mock.state.failNext.push({ status: 429, retryAfter: 5 });
    setTimeout(() => controller.abort(), 100);
    const started = Date.now();
    await expect(c.myself()).rejects.toBeInstanceOf(JiraUnreachableError);
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it("reports an empty body as an unreadable response", async () => {
    const c = client();
    mock.state.projectReadable = true;
    jest.spyOn(c as any, "request").mockResolvedValue(undefined);
    await expect(c.myself()).rejects.toThrow("Could not read Jira's response");
    await expect(c.getProject("10000")).rejects.toThrow("Could not read Jira's response");
    await expect(c.getIssue("1")).rejects.toThrow("Could not read Jira's response");
  });
});
