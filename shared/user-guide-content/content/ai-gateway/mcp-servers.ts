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
        { bold: 'Tool count', text: 'How many of this server\'s tools are currently available. Tools the server no longer offers aren\'t counted.' },
        { bold: 'URL', text: 'The server\'s address.' },
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
        { field: 'URL', required: 'Yes', description: 'The full address of the MCP server (e.g., https://mcp-server.example.com). It must start with http or https and can\'t contain a username or password. Cloud metadata addresses (169.254.169.254) and 0.0.0.0 are blocked. Private network addresses are allowed.' },
        { field: 'Description', required: 'No', description: 'A short note about what this server does (e.g., "Exposes search and retrieval tools").' },
        { field: 'Authentication', required: 'No', description: 'How the gateway authenticates with this server. Options: None (default), Bearer token or API key. OAuth isn\'t supported yet.' },
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
      text: 'The gateway supports three authentication methods when connecting to your backend MCP servers. OAuth isn\'t supported yet. The gateway connects over Streamable HTTP and uses tools only (not resources or prompts).',
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
      text: 'Bearer tokens and API keys are encrypted at rest and only decrypted when the gateway contacts the server. After saving, Admins see only a masked hint of the credential, never the full value.',
    },
    {
      type: 'heading',
      id: 'editing-a-server',
      level: 2,
      text: 'Editing a server',
    },
    {
      type: 'paragraph',
      text: 'Click a server row or the pencil icon to open the edit modal. You can change the name, address, description and authentication. The slug can\'t be changed after creation because agent keys and audit logs reference it.',
    },
    {
      type: 'paragraph',
      text: 'To update auth credentials, select the auth type and enter new values. Leave the credential field blank to keep the existing credential.',
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
      text: 'The admin MCP Tools page still lists tools from a disabled server. This helps during maintenance windows, or when you need to quickly cut off access to a server without deleting it. Switching a server back on runs tool discovery again.',
    },
    {
      type: 'heading',
      id: 'server-health',
      level: 2,
      text: 'Server health',
    },
    {
      type: 'paragraph',
      text: 'The health chip next to the server name shows the result of the last tool discovery. It has one of three states:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Healthy', text: '(green) The last tool discovery succeeded.' },
        { bold: 'Unhealthy', text: '(red) The last tool discovery failed. Hover over the chip to see why.' },
        { bold: 'Unknown', text: '(gray) No tool discovery has run yet.' },
      ],
    },
    {
      type: 'paragraph',
      text: 'Health only changes when tool discovery runs. There are no periodic health checks yet. Unhealthy servers aren\'t bypassed, so requests to them are still attempted and will likely fail. You can disable an unhealthy server manually.',
    },
    {
      type: 'heading',
      id: 'tool-discovery',
      level: 2,
      text: 'Tool discovery',
    },
    {
      type: 'paragraph',
      text: 'The gateway discovers a server\'s tools by connecting to it, listing its tools and storing them in the tool catalog. Discovery runs while you save, in these cases:',
    },
    {
      type: 'bullet-list',
      items: [
        { text: 'You create a server.' },
        { text: 'You edit a server\'s address, authentication type or credentials.' },
        { text: 'You switch a server on.' },
      ],
    },
    {
      type: 'paragraph',
      text: 'Discovery during save has a 10-second limit. The server is always saved, even if discovery fails.',
    },
    {
      type: 'paragraph',
      text: 'Admins can also click **Discover tools** on a server to run discovery again. This has a 25-second limit.',
    },
    {
      type: 'paragraph',
      text: 'Each run shows its result: how many tools were found, that the server offered no tools, or the reason it failed.',
    },
    {
      type: 'paragraph',
      text: 'If a server stops offering a tool, the tool is deactivated on the next discovery. Its risk level and approval settings are kept, so they apply again if the tool comes back.',
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
