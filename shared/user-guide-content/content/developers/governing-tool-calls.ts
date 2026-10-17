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
      { decision: 'deny', meaning: 'A guardrail, or the agent key\'s tool lists when they apply to native calls, blocked the call. Do not run the tool. The response includes a reason.' },
      { decision: 'approval_required', meaning: 'A human must approve first. The response includes an approval id and a poll endpoint. Wait for approval, then retry.' },
      { decision: 'rate_limited', meaning: 'The agent key went over its per-minute limit. Back off and retry later.' },
    ]},
    { type: 'heading', id: 'tool-lists', level: 2, text: 'Agent key tool lists' },
    { type: 'paragraph', text: 'An agent key\'s allowed and blocked tool lists always apply to MCP server tools called through the proxy. They apply to native tool calls (the hook script and the Python SDK) only when the key has "Also apply tool lists to native tool calls" turned on. It is off by default, because lists written for MCP tools would otherwise deny Bash, Edit and other built-in tools of a key shared with Claude Code or Cursor.' },
    { type: 'paragraph', text: 'When the setting is on, the native hook checks the lists first, before any guardrail or approval rule. A tool that is not on the allowed list, or is on the blocked list, is denied straight away. A key with no lists is not affected.' },
    { type: 'code', language: 'json', code: '{\n  "decision": "deny",\n  "reason": "Tool \'Bash\' is not allowed for this agent key"\n}' },
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
    { type: 'heading', id: 'monitor-only', level: 2, text: 'Monitor only mode' },
    { type: 'paragraph', text: 'An Admin can set an agent key to monitor only, in the Mode setting of the Agent keys page. Use it to see what your rules would do to an agent before you enforce them. Every rule is still checked, but the call is never blocked or paused: the decision is always allow and the agent runs the tool.' },
    { type: 'bullet-list', items: [
      { bold: 'What is checked', text: 'Guardrails (a block or mask match), require approval rules, the key\'s allowed and blocked tool lists on the MCP proxy (and on native tool calls when the key\'s "Also apply tool lists to native tool calls" setting is on), and on the MCP proxy tools marked as requiring approval.' },
      { bold: 'No approvals', text: 'No approval request is created and nobody is notified, so there is nothing to poll.' },
      { bold: 'Still enforced', text: 'The key\'s rate limit, and on the MCP proxy the circuit breaker. They protect the gateway and your MCP servers rather than express policy, so a monitor only key can still get rate_limited.' },
      { bold: 'Tool list on the proxy', text: 'tools/list is not filtered by the key\'s tool lists, so the agent sees every tool.' },
    ]},
    { type: 'paragraph', text: 'When something matched, the allow response carries a monitored object saying what would have happened. On the MCP proxy the same object is in the tool result under _meta["verifywise.ai/monitored"]. See the API reference for its fields.' },
    { type: 'code', language: 'json', code: '{\n  "decision": "allow",\n  "monitored": {\n    "would": "deny",\n    "reason": "PII detected",\n    "source": "guardrail",\n    "rule": { "id": 11, "name": "No emails" },\n    "outcomes": [\n      { "would": "deny", "reason": "PII detected", "source": "guardrail", "rule": { "id": 11, "name": "No emails" } }\n    ]\n  }\n}' },
    { type: 'paragraph', text: 'In Activity these calls appear with the status Would block or Would need approval instead of blocked or approval required. When a call matched several things, the status is the most severe one and each match is listed in the call\'s events. The result summary is the tool\'s own result, as for any allowed call.' },
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
