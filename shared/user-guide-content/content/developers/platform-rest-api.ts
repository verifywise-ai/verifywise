import type { ArticleContent } from '../../contentTypes';

export const platformRestApiContent: ArticleContent = {
  blocks: [
    { type: 'heading', id: 'overview', level: 2, text: 'Platform REST API' },
    { type: 'paragraph', text: 'The VerifyWise platform exposes a REST API for reading and writing your governance data: projects, risks, vendors, models, tasks, evidence, policies and more. Every endpoint lives under /api and authenticates with a bearer token you create in the app.' },
    { type: 'paragraph', text: 'This article covers the basics that apply to every endpoint: the base URL, how to authenticate, the response shape and the current limits. For the full endpoint catalog, use the interactive API reference described below.' },
    { type: 'callout', variant: 'info', title: 'Agent Control has its own API', text: 'If you are governing an AI agent’s tool calls, you want the Agent Control hook API instead, not these endpoints. See the API reference in this guide.' },

    { type: 'heading', id: 'base-url', level: 2, text: 'Base URL' },
    { type: 'paragraph', text: 'All endpoints are mounted under the /api prefix. The host depends on where VerifyWise runs. For a local install the default is:' },
    { type: 'code', language: 'bash', code: 'http://localhost:3000/api' },
    { type: 'paragraph', text: 'On a hosted deployment, replace the host with your own domain. Endpoint paths keep their casing exactly as defined. For example, project risks are served at /api/projectRisks, not /api/project-risks.' },

    { type: 'heading', id: 'reference', level: 2, text: 'Interactive API reference' },
    { type: 'paragraph', text: 'VerifyWise serves a live OpenAPI (Swagger) reference that lists every endpoint, its parameters and its response schema. Open it in a browser at:' },
    { type: 'code', language: 'bash', code: 'http://localhost:3000/api/docs' },
    { type: 'paragraph', text: 'The spec is OpenAPI 3.0. Use it as the source of truth for the full endpoint list; this article only covers the cross-cutting rules.' },

    { type: 'heading', id: 'auth', level: 2, text: 'Authentication' },
    { type: 'paragraph', text: 'Every request must carry a bearer token in the Authorization header.' },
    { type: 'code', language: 'bash', code: 'Authorization: Bearer <your-token>' },
    { type: 'paragraph', text: 'You create tokens in the app under Settings → API keys. Only Admin users can create them, and an organization may hold up to 10 active tokens at a time. A token carries the role of the user who created it.' },

    { type: 'heading', id: 'create-token', level: 3, text: 'Create a token' },
    { type: 'paragraph', text: 'Tokens can also be created through the API itself (Admin only). Send a name and an expiry in days:' },
    { type: 'code', language: 'bash', code: 'curl -X POST "http://localhost:3000/api/tokens" \\\n  -H "Authorization: Bearer <admin-token>" \\\n  -H "Content-Type: application/json" \\\n  -d \'{"name":"ci-pipeline","expires_in_days":90}\'' },
    { type: 'callout', variant: 'warning', title: 'The raw token is shown once', text: 'The full token is returned only in the create response, in the data.token field. It is stored as a hash and can never be retrieved again. Copy it immediately; if you lose it, create a new one.' },

    { type: 'heading', id: 'manage-tokens', level: 3, text: 'List, revoke and delete tokens' },
    { type: 'table', columns: [
      { key: 'method', label: 'Method & path', width: '45%' },
      { key: 'desc', label: 'Description', width: '55%' },
    ], rows: [
      { method: 'GET /api/tokens', desc: 'List the organization’s tokens with status and last-used time. The token value itself is never returned.' },
      { method: 'POST /api/tokens', desc: 'Create a token (Admin only). Returns the raw token once.' },
      { method: 'POST /api/tokens/:id/revoke', desc: 'Revoke a token. It stops working immediately and is kept, marked revoked, for your records.' },
      { method: 'DELETE /api/tokens/:id', desc: 'Permanently delete a token row.' },
    ]},
    { type: 'callout', variant: 'tip', title: 'Revoking takes effect immediately', text: 'A revoked token is rejected on its next request, before its expiry date. Revoke a token the moment it may be compromised rather than waiting for it to expire.' },

    { type: 'heading', id: 'response-shape', level: 2, text: 'Response shape' },
    { type: 'paragraph', text: 'Responses use a consistent envelope: a short message and a data field that holds the payload.' },
    { type: 'code', language: 'json', code: '{\n  "message": "OK",\n  "data": {\n    "id": 1,\n    "name": "ci-pipeline",\n    "expires_at": "2027-06-18T00:00:00.000Z"\n  }\n}' },
    { type: 'paragraph', text: 'Client errors (4xx) use the same envelope, with data carrying the detail:' },
    { type: 'code', language: 'json', code: '{\n  "message": "Bad Request",\n  "data": "expires_in_days is required"\n}' },
    { type: 'paragraph', text: 'Server errors (5xx) use an error field instead of data:' },
    { type: 'code', language: 'json', code: '{\n  "message": "Internal Server Error",\n  "error": "..."\n}' },

    { type: 'heading', id: 'status-codes', level: 2, text: 'Status codes' },
    { type: 'table', columns: [
      { key: 'code', label: 'Code', width: '20%' },
      { key: 'meaning', label: 'Meaning', width: '80%' },
    ], rows: [
      { code: '200 / 201', meaning: 'Success. 201 is returned when a resource is created.' },
      { code: '400', meaning: 'Bad request: missing or invalid input.' },
      { code: '401', meaning: 'Missing, invalid, expired or revoked token.' },
      { code: '403', meaning: 'Authenticated, but the token’s role is not allowed to perform this action.' },
      { code: '404', meaning: 'Resource not found.' },
      { code: '500', meaning: 'Server error.' },
    ]},

    { type: 'heading', id: 'limits', level: 2, text: 'Limits to know about' },
    { type: 'paragraph', text: 'Two things work differently from what you might expect. Both are easy to design around once you know about them.' },
    { type: 'callout', variant: 'warning', title: 'List endpoints are not paginated', text: 'List endpoints (for example GET /api/projectRisks, GET /api/vendors) return every matching row for your organization. There are no limit, offset or page parameters. Some lists accept a filter parameter (for example active, deleted or all on risks), but expect to receive the full set and handle large responses on your side.' },
    { type: 'callout', variant: 'warning', title: 'Most CRUD routes are not rate limited', text: 'Rate limiting is applied to some route groups, such as authentication, file, intake-form and detection-scan routes, but not to the main resource (CRUD) routes. Do not treat the absence of a limit as a licence to hammer the API; keep request volumes reasonable, as limits may be added later.' },

    { type: 'heading', id: 'tenancy', level: 2, text: 'Multi-tenancy' },
    { type: 'paragraph', text: 'Every request is scoped to the organization of the token that made it. You only ever see and modify your own organization’s data; there is no cross-organization access through these endpoints.' },

    { type: 'article-links', title: 'Related articles', items: [
      { collectionId: 'developers', articleId: 'working-with-resources', title: 'Working with resources', description: 'The CRUD pattern for projects, risks, vendors and more.' },
      { collectionId: 'developers', articleId: 'overview', title: 'Developer guide', description: 'What the developer guide covers today.' },
      { collectionId: 'developers', articleId: 'agent-control-api', title: 'API reference', description: 'The separate hook API for governing an agent’s tool calls.' },
    ]},
  ],
};
