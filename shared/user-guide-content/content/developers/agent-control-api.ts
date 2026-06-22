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
    { type: 'heading', id: 'result', level: 2, text: 'POST /v1/mcp/hook/result' },
    { type: 'paragraph', text: 'Report the result of a tool that has already run, so the run shows what happened. Best-effort; it never blocks.' },
    { type: 'table', columns: [
      { key: 'field', label: 'Field', width: '30%' },
      { key: 'desc', label: 'Description', width: '70%' },
    ], rows: [
      { field: 'tool_name', desc: 'Name of the tool that ran.' },
      { field: 'tool_response', desc: 'Object with the tool result.' },
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
    { type: 'heading', id: 'scanning', level: 2, text: 'What gets scanned' },
    { type: 'paragraph', text: 'For file-write tools, the gateway scans the content being written, not the file path or the text being removed. For other tools it scans the full arguments. This means writing sensitive data can be blocked, while deleting it is allowed.' },
    { type: 'article-links', title: 'Related articles', items: [
      { collectionId: 'developers', articleId: 'governing-tool-calls', title: 'Governing tool calls', description: 'How to handle each decision in practice.' },
      { collectionId: 'ai-gateway', articleId: 'mcp-audit', title: 'Activity', description: 'Where governed calls are recorded.' },
    ]},
  ],
};
