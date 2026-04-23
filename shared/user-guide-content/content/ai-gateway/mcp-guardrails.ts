import type { ArticleContent } from '../../contentTypes';

export const mcpGuardrailsContent: ArticleContent = {
  blocks: [
    {
      type: 'heading',
      id: 'overview',
      level: 2,
      text: 'Overview',
    },
    {
      type: 'paragraph',
      text: 'MCP Guardrails scan tool inputs before the gateway forwards them to the backend server. They catch PII, prohibited content, and prompt injection attempts before they reach your tools.',
    },
    {
      type: 'paragraph',
      text: 'You\'ll find them at **AI Gateway > MCP Gateway > Guardrails**.',
    },
    {
      type: 'paragraph',
      text: 'These guardrails are separate from the AI Gateway\'s LLM guardrails. LLM guardrails scan chat completion requests to LLM providers. MCP guardrails scan tool invocation inputs sent by agents to MCP servers.',
    },
    {
      type: 'heading',
      id: 'rule-list',
      level: 2,
      text: 'Rule list',
    },
    {
      type: 'paragraph',
      text: 'The main view lists all configured guardrail rules. A summary line at the top shows the total rule count and how many are active (e.g., "3 rules configured, 2 active").',
    },
    {
      type: 'paragraph',
      text: 'Each rule row displays:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Name', text: 'The name you gave the rule.' },
        { bold: 'Rule type chip', text: 'Shows "PII", "Content filter", or "Prompt injection" with a color-coded badge.' },
        { bold: 'Action chip', text: 'Shows "Block" or "Mask".' },
        { bold: 'Scope', text: 'Where the rule applies (currently "tool_input").' },
        { bold: 'Tool scope', text: 'Either "Applies to all tools" or a list of specific tool names.' },
        { bold: 'Tool chips', text: 'When scoped to specific tools, small chips show each tool name.' },
        { bold: 'Active toggle', text: 'Turn the rule on or off without deleting it.' },
      ],
    },
    {
      type: 'paragraph',
      text: 'Inactive rules appear dimmed (60% opacity). Click any row to edit it.',
    },
    {
      type: 'heading',
      id: 'rule-types',
      level: 2,
      text: 'Rule types',
    },
    {
      type: 'paragraph',
      text: 'Three types of guardrail rules are available:',
    },
    {
      type: 'table',
      columns: [
        { key: 'type', label: 'Rule type', width: '20%' },
        { key: 'chip', label: 'Chip color', width: '15%' },
        { key: 'description', label: 'What it does', width: '65%' },
      ],
      rows: [
        { type: 'PII detection', chip: 'Blue (info)', description: 'Scans tool inputs for personal identifiable information: email addresses, phone numbers, credit card numbers, SSNs, etc. Uses Presidio-based detection.' },
        { type: 'Content filter', chip: 'Amber (warning)', description: 'Checks tool inputs against a list of keywords or regex patterns that you define. Useful for blocking profanity, competitor names, or domain-specific terms.' },
        { type: 'Prompt injection', chip: 'Green (success)', description: 'Detects attempts to manipulate the tool\'s behavior through injected instructions in the input data.' },
      ],
    },
    {
      type: 'heading',
      id: 'actions',
      level: 2,
      text: 'Actions',
    },
    {
      type: 'paragraph',
      text: 'Each rule has an action that determines what happens when a match is found:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Block', text: 'Rejects the entire tool call. The agent receives a JSON-RPC error with code `-32003` and a message explaining the guardrail violation. The call is logged as "blocked" in the audit trail.' },
        { bold: 'Mask', text: 'Replaces the matched content with placeholders before forwarding the call to the server. The tool still executes, but with sanitized input.' },
      ],
    },
    {
      type: 'callout',
      variant: 'warning',
      title: 'Masking affects tool results',
      text: 'When masking is used, the tool receives modified input. This means it may produce less relevant results. For example, masking an email address in a search query means the tool won\'t find results for that address.',
    },
    {
      type: 'heading',
      id: 'creating-a-rule',
      level: 2,
      text: 'Creating a guardrail rule',
    },
    {
      type: 'paragraph',
      text: 'Click **Add guardrail** in the top-right corner. The modal has these fields:',
    },
    {
      type: 'table',
      columns: [
        { key: 'field', label: 'Field', width: '22%' },
        { key: 'required', label: 'Required', width: '12%' },
        { key: 'description', label: 'Description', width: '66%' },
      ],
      rows: [
        { field: 'Name', required: 'Yes', description: 'A descriptive name for the rule (e.g., "Block PII in database queries"). Max 255 characters.' },
        { field: 'Rule type', required: 'Yes', description: 'Select PII detection, Content filter, or Prompt injection.' },
        { field: 'Action', required: 'Yes', description: 'Select Block or Mask.' },
        { field: 'Scope', required: 'Yes', description: 'Where to apply the rule. Currently only "Tool input" is available.' },
        { field: 'Applies to tools', required: 'No', description: 'Comma-separated tool names. Leave empty to apply to all MCP tools.' },
        { field: 'Config (JSON)', required: 'No', description: 'Optional JSON object for advanced rule settings. Format depends on the rule type.' },
        { field: 'Active', required: 'Yes', description: 'Toggle to enable or disable the rule immediately.' },
      ],
    },
    {
      type: 'heading',
      id: 'scoping-rules',
      level: 2,
      text: 'Scoping rules to specific tools',
    },
    {
      type: 'paragraph',
      text: 'By default, a rule applies to all MCP tools. You can restrict it to specific tools by entering a comma-separated list of tool names in the "Applies to tools" field.',
    },
    {
      type: 'paragraph',
      text: 'Examples:',
    },
    {
      type: 'bullet-list',
      items: [
        { text: 'Leave empty: the rule runs on every tool call.' },
        { text: 'Enter `run_query, search_db`: the rule only checks calls to those two tools.' },
        { text: 'Enter `delete_record`: the rule only checks calls to delete_record.' },
      ],
    },
    {
      type: 'callout',
      variant: 'tip',
      title: 'Targeted PII rules',
      text: 'You don\'t need to scan every tool for PII. Scope your PII rules to tools that interact with databases or external services. Tools like get_weather or list_colors probably don\'t need PII scanning.',
    },
    {
      type: 'heading',
      id: 'config-json',
      level: 2,
      text: 'Config JSON',
    },
    {
      type: 'paragraph',
      text: 'The Config field accepts a JSON object for advanced rule settings. The format depends on the rule type:',
    },
    {
      type: 'heading',
      id: 'pii-config',
      level: 3,
      text: 'PII detection config',
    },
    {
      type: 'code',
      language: 'json',
      code: `{
  "entities": {
    "EMAIL_ADDRESS": "mask",
    "PHONE_NUMBER": "block",
    "CREDIT_CARD": "block"
  }
}`,
    },
    {
      type: 'paragraph',
      text: 'Define which PII entity types to detect and how to handle each one. If no config is provided, the default detection settings are used.',
    },
    {
      type: 'heading',
      id: 'content-filter-config',
      level: 3,
      text: 'Content filter config',
    },
    {
      type: 'code',
      language: 'json',
      code: `{
  "keywords": ["password", "secret", "confidential"],
  "patterns": ["\\\\b\\\\d{3}-\\\\d{2}-\\\\d{4}\\\\b"]
}`,
    },
    {
      type: 'paragraph',
      text: 'Define keywords (exact match) and regex patterns to flag in tool inputs.',
    },
    {
      type: 'heading',
      id: 'editing-a-rule',
      level: 2,
      text: 'Editing a rule',
    },
    {
      type: 'paragraph',
      text: 'Click any rule row or the pencil icon to open the edit modal. All fields are editable. Click **Save changes** to apply. Changes take effect immediately for the next tool call.',
    },
    {
      type: 'heading',
      id: 'toggling-rules',
      level: 2,
      text: 'Enabling and disabling rules',
    },
    {
      type: 'paragraph',
      text: 'Each rule has an active toggle. Disabled rules are skipped during tool input scanning. This is useful for testing: create a rule, disable it, verify it works on the next tool call, then enable it.',
    },
    {
      type: 'heading',
      id: 'deleting-a-rule',
      level: 2,
      text: 'Deleting a rule',
    },
    {
      type: 'paragraph',
      text: 'Click the trash icon on a rule row. A confirmation modal appears: "This action takes effect immediately. MCP tool invocations will no longer be checked against this rule."',
    },
    {
      type: 'paragraph',
      text: 'Deletion is permanent but you can re-create the rule at any time.',
    },
    {
      type: 'heading',
      id: 'execution-order',
      level: 2,
      text: 'How guardrails execute',
    },
    {
      type: 'paragraph',
      text: 'When an agent calls a tool through the gateway, the guardrail evaluation happens in this order:',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'The gateway authenticates the agent key and resolves the tool.' },
        { text: 'ACLs and rate limits are checked.' },
        { text: 'If the tool requires approval, the approval flow takes priority (guardrails run after approval).' },
        { text: 'All active guardrail rules that apply to this tool are evaluated against the input.' },
        { text: 'If any rule triggers a "block" action, the call is rejected immediately.' },
        { text: 'If any rule triggers a "mask" action, the matched content is replaced before forwarding.' },
        { text: 'The (possibly modified) input is forwarded to the backend MCP server.' },
      ],
    },
    {
      type: 'heading',
      id: 'empty-state',
      level: 2,
      text: 'Empty state',
    },
    {
      type: 'paragraph',
      text: 'When no rules are configured, three tips explain the feature:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Scan tool inputs before execution', text: 'Rules are evaluated against tool input data before the tool runs.' },
        { bold: 'Scope rules to specific tools', text: 'Apply guardrails globally or restrict to specific MCP tools.' },
        { bold: 'Multiple rule types', text: 'Choose from PII detection, content filtering, or prompt injection detection.' },
      ],
    },
    {
      type: 'heading',
      id: 'permissions',
      level: 2,
      text: 'Permissions',
    },
    {
      type: 'paragraph',
      text: 'Creating, editing and deleting guardrail rules requires the Admin role. All authenticated users can view the rule list.',
    },
    {
      type: 'article-links',
      title: 'Related articles',
      items: [
        {
          collectionId: 'ai-gateway',
          articleId: 'mcp-audit',
          title: 'Audit log',
          description: 'Blocked tool calls appear in the audit trail with "blocked" status.',
        },
        {
          collectionId: 'ai-gateway',
          articleId: 'mcp-tools',
          title: 'Tool catalog',
          description: 'View which tools your guardrails apply to.',
        },
        {
          collectionId: 'ai-gateway',
          articleId: 'guardrails',
          title: 'AI Gateway guardrails',
          description: 'The LLM-level guardrails that protect chat completion requests.',
        },
      ],
    },
  ],
};
