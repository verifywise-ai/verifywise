import type { ArticleContent } from '../../contentTypes';

export const mcpAgentKeysContent: ArticleContent = {
  blocks: [
    {
      type: 'heading',
      id: 'overview',
      level: 2,
      text: 'Overview',
    },
    {
      type: 'paragraph',
      text: 'Agent keys are scoped API keys that AI agents use to authenticate with the MCP Gateway. Each key controls which tools the agent can call, how fast it can call them, and when the key expires.',
    },
    {
      type: 'paragraph',
      text: 'You\'ll find them at **AI Gateway > MCP Gateway > Agent keys**.',
    },
    {
      type: 'paragraph',
      text: 'Agent keys are prefixed with `sk-mcp-` and work as Bearer tokens. Your agent includes the key in the `Authorization` header when connecting to `POST /v1/mcp`.',
    },
    {
      type: 'heading',
      id: 'key-list',
      level: 2,
      text: 'Key list',
    },
    {
      type: 'paragraph',
      text: 'The main view lists all agent keys for your organization. Each row shows:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Name', text: 'The display name you gave the key.' },
        { bold: 'Status chip', text: '"Active", "Revoked", "Expired", or "Inactive".' },
        { bold: 'Key prefix', text: 'The first characters of the key in monospace font. The full key is never shown again after creation.' },
        { bold: 'Rate limit', text: 'Shown as RPM (requests per minute) if configured.' },
        { bold: 'Allowed/blocked tools', text: 'Chip showing the count of allowed or blocked tools, if any are configured.' },
        { bold: 'Created by', text: 'The user who created the key and the creation date.' },
        { bold: 'Description', text: 'Optional text explaining what the key is for.' },
      ],
    },
    {
      type: 'heading',
      id: 'creating-a-key',
      level: 2,
      text: 'Creating an agent key',
    },
    {
      type: 'paragraph',
      text: 'Click **Create agent key** in the top-right corner. The modal has these fields:',
    },
    {
      type: 'table',
      columns: [
        { key: 'field', label: 'Field', width: '25%' },
        { key: 'required', label: 'Required', width: '12%' },
        { key: 'description', label: 'Description', width: '63%' },
      ],
      rows: [
        { field: 'Name', required: 'Yes', description: 'A name to identify this key (e.g., "Production agent key"). Max 255 characters.' },
        { field: 'Description', required: 'No', description: 'What this key is used for (e.g., "Used by the backend orchestration agent"). Max 1000 characters.' },
        { field: 'Allowed tools', required: 'No', description: 'Comma-separated list of tool names the agent can call. Leave empty to allow all tools.' },
        { field: 'Blocked tools', required: 'No', description: 'Comma-separated list of tool names the agent can\'t call (e.g., "delete_record, drop_table").' },
        { field: 'Rate limit (RPM)', required: 'No', description: 'Maximum requests per minute. Leave empty for no limit.' },
        { field: 'Expiry date', required: 'No', description: 'Date when the key stops working. Uses a date picker. Leave empty for no expiry.' },
      ],
    },
    {
      type: 'heading',
      id: 'tool-access-control',
      level: 3,
      text: 'Tool access control',
    },
    {
      type: 'paragraph',
      text: 'You can restrict which tools an agent key can access using two lists:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Allowed tools', text: 'If set, the agent can only call tools in this list. Everything else is blocked.' },
        { bold: 'Blocked tools', text: 'If set, the agent can call any tool except those in this list.' },
      ],
    },
    {
      type: 'paragraph',
      text: 'If both lists are empty, the agent can access all tools. If both are set, the allowed list takes precedence: a tool must be in the allowed list and not in the blocked list.',
    },
    {
      type: 'callout',
      variant: 'tip',
      title: 'Use the principle of least privilege',
      text: 'Give each agent key access only to the tools it needs. A key for a search agent shouldn\'t be able to call delete_record. This limits the blast radius if a key is compromised.',
    },
    {
      type: 'heading',
      id: 'key-display',
      level: 2,
      text: 'Copying the key after creation',
    },
    {
      type: 'paragraph',
      text: 'After you click **Create key**, a modal shows the full key. This is the only time you\'ll see it. Copy it immediately and store it securely.',
    },
    {
      type: 'paragraph',
      text: 'The modal includes:',
    },
    {
      type: 'bullet-list',
      items: [
        { text: 'The full key in a monospace box with a copy button.' },
        { text: 'A warning that the key won\'t be shown again.' },
        { text: 'A usage example showing a curl command with the key as a Bearer token.' },
        { text: 'A reminder to use agent keys from backend services only.' },
      ],
    },
    {
      type: 'paragraph',
      text: 'Click **I copied, continue** to close the modal. If you lose the key, you\'ll need to create a new one.',
    },
    {
      type: 'heading',
      id: 'usage-example',
      level: 2,
      text: 'Usage example',
    },
    {
      type: 'paragraph',
      text: 'Here\'s how an agent authenticates with the gateway using an agent key:',
    },
    {
      type: 'code',
      language: 'bash',
      code: `# List available tools
curl -X POST https://your-verifywise-host/v1/mcp \\
  -H "Authorization: Bearer sk-mcp-your-key-here" \\
  -H "Content-Type: application/json" \\
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/list",
    "params": {}
  }'

# Call a tool
curl -X POST https://your-verifywise-host/v1/mcp \\
  -H "Authorization: Bearer sk-mcp-your-key-here" \\
  -H "Content-Type: application/json" \\
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
      "name": "search",
      "arguments": {"query": "quarterly revenue"}
    }
  }'`,
    },
    {
      type: 'heading',
      id: 'key-statuses',
      level: 2,
      text: 'Key statuses',
    },
    {
      type: 'paragraph',
      text: 'Agent keys have four possible statuses:',
    },
    {
      type: 'table',
      columns: [
        { key: 'status', label: 'Status', width: '20%' },
        { key: 'meaning', label: 'What it means', width: '80%' },
      ],
      rows: [
        { status: 'Active', meaning: 'The key is working and accepting requests.' },
        { status: 'Expired', meaning: 'The key\'s expiry date has passed. All requests are rejected.' },
        { status: 'Revoked', meaning: 'An admin manually revoked the key. All requests are rejected immediately.' },
        { status: 'Inactive', meaning: 'The key is disabled (not revoked, not expired). It was deactivated programmatically.' },
      ],
    },
    {
      type: 'heading',
      id: 'revoking-a-key',
      level: 2,
      text: 'Revoking a key',
    },
    {
      type: 'paragraph',
      text: 'To revoke an active key, click the ban icon on its row. A confirmation modal appears with the warning: "All requests using this key will be rejected immediately."',
    },
    {
      type: 'paragraph',
      text: 'Revocation is instant. The agent will start getting 401 errors on its next request. You can\'t un-revoke a key. Create a new one if needed.',
    },
    {
      type: 'heading',
      id: 'deleting-a-key',
      level: 2,
      text: 'Deleting a key',
    },
    {
      type: 'paragraph',
      text: 'Only revoked or inactive keys can be deleted. The trash icon appears for non-active keys. Deleting a key removes it from the list permanently. Audit log entries referencing this key are preserved.',
    },
    {
      type: 'heading',
      id: 'rate-limiting',
      level: 2,
      text: 'Rate limiting',
    },
    {
      type: 'paragraph',
      text: 'Each key can have a requests-per-minute (RPM) limit. When the limit is hit, the gateway returns a rate-limited error. The agent should back off and retry.',
    },
    {
      type: 'paragraph',
      text: 'If no rate limit is set on the key, there\'s no per-key throttling (though the gateway may still enforce global rate limits).',
    },
    {
      type: 'heading',
      id: 'permissions',
      level: 2,
      text: 'Permissions',
    },
    {
      type: 'paragraph',
      text: 'Creating, revoking and deleting agent keys requires the Admin role. All authenticated users can view the key list (but not the key values, which are only shown once at creation).',
    },
    {
      type: 'article-links',
      title: 'Related articles',
      items: [
        {
          collectionId: 'ai-gateway',
          articleId: 'mcp-overview',
          title: 'MCP Gateway overview',
          description: 'Understand the full gateway architecture and request flow.',
        },
        {
          collectionId: 'ai-gateway',
          articleId: 'mcp-audit',
          title: 'Audit log',
          description: 'See every tool call made with each agent key.',
        },
        {
          collectionId: 'ai-gateway',
          articleId: 'mcp-tools',
          title: 'Tool catalog',
          description: 'View the tools that agent keys grant access to.',
        },
      ],
    },
  ],
};
