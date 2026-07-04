import type { ArticleContent } from '../../contentTypes';

export const workingWithResourcesContent: ArticleContent = {
  blocks: [
    { type: 'heading', id: 'overview', level: 2, text: 'Working with resources' },
    { type: 'paragraph', text: 'Most VerifyWise resources (projects, risks, vendors, models, tasks and more) follow the same REST pattern: list them, fetch one by id, create, update and delete. Once you know the pattern, every resource works the same way. The few places where they differ are listed at the end.' },
    { type: 'paragraph', text: 'This article assumes you already have a token and know the base URL. If not, read the Platform REST API article first.' },

    { type: 'heading', id: 'pattern', level: 2, text: 'The CRUD pattern' },
    { type: 'paragraph', text: 'Using vendors as the example, here is the full set of operations. Every request carries your bearer token.' },
    { type: 'table', columns: [
      { key: 'op', label: 'Operation', width: '25%' },
      { key: 'method', label: 'Method & path', width: '40%' },
      { key: 'desc', label: 'Returns', width: '35%' },
    ], rows: [
      { op: 'List', method: 'GET /api/vendors', desc: 'Every vendor in your organization.' },
      { op: 'Get one', method: 'GET /api/vendors/:id', desc: 'A single vendor by id.' },
      { op: 'Create', method: 'POST /api/vendors', desc: 'The created vendor, with its new id.' },
      { op: 'Update', method: 'PATCH /api/vendors/:id', desc: 'The updated vendor.' },
      { op: 'Delete', method: 'DELETE /api/vendors/:id', desc: 'A confirmation message.' },
    ]},

    { type: 'heading', id: 'list', level: 3, text: 'List and get' },
    { type: 'code', language: 'bash', code: 'curl "http://localhost:3000/api/vendors" \\\n  -H "Authorization: Bearer <your-token>"' },
    { type: 'paragraph', text: 'The response is the standard envelope. The list lives in the data field:' },
    { type: 'code', language: 'json', code: '{\n  "message": "OK",\n  "data": [\n    { "id": 1, "vendor_name": "Acme AI", "website": "https://acme.example" }\n  ]\n}' },
    { type: 'paragraph', text: 'Fetch a single vendor by adding its id to the path:' },
    { type: 'code', language: 'bash', code: 'curl "http://localhost:3000/api/vendors/1" \\\n  -H "Authorization: Bearer <your-token>"' },

    { type: 'heading', id: 'create', level: 3, text: 'Create' },
    { type: 'paragraph', text: 'Send the resource fields as a JSON body. For a vendor, the common fields are:' },
    { type: 'code', language: 'bash', code: 'curl -X POST "http://localhost:3000/api/vendors" \\\n  -H "Authorization: Bearer <your-token>" \\\n  -H "Content-Type: application/json" \\\n  -d \'{\n    "vendor_name": "Acme AI",\n    "vendor_provides": "LLM hosting",\n    "website": "https://acme.example",\n    "vendor_contact_person": "Jane Doe",\n    "review_status": "Not started"\n  }\'' },
    { type: 'paragraph', text: 'The response returns the created vendor with its assigned id. Each resource has its own set of fields, so check the resource in the live reference at /api/docs to see exactly what it accepts.' },

    { type: 'heading', id: 'update-delete', level: 3, text: 'Update and delete' },
    { type: 'paragraph', text: 'Update sends only the fields you want to change. Delete needs no body.' },
    { type: 'code', language: 'bash', code: 'curl -X PATCH "http://localhost:3000/api/vendors/1" \\\n  -H "Authorization: Bearer <your-token>" \\\n  -H "Content-Type: application/json" \\\n  -d \'{ "review_status": "In review" }\'\n\ncurl -X DELETE "http://localhost:3000/api/vendors/1" \\\n  -H "Authorization: Bearer <your-token>"' },

    { type: 'heading', id: 'differences', level: 2, text: 'Where resources differ' },
    { type: 'paragraph', text: 'The pattern is consistent, but three details vary by resource. Always confirm them per resource in /api/docs before you wire up an integration.' },

    { type: 'heading', id: 'path-casing', level: 3, text: 'Path casing' },
    { type: 'paragraph', text: 'Most paths are lowercase (/api/vendors, /api/projects), but some keep camelCase. Project risks are served at /api/projectRisks, not /api/project-risks. Use the path exactly as the reference shows it.' },

    { type: 'heading', id: 'update-verb', level: 3, text: 'Update verb (PATCH vs PUT)' },
    { type: 'paragraph', text: 'The update verb is not the same for every resource. Sending the wrong one returns a 404 or 405.' },
    { type: 'table', columns: [
      { key: 'resource', label: 'Resource', width: '40%' },
      { key: 'verb', label: 'Update verb', width: '30%' },
      { key: 'path', label: 'Path', width: '30%' },
    ], rows: [
      { resource: 'Projects', verb: 'PATCH', path: '/api/projects/:id' },
      { resource: 'Vendors', verb: 'PATCH', path: '/api/vendors/:id' },
      { resource: 'Project risks', verb: 'PUT', path: '/api/projectRisks/:id' },
    ]},

    { type: 'heading', id: 'filter-param', level: 3, text: 'The filter parameter' },
    { type: 'paragraph', text: 'Some list endpoints accept a filter query parameter, and some do not. Project risks support it; projects and vendors do not. When supported, the values are active (the default), deleted or all.' },
    { type: 'code', language: 'bash', code: 'curl "http://localhost:3000/api/projectRisks?filter=all" \\\n  -H "Authorization: Bearer <your-token>"' },

    { type: 'heading', id: 'roles', level: 2, text: 'Roles and access' },
    { type: 'paragraph', text: 'Every resource endpoint requires a valid token. Most read and write operations are open to any role within your organization, but some actions are restricted. For example, the bulk update of project risks (PATCH /api/projectRisks/bulk) is limited to Admin and Editor. A token carries the role of the user who created it, so an integration that needs to bulk-update risks must use a key created by an Admin or Editor.' },

    { type: 'heading', id: 'reminders', level: 2, text: 'Two reminders' },
    { type: 'callout', variant: 'warning', title: 'List endpoints return everything', text: 'No resource list is paginated. A list call returns every matching row for your organization, so fetch and cache rather than polling in a tight loop, and be ready to handle large responses.' },
    { type: 'callout', variant: 'info', title: 'Check each resource in the reference', text: 'Field names, the update verb and filter support all vary by resource. The live reference at /api/docs is the source of truth for any resource you have not used before.' },

    { type: 'article-links', title: 'Related articles', items: [
      { collectionId: 'developers', articleId: 'platform-rest-api', title: 'Platform REST API', description: 'Auth, base URL, response shape and limits.' },
      { collectionId: 'developers', articleId: 'overview', title: 'Developer guide', description: 'What the developer guide covers today.' },
    ]},
  ],
};
