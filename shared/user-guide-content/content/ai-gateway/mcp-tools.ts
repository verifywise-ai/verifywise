import type { ArticleContent } from '../../contentTypes';

export const mcpToolsContent: ArticleContent = {
  blocks: [
    {
      type: 'heading',
      id: 'overview',
      level: 2,
      text: 'Overview',
    },
    {
      type: 'paragraph',
      text: 'The Tool Catalog shows every MCP tool discovered across all your registered servers. It\'s the central place to see what your agents can do, assign risk levels, and decide which tools need human approval before execution.',
    },
    {
      type: 'paragraph',
      text: 'You\'ll find it at **AI Gateway > MCP Gateway > Tools**.',
    },
    {
      type: 'heading',
      id: 'tool-list',
      level: 2,
      text: 'Tool list',
    },
    {
      type: 'paragraph',
      text: 'Tools are grouped by the server they belong to. Each server section shows the server name and tool count. Each tool row displays:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Tool name', text: 'The name exposed by the MCP server (e.g., `search`, `run_query`, `get_weather`).' },
        { bold: 'Risk level badge', text: 'Color-coded: green for low, amber for medium, red for high.' },
        { bold: 'Approval required chip', text: 'Shows "Approval required" in orange when the tool needs human sign-off before execution.' },
        { bold: 'Description', text: 'The tool\'s description as reported by the server.' },
        { bold: 'Approval toggle', text: 'Quick toggle on the right side to enable or disable approval requirements.' },
      ],
    },
    {
      type: 'heading',
      id: 'filtering',
      level: 2,
      text: 'Filtering tools',
    },
    {
      type: 'paragraph',
      text: 'Two dropdown filters appear above the tool list when you have tools:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Filter by server', text: 'Show tools from a specific server or all servers.' },
        { bold: 'Filter by risk', text: 'Show tools at a specific risk level (low, medium, high) or all.' },
      ],
    },
    {
      type: 'paragraph',
      text: 'Filters work together. Select both a server and a risk level to narrow down to exactly the tools you\'re looking for.',
    },
    {
      type: 'heading',
      id: 'risk-levels',
      level: 2,
      text: 'Risk levels',
    },
    {
      type: 'paragraph',
      text: 'Every tool has a risk level that you assign. It doesn\'t affect routing directly, but it drives governance decisions and shows up in the audit trail.',
    },
    {
      type: 'table',
      columns: [
        { key: 'level', label: 'Level', width: '15%' },
        { key: 'color', label: 'Color', width: '15%' },
        { key: 'when', label: 'When to use', width: '70%' },
      ],
      rows: [
        { level: 'Low', color: 'Green', when: 'Read-only tools that don\'t access sensitive data. Examples: search, get_weather, list_items.' },
        { level: 'Medium', color: 'Amber', when: 'Tools that modify data or access internal systems. Examples: update_record, send_email, create_ticket.' },
        { level: 'High', color: 'Red', when: 'Tools that delete data, access PII, or perform irreversible actions. Examples: delete_record, drop_table, transfer_funds.' },
      ],
    },
    {
      type: 'paragraph',
      text: 'New tools default to "low" risk. You should review and classify them as part of your onboarding process.',
    },
    {
      type: 'heading',
      id: 'approval-requirements',
      level: 2,
      text: 'Approval requirements',
    },
    {
      type: 'paragraph',
      text: 'When you enable "Requires approval" on a tool, every invocation of that tool goes through a human review step:',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'An agent calls the tool through the gateway.' },
        { text: 'The gateway creates an approval request and returns an error to the agent with the approval ID and a poll endpoint.' },
        { text: 'The approval request appears on the **Approvals** page.' },
        { text: 'An admin approves or denies the request.' },
        { text: 'The agent polls the status endpoint and retries the call once approved.' },
      ],
    },
    {
      type: 'paragraph',
      text: 'You can toggle approval on and off directly from the tool list using the toggle, or from the edit modal.',
    },
    {
      type: 'callout',
      variant: 'warning',
      title: 'High-risk tools without approval',
      text: 'If you mark a tool as high risk but don\'t enable approval, the edit modal shows a warning. Consider enabling approval for high-risk tools to ensure human oversight.',
    },
    {
      type: 'heading',
      id: 'editing-tools',
      level: 2,
      text: 'Editing tool settings',
    },
    {
      type: 'paragraph',
      text: 'Click any tool row or the pencil icon to open the edit modal. The modal shows:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Tool info box', text: 'Read-only section showing the tool name, description, and which server it belongs to.' },
        { bold: 'Risk level', text: 'Dropdown to select low, medium, or high.' },
        { bold: 'Requires approval', text: 'Toggle with a description: "When enabled, tool invocations must be approved before execution."' },
      ],
    },
    {
      type: 'paragraph',
      text: 'Click **Save changes** to apply. Changes take effect immediately for the next tool call.',
    },
    {
      type: 'heading',
      id: 'how-tools-are-discovered',
      level: 2,
      text: 'How tools are discovered',
    },
    {
      type: 'paragraph',
      text: 'Tools appear in the catalog after the gateway runs tool discovery on a registered server. Discovery calls the server\'s `tools/list` MCP method and stores each tool with its name, description, and input schema.',
    },
    {
      type: 'paragraph',
      text: 'You can\'t manually add tools. They always come from a server\'s discovery response. If a tool disappears from the server, it stays in the catalog until the server is deleted.',
    },
    {
      type: 'heading',
      id: 'tool-input-schema',
      level: 2,
      text: 'Tool input schema',
    },
    {
      type: 'paragraph',
      text: 'Each tool can have a JSON Schema describing its expected input. This schema is stored during discovery and returned to agents in `tools/list` responses. The gateway doesn\'t validate inputs against the schema, but agents use it to construct correct tool calls.',
    },
    {
      type: 'heading',
      id: 'empty-state',
      level: 2,
      text: 'Empty state',
    },
    {
      type: 'paragraph',
      text: 'If no tools have been discovered yet, you\'ll see tips explaining how to get started:',
    },
    {
      type: 'bullet-list',
      items: [
        { text: 'Register MCP servers and trigger tool discovery.' },
        { text: 'Once tools appear, assign risk levels and enable approval for sensitive operations.' },
      ],
    },
    {
      type: 'heading',
      id: 'permissions',
      level: 2,
      text: 'Permissions',
    },
    {
      type: 'paragraph',
      text: 'Viewing the tool catalog is available to all authenticated users. Changing risk levels and approval settings requires the Admin role.',
    },
    {
      type: 'article-links',
      title: 'Related articles',
      items: [
        {
          collectionId: 'ai-gateway',
          articleId: 'mcp-servers',
          title: 'MCP servers',
          description: 'Register servers that expose tools to the gateway.',
        },
        {
          collectionId: 'ai-gateway',
          articleId: 'mcp-approvals',
          title: 'Approvals',
          description: 'Review and decide on pending tool execution requests.',
        },
        {
          collectionId: 'ai-gateway',
          articleId: 'mcp-guardrails',
          title: 'MCP guardrails',
          description: 'Configure input scanning rules that apply to tool calls.',
        },
      ],
    },
  ],
};
