import { zonedMinuteToInstant } from "../store";
import { startJiraCloudMock, JiraCloudMock } from "../server";

const auth = "Basic " + Buffer.from("svc@acme.test:token-1").toString("base64");
const get = (m: JiraCloudMock, path: string, a = auth) =>
  fetch(`${m.url}${path}`, { headers: { Authorization: a, Accept: "application/json" } });
const post = (m: JiraCloudMock, path: string, body: unknown) =>
  fetch(`${m.url}${path}`, {
    method: "POST",
    headers: {
      Authorization: auth,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });

describe("simulated Jira Cloud", () => {
  let mock: JiraCloudMock;
  beforeEach(async () => {
    mock = await startJiraCloudMock();
  });
  afterEach(async () => {
    await mock.close();
  });

  it("rejects bad credentials", async () => {
    expect((await get(mock, "/rest/api/3/myself", "Basic eDp5")).status).toBe(401);
    expect((await get(mock, "/rest/api/3/myself")).status).toBe(200);
  });

  it("searches by the import JQL in the account's time zone, with paging", async () => {
    mock.state.account.timeZone = "Pacific/Kiritimati";
    for (let i = 0; i < 3; i++)
      mock.addIssue({ summary: `I${i}`, created: "2026-10-14T10:00:00.000+0000" });
    mock.addIssue({ summary: "old", created: "2026-10-13T09:00:00.000+0000" });
    // 2026-10-14 10:00 UTC is 2026-10-15 00:00 in Kiritimati.
    const jql =
      'project = 10000 AND issuetype = 10001 AND created >= "2026-10-15 00:00" ORDER BY created ASC';
    const page1 = await (
      await post(mock, "/rest/api/3/search/jql", { jql, maxResults: 2, fields: ["summary"] })
    ).json();
    expect(page1.issues.map((i: any) => i.fields.summary)).toEqual(["I0", "I1"]);
    const page2 = await (
      await post(mock, "/rest/api/3/search/jql", {
        jql,
        maxResults: 2,
        fields: ["summary"],
        nextPageToken: page1.nextPageToken,
      })
    ).json();
    expect(page2.issues.map((i: any) => i.fields.summary)).toEqual(["I2"]);
    expect(page2.nextPageToken).toBeUndefined();
  });

  it("defaults to 50 results per page and numbers issues SEC-1, SEC-2", async () => {
    for (let i = 0; i < 51; i++) mock.addIssue({ summary: `I${i}` });
    expect(mock.state.issues[0].key).toBe("SEC-1");
    expect(mock.state.issues[0].id).toBe("20000");
    const jql =
      'project = 10000 AND issuetype = 10001 AND created >= "2000-01-01 00:00" ORDER BY created ASC';
    const page1 = await (
      await post(mock, "/rest/api/3/search/jql", { jql, fields: ["summary"] })
    ).json();
    expect(page1.issues).toHaveLength(50);
    expect(page1.nextPageToken).toBeDefined();
  });

  it("filters by label, supports id in (...) and rejects unknown JQL", async () => {
    const a = mock.addIssue({ summary: "a", labels: ["ai"] });
    mock.addIssue({ summary: "b", labels: [] });
    const labelJql =
      'project = 10000 AND issuetype = 10001 AND labels = "ai" AND created >= "2000-01-01 00:00" ORDER BY created ASC';
    const byLabel = await (
      await post(mock, "/rest/api/3/search/jql", {
        jql: labelJql,
        fields: ["summary", "status", "priority"],
      })
    ).json();
    expect(byLabel.issues.map((i: any) => i.key)).toEqual([a.key]);
    expect(byLabel.issues[0].fields.status).toEqual({ id: "1", name: "To Do" });
    expect(byLabel.issues[0].fields.priority).toEqual({ id: "3", name: "Medium" });
    const byIds = await (
      await post(mock, "/rest/api/3/search/jql", { jql: `id in (${a.id})`, fields: ["summary"] })
    ).json();
    expect(byIds.issues).toHaveLength(1);
    expect(
      (await post(mock, "/rest/api/3/search/jql", { jql: "assignee = bob", fields: [] })).status,
    ).toBe(400);
  });

  it("transitions an issue and refuses one that needs a field", async () => {
    const issue = mock.addIssue({ summary: "x" });
    mock.state.transitions.push({
      id: "99",
      name: "Resolve",
      toStatusId: "4",
      requiredFields: ["Resolution"],
    });
    expect(
      (await post(mock, `/rest/api/3/issue/${issue.id}/transitions`, { transition: { id: "11" } }))
        .status,
    ).toBe(204);
    expect(mock.state.issues[0].statusId).toBe("3");
    expect(
      (await post(mock, `/rest/api/3/issue/${issue.id}/transitions`, { transition: { id: "99" } }))
        .status,
    ).toBe(400);
  });

  it("lists transitions without blocked ones and reports the status changelog", async () => {
    const issue = mock.addIssue({ summary: "x" });
    mock.state.blockedTransitions = ["12"];
    const t = await (
      await get(mock, `/rest/api/3/issue/${issue.id}/transitions?expand=transitions.fields`)
    ).json();
    expect(t.transitions.map((x: any) => x.id)).toEqual(["11", "13"]);
    const log = await (await get(mock, `/rest/api/3/issue/${issue.id}/changelog`)).json();
    expect(log.values[0].items[0]).toEqual({ field: "status", fieldId: "status", to: "1" });
    expect(log.isLast).toBe(true);
  });

  it("injects failures with Retry-After", async () => {
    await post(mock, "/__mock/fail-next", { status: 429, retryAfter: 30 });
    const res = await get(mock, "/rest/api/3/myself");
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("30");
    expect((await get(mock, "/rest/api/3/myself")).status).toBe(200);
  });

  it("fires a failure after a number of matching calls", async () => {
    await post(mock, "/__mock/fail-next", {
      status: 500,
      path: "/rest/api/3/myself",
      afterCalls: 1,
    });
    expect((await get(mock, "/rest/api/3/myself")).status).toBe(200);
    expect((await get(mock, "/rest/api/3/myself")).status).toBe(500);
    expect((await get(mock, "/rest/api/3/myself")).status).toBe(200);
  });

  it("hides everything when the project is unreadable and 404s a deleted issue", async () => {
    const issue = mock.addIssue({ summary: "x" });
    issue.deleted = true;
    expect((await get(mock, `/rest/api/3/issue/${issue.id}`)).status).toBe(404);
    mock.state.projectReadable = false;
    expect((await get(mock, "/rest/api/3/project/10000")).status).toBe(404);
  });

  it("serves statuses per issue type and permissions", async () => {
    const s = await (await get(mock, "/rest/api/3/project/10000/statuses")).json();
    expect(s).toEqual([
      {
        id: "10001",
        name: "Incident",
        statuses: [
          { id: "1", name: "To Do", statusCategory: { key: "new" } },
          { id: "3", name: "In Progress", statusCategory: { key: "indeterminate" } },
          { id: "4", name: "Done", statusCategory: { key: "done" } },
        ],
      },
    ]);
    const p = await (
      await get(
        mock,
        "/rest/api/3/mypermissions?projectId=10000&permissions=BROWSE_PROJECTS,LINK_ISSUES",
      )
    ).json();
    expect(p.permissions.LINK_ISSUES).toEqual({ key: "LINK_ISSUES", havePermission: true });
  });

  it("upserts remote links by globalId", async () => {
    const issue = mock.addIssue({ summary: "x" });
    const body = {
      globalId: "verifywise:incident:1:5",
      object: { url: "u", title: "VerifyWise INC-5" },
    };
    await post(mock, `/rest/api/3/issue/${issue.id}/remotelink`, body);
    await post(mock, `/rest/api/3/issue/${issue.id}/remotelink`, body);
    expect(mock.state.issues[0].remoteLinks).toHaveLength(1);
  });

  it("counts down every matching failure and fires a later one immediately", async () => {
    await post(mock, "/__mock/fail-next", {
      status: 500,
      path: "/rest/api/3/myself",
      afterCalls: 2,
    });
    await post(mock, "/__mock/fail-next", { status: 503, path: "/rest/api/3/project" });
    expect((await get(mock, "/rest/api/3/project/10000")).status).toBe(503);
    expect((await get(mock, "/rest/api/3/myself")).status).toBe(200);
    expect((await get(mock, "/rest/api/3/myself")).status).toBe(200);
    expect((await get(mock, "/rest/api/3/myself")).status).toBe(500);
    expect((await get(mock, "/rest/api/3/myself")).status).toBe(200);
  });

  it("falls back to 50 and caps at 100 for unusable maxResults", async () => {
    for (let i = 0; i < 101; i++) mock.addIssue({ summary: `I${i}` });
    const jql =
      'project = 10000 AND issuetype = 10001 AND created >= "2000-01-01 00:00" ORDER BY created ASC';
    const size = async (maxResults: unknown) =>
      (await (await post(mock, "/rest/api/3/search/jql", { jql, maxResults, fields: [] })).json())
        .issues.length;
    expect(await size(0)).toBe(50);
    expect(await size(-3)).toBe(50);
    expect(await size("abc")).toBe(50);
    expect(await size(500)).toBe(100);
  });
});

describe("zonedMinuteToInstant", () => {
  const iso = (local: string, zone: string) => zonedMinuteToInstant(local, zone).toISOString();
  it("handles DST changes in zones behind UTC", () => {
    expect(iso("2026-03-08 03:30", "America/New_York")).toBe("2026-03-08T07:30:00.000Z");
    expect(iso("2026-11-01 00:30", "America/New_York")).toBe("2026-11-01T04:30:00.000Z");
    expect(iso("2026-11-01 03:30", "America/New_York")).toBe("2026-11-01T08:30:00.000Z");
  });
  it("does not throw for a nonexistent local time", () => {
    expect(["2026-03-29T01:30:00.000Z", "2026-03-29T02:30:00.000Z"]).toContain(
      iso("2026-03-29 02:30", "Europe/London"),
    );
  });
  it("keeps fixed-offset zones unchanged", () => {
    expect(iso("2026-10-15 00:00", "Pacific/Kiritimati")).toBe("2026-10-14T10:00:00.000Z");
  });
});
