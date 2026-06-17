import type { ArticleContent } from '../../contentTypes';

export const mcpAuditContent: ArticleContent = {
  blocks: [
    {
      type: 'heading',
      id: 'overview',
      level: 2,
      text: 'Overview',
    },
    {
      type: 'paragraph',
      text: 'The Audit Log records every tool call that flows through the MCP Gateway. It\'s your compliance trail for agent activity: what was called, who called it, whether it succeeded and how long it took.',
    },
    {
      type: 'paragraph',
      text: 'You\'ll find it at **AI Gateway > Agent Control > Activity**.',
    },
    {
      type: 'heading',
      id: 'summary-stats',
      level: 2,
      text: 'Summary stats',
    },
    {
      type: 'paragraph',
      text: 'Four stat cards appear at the top of the page, summarizing activity for the selected time period:',
    },
    {
      type: 'table',
      columns: [
        { key: 'card', label: 'Stat card', width: '25%' },
        { key: 'description', label: 'What it shows', width: '75%' },
      ],
      rows: [
        { card: 'Total calls', description: 'Total number of tool invocations in the selected period.' },
        { card: 'Error rate', description: 'Percentage of tool calls that failed, shown as a percentage. Highlighted in red when errors exist.' },
        { card: 'Avg latency', description: 'Average round-trip time for tool calls in milliseconds.' },
        { card: 'Unique tools', description: 'Number of distinct tools that were called.' },
      ],
    },
    {
      type: 'paragraph',
      text: 'Hover over any stat card to see a tooltip with more context.',
    },
    {
      type: 'heading',
      id: 'time-period',
      level: 2,
      text: 'Time period selector',
    },
    {
      type: 'paragraph',
      text: 'A dropdown in the top-right corner controls the time window for summary stats and charts. Options are:',
    },
    {
      type: 'bullet-list',
      items: [
        { text: 'Last 7 days (default)' },
        { text: 'Last 14 days' },
        { text: 'Last 30 days' },
      ],
    },
    {
      type: 'paragraph',
      text: 'Changing the period reloads the stats and charts. The log table below always shows the most recent entries regardless of this selector.',
    },
    {
      type: 'heading',
      id: 'charts',
      level: 2,
      text: 'Charts',
    },
    {
      type: 'paragraph',
      text: 'Two bar charts appear side by side when there\'s enough data:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Top 10 tools by calls', text: 'Shows the most frequently invoked tools, ranked by total call count. Hover over a bar to see the exact number.' },
        { bold: 'Avg latency for top 10 tools', text: 'Shows average round-trip time per tool. Helps identify slow or bottlenecked tools. Values are in milliseconds.' },
      ],
    },
    {
      type: 'paragraph',
      text: 'Each chart has an info icon with a tooltip explaining what it measures. Both charts use the time period you selected.',
    },
    {
      type: 'heading',
      id: 'log-table',
      level: 2,
      text: 'Log entries',
    },
    {
      type: 'paragraph',
      text: 'Below the charts, the "Recent tool calls" section lists individual log entries. Each entry shows:',
    },
    {
      type: 'table',
      columns: [
        { key: 'field', label: 'Field', width: '20%' },
        { key: 'description', label: 'Description', width: '80%' },
      ],
      rows: [
        { field: 'Tool name', description: 'The name of the tool that was called, in monospace font.' },
        { field: 'Status', description: 'Color-coded chip showing the outcome: success, error, blocked, rate_limited or approval_required.' },
        { field: 'Latency', description: 'Round-trip time in milliseconds.' },
        { field: 'Result summary', description: 'A truncated summary of the tool\'s response (up to 500 characters). Shows a dash if no summary is available.' },
        { field: 'Agent key', description: 'The name of the agent key that made the call.' },
        { field: 'Timestamp', description: 'When the call happened.' },
      ],
    },
    {
      type: 'heading',
      id: 'statuses',
      level: 3,
      text: 'Status values',
    },
    {
      type: 'paragraph',
      text: 'Each log entry has one of these statuses:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'success', text: 'The tool was called and returned a result.' },
        { bold: 'error', text: 'The tool call failed (server error, invalid input, etc.).' },
        { bold: 'blocked', text: 'A guardrail rule blocked the call before it reached the server.' },
        { bold: 'rate_limited', text: 'The agent key exceeded its requests-per-minute limit.' },
        { bold: 'approval_required', text: 'The tool requires approval. An approval request was created.' },
      ],
    },
    {
      type: 'heading',
      id: 'filtering',
      level: 2,
      text: 'Filtering logs',
    },
    {
      type: 'paragraph',
      text: 'Two filters appear above the log entries:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Filter by tool', text: 'Text field. Type a tool name (e.g., "greet") to show only calls to that tool.' },
        { bold: 'Status', text: 'Dropdown to filter by result status: All statuses, Success, Error, Blocked or Rate limited.' },
      ],
    },
    {
      type: 'paragraph',
      text: 'Both filters work together. Changing either one resets the page to 1.',
    },
    {
      type: 'heading',
      id: 'pagination',
      level: 2,
      text: 'Pagination',
    },
    {
      type: 'paragraph',
      text: 'The log table shows 20 entries per page. At the bottom you\'ll see:',
    },
    {
      type: 'bullet-list',
      items: [
        { text: 'A counter showing which entries are displayed (e.g., "Showing 1-20 of 156").' },
        { text: 'Previous and Next buttons to navigate between pages.' },
      ],
    },
    {
      type: 'heading',
      id: 'backend-api',
      level: 2,
      text: 'Backend API',
    },
    {
      type: 'paragraph',
      text: 'The audit log exposes several API endpoints for programmatic access:',
    },
    {
      type: 'table',
      columns: [
        { key: 'endpoint', label: 'Endpoint', width: '45%' },
        { key: 'description', label: 'Description', width: '55%' },
      ],
      rows: [
        { endpoint: 'GET /mcp/audit/logs', description: 'List log entries with pagination and filters (agent_key_id, tool_name, result_status, start_date, end_date).' },
        { endpoint: 'GET /mcp/audit/stats', description: 'Get summary statistics (total calls, error count, avg latency, unique tools, unique agents) for a given number of days.' },
        { endpoint: 'GET /mcp/audit/stats/by-tool', description: 'Get call count and average latency broken down by tool name.' },
        { endpoint: 'GET /mcp/audit/stats/by-agent', description: 'Get call count and average latency broken down by agent key.' },
        { endpoint: 'POST /mcp/audit/cleanup', description: 'Delete audit logs older than the retention period. Called by scheduled job.' },
        { endpoint: 'POST /mcp/audit/cleanup-approvals', description: 'Delete decided/expired approval requests older than the retention period.' },
      ],
    },
    {
      type: 'heading',
      id: 'retention',
      level: 2,
      text: 'Data retention',
    },
    {
      type: 'paragraph',
      text: 'Audit logs have a configurable retention period (set in the gateway configuration). A scheduled cleanup job removes logs and decided approval requests older than the retention window. This runs automatically.',
    },
    {
      type: 'callout',
      variant: 'tip',
      title: 'Export before cleanup',
      text: 'If you need to keep audit data longer than the retention period for regulatory reasons, use the API to export logs before they\'re cleaned up.',
    },
    {
      type: 'heading',
      id: 'empty-state',
      level: 2,
      text: 'Empty state',
    },
    {
      type: 'paragraph',
      text: 'If no audit logs exist yet, you\'ll see a tip explaining how to generate them: "Make tool calls through the MCP Gateway using an agent key at POST /v1/mcp with the tools/call method."',
    },
    {
      type: 'heading',
      id: 'compliance-use',
      level: 2,
      text: 'Using audit logs for compliance',
    },
    {
      type: 'paragraph',
      text: 'The audit log directly supports EU AI Act Article 12 (record-keeping requirements for high-risk AI systems). Every tool invocation is recorded with:',
    },
    {
      type: 'bullet-list',
      items: [
        { text: 'Who made the call (agent key identity)' },
        { text: 'What was called (tool name and arguments)' },
        { text: 'When it happened (timestamp)' },
        { text: 'What happened (status, result summary, latency)' },
        { text: 'Whether it was blocked, rate-limited or required approval' },
      ],
    },
    {
      type: 'article-links',
      title: 'Related articles',
      items: [
        {
          collectionId: 'ai-gateway',
          articleId: 'mcp-agent-keys',
          title: 'Agent keys',
          description: 'The keys that identify agents in the audit trail.',
        },
        {
          collectionId: 'ai-gateway',
          articleId: 'mcp-approvals',
          title: 'Approvals',
          description: 'Review pending tool execution requests logged in the audit trail.',
        },
        {
          collectionId: 'ai-gateway',
          articleId: 'mcp-guardrails',
          title: 'MCP guardrails',
          description: 'Rules that generate "blocked" entries in the audit log.',
        },
      ],
    },
  ],
};
