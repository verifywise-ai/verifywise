import type { ArticleContent } from '../../contentTypes';

export const agentControlApiContent: ArticleContent = {
  blocks: [
    { type: 'heading', id: 'overview', level: 2, text: 'API reference' },
    { type: 'paragraph', text: 'The endpoints your agent uses to get tool calls governed. All calls authenticate with an agent key.' },
    { type: 'heading', id: 'auth', level: 2, text: 'Authentication' },
    { type: 'paragraph', text: 'Send your agent key (it starts with sk-mcp-) as a bearer token on every request.' },
    { type: 'code', language: 'bash', code: 'Authorization: Bearer sk-mcp-...' },
    { type: 'heading', id: 'headers', level: 2, text: 'Headers' },
    { type: 'table', columns: [
      { key: 'header', label: 'Header', width: '35%' },
      { key: 'purpose', label: 'Purpose', width: '65%' },
    ], rows: [
      { header: 'Authorization', purpose: 'Bearer sk-mcp-... agent key. Required.' },
      { header: 'x-vw-agent-run-id', purpose: 'Groups model calls into the same run. Aliases: x-session-id, helicone-session-id.' },
    ]},
    { type: 'heading', id: 'hook', level: 2, text: 'POST /v1/mcp/hook' },
    { type: 'paragraph', text: 'Ask for a decision on a native tool call. The gateway never runs the tool; it only returns a decision.' },
    { type: 'paragraph', text: 'Checks run in this order: the agent key\'s allowed and blocked tool lists (only when the key\'s apply_tool_lists_to_hook setting is on), then the guardrail scan, then approval rules, then the rate limit. A tool the key\'s lists don\'t permit gets a deny with the reason "Tool \'<name>\' is not allowed for this agent key".' },
    { type: 'paragraph', text: 'Request body:' },
    { type: 'table', columns: [
      { key: 'field', label: 'Field', width: '30%' },
      { key: 'desc', label: 'Description', width: '70%' },
    ], rows: [
      { field: 'tool_name', desc: 'Name of the tool, e.g. "Bash".' },
      { field: 'arguments', desc: 'Object with the tool arguments, e.g. { "command": "ls" }.' },
      { field: 'session_id', desc: 'The run id for this turn. Used to group the call into a run.' },
      { field: 'tool_use_id', desc: 'A unique id for this specific call.' },
    ]},
    { type: 'code', language: 'bash', code: 'curl -X POST "$VW_GATEWAY_URL/v1/mcp/hook" \\\n  -H "Authorization: Bearer $VW_AGENT_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d \'{"tool_name":"Bash","arguments":{"command":"ls"},"session_id":"run-123","tool_use_id":"call-1"}\'' },
    { type: 'paragraph', text: 'Responses, one per decision:' },
    { type: 'code', language: 'json', code: '{ "decision": "allow" }\n\n{ "decision": "deny", "reason": "policy violation", "detections": [] }\n\n{ "decision": "approval_required", "approval_id": 42,\n  "poll_endpoint": "/v1/mcp/approvals/42/status",\n  "expires_at": "2026-04-20T15:30:00+00:00" }\n\n{ "decision": "rate_limited", "reason": "rate limit exceeded" }' },
    { type: 'paragraph', text: 'For a monitor only agent key the decision is always allow (or rate_limited). When a rule matched, the response adds an optional monitored object. Treat the call as allowed either way; the field is for logging.' },
    { type: 'table', columns: [
      { key: 'field', label: 'Field', width: '30%' },
      { key: 'desc', label: 'Description', width: '70%' },
    ], rows: [
      { field: 'monitored.would', desc: 'What an enforcing key would have got: "deny" or "approval_required". The most severe match.' },
      { field: 'monitored.reason', desc: 'Why, for that match.' },
      { field: 'monitored.source', desc: 'Which check produced that match: "guardrail", "approval_rule" (a require approval rule), "tool_acl" (the key\'s allowed or blocked tool lists: on the MCP proxy, and on native calls when the key\'s apply_tool_lists_to_hook is on) or "tool_requires_approval" (a tool marked as requiring approval, MCP proxy only).' },
      { field: 'monitored.rule', desc: '{ "id", "name" } of the rule behind that match, or null when it came from the key\'s tool lists or a tool marked as requiring approval.' },
      { field: 'monitored.outcomes', desc: 'Every match, each with would, reason, source and rule.' },
    ]},
    { type: 'code', language: 'json', code: '{ "decision": "allow",\n  "monitored": { "would": "approval_required",\n    "reason": "rule \'Approve rm\' requires approval",\n    "source": "approval_rule",\n    "rule": { "id": 21, "name": "Approve rm" },\n    "outcomes": [ { "would": "approval_required",\n      "reason": "rule \'Approve rm\' requires approval",\n      "source": "approval_rule",\n      "rule": { "id": 21, "name": "Approve rm" } } ] } }' },
    { type: 'heading', id: 'result', level: 2, text: 'POST /v1/mcp/hook/result' },
    { type: 'paragraph', text: 'Report the result of a tool that has already run, so the run shows what happened. Best-effort; it never blocks.' },
    { type: 'table', columns: [
      { key: 'field', label: 'Field', width: '30%' },
      { key: 'desc', label: 'Description', width: '70%' },
    ], rows: [
      { field: 'tool_name', desc: 'Name of the tool that ran.' },
      { field: 'tool_response', desc: 'Object with the tool result. An object with a non-null "error" key is recorded as a failed call, whatever the tool. Results over 10240 bytes (as serialized JSON) are cut.' },
      { field: 'session_id', desc: 'Same run id used on the hook call.' },
      { field: 'tool_use_id', desc: 'Same call id used on the hook call.' },
    ]},
    { type: 'code', language: 'python', code: 'import httpx, os\nhttpx.post(\n    f"{os.environ[\'VW_GATEWAY_URL\']}/v1/mcp/hook/result",\n    headers={"Authorization": f"Bearer {os.environ[\'VW_AGENT_KEY\']}"},\n    json={\n        "tool_name": "Bash",\n        "tool_response": {"stdout": "file1\\nfile2"},\n        "session_id": "run-123",\n        "tool_use_id": "call-1",\n    },\n)' },
    { type: 'heading', id: 'approval-status', level: 2, text: 'GET /v1/mcp/approvals/{id}/status' },
    { type: 'paragraph', text: 'Check whether a pending approval has been decided. Returns a status of pending, approved, denied or expired.' },
    { type: 'code', language: 'bash', code: 'curl "$VW_GATEWAY_URL/v1/mcp/approvals/42/status" \\\n  -H "Authorization: Bearer $VW_AGENT_KEY"' },
    { type: 'heading', id: 'errors', level: 2, text: 'JSON-RPC error codes' },
    { type: 'paragraph', text: 'On the MCP proxy path (POST /v1/mcp), an approval requirement comes back as a JSON-RPC error.' },
    { type: 'table', columns: [
      { key: 'code', label: 'Code', width: '20%' },
      { key: 'meaning', label: 'Meaning', width: '80%' },
    ], rows: [
      { code: '-32001', meaning: 'Tool requires approval. error.data has approval_id, poll_endpoint and expires_at.' },
    ]},
    { type: 'paragraph', text: 'With a monitor only agent key the proxy forwards the call instead of returning an error. When something matched, the JSON-RPC result carries the same monitored object as the hook in result._meta["verifywise.ai/monitored"].' },
    { type: 'heading', id: 'agent-key-mode', level: 2, text: 'Agent key mode' },
    { type: 'paragraph', text: 'Each agent key has an enforcement_mode: "enforce" (the default) blocks and pauses calls by policy, and "monitor" only records what would have happened. It is set on the Agent keys page. Agent key responses include these fields:' },
    { type: 'table', columns: [
      { key: 'field', label: 'Field', width: '35%' },
      { key: 'desc', label: 'Description', width: '65%' },
    ], rows: [
      { field: 'enforcement_mode', desc: '"enforce" or "monitor". Accepted when creating or updating a key (Admin only); any other value is rejected with a 400.' },
      { field: 'enforcement_mode_changed_at', desc: 'When the mode last changed (ISO 8601), or null if it was never changed from enforce.' },
      { field: 'enforcement_mode_changed_by', desc: 'Id of the user who last changed the mode, or null (also when that user has since been deleted).' },
      { field: 'enforcement_mode_changed_by_name', desc: 'Name of that user, or null. Returned when listing keys.' },
      { field: 'apply_tool_lists_to_hook', desc: 'true or false (default false). When true, the key\'s allowed and blocked tool lists also apply to native tool calls through POST /v1/mcp/hook; when false they apply to the MCP proxy only. Accepted when creating or updating a key (Admin only); a value that is not a boolean is rejected with a 400.' },
    ]},
    { type: 'heading', id: 'scanning', level: 2, text: 'What gets scanned' },
    { type: 'paragraph', text: 'For file-write tools, the gateway scans the content being written, not the file path or the text being removed. For other tools it scans the full arguments. This means writing sensitive data can be blocked, while deleting it is allowed.' },
    { type: 'article-links', title: 'Related articles', items: [
      { collectionId: 'developers', articleId: 'governing-tool-calls', title: 'Governing tool calls', description: 'How to handle each decision in practice.' },
      { collectionId: 'ai-gateway', articleId: 'mcp-audit', title: 'Activity', description: 'Where governed calls are recorded.' },
    ]},
  ],
};
