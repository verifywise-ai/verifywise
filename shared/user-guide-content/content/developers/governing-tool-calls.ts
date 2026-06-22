import type { ArticleContent } from '../../contentTypes';

export const governingToolCallsContent: ArticleContent = {
  blocks: [
    { type: 'heading', id: 'overview', level: 2, text: 'Governing tool calls' },
    { type: 'paragraph', text: 'When your agent asks the gateway about a tool call, it gets back one of four decisions. This page explains each one, how to group calls into a run and how failures are handled.' },
    { type: 'heading', id: 'decisions', level: 2, text: 'The four decisions' },
    { type: 'table', columns: [
      { key: 'decision', label: 'Decision', width: '25%' },
      { key: 'meaning', label: 'What it means and what to do', width: '75%' },
    ], rows: [
      { decision: 'allow', meaning: 'The call passed all checks. Run the tool.' },
      { decision: 'deny', meaning: 'A guardrail blocked the call. Do not run the tool. The response includes a reason.' },
      { decision: 'approval_required', meaning: 'A human must approve first. The response includes an approval id and a poll endpoint. Wait for approval, then retry.' },
      { decision: 'rate_limited', meaning: 'The agent key went over its per-minute limit. Back off and retry later.' },
    ]},
    { type: 'heading', id: 'approval', level: 2, text: 'Handling approval' },
    { type: 'paragraph', text: 'When the decision is approval_required, the gateway has created a request for a human to approve or deny. Poll the status endpoint until you get a final answer.' },
    { type: 'code', language: 'json', code: '{\n  "decision": "approval_required",\n  "approval_id": 42,\n  "poll_endpoint": "/v1/mcp/approvals/42/status",\n  "expires_at": "2026-04-20T15:30:00+00:00"\n}' },
    { type: 'ordered-list', items: [
      { text: 'Call GET /v1/mcp/approvals/{approval_id}/status with your agent key.' },
      { text: 'When the status is approved, run the tool.' },
      { text: 'When the status is denied, do not run it.' },
      { text: 'When the status is expired, the window passed with no decision; treat it as a block.' },
    ]},
    { type: 'paragraph', text: 'On the MCP proxy path the same information comes back as a JSON-RPC error with code -32001, carrying the approval id, poll endpoint and expiry in error.data.' },
    { type: 'heading', id: 'runs', level: 2, text: 'Grouping calls into a run' },
    { type: 'paragraph', text: 'A run groups one turn of work: the model calls and the tool calls that belong together. They are tied by a shared run id.' },
    { type: 'bullet-list', items: [
      { bold: 'Tool calls', text: 'The native hook reuses the agent session id it already sends, so tool calls are grouped automatically.' },
      { bold: 'Model calls', text: 'Send the same id on your model requests using the header x-vw-agent-run-id. The aliases x-session-id and helicone-session-id are also accepted.' },
    ]},
    { type: 'callout', variant: 'tip', title: 'Use the same id on every call', text: 'A turn only groups correctly when the agent sends the same run id on every call, including sub-calls. A call with no id is still checked and logged; it just will not appear inside a run.' },
    { type: 'heading', id: 'failures', level: 2, text: 'Failures and fail-modes' },
    { type: 'bullet-list', items: [
      { bold: 'Gateway unreachable', text: 'With VW_FAIL_MODE=open (the default) the call runs anyway, so an outage never blocks your agent. Set it to closed to block instead.' },
      { bold: 'Approval timed out', text: 'Controlled by VW_APPROVAL_FAIL_MODE (default closed, which blocks). Set it to open to allow on timeout.' },
      { bold: 'Rate limited', text: 'Follows VW_FAIL_MODE. The call is an infra outcome, not a policy block.' },
    ]},
    { type: 'article-links', title: 'Related articles', items: [
      { collectionId: 'developers', articleId: 'agent-control-api', title: 'API reference', description: 'Every endpoint, header and error code in one place.' },
      { collectionId: 'ai-gateway', articleId: 'mcp-approvals', title: 'Approvals', description: 'The human side of approving or denying a call.' },
    ]},
  ],
};
