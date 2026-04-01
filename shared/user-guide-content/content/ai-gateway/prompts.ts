import type { ArticleContent } from '../../contentTypes';

export const promptsContent: ArticleContent = {
  blocks: [
    {
      type: 'heading',
      id: 'overview',
      level: 2,
      text: 'Overview',
    },
    {
      type: 'paragraph',
      text: 'A prompt is a versioned list of messages (system, user, assistant) with **{{variable}}** placeholders. Bind a prompt to an endpoint and the gateway resolves the template before every request, so you can change instructions without touching application code.',
    },
    {
      type: 'paragraph',
      text: 'The editor is a 50/50 split: messages on the left, a test chat on the right. Fill in variables, pick an endpoint, and see streaming responses before you publish anything.',
    },
    {
      type: 'heading',
      id: 'creating-prompt',
      level: 2,
      text: 'Creating a prompt',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Go to **AI Gateway > Prompts** in the sidebar' },
        { text: 'Click **Create prompt**' },
        { text: 'Enter a name (e.g., "Customer support agent"). A URL-safe slug is generated from the name automatically.' },
        { text: 'Add a description if you want (optional, but helps your team find the right prompt later)' },
        { text: 'Click **Create**. You\'ll land in the editor.' },
      ],
    },
    {
      type: 'heading',
      id: 'editing-messages',
      level: 2,
      text: 'Editing messages',
    },
    {
      type: 'paragraph',
      text: 'The left panel shows your message blocks. Each block has a role (system, user, or assistant) and a text area. Here\'s what you can do:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Add messages', text: 'Click "+ Add message" below the last block to add a new user message. Change the role using the dropdown in the block header.' },
        { bold: 'Reorder messages', text: 'Drag the grip handle on the left side of any message block to reorder them.' },
        { bold: 'Delete messages', text: 'Click the trash icon in the block header. At least one message must remain.' },
        { bold: 'Change the role', text: 'Use the dropdown in the block header to switch between SYSTEM, USER, and ASSISTANT roles.' },
      ],
    },
    {
      type: 'heading',
      id: 'template-variables',
      level: 2,
      text: 'Template variables',
    },
    {
      type: 'paragraph',
      text: 'Write **{{variableName}}** anywhere in a message to create a placeholder. The editor detects variables automatically and shows them as chips below the message blocks. Variable names can contain letters, numbers, and underscores.',
    },
    {
      type: 'callout',
      variant: 'info',
      title: 'Variable resolution',
      text: 'When testing in the editor, you fill in variable values manually in the right panel. When a prompt is bound to an endpoint in production, variables are resolved from the request metadata.',
    },
    {
      type: 'heading',
      id: 'model-and-parameters',
      level: 2,
      text: 'Model and parameters',
    },
    {
      type: 'paragraph',
      text: 'Each version can store a model and parameter overrides. Pick a model from the dropdown at the top of the editor, then click the gear icon to configure:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Temperature', text: 'Controls randomness (0.0 to 2.0). Lower values produce more focused, deterministic output. Higher values produce more creative, varied output. Default is 1.0.' },
        { bold: 'Max tokens', text: 'Maximum number of tokens to generate in the response. Higher values allow longer outputs but increase cost and latency.' },
        { bold: 'Top P', text: 'Nucleus sampling parameter (0.0 to 1.0). The model considers tokens within the top_p cumulative probability. Use either temperature or top P for best results, not both.' },
      ],
    },
    {
      type: 'heading',
      id: 'versioning',
      level: 2,
      text: 'Versioning',
    },
    {
      type: 'paragraph',
      text: 'Every **Save draft** click creates a new version. Versions are append-only, numbered v1, v2, v3, etc. Each one captures the full message list, detected variables, model, and parameters.',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Draft', text: 'A saved version that is not yet active. Drafts can be loaded into the editor and tested.' },
        { bold: 'Published', text: 'The active version used by bound endpoints. Only one version can be published at a time.' },
      ],
    },
    {
      type: 'paragraph',
      text: 'Click the clock icon in the top right to open the **Version history** drawer. From there you can load any version into the editor or publish it directly.',
    },
    {
      type: 'callout',
      variant: 'tip',
      title: 'Publishing',
      text: 'When you publish a version, all other versions are automatically set back to draft. The published version is immediately used by any endpoints bound to this prompt.',
    },
    {
      type: 'heading',
      id: 'testing',
      level: 2,
      text: 'Testing prompts',
    },
    {
      type: 'paragraph',
      text: 'The right panel is a live test chat. To try your prompt:',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Pick an endpoint from the **Test endpoint** dropdown. This controls which provider and API key get used.' },
        { text: 'If your prompt has variables, fill in their values in the fields that appear below the dropdown.' },
        { text: 'Type a message and press Enter (or click send).' },
        { text: 'The response streams in. Once it finishes, you\'ll see latency, token count, and cost above the input.' },
      ],
    },
    {
      type: 'callout',
      variant: 'info',
      title: 'Test requests use real endpoints',
      text: 'Test requests go through the real proxy flow: guardrails scan the input, rate limits apply, and spend is logged. This costs real budget, same as a production request.',
    },
    {
      type: 'heading',
      id: 'binding-to-endpoints',
      level: 2,
      text: 'Binding prompts to endpoints',
    },
    {
      type: 'paragraph',
      text: 'Once you\'ve published a version, you can bind the prompt to an endpoint. The gateway then resolves the published messages and prepends them to every request that goes through that endpoint.',
    },
    {
      type: 'paragraph',
      text: 'The resolution priority is:',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'If the endpoint has a **prompt_id**, resolve the published version and prepend its messages (with variables substituted from request metadata).' },
        { text: 'If no published version exists or resolution fails, fall back to the endpoint\'s **system prompt** field.' },
        { text: 'If neither is set, use the request messages as-is.' },
      ],
    },
    {
      type: 'heading',
      id: 'deleting-prompts',
      level: 2,
      text: 'Deleting prompts',
    },
    {
      type: 'paragraph',
      text: 'Click the trash icon on any row in the list. This removes the prompt and all its versions. Any endpoints that were using this prompt get unlinked (prompt_id set to null). Requests already in flight aren\'t affected, but new requests will fall back to the endpoint\'s system prompt or pass through with no template.',
    },
    {
      type: 'heading',
      id: 'permissions',
      level: 2,
      text: 'Permissions',
    },
    {
      type: 'paragraph',
      text: 'All users can view prompts and their versions. Creating, editing, publishing, and deleting prompts requires the **Admin** role.',
    },
    {
      type: 'article-links',
      title: 'Related articles',
      items: [
        {
          collectionId: 'ai-gateway',
          articleId: 'endpoints',
          title: 'Endpoints',
          description: 'Configure LLM provider endpoints that prompts can be bound to.',
        },
        {
          collectionId: 'ai-gateway',
          articleId: 'guardrails',
          title: 'Guardrails',
          description: 'Set up PII detection and content filtering that applies to prompt test requests.',
        },
        {
          collectionId: 'ai-gateway',
          articleId: 'getting-started',
          title: 'Getting started',
          description: 'Set up the AI Gateway from scratch with API keys, endpoints, and first requests.',
        },
      ],
    },
  ],
};
