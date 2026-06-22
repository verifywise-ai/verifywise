import type { ArticleContent } from '../../contentTypes';

export const connectAnyAgentContent: ArticleContent = {
  blocks: [
    { type: 'heading', id: 'overview', level: 2, text: 'Connect any agent' },
    {
      type: 'paragraph',
      text: 'The gateway does not care which coding tool calls it. Any agent that can either send an HTTP request before it runs a tool, or speak MCP, can be governed. Claude Code and Cursor have ready-made wiring in the quickstart; this page covers everything else.',
    },
    { type: 'heading', id: 'two-options', level: 2, text: 'Two ways in' },
    {
      type: 'bullet-list',
      items: [
        { bold: 'A pre-tool hook', text: 'If your agent can run a script before each tool call, use the hook contract below. This is the same path Claude Code and Cursor use.' },
        { bold: 'The MCP proxy', text: 'If your agent speaks MCP (JSON-RPC tools/call), point it at the gateway and you are done. No script needed.' },
      ],
    },
    { type: 'heading', id: 'hook-contract', level: 2, text: 'The pre-tool hook contract' },
    {
      type: 'paragraph',
      text: 'Before your agent runs a tool, send the call to the gateway and act on the answer. The contract has three parts.',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'POST the tool call to /v1/mcp/hook with your agent key. Send tool_name, arguments, session_id and tool_use_id.' },
        { text: 'Read the decision in the response: allow, deny, approval_required or rate_limited.' },
        { text: 'Run the tool only on allow. On deny block it. On approval_required poll until you get a final answer. On rate_limited back off.' },
      ],
    },
    {
      type: 'code',
      language: 'bash',
      code: 'decision=$(curl -s -X POST "$VW_GATEWAY_URL/v1/mcp/hook" \\\n  -H "Authorization: Bearer $VW_AGENT_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d \'{"tool_name":"Bash","arguments":{"command":"ls"},"session_id":"run-123","tool_use_id":"call-1"}\' \\\n  | jq -r .decision)\n\n[ "$decision" = "allow" ] && run_the_tool || echo "blocked: $decision"',
    },
    {
      type: 'paragraph',
      text: 'The bundled script scripts/vw-tool-hook.sh already implements this, including approval polling and fail-modes. If your agent passes the tool call to a script on stdin, you can reuse it directly. See the API reference for every field.',
    },
    { type: 'heading', id: 'mcp-proxy', level: 2, text: 'The MCP proxy' },
    {
      type: 'paragraph',
      text: 'If your agent already talks to tools over MCP, route those calls through the gateway instead of straight to the tool server. The gateway checks each call and forwards the allowed ones.',
    },
    {
      type: 'bullet-list',
      items: [
        { text: 'Send your JSON-RPC tools/call requests to POST /v1/mcp.' },
        { text: 'Authenticate with your agent key as a bearer token.' },
        { text: 'When a tool needs approval, the gateway replies with a JSON-RPC error (code -32001) that tells you where to poll.' },
      ],
    },
    {
      type: 'paragraph',
      text: 'No adapter script is needed for this path. Any MCP client works.',
    },
    { type: 'heading', id: 'byo', level: 2, text: 'Agents without a hook' },
    {
      type: 'paragraph',
      text: 'Some terminal agents (for example Codex CLI, Aider and Gemini CLI) do not yet have a built-in way to run a script before each tool call. You have two choices.',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Use the MCP proxy', text: 'If the agent can reach tools over MCP, the proxy path above governs it with no hook.' },
        { bold: 'Wrap the tool step', text: 'If you control how the agent runs tools, add the hook contract call at that point: POST to /v1/mcp/hook and only run the tool on allow.' },
      ],
    },
    {
      type: 'callout',
      variant: 'tip',
      title: 'Same key, same endpoints',
      text: 'Whichever path you use, the agent key, the endpoints and the decisions are the same. Nothing about the gateway changes per agent, so a wiring you build for one tool transfers to the next.',
    },
    {
      type: 'article-links',
      title: 'Related articles',
      items: [
        { collectionId: 'developers', articleId: 'connect-your-agent', title: 'Connect your agent', description: 'Ready-made wiring for Claude Code and Cursor.' },
        { collectionId: 'developers', articleId: 'agent-control-api', title: 'API reference', description: 'Every endpoint, header and error code.' },
        { collectionId: 'developers', articleId: 'governing-tool-calls', title: 'Governing tool calls', description: 'How to handle each decision.' },
      ],
    },
  ],
};
