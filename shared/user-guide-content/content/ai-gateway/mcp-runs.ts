import type { ArticleContent } from '../../contentTypes';

export const mcpRunsContent: ArticleContent = {
  blocks: [
    {
      type: 'heading',
      id: 'overview',
      level: 2,
      text: 'Overview',
    },
    {
      type: 'paragraph',
      text: 'A run groups everything an agent did in a single working session into one view: the model calls it made (the conversation) alongside the tool calls it ran (the actions). Rather than reading model traffic and tool activity in two separate places, Runs lets you reconstruct a whole agent turn in order.',
    },
    {
      type: 'paragraph',
      text: 'You\'ll find it at **AI Gateway > Agent Control > Runs**.',
    },
    {
      type: 'heading',
      id: 'how-correlation-works',
      level: 2,
      text: 'How runs are correlated',
    },
    {
      type: 'paragraph',
      text: 'Model calls and tool calls are tied together by a shared run id (`agent_run_id`). For the two halves of a turn to appear under the same run, the agent must use the same id on both:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Tool calls', text: 'The native tool-call hook uses the agent session id it already sends as the run id automatically.' },
        { bold: 'Model calls', text: 'The agent sends the run id on its model requests via the `x-vw-agent-run-id` header. The aliases `x-session-id` and `helicone-session-id` are also accepted, so agents already instrumented for other tools can correlate with little or no change.' },
      ],
    },
    {
      type: 'callout',
      variant: 'tip',
      title: 'Use the same id on every call',
      text: 'Correlation only works when the agent sends the same run id on every call of a turn: both its model calls and its tool calls, including any sub-calls. If the model calls don\'t carry the header, they\'ll be captured and governed as normal but won\'t appear inside the run.',
    },
    {
      type: 'paragraph',
      text: 'A call with no run id is still fully logged and governed exactly as before; it just won\'t be grouped into a correlated run. No capture or enforcement is lost.',
    },
    {
      type: 'heading',
      id: 'runs-list',
      level: 2,
      text: 'The runs list',
    },
    {
      type: 'paragraph',
      text: 'The Runs page lists one row per run, most recent first. Each row shows:',
    },
    {
      type: 'table',
      columns: [
        { key: 'field', label: 'Column', width: '22%' },
        { key: 'description', label: 'Description', width: '78%' },
      ],
      rows: [
        { field: 'Run', description: 'A short form of the run id.' },
        { field: 'Agent', description: 'The agent key associated with the run\'s tool calls.' },
        { field: 'Started', description: 'When the run began (the earliest call in it).' },
        { field: 'Model calls', description: 'How many model (conversation) calls the run made.' },
        { field: 'Tool calls', description: 'How many tool (action) calls the run made.' },
        { field: 'Denied', description: 'How many tool calls were blocked by a guardrail. Shows a dash when none were denied.' },
      ],
    },
    {
      type: 'paragraph',
      text: 'Click any row to open the run detail.',
    },
    {
      type: 'heading',
      id: 'run-detail',
      level: 2,
      text: 'Run detail',
    },
    {
      type: 'paragraph',
      text: 'The detail drawer shows every entry in the run, model calls and tool calls interleaved in the order they happened. Each entry is tagged so you can tell the two apart:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Model call', text: 'Shows the prompt sent and the response received, plus the model used and timing.' },
        { bold: 'Tool call', text: 'Shows the tool name, its arguments and a summary of the result.' },
      ],
    },
    {
      type: 'heading',
      id: 'conversation-capture',
      level: 2,
      text: 'Conversation capture',
    },
    {
      type: 'paragraph',
      text: 'Prompt and response content is only stored when body logging is turned on for your organization, via the guardrail settings flags **Log request body** and **Log response body**. Both default to off.',
    },
    {
      type: 'bullet-list',
      items: [
        { text: 'When the flags are on, the prompt and response shown are the post-guardrail (scanned and masked) versions, never the raw unmasked text.' },
        { text: 'When the flags are off, model entries show "(body logging disabled)" instead of content. The run, its counts, timing and tool activity are still recorded.' },
      ],
    },
    {
      type: 'callout',
      variant: 'info',
      title: 'Privacy first',
      text: 'Because stored prompts and responses can contain sensitive data, body logging is opt-in and stored content is always passed through your guardrails first, so masked entities stay masked in the run view.',
    },
    {
      type: 'heading',
      id: 'empty-state',
      level: 2,
      text: 'Empty state',
    },
    {
      type: 'paragraph',
      text: 'If no runs exist yet, the page explains how they appear: runs show up once an agent sends the same run id on its calls (the `x-vw-agent-run-id` header on model calls, or the session id on tool calls).',
    },
    {
      type: 'heading',
      id: 'backend-api',
      level: 2,
      text: 'Backend API',
    },
    {
      type: 'table',
      columns: [
        { key: 'endpoint', label: 'Endpoint', width: '40%' },
        { key: 'description', label: 'Description', width: '60%' },
      ],
      rows: [
        { endpoint: 'GET /mcp/runs', description: 'List runs, one row per run with model and tool call counts, denied count, token and cost totals. Paginated.' },
        { endpoint: 'GET /mcp/runs/{run_id}', description: 'Get a single run\'s entries (model and tool calls) interleaved in chronological order.' },
      ],
    },
    {
      type: 'heading',
      id: 'compliance-use',
      level: 2,
      text: 'Using runs for compliance',
    },
    {
      type: 'paragraph',
      text: 'Runs support record-keeping and human-oversight requirements by making a complete agent turn reconstructable end to end: what the agent was asked, what it answered and what actions it took, with every action still passing through allow, deny or approval before it ran.',
    },
    {
      type: 'article-links',
      title: 'Related articles',
      items: [
        {
          collectionId: 'ai-gateway',
          articleId: 'mcp-audit',
          title: 'MCP audit log',
          description: 'The per-tool-call activity log that feeds the action side of a run.',
        },
        {
          collectionId: 'ai-gateway',
          articleId: 'mcp-guardrails',
          title: 'MCP guardrails',
          description: 'Rules that scan and mask content, including what gets stored in a run.',
        },
        {
          collectionId: 'ai-gateway',
          articleId: 'mcp-approvals',
          title: 'MCP approvals',
          description: 'Human sign-off for tool calls that appear in a run.',
        },
      ],
    },
  ],
};
