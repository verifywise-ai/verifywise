import type { ArticleContent } from '../../contentTypes';

export const agentControlOverviewContent: ArticleContent = {
  blocks: [
    { type: 'heading', id: 'overview', level: 2, text: 'What Agent Control does' },
    { type: 'paragraph', text: 'Agent Control governs the actions your agent takes, beyond the text it generates. Every time an agent runs a tool (a shell command, a file write, an API call through a tool server), the gateway checks that call before it runs and decides whether to allow it, block it, ask a human or rate-limit it.' },
    { type: 'paragraph', text: 'This guide is for developers connecting their own agent to the gateway. If you just want to use the screens, see the end-user AI Gateway articles instead.' },
    { type: 'heading', id: 'terms', level: 2, text: 'Terms used in this guide' },
    { type: 'bullet-list', items: [
      { bold: 'Agent key', text: 'A secret token (starts with sk-mcp-) that identifies your agent to the gateway. You create it in the UI and send it on every request.' },
      { bold: 'Tool call', text: 'A single action the agent takes, like running a Bash command or writing a file.' },
      { bold: 'Hook', text: 'A small script your agent runs before each tool call to ask the gateway for a decision.' },
      { bold: 'Run', text: 'One agent turn, grouping the model calls (the conversation) and the tool calls (the actions) that belong together.' },
    ]},
    { type: 'heading', id: 'two-paths', level: 2, text: 'Two ways to connect' },
    { type: 'paragraph', text: 'There are two entry paths. Most coding agents use the first.' },
    { type: 'bullet-list', items: [
      { bold: 'Native hook', text: 'Your agent runs its own built-in tools (like Bash). Before each call, a hook asks the gateway POST /v1/mcp/hook for a decision. The gateway never runs the tool itself; it only says yes or no.' },
      { bold: 'MCP proxy', text: 'Your agent calls a tool through the gateway at POST /v1/mcp using JSON-RPC. The gateway checks the call and forwards it to the registered tool server.' },
    ]},
    { type: 'callout', variant: 'info', title: 'Where decisions are recorded', text: 'Every checked call is written to the Activity log, so you can see what each agent did, the decision it got and how long it took.' },
    { type: 'article-links', title: 'Next steps', items: [
      { collectionId: 'developers', articleId: 'connect-your-agent', title: 'Connect your agent', description: 'Get a tool call governed in about 5 minutes.' },
      { collectionId: 'ai-gateway', articleId: 'mcp-overview', title: 'Agent Control overview', description: 'The end-user view of the same feature.' },
    ]},
  ],
};
