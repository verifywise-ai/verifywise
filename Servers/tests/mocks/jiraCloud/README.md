# Simulated Jira Cloud

A small in-memory stand-in for Jira Cloud REST v3, used by the jira-incidents
tests and for local manual runs. Shapes follow Atlassian's published v3
reference, so it proves our behaviour against our reading of the API, not
against Jira itself. The application never loads it.

## Run

```bash
cd Servers && npx ts-node --transpile-only tests/mocks/jiraCloud/start.ts --port 4010
```

Credentials are `svc@acme.test` / `token-1` (Basic auth). Tests use
`startJiraCloudMock()` from `server.ts` and mutate `mock.state` directly.

## Control endpoints (no auth)

- `POST /__mock/issues`: add an issue (`{ "summary": "...", "labels": [], "priorityId": "3" }`)
- `POST /__mock/issues/{id}/status`: `{ "statusId": "4" }`
- `POST /__mock/reset`: back to the default state
- `POST /__mock/fail-next`: `{ "status": 429, "retryAfter": 30, "path": "/rest/api/3/search", "afterCalls": 1 }`

Search and list endpoints default to 50 results per page.

## Pointing a local VerifyWise at it

The site URL rule only accepts `https://*.atlassian.net`. To accept
`http://localhost:4010`, run the backend with `NODE_ENV=development` and
`JIRA_INCIDENTS_ALLOW_LOCAL_SITE_URL=true`.
