import type { ArticleContent } from '../../contentTypes';

export const mcpServersContent: ArticleContent = {
  blocks: [
    {
      type: 'heading',
      id: 'overview',
      level: 2,
      text: 'Overview',
    },
    {
      type: 'paragraph',
      text: 'The Servers page is where you register the backend MCP servers that your agents call through the gateway. Each server exposes one or more tools (database queries, search, file operations and so on) that agents can discover and invoke.',
    },
    {
      type: 'paragraph',
      text: 'You\'ll find it at **AI Gateway > Agent Control > MCP Servers**.',
    },
    {
      type: 'heading',
      id: 'server-list',
      level: 2,
      text: 'Server list',
    },
    {
      type: 'paragraph',
      text: 'The main view shows all registered servers as a list. Each row displays:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Server name', text: 'The display name you gave the server.' },
        { bold: 'Health status', text: 'A color-coded chip: green for "Healthy", red for "Unhealthy" or gray for "Unknown".' },
        { bold: 'Tool count', text: 'How many tools have been discovered on this server.' },
        { bold: 'URL', text: 'The server\'s endpoint URL.' },
        { bold: 'Auth type', text: 'Shows "no auth", "bearer" or "api_key".' },
        { bold: 'Slug', text: 'The URL-safe identifier, shown as a path segment (e.g., /my-server).' },
        { bold: 'Created by', text: 'The user who registered the server and the date.' },
      ],
    },
    {
      type: 'paragraph',
      text: 'Click any row to open the edit modal. Use the toggle on the right to enable or disable a server without deleting it.',
    },
    {
      type: 'heading',
      id: 'adding-a-server',
      level: 2,
      text: 'Adding a server',
    },
    {
      type: 'paragraph',
      text: 'Click **Add server** in the top-right corner. The modal has these fields:',
    },
    {
      type: 'table',
      columns: [
        { key: 'field', label: 'Field', width: '25%' },
        { key: 'required', label: 'Required', width: '12%' },
        { key: 'description', label: 'Description', width: '63%' },
      ],
      rows: [
        { field: 'Server name', required: 'Yes', description: 'A human-readable name (e.g., "Production Search Server").' },
        { field: 'Slug', required: 'Yes', description: 'Auto-generated from the name. Lowercase letters, digits and hyphens only. Must start with a letter or digit. Can\'t be changed after creation.' },
        { field: 'URL', required: 'Yes', description: 'The full URL of the MCP server (e.g., https://mcp-server.example.com).' },
        { field: 'Description', required: 'No', description: 'A short note about what this server does (e.g., "Exposes search and retrieval tools").' },
        { field: 'Authentication', required: 'No', description: 'How the gateway authenticates with this server. Options: None (default), Bearer token or API key.' },
      ],
    },
    {
      type: 'heading',
      id: 'authentication-options',
      level: 3,
      text: 'Authentication options',
    },
    {
      type: 'paragraph',
      text: 'The gateway supports three authentication methods when connecting to your backend MCP servers:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'None', text: 'No authentication header is sent. Use this for servers on a private network or behind a VPN.' },
        { bold: 'Bearer token', text: 'The gateway sends an `Authorization: Bearer <token>` header with each request. Enter the token in the modal.' },
        { bold: 'API key', text: 'The gateway sends a custom header with an API key value. You choose the header name (defaults to `X-API-Key`) and enter the key value.' },
      ],
    },
    {
      type: 'callout',
      variant: 'warning',
      title: 'Auth credentials are stored encrypted',
      text: 'Bearer tokens and API keys are encrypted at rest, and only decrypted when the gateway forwards a request to the server. You won\'t see the full credential after saving.',
    },
    {
      type: 'heading',
      id: 'editing-a-server',
      level: 2,
      text: 'Editing a server',
    },
    {
      type: 'paragraph',
      text: 'Click a server row or the pencil icon to open the edit modal. You can change the name, URL, description and auth configuration. The slug can\'t be changed after creation because agent keys and audit logs reference it.',
    },
    {
      type: 'paragraph',
      text: 'To update auth credentials, select the auth type and enter new values. Leave the credential fields empty to keep the existing values.',
    },
    {
      type: 'heading',
      id: 'enabling-disabling',
      level: 2,
      text: 'Enabling and disabling servers',
    },
    {
      type: 'paragraph',
      text: 'Each server has an active/inactive toggle. When you disable a server:',
    },
    {
      type: 'bullet-list',
      items: [
        { text: 'Its tools stop appearing in `tools/list` responses to agents.' },
        { text: 'Any `tools/call` requests targeting its tools are rejected.' },
        { text: 'The server\'s configuration is preserved. Toggle it back on at any time.' },
      ],
    },
    {
      type: 'paragraph',
      text: 'This helps during maintenance windows, or when you need to quickly cut off access to a server without deleting it.',
    },
    {
      type: 'heading',
      id: 'health-monitoring',
      level: 2,
      text: 'Health monitoring',
    },
    {
      type: 'paragraph',
      text: 'The gateway tracks each server\'s health status. The health chip next to the server name shows one of three states:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Healthy', text: '(green) The server responded successfully to the last health check or tool discovery.' },
        { bold: 'Unhealthy', text: '(red) The server failed to respond or returned an error. The gateway will still attempt to route requests, but they\'ll likely fail.' },
        { bold: 'Unknown', text: '(gray) No health check has run yet. This is normal for newly registered servers.' },
      ],
    },
    {
      type: 'paragraph',
      text: 'Health status updates automatically when tool discovery runs. Unhealthy servers aren\'t automatically bypassed, but you can disable them manually.',
    },
    {
      type: 'heading',
      id: 'tool-discovery',
      level: 2,
      text: 'Tool discovery',
    },
    {
      type: 'paragraph',
      text: 'After registering a server, the gateway can discover its tools automatically. The discover endpoint (`POST /mcp/servers/{id}/discover`) connects to the server, lists its tools and stores them in the tool catalog.',
    },
    {
      type: 'paragraph',
      text: 'The discovery button in the UI is currently marked as "Coming soon". In the meantime, discovery runs through the API or when the gateway first routes a request to a server.',
    },
    {
      type: 'callout',
      variant: 'tip',
      title: 'Manual discovery via API',
      text: 'You can trigger discovery programmatically: `POST /api/ai-gateway/mcp/servers/{server_id}/discover`. This calls the server\'s `tools/list` method and stores the results.',
    },
    {
      type: 'heading',
      id: 'deleting-a-server',
      level: 2,
      text: 'Deleting a server',
    },
    {
      type: 'paragraph',
      text: 'Click the trash icon on a server row to open the delete confirmation modal. Deleting a server:',
    },
    {
      type: 'bullet-list',
      items: [
        { text: 'Permanently removes the server and all its registered tools from the catalog.' },
        { text: 'Agents referencing those tools will receive errors on their next call.' },
        { text: 'Existing audit log entries for tools from this server are preserved.' },
      ],
    },
    {
      type: 'callout',
      variant: 'warning',
      title: 'This can\'t be undone',
      text: 'Deleting a server removes it permanently. If you just want to stop routing traffic, disable the server with the toggle instead.',
    },
    {
      type: 'heading',
      id: 'slug-rules',
      level: 2,
      text: 'Slug format rules',
    },
    {
      type: 'paragraph',
      text: 'Slugs must follow these rules:',
    },
    {
      type: 'bullet-list',
      items: [
        { text: 'Start with a lowercase letter or digit.' },
        { text: 'Contain only lowercase letters, digits and hyphens.' },
        { text: 'Be unique across all servers in your organization.' },
        { text: 'Can\'t be changed after the server is created.' },
      ],
    },
    {
      type: 'paragraph',
      text: 'The slug is auto-generated from the server name when you create a new server. For example, "Production Search Server" becomes `production-search-server`.',
    },
    {
      type: 'heading',
      id: 'permissions',
      level: 2,
      text: 'Permissions',
    },
    {
      type: 'paragraph',
      text: 'Creating, editing and deleting servers requires the Admin role. All authenticated users can view the server list.',
    },
    {
      type: 'article-links',
      title: 'Related articles',
      items: [
        {
          collectionId: 'ai-gateway',
          articleId: 'mcp-tools',
          title: 'MCP Tools',
          description: 'View and manage discovered tools across your servers.',
        },
        {
          collectionId: 'ai-gateway',
          articleId: 'mcp-agent-keys',
          title: 'Agent keys',
          description: 'Create API keys that agents use to access servers through the gateway.',
        },
        {
          collectionId: 'ai-gateway',
          articleId: 'mcp-overview',
          title: 'Agent Control overview',
          description: 'Understand how the gateway proxies agent-to-server communication.',
        },
      ],
    },
  ],
};
