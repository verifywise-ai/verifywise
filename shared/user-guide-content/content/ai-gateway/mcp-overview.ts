import type { ArticleContent } from '../../contentTypes';

export const mcpOverviewContent: ArticleContent = {
  blocks: [
    {
      type: 'heading',
      id: 'what-is-mcp-gateway',
      level: 2,
      text: 'What is the MCP Gateway',
    },
    {
      type: 'paragraph',
      text: 'The MCP Gateway is VerifyWise\'s proxy for the Model Context Protocol. It sits between your AI agents and the MCP servers they call, adding authentication, access control, guardrails and a full audit trail to every tool invocation.',
    },
    {
      type: 'paragraph',
      text: 'Without a gateway, agents connect directly to MCP servers. That means no central view of what tools they\'re calling, no way to block sensitive operations and no audit log. The MCP Gateway closes all three gaps.',
    },
    {
      type: 'heading',
      id: 'how-it-works',
      level: 2,
      text: 'How it works',
    },
    {
      type: 'paragraph',
      text: 'The gateway speaks JSON-RPC 2.0 over HTTP, the same protocol MCP clients already use. Your agent connects to `POST /v1/mcp` with an agent key instead of connecting directly to backend servers. The gateway handles everything in between.',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Your agent sends a `tools/list` or `tools/call` request to `POST /v1/mcp` with a Bearer token (the agent key).' },
        { text: 'The gateway authenticates the key, checks rate limits and tool-level ACLs.' },
        { text: 'For `tools/call`, the gateway runs guardrail rules against the tool input (PII detection, content filtering, prompt injection detection).' },
        { text: 'If the tool requires approval, the gateway pauses execution and returns an approval request ID. A human reviews it in the Approvals page.' },
        { text: 'Once cleared, the gateway forwards the call to the correct backend MCP server, using the auth credentials you configured.' },
        { text: 'The response flows back to the agent. The gateway logs the call, its result, latency and status to the audit trail.' },
      ],
    },
    {
      type: 'callout',
      variant: 'info',
      title: 'Protocol version',
      text: 'The gateway implements MCP protocol version 2025-03-26 with Streamable HTTP transport. It also exposes a `GET /v1/mcp` SSE endpoint for keep-alive connections.',
    },
    {
      type: 'heading',
      id: 'core-concepts',
      level: 2,
      text: 'Core concepts',
    },
    {
      type: 'grid-cards',
      columns: 2,
      items: [
        {
          title: 'MCP servers',
          description: 'Backend servers that expose tools (database queries, file operations, search and so on). You register them in VerifyWise with their URL and auth credentials.',
          icon: 'Server',
        },
        {
          title: 'MCP Tools',
          description: 'All discovered tools across your servers, with risk levels and approval requirements you can configure per tool.',
          icon: 'Wrench',
        },
        {
          title: 'Agent keys',
          description: 'Scoped API keys (prefixed sk-mcp-) that agents use to authenticate. Each key can restrict which tools the agent can call.',
          icon: 'KeyRound',
        },
        {
          title: 'Guardrails',
          description: 'Rules that scan tool inputs before execution. Detect PII, filter prohibited content or block prompt injection attempts.',
          icon: 'Shield',
        },
        {
          title: 'Approvals',
          description: 'High-risk tools can require human sign-off before the agent executes them. Pending requests appear in the Approvals page.',
          icon: 'CheckCircle',
        },
        {
          title: 'Audit log',
          description: 'Every tool call is logged with the agent key, tool name, status, latency and result summary. Filterable and paginated.',
          icon: 'ClipboardList',
        },
      ],
    },
    {
      type: 'heading',
      id: 'who-needs-this',
      level: 2,
      text: 'Who needs this',
    },
    {
      type: 'paragraph',
      text: 'If your organization runs AI agents that call external tools, you need governance around those calls. The MCP Gateway is for:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Security teams', text: 'who need to control which tools agents can access and scan inputs for sensitive data' },
        { bold: 'Compliance teams', text: 'who need an audit trail of every tool invocation for EU AI Act Article 12 (record-keeping) and Article 14 (human oversight)' },
        { bold: 'Platform teams', text: 'who manage MCP servers and want centralized auth, health monitoring and rate limiting' },
        { bold: 'AI engineers', text: 'who build agents and want a single endpoint to discover all available tools across servers' },
      ],
    },
    {
      type: 'heading',
      id: 'quick-setup',
      level: 2,
      text: 'Quick setup',
    },
    {
      type: 'paragraph',
      text: 'Setup takes about 5 minutes:',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Register an MCP server in **AI Gateway > Agent Control > MCP Servers**.' },
        { text: 'Wait for tool discovery (or trigger it manually once available).' },
        { text: 'Review discovered tools in the **MCP Tools** page. Set risk levels and approval requirements.' },
        { text: 'Create an agent key in **Agent keys**. Scope it to the tools the agent needs.' },
        { text: 'Point your agent at `POST /v1/mcp` with the key as a Bearer token.' },
      ],
    },
    {
      type: 'heading',
      id: 'compliance-mapping',
      level: 2,
      text: 'Compliance mapping',
    },
    {
      type: 'paragraph',
      text: 'The MCP Gateway maps directly to several regulatory requirements:',
    },
    {
      type: 'table',
      columns: [
        { key: 'requirement', label: 'Requirement', width: '35%' },
        { key: 'feature', label: 'MCP Gateway feature', width: '65%' },
      ],
      rows: [
        { requirement: 'EU AI Act Art. 9 (risk management)', feature: 'Tool risk levels, guardrails, approval workflows' },
        { requirement: 'EU AI Act Art. 12 (record-keeping)', feature: 'Audit log with full invocation history' },
        { requirement: 'EU AI Act Art. 14 (human oversight)', feature: 'Approval requirements on high-risk tools' },
        { requirement: 'ISO 42001 A.3 (AI policy)', feature: 'Agent key ACLs, tool-level access control' },
        { requirement: 'ISO 42001 Clause 8.2 (risk assessment)', feature: 'Per-tool risk classification (low, medium, high)' },
      ],
    },
    {
      type: 'heading',
      id: 'sidebar-navigation',
      level: 2,
      text: 'Sidebar navigation',
    },
    {
      type: 'paragraph',
      text: 'The Agent Control section appears as a collapsible group in the AI Gateway sidebar. Click "Agent Control" to expand it. You\'ll see 6 sub-pages:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Agent keys', text: 'Create and manage API keys for agents' },
        { bold: 'Servers', text: 'Register and monitor backend MCP servers' },
        { bold: 'MCP Tools', text: 'View all discovered tools, set risk levels' },
        { bold: 'Activity', text: 'Review tool invocation history and stats' },
        { bold: 'Approvals', text: 'Approve or deny pending tool calls' },
        { bold: 'Guardrails', text: 'Configure input scanning rules' },
      ],
    },
    {
      type: 'article-links',
      title: 'Next steps',
      items: [
        {
          collectionId: 'ai-gateway',
          articleId: 'mcp-servers',
          title: 'MCP servers',
          description: 'Register your first MCP server and configure authentication.',
        },
        {
          collectionId: 'ai-gateway',
          articleId: 'mcp-agent-keys',
          title: 'Agent keys',
          description: 'Create scoped API keys for your AI agents.',
        },
        {
          collectionId: 'ai-gateway',
          articleId: 'mcp-tools',
          title: 'MCP Tools',
          description: 'Browse discovered tools and configure risk levels.',
        },
      ],
    },
  ],
};
