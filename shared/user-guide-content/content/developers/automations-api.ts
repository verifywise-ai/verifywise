import type { ArticleContent } from '../../contentTypes';

export const automationsApiContent: ArticleContent = {
  blocks: [
    { type: 'heading', id: 'overview', level: 2, text: 'Automations API' },
    { type: 'paragraph', text: 'An automation runs an action when something happens in VerifyWise: a vendor is added, a risk is updated, a policy is deleted and so on. You can create and manage automations through the REST API as well as in the app, which is useful for provisioning the same rules across environments from a script.' },
    { type: 'callout', variant: 'info', title: 'What automations can do today', text: 'Triggers cover the create, update and delete events for the main resource types, plus scheduled reports. The only action available right now is sending an email. There is no action that calls an external URL, so automations notify people; they do not push events to other systems.' },

    { type: 'heading', id: 'shape', level: 2, text: 'How a rule is shaped' },
    { type: 'paragraph', text: 'An automation links one trigger to one or more actions. Each piece is identified by an id you look up from the discovery endpoints below.' },
    { type: 'bullet-list', items: [
      { bold: 'Trigger', text: 'The event that starts the automation, identified by a triggerId.' },
      { bold: 'Actions', text: 'What to do when the trigger fires. Each action has an action_type_id and a params object holding its configuration, such as the email recipients and body.' },
    ]},

    { type: 'heading', id: 'discover', level: 2, text: 'Discover triggers and actions' },
    { type: 'paragraph', text: 'Before creating a rule, fetch the available triggers and the actions each trigger supports. Both return the standard envelope with the list in data.' },
    { type: 'table', columns: [
      { key: 'method', label: 'Method & path', width: '50%' },
      { key: 'desc', label: 'Returns', width: '50%' },
    ], rows: [
      { method: 'GET /api/automations/triggers', desc: 'The trigger types you can use, each with its id, key and label.' },
      { method: 'GET /api/automations/actions/by-triggerId/:triggerId', desc: 'The actions available for a given trigger.' },
    ]},
    { type: 'code', language: 'bash', code: 'curl "http://localhost:3000/api/automations/triggers" \\\n  -H "Authorization: Bearer <your-token>"' },

    { type: 'heading', id: 'manage', level: 2, text: 'Create, update and delete' },
    { type: 'table', columns: [
      { key: 'method', label: 'Method & path', width: '45%' },
      { key: 'desc', label: 'Description', width: '55%' },
    ], rows: [
      { method: 'GET /api/automations', desc: 'List the automations in your organization.' },
      { method: 'GET /api/automations/:id', desc: 'Fetch one automation.' },
      { method: 'POST /api/automations', desc: 'Create an automation.' },
      { method: 'PUT /api/automations/:id', desc: 'Update an automation (trigger, name, actions, active state).' },
      { method: 'DELETE /api/automations/:id', desc: 'Delete an automation.' },
      { method: 'GET /api/automations/:id/history', desc: 'The execution history for an automation.' },
      { method: 'GET /api/automations/:id/stats', desc: 'Execution stats for an automation.' },
    ]},

    { type: 'heading', id: 'create', level: 3, text: 'Creating an automation' },
    { type: 'paragraph', text: 'Send the triggerId, a name and a non-empty actions array. Each action carries its action_type_id and a params object. The top-level params is a JSON string for automation-level settings.' },
    { type: 'code', language: 'bash', code: 'curl -X POST "http://localhost:3000/api/automations" \\\n  -H "Authorization: Bearer <your-token>" \\\n  -H "Content-Type: application/json" \\\n  -d \'{\n    "triggerId": 6,\n    "name": "Email the team when a risk is added",\n    "actions": [\n      {\n        "action_type_id": 1,\n        "params": { "to": "team@example.com", "subject": "New risk added" }\n      }\n    ],\n    "params": "{}"\n  }\'' },
    { type: 'callout', variant: 'warning', title: 'Required fields', text: 'triggerId, name and a non-empty actions array are required. Leaving any of them out returns a 400 with the message "Missing required fields: triggerId, name, actions".' },

    { type: 'heading', id: 'execution', level: 2, text: 'How automations run' },
    { type: 'paragraph', text: 'When a matching event happens, VerifyWise queues the automation\'s actions and runs them in the background. Each run is recorded, so the history and stats endpoints show what fired, whether it succeeded and how long it took. Because runs are queued rather than immediate, an action may complete a moment after the triggering event.' },

    { type: 'heading', id: 'access', level: 2, text: 'Access' },
    { type: 'paragraph', text: 'Every automations endpoint requires a valid token and is scoped to your organization. You only see and manage your own organization\'s automations.' },

    { type: 'article-links', title: 'Related articles', items: [
      { collectionId: 'developers', articleId: 'platform-rest-api', title: 'Platform REST API', description: 'Auth, base URL, response shape and limits.' },
      { collectionId: 'integrations', articleId: 'automations', title: 'Automations', description: 'Setting up automations in the app.' },
    ]},
  ],
};
