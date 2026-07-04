import type { ArticleContent } from '../../contentTypes';

export const connectYourAgentContent: ArticleContent = {
  blocks: [
    { type: 'heading', id: 'overview', level: 2, text: 'Connect your agent' },
    { type: 'paragraph', text: 'This gets one tool call governed in about 5 minutes using the bundled hook script. Steps 1, 2, 4 and 5 are the same for every agent. Step 3 shows the wiring for Claude Code and for Cursor, which share the same script. For any other terminal agent, see Connect any agent.' },
    { type: 'heading', id: 'step-1', level: 2, text: '1. Create an agent key' },
    { type: 'paragraph', text: 'In the UI, go to AI Gateway > Agent Control > Agent keys and create a key. Copy the value (it starts with sk-mcp-). You only see it once.' },
    { type: 'heading', id: 'step-2', level: 2, text: '2. Set the environment variables' },
    { type: 'code', language: 'bash', code: 'export VW_GATEWAY_URL=http://localhost:8100   # your gateway URL\nexport VW_AGENT_KEY=sk-mcp-...                 # the key you just copied' },
    { type: 'heading', id: 'step-3', level: 2, text: '3. Wire the hook' },
    { type: 'paragraph', text: 'Both agents below run the same bundled script, scripts/vw-tool-hook.sh. The script needs curl and jq on the PATH. Pick the wiring for your agent.' },
    { type: 'heading', id: 'step-3-claude-code', level: 3, text: 'Claude Code' },
    { type: 'paragraph', text: 'Point Claude Code at the script in your .claude/settings.json. The PreToolUse hook asks for a decision before each tool runs; the PostToolUse hook reports the result afterward.' },
    { type: 'code', language: 'json', code: '{\n  "hooks": {\n    "PreToolUse": [\n      { "matcher": "Bash|Edit|Write|MultiEdit|NotebookEdit",\n        "hooks": [{ "type": "command", "command": "scripts/vw-tool-hook.sh" }] }\n    ],\n    "PostToolUse": [\n      { "matcher": "Bash|Edit|Write",\n        "hooks": [{ "type": "command", "command": "scripts/vw-tool-hook.sh" }] }\n    ]\n  }\n}' },
    { type: 'heading', id: 'step-3-cursor', level: 3, text: 'Cursor' },
    { type: 'paragraph', text: 'Add the same script to .cursor/hooks.json. Cursor runs the preToolUse hook before each tool; the matcher limits it to the tools you want to check.' },
    { type: 'code', language: 'json', code: '{\n  "version": 1,\n  "hooks": {\n    "preToolUse": [\n      { "command": "scripts/vw-tool-hook.sh",\n        "matcher": "Shell|Write|Edit" }\n    ]\n  }\n}' },
    { type: 'callout', variant: 'info', title: 'How deny works in Cursor', text: 'The script blocks a denied call by exiting with code 2, which Cursor honors as a block. Cursor then shows its own generic block message rather than the gateway reason. The call is still blocked and recorded.' },
    { type: 'heading', id: 'step-4', level: 2, text: '4. Make a tool call' },
    { type: 'paragraph', text: 'Run any Bash command in your agent. The hook calls the gateway, the gateway returns a decision, and the call runs only if it is allowed.' },
    { type: 'heading', id: 'step-5', level: 2, text: '5. See it in Activity' },
    { type: 'paragraph', text: 'Open AI Gateway > Agent Control > Activity. The call appears with its decision, latency and the agent key that made it.' },
    { type: 'callout', variant: 'tip', title: 'Fail-open by default', text: 'If the gateway is unreachable, the hook lets the call run so your workflow is never blocked by an outage. Set VW_FAIL_MODE=closed to block instead.' },
    { type: 'article-links', title: 'Next steps', items: [
      { collectionId: 'developers', articleId: 'connect-any-agent', title: 'Connect any agent', description: 'The generic contract for agents other than Claude Code and Cursor.' },
      { collectionId: 'developers', articleId: 'governing-tool-calls', title: 'Governing tool calls', description: 'What the gateway sends back and how to handle each case.' },
      { collectionId: 'ai-gateway', articleId: 'mcp-agent-keys', title: 'Agent keys', description: 'Managing the keys that identify your agents.' },
    ]},
  ],
};
