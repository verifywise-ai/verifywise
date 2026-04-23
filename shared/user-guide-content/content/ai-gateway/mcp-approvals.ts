import type { ArticleContent } from '../../contentTypes';

export const mcpApprovalsContent: ArticleContent = {
  blocks: [
    {
      type: 'heading',
      id: 'overview',
      level: 2,
      text: 'Overview',
    },
    {
      type: 'paragraph',
      text: 'The Approvals page is where you review and decide on tool execution requests that need human sign-off. When a tool is marked as "requires approval" in the Tool Catalog, every invocation pauses here until an admin approves or denies it.',
    },
    {
      type: 'paragraph',
      text: 'You\'ll find it at **AI Gateway > MCP Gateway > Approvals**.',
    },
    {
      type: 'heading',
      id: 'tabs',
      level: 2,
      text: 'Tabs',
    },
    {
      type: 'paragraph',
      text: 'The page has two tabs:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Pending', text: 'Shows approval requests waiting for a decision. The tab label includes a count when requests are queued (e.g., "Pending (3)").' },
        { bold: 'History', text: 'Shows previously approved and denied requests.' },
      ],
    },
    {
      type: 'heading',
      id: 'pending-requests',
      level: 2,
      text: 'Pending requests',
    },
    {
      type: 'paragraph',
      text: 'Each pending request card shows:',
    },
    {
      type: 'table',
      columns: [
        { key: 'field', label: 'Field', width: '25%' },
        { key: 'description', label: 'Description', width: '75%' },
      ],
      rows: [
        { field: 'Tool name', description: 'The tool the agent wants to call, in monospace font.' },
        { field: 'Status chip', description: 'Shows "pending" with a color-coded background.' },
        { field: 'Time remaining', description: 'Countdown showing how long until the request expires (e.g., "45m remaining" or "2h 15m remaining"). Shows "Expired" if the window has passed.' },
        { field: 'Agent', description: 'The name of the agent key that made the request.' },
        { field: 'Requested', description: 'Timestamp of when the request was created.' },
        { field: 'Arguments', description: 'A preview of the tool arguments in JSON format (truncated to 200 characters). Only shown if arguments were provided.' },
      ],
    },
    {
      type: 'heading',
      id: 'approving-denying',
      level: 2,
      text: 'Approving or denying a request',
    },
    {
      type: 'paragraph',
      text: 'Each pending request has two action buttons on the right:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Approve', text: '(green button) Allows the agent to proceed with the tool call.' },
        { bold: 'Deny', text: '(red outlined button) Blocks the tool call. The agent will receive an error.' },
      ],
    },
    {
      type: 'paragraph',
      text: 'Clicking either button opens a confirmation modal where you can optionally add a reason for your decision. The reason is stored and visible in the history tab.',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Click **Approve** or **Deny** on a pending request.' },
        { text: 'In the confirmation modal, optionally type a reason (e.g., "Verified the query is safe" or "Agent shouldn\'t access production data").' },
        { text: 'Click the confirm button to submit your decision.' },
        { text: 'The request disappears from the Pending tab and appears in History.' },
      ],
    },
    {
      type: 'heading',
      id: 'expiration',
      level: 2,
      text: 'Request expiration',
    },
    {
      type: 'paragraph',
      text: 'Each approval request has an expiration window. If no one approves or denies within this window, the request expires automatically and the agent receives an error.',
    },
    {
      type: 'paragraph',
      text: 'The expiration time is configured in the gateway settings (`mcp_approval_expiry_seconds`). Expired requests are cleaned up by a scheduled job.',
    },
    {
      type: 'callout',
      variant: 'info',
      title: 'Duplicate prevention',
      text: 'If an agent retries a tool call that already has a pending approval request, the gateway reuses the existing request instead of creating a new one. This prevents duplicate requests from piling up.',
    },
    {
      type: 'heading',
      id: 'history',
      level: 2,
      text: 'Decision history',
    },
    {
      type: 'paragraph',
      text: 'The History tab shows all decided requests (approved and denied). Each entry includes everything from the pending view, plus:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Decision status', text: 'The chip shows "approved" or "denied" instead of "pending".' },
        { bold: 'Decided by', text: 'The name of the user who made the decision.' },
        { bold: 'Decided at', text: 'Timestamp of the decision.' },
        { bold: 'Decision reason', text: 'The reason entered at decision time, if any.' },
      ],
    },
    {
      type: 'paragraph',
      text: 'History is paginated. The last 50 decisions are loaded by default.',
    },
    {
      type: 'heading',
      id: 'how-agents-interact',
      level: 2,
      text: 'How agents interact with approvals',
    },
    {
      type: 'paragraph',
      text: 'When an agent calls a tool that requires approval, here\'s what happens from the agent\'s perspective:',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'The agent sends a `tools/call` request to `POST /v1/mcp`.' },
        { text: 'The gateway returns a JSON-RPC error with code `-32001` and a data payload containing the `approval_id`, `poll_endpoint`, and `expires_at`.' },
        { text: 'The agent polls `GET /v1/mcp/approvals/{approval_id}/status` periodically to check if the request was approved.' },
        { text: 'Once the status is "approved", the agent retries the original `tools/call` request.' },
        { text: 'If the status is "denied" or "expired", the agent handles the rejection.' },
      ],
    },
    {
      type: 'code',
      language: 'json',
      code: `// Error response when approval is required
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32001,
    "message": "Tool requires approval",
    "data": {
      "approval_id": 42,
      "poll_endpoint": "/v1/mcp/approvals/42/status",
      "expires_at": "2026-04-20T15:30:00+00:00"
    }
  }
}`,
    },
    {
      type: 'heading',
      id: 'empty-states',
      level: 2,
      text: 'Empty states',
    },
    {
      type: 'paragraph',
      text: 'When there are no pending approvals, the page shows: "No pending approvals" with a tip explaining how to trigger them (mark a tool as "requires approval" in the Tool Catalog, then call it with an agent key).',
    },
    {
      type: 'paragraph',
      text: 'When there\'s no history yet, the message is: "No approval history yet. Approved or denied requests will appear here."',
    },
    {
      type: 'heading',
      id: 'permissions',
      level: 2,
      text: 'Permissions',
    },
    {
      type: 'paragraph',
      text: 'Viewing pending requests and history is available to all authenticated users. Approving and denying requests requires the Admin role.',
    },
    {
      type: 'article-links',
      title: 'Related articles',
      items: [
        {
          collectionId: 'ai-gateway',
          articleId: 'mcp-tools',
          title: 'Tool catalog',
          description: 'Enable approval requirements on specific tools.',
        },
        {
          collectionId: 'ai-gateway',
          articleId: 'mcp-audit',
          title: 'Audit log',
          description: 'See approval_required entries in the audit trail.',
        },
        {
          collectionId: 'ai-gateway',
          articleId: 'mcp-overview',
          title: 'MCP Gateway overview',
          description: 'Understand the full request flow including the approval step.',
        },
      ],
    },
  ],
};
