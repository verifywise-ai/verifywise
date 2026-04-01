import type { ArticleContent } from '../../contentTypes';

export const gettingStartedContent: ArticleContent = {
  blocks: [
    {
      type: 'heading',
      id: 'overview',
      level: 2,
      text: 'Overview',
    },
    {
      type: 'paragraph',
      text: 'The AI Gateway sits between your applications and LLM providers like OpenAI, Anthropic, and Google. Every request passes through it, so you get cost tracking, guardrails, and audit logs without changing your application code.',
    },
    {
      type: 'paragraph',
      text: 'By the end you\'ll have a working endpoint that your developers can hit with the standard OpenAI SDK.',
    },
    {
      type: 'heading',
      id: 'what-you-need',
      level: 2,
      text: 'What you need',
    },
    {
      type: 'bullet-list',
      items: [
        { text: 'A VerifyWise account with Admin role' },
        { text: 'An API key from at least one LLM provider (OpenAI, Anthropic, Google, etc.)' },
        { text: 'About 5 minutes' },
      ],
    },
    {
      type: 'heading',
      id: 'step-1-add-provider-key',
      level: 2,
      text: 'Step 1: Add a provider API key',
    },
    {
      type: 'paragraph',
      text: 'The gateway needs your provider\'s API key to forward requests. Keys are encrypted at rest (AES-256-CBC) and only decrypted when proxying a request.',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Go to **AI Gateway > Settings**.' },
        { text: 'Under API keys, click **Add key**.' },
        { text: 'Pick your provider from the dropdown (e.g., OpenAI).' },
        { text: 'Give it a name you\'ll recognize later (e.g., "Production OpenAI").' },
        { text: 'Paste your provider API key and click **Add key**.' },
      ],
    },
    {
      type: 'callout',
      variant: 'tip',
      title: 'Multiple keys per provider',
      text: 'You can add several keys for the same provider. Useful if different teams have separate billing accounts, or if you want a production key and a testing key.',
    },
    {
      type: 'heading',
      id: 'step-2-create-endpoint',
      level: 2,
      text: 'Step 2: Create an endpoint',
    },
    {
      type: 'paragraph',
      text: 'An endpoint maps a slug (like `prod-gpt4o`) to a specific provider, model, and API key. Your code references the slug. If you need to swap the model later, change the endpoint config and your application code stays the same.',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Go to **AI Gateway > Endpoints**.' },
        { text: 'Click **Create endpoint**.' },
        { text: 'Enter a slug (lowercase, hyphens allowed, e.g., `prod-gpt4o`).' },
        { text: 'Give it a display name (e.g., "Production GPT-4o").' },
        { text: 'Select the provider and model.' },
        { text: 'Pick the API key you just added.' },
        { text: 'Optionally add a system prompt, max tokens, temperature, or rate limit.' },
        { text: 'Click **Create**.' },
      ],
    },
    {
      type: 'callout',
      variant: 'info',
      title: 'What\'s a slug?',
      text: 'The slug is the identifier your code uses to route requests. When a developer sends `model: "prod-gpt4o"` in their API call, the gateway looks up the endpoint with that slug and forwards the request to the right provider and model.',
    },
    {
      type: 'heading',
      id: 'step-3-test-in-playground',
      level: 2,
      text: 'Step 3: Test it in the Playground',
    },
    {
      type: 'paragraph',
      text: 'Before handing the endpoint to developers, make sure it works.',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Go to **AI Gateway > Playground**.' },
        { text: 'Select your endpoint from the dropdown.' },
        { text: 'Type a message and hit send.' },
        { text: 'You should see a response from the LLM, plus the cost and token count.' },
      ],
    },
    {
      type: 'paragraph',
      text: 'If you get an error, check that the API key is correct and the model name matches what your provider expects.',
    },
    {
      type: 'heading',
      id: 'step-4-use-from-code',
      level: 2,
      text: 'Step 4: Use it from code',
    },
    {
      type: 'paragraph',
      text: 'Two options for calling the gateway from code:',
    },
    {
      type: 'heading',
      id: 'option-a-virtual-key',
      level: 3,
      text: 'Option A: Virtual key (recommended for production)',
    },
    {
      type: 'paragraph',
      text: 'Virtual keys let developers use the gateway without a VerifyWise account. Create one in **AI Gateway > Virtual keys**, copy the key, and use it like this:',
    },
    {
      type: 'code',
      language: 'python',
      code: `from openai import OpenAI

client = OpenAI(
    base_url="https://your-verifywise-host/v1",
    api_key="sk-vw-your-virtual-key",
)

response = client.chat.completions.create(
    model="prod-gpt4o",  # your endpoint slug
    messages=[{"role": "user", "content": "Hello!"}],
)
print(response.choices[0].message.content)`,
    },
    {
      type: 'heading',
      id: 'option-b-playground',
      level: 3,
      text: 'Option B: Playground (for testing)',
    },
    {
      type: 'paragraph',
      text: 'The Playground page in VerifyWise uses your logged-in session. Good for testing prompts and checking costs, but not for production code.',
    },
    {
      type: 'heading',
      id: 'step-5-optional-budget',
      level: 2,
      text: 'Step 5 (optional): Set a budget',
    },
    {
      type: 'paragraph',
      text: 'If you want to cap monthly spending:',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Go to **AI Gateway > Settings**.' },
        { text: 'Under Budget, click **Set budget**.' },
        { text: 'Enter a monthly limit in USD.' },
        { text: 'Set an alert threshold (e.g., 80%) to get a warning before the limit hits.' },
        { text: 'Toggle **Hard limit** on if you want requests rejected when the budget runs out.' },
      ],
    },
    {
      type: 'paragraph',
      text: 'Virtual keys can also have their own per-key budgets, separate from the org-wide budget.',
    },
    {
      type: 'heading',
      id: 'step-6-optional-guardrails',
      level: 2,
      text: 'Step 6 (optional): Add guardrails',
    },
    {
      type: 'paragraph',
      text: 'Guardrails scan every request before it reaches the LLM. You can block or mask personal data (PII) and filter prohibited content.',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Go to **AI Gateway > Guardrails**.' },
        { text: 'Click **Add rule**.' },
        { text: 'Choose a type: PII detection (catches emails, phone numbers, credit cards, etc.) or content filter (keywords or regex patterns).' },
        { text: 'Set the action: block the request entirely, or mask the detected content before forwarding.' },
        { text: 'Use the **Test** button to try your rule against sample text before enabling it.' },
      ],
    },
    {
      type: 'heading',
      id: 'whats-next',
      level: 2,
      text: 'What\'s next',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Monitor usage', text: 'Check the Analytics page for cost trends, token usage, and top users' },
        { bold: 'Review logs', text: 'The Logs page shows every request with filters for status, source, and search' },
        { bold: 'Create more endpoints', text: 'Set up separate endpoints for different models or environments (staging vs production)' },
        { bold: 'Distribute virtual keys', text: 'Give each team or service its own key with a budget cap' },
      ],
    },
    {
      type: 'article-links',
      title: 'Related articles',
      items: [
        {
          collectionId: 'ai-gateway',
          articleId: 'endpoints',
          title: 'Endpoints',
          description: 'Configure provider, model, and rate limits for each endpoint.',
        },
        {
          collectionId: 'ai-gateway',
          articleId: 'settings',
          title: 'Settings',
          description: 'Manage API keys, budgets, and guardrail configuration.',
        },
        {
          collectionId: 'ai-gateway',
          articleId: 'playground',
          title: 'Playground',
          description: 'Test your endpoints interactively before going to production.',
        },
        {
          collectionId: 'ai-gateway',
          articleId: 'virtual-keys',
          title: 'Virtual keys',
          description: 'Create API keys for developers to use the gateway programmatically.',
        },
      ],
    },
  ],
};
