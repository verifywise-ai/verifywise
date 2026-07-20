import type { ArticleContent } from '../../contentTypes';

export const inboundIntegrationsContent: ArticleContent = {
  blocks: [
    { type: 'heading', id: 'overview', level: 2, text: 'Inbound integrations' },
    { type: 'paragraph', text: 'Two parts of VerifyWise are built to receive data from outside systems: incidents and intake forms. You can raise an incident from your own monitoring stack, and you can submit an intake form from a public website without a login.' },

    { type: 'heading', id: 'incidents', level: 2, text: 'Creating incidents from another system' },
    { type: 'paragraph', text: 'If your monitoring or observability tooling detects an AI problem, it can record an incident in VerifyWise through the API. Incidents have full CRUD, all behind a token.' },
    { type: 'table', columns: [
      { key: 'method', label: 'Method & path', width: '55%' },
      { key: 'desc', label: 'Description', width: '45%' },
    ], rows: [
      { method: 'GET /api/ai-incident-managements', desc: 'List incidents.' },
      { method: 'GET /api/ai-incident-managements/:id', desc: 'Fetch one incident.' },
      { method: 'POST /api/ai-incident-managements', desc: 'Create an incident.' },
      { method: 'PATCH /api/ai-incident-managements/:id', desc: 'Update an incident.' },
      { method: 'DELETE /api/ai-incident-managements/:id', desc: 'Delete an incident.' },
    ]},
    { type: 'paragraph', text: 'A create needs at least the affected project, a type, a severity, a status, a reporter and a description. Many more fields are accepted for a fuller record.' },
    { type: 'code', language: 'bash', code: 'curl -X POST "http://localhost:3000/api/ai-incident-managements" \\\n  -H "Authorization: Bearer <your-token>" \\\n  -H "Content-Type: application/json" \\\n  -d \'{\n    "ai_project": 1,\n    "type": "Performance degradation",\n    "severity": "High",\n    "status": "Open",\n    "reporter": "monitoring-bot",\n    "description": "Model accuracy dropped below the alert threshold."\n  }\'' },
    { type: 'paragraph', text: 'The response is the standard envelope with the created incident in data. From there your team picks it up in the app.' },

    { type: 'heading', id: 'intake', level: 2, text: 'Submitting public intake forms' },
    { type: 'paragraph', text: 'Intake forms collect AI project requests. Their public endpoints let an external site fetch a form and submit answers with no login, identified by the form\'s public id. These routes are rate-limited and protected by a CAPTCHA.' },
    { type: 'table', columns: [
      { key: 'method', label: 'Method & path', width: '55%' },
      { key: 'desc', label: 'Description', width: '45%' },
    ], rows: [
      { method: 'GET /api/intake/public/by-id/:publicId', desc: 'Fetch the form definition, including its fields.' },
      { method: 'POST /api/intake/public/by-id/:publicId', desc: 'Submit a completed form.' },
      { method: 'GET /api/intake/public/captcha', desc: 'Get a CAPTCHA challenge to include with a submission.' },
    ]},
    { type: 'paragraph', text: 'Fetch the form to learn its fields, then post the answers. The submitter email, the answers as formData and a CAPTCHA token and answer are required.' },
    { type: 'code', language: 'bash', code: 'curl "http://localhost:3000/api/intake/public/by-id/<public-id>"\n\ncurl -X POST "http://localhost:3000/api/intake/public/by-id/<public-id>" \\\n  -H "Content-Type: application/json" \\\n  -d \'{\n    "submitterEmail": "requester@example.com",\n    "submitterName": "Jane Doe",\n    "formData": { "field-1": "New chatbot", "field-2": "Customer support" },\n    "captchaToken": "<token-from-captcha-endpoint>",\n    "captchaAnswer": 7\n  }\'' },
    { type: 'callout', variant: 'info', title: 'No token needed here', text: 'The public intake routes are the one part of the platform that does not use a bearer token, because forms are meant to be filled in by people outside your organization. They are rate-limited and CAPTCHA-gated instead. Everything else in the developer guide needs a token.' },

    { type: 'heading', id: 'what-is-missing', level: 2, text: 'What is not available' },
    { type: 'paragraph', text: 'VerifyWise does not send outbound webhooks for these events. Nothing calls your systems when an incident changes or a form is submitted; your side initiates every request. Automations can send email on events, but there is no action that posts to an external URL.' },

    { type: 'article-links', title: 'Related articles', items: [
      { collectionId: 'developers', articleId: 'platform-rest-api', title: 'Platform REST API', description: 'Auth, base URL, response shape and limits.' },
      { collectionId: 'developers', articleId: 'automations-api', title: 'Automations API', description: 'Run an email action when an event happens.' },
    ]},
  ],
};
