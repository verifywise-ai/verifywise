import type { ArticleContent } from '../../contentTypes';

export const aiGatewayModelsContent: ArticleContent = {
  blocks: [
    {
      type: 'heading',
      id: 'overview',
      level: 2,
      text: 'Overview',
    },
    {
      type: 'paragraph',
      text: 'The Models page in the AI Gateway gives you a searchable catalog of every LLM model available through the gateway. It pulls metadata from LiteLLM\'s model registry, so you can browse models across all supported providers without leaving VerifyWise.',
    },
    {
      type: 'paragraph',
      text: 'The page has three tabs: a full model catalog, a cost calculator for estimating monthly spend and a feature comparison tool for evaluating models side by side.',
    },
    {
      type: 'heading',
      id: 'accessing-models',
      level: 2,
      text: 'Accessing the models page',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Click the **AI Gateway** icon in the sidebar' },
        { text: 'Click **Models** in the secondary sidebar' },
        { text: 'The page loads with the All models tab active' },
      ],
    },
    {
      type: 'paragraph',
      text: 'The page header shows the total number of models and providers available. This count updates based on the LiteLLM model registry bundled with your AI Gateway installation.',
    },
    {
      type: 'heading',
      id: 'all-models-tab',
      level: 2,
      text: 'All models tab',
    },
    {
      type: 'paragraph',
      text: 'The default tab shows a paginated table of every model in the catalog. Each page displays 25 models at a time.',
    },
    {
      type: 'heading',
      id: 'table-columns',
      level: 3,
      text: 'Table columns',
    },
    {
      type: 'paragraph',
      text: 'The model table shows the following information for each model:',
    },
    {
      type: 'table',
      columns: [
        { key: 'column', label: 'Column', width: '25%' },
        { key: 'description', label: 'Description', width: '75%' },
      ],
      rows: [
        { column: 'Provider', description: 'The LLM provider (OpenAI, Anthropic, Google, Mistral, etc.) shown with a provider icon' },
        { column: 'Model', description: 'The model identifier used when making API requests through the gateway' },
        { column: 'Mode', description: 'The model type: chat, embedding, image generation, audio transcription or completion' },
        { column: 'Context', description: 'Maximum input token window, shown in shorthand (e.g. 128K, 1M)' },
        { column: '$/1M in', description: 'Cost per million input tokens in USD' },
        { column: '$/1M out', description: 'Cost per million output tokens in USD' },
        { column: 'Features', description: 'Icons showing supported capabilities: vision, function calling, PDF input, prompt caching' },
      ],
    },
    {
      type: 'heading',
      id: 'filtering-models',
      level: 3,
      text: 'Filtering models',
    },
    {
      type: 'paragraph',
      text: 'The filter bar above the table gives you several ways to narrow the list:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Search', text: 'Type in the search field to filter by model name or provider. Results update as you type.' },
        { bold: 'Provider dropdown', text: 'Select a specific provider to show only their models. Defaults to "All providers".' },
        { bold: 'Mode dropdown', text: 'Filter by model type: Chat, Embedding, Image generation, Audio transcription or Completion.' },
        { bold: 'Feature toggles', text: 'Click the Vision, Tools, PDF or Caching buttons to show only models that support those features. Active filters show a green border.' },
      ],
    },
    {
      type: 'paragraph',
      text: 'Filters can be combined. For example, you can search for "claude" while filtering by the Chat mode and Vision feature to find all Anthropic chat models with image support.',
    },
    {
      type: 'paragraph',
      text: 'A results count below the filters shows how many models match your current selection.',
    },
    {
      type: 'heading',
      id: 'adding-model-to-endpoint',
      level: 3,
      text: 'Adding a model to an endpoint',
    },
    {
      type: 'paragraph',
      text: 'Each row in the model table has an **Add** button on the right side. Clicking it takes you to the Endpoints page with the model and provider pre-filled, so you can quickly create a new endpoint for that model.',
    },
    {
      type: 'callout',
      variant: 'tip',
      text: 'The Add button is a shortcut. You can also create endpoints directly from the Endpoints page and type in the model name manually.',
    },
    {
      type: 'heading',
      id: 'pagination',
      level: 3,
      text: 'Pagination',
    },
    {
      type: 'paragraph',
      text: 'When the filtered list has more than 25 models, pagination controls appear at the bottom of the table. Use the left and right arrow buttons to move between pages. The current page number and total page count are displayed alongside the controls.',
    },
    {
      type: 'heading',
      id: 'cost-calculator-tab',
      level: 2,
      text: 'Cost calculator tab',
    },
    {
      type: 'paragraph',
      text: 'The cost calculator helps you estimate monthly spend across models based on your expected usage patterns. Only chat models with known pricing appear in the results.',
    },
    {
      type: 'heading',
      id: 'calculator-inputs',
      level: 3,
      text: 'Calculator inputs',
    },
    {
      type: 'paragraph',
      text: 'Enter your expected usage to see cost estimates:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Requests/day', text: 'The number of API requests you expect to make per day' },
        { bold: 'Avg input tokens', text: 'Average number of input tokens per request (prompt length)' },
        { bold: 'Avg output tokens', text: 'Average number of output tokens per request (response length)' },
        { bold: 'Provider', text: 'Optionally filter results to a single provider' },
      ],
    },
    {
      type: 'heading',
      id: 'calculator-results',
      level: 3,
      text: 'Understanding the results',
    },
    {
      type: 'paragraph',
      text: 'Results are sorted from cheapest to most expensive. The table shows:',
    },
    {
      type: 'table',
      columns: [
        { key: 'column', label: 'Column', width: '20%' },
        { key: 'description', label: 'Description', width: '80%' },
      ],
      rows: [
        { column: 'Rank', description: 'Position in the cost ranking. Top 3 get trophy, medal and award icons.' },
        { column: 'Model', description: 'Provider and model name. The cheapest model is tagged with a "cheapest" badge.' },
        { column: 'Context', description: 'Maximum input token window' },
        { column: '$/req', description: 'Cost per single request based on your input/output token averages' },
        { column: 'Input', description: 'Total daily input cost (requests x avg input tokens x cost per token)' },
        { column: 'Output', description: 'Total daily output cost (requests x avg output tokens x cost per token)' },
        { column: '$/day', description: 'Combined daily cost for all requests' },
        { column: '$/month', description: 'Projected 30-day cost (daily cost x 30)' },
      ],
    },
    {
      type: 'paragraph',
      text: 'The top 3 results are highlighted with distinct background colors for quick identification. By default, the calculator shows the top 50 results. If more models match, a button appears to show all results.',
    },
    {
      type: 'callout',
      variant: 'info',
      text: 'Cost estimates are based on published per-token pricing from each provider. Actual costs may differ if your provider offers volume discounts, committed use pricing or if token counts vary from your estimates.',
    },
    {
      type: 'heading',
      id: 'feature-comparison-tab',
      level: 2,
      text: 'Feature comparison tab',
    },
    {
      type: 'paragraph',
      text: 'The feature comparison tab lets you select up to 5 models and compare their capabilities side by side in a table.',
    },
    {
      type: 'heading',
      id: 'selecting-models',
      level: 3,
      text: 'Selecting models to compare',
    },
    {
      type: 'paragraph',
      text: 'There are two ways to add models to the comparison:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Popular models', text: 'Click any of the pre-populated model buttons (GPT-4o, Claude Sonnet, Gemini Flash, Mistral Large, Grok and others). Selected models show a green border.' },
        { bold: 'Search', text: 'Type in the search field to find any model by name. Click a result to add it to the comparison. Up to 5 models can be compared at once.' },
      ],
    },
    {
      type: 'paragraph',
      text: 'Three models are pre-selected by default (GPT-4o, Claude Sonnet 4 and Gemini 2.0 Flash) so you see results right away. Click any selected model\'s button again to deselect it.',
    },
    {
      type: 'heading',
      id: 'comparison-features',
      level: 3,
      text: 'Compared features',
    },
    {
      type: 'paragraph',
      text: 'The comparison table shows the following attributes for each selected model:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Provider', text: 'Which company offers the model' },
        { bold: 'Mode', text: 'The model type (chat, embedding, etc.)' },
        { bold: 'Max input tokens', text: 'Maximum context window size' },
        { bold: 'Max output tokens', text: 'Maximum response length' },
        { bold: 'Input $/1M tokens', text: 'Cost per million input tokens' },
        { bold: 'Output $/1M tokens', text: 'Cost per million output tokens' },
        { bold: 'Vision', text: 'Whether the model can process images' },
        { bold: 'Function calling', text: 'Whether the model supports tool/function calling' },
        { bold: 'Parallel tools', text: 'Whether the model can call multiple tools in a single turn' },
        { bold: 'PDF input', text: 'Whether the model accepts PDF files directly' },
        { bold: 'Prompt caching', text: 'Whether the model supports caching repeated prompt prefixes' },
        { bold: 'Response schema', text: 'Whether the model supports structured output schemas' },
        { bold: 'System messages', text: 'Whether the model accepts system-level instructions' },
      ],
    },
    {
      type: 'heading',
      id: 'comparison-highlighting',
      level: 3,
      text: 'Best-value highlighting',
    },
    {
      type: 'paragraph',
      text: 'The comparison table automatically highlights the best value in each row with a green background. For cost rows, the lowest price wins. For token limits and feature support, the highest value wins. This makes it easy to spot which model leads in each category.',
    },
    {
      type: 'paragraph',
      text: 'Boolean features (vision, function calling, etc.) show a green checkmark for "Yes" and a gray X for "No".',
    },
    {
      type: 'heading',
      id: 'removing-models',
      level: 3,
      text: 'Removing models from comparison',
    },
    {
      type: 'paragraph',
      text: 'To remove a model from the comparison, click the small trash icon next to its name in the column header. You can also click its button in the popular models row to deselect it.',
    },
    {
      type: 'heading',
      id: 'supported-providers',
      level: 2,
      text: 'Supported providers',
    },
    {
      type: 'paragraph',
      text: 'The AI Gateway supports models from all providers in the LiteLLM registry. The catalog is bundled with the gateway, so it doesn\'t require any API keys to browse. Common providers include:',
    },
    {
      type: 'grid-cards',
      columns: 3,
      items: [
        { title: 'OpenAI', description: 'GPT-4o, GPT-4o Mini, o1, o3 and more' },
        { title: 'Anthropic', description: 'Claude Opus, Sonnet, Haiku families' },
        { title: 'Google', description: 'Gemini Pro, Flash, Nano models' },
        { title: 'Mistral', description: 'Mistral Large, Medium, Small' },
        { title: 'xAI', description: 'Grok models' },
        { title: 'Meta', description: 'Llama models via various hosts' },
        { title: 'Cohere', description: 'Command and Embed models' },
        { title: 'Amazon Bedrock', description: 'All Bedrock-hosted models' },
        { title: 'Azure OpenAI', description: 'Azure-hosted OpenAI models' },
      ],
    },
    {
      type: 'callout',
      variant: 'info',
      text: 'Browsing the model catalog doesn\'t require provider API keys. Keys are only needed when you create an endpoint and start routing requests through the gateway.',
    },
    {
      type: 'heading',
      id: 'model-modes',
      level: 2,
      text: 'Model modes',
    },
    {
      type: 'paragraph',
      text: 'Models in the catalog are classified by their mode, which describes what kind of task they perform:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Chat', text: 'Conversational models that accept messages and return text responses. This is the most common mode.' },
        { bold: 'Embedding', text: 'Models that convert text into vector representations for semantic search and similarity matching.' },
        { bold: 'Image generation', text: 'Models that create images from text prompts (DALL-E, Stable Diffusion, etc.).' },
        { bold: 'Audio transcription', text: 'Models that convert spoken audio into text (Whisper, etc.).' },
        { bold: 'Completion', text: 'Legacy text completion models that predict the next tokens in a sequence.' },
      ],
    },
    {
      type: 'heading',
      id: 'feature-icons',
      level: 2,
      text: 'Feature icons reference',
    },
    {
      type: 'paragraph',
      text: 'The Features column in the model table uses icons to indicate model capabilities:',
    },
    {
      type: 'table',
      columns: [
        { key: 'icon', label: 'Icon', width: '15%' },
        { key: 'feature', label: 'Feature', width: '25%' },
        { key: 'meaning', label: 'What it means', width: '60%' },
      ],
      rows: [
        { icon: 'Eye', feature: 'Vision', meaning: 'Model can analyze images sent alongside text prompts' },
        { icon: 'Wrench', feature: 'Function calling', meaning: 'Model can call external tools and functions through structured tool-use APIs' },
        { icon: 'FileText', feature: 'PDF input', meaning: 'Model accepts PDF files directly without pre-processing' },
        { icon: 'Database', feature: 'Prompt caching', meaning: 'Provider supports caching repeated prompt prefixes to reduce cost and latency' },
      ],
    },
    {
      type: 'heading',
      id: 'workflow',
      level: 2,
      text: 'Typical workflow',
    },
    {
      type: 'paragraph',
      text: 'Here\'s how most teams use the Models page as part of their gateway setup:',
    },
    {
      type: 'ordered-list',
      items: [
        { bold: 'Browse the catalog', text: 'Use filters to find models that match your requirements (chat mode, vision support, etc.)' },
        { bold: 'Compare candidates', text: 'Switch to the Feature comparison tab to evaluate your shortlist side by side' },
        { bold: 'Estimate costs', text: 'Use the Cost calculator to project monthly spend based on your expected usage' },
        { bold: 'Add to endpoints', text: 'Click the Add button on your chosen model to create a gateway endpoint for it' },
        { bold: 'Test in playground', text: 'Use the AI Gateway Playground to test the endpoint before routing production traffic' },
      ],
    },
    {
      type: 'heading',
      id: 'troubleshooting',
      level: 2,
      text: 'Troubleshooting',
    },
    {
      type: 'paragraph',
      text: 'If the models page shows an error or no data:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'AI Gateway not running', text: 'The page shows "Failed to load model catalog. Is the AI Gateway running?" if it can\'t reach the gateway service. Make sure the AI Gateway is running on port 8100.' },
        { bold: 'Empty catalog', text: 'If the gateway is running but the catalog is empty, the LiteLLM model registry may not have loaded. Restart the AI Gateway service.' },
        { bold: 'Missing models', text: 'The catalog shows models from LiteLLM\'s built-in registry. Custom or self-hosted models won\'t appear here but can still be used in endpoints by entering the model name manually.' },
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
          description: 'Create gateway endpoints for the models you\'ve chosen',
        },
        {
          collectionId: 'ai-gateway',
          articleId: 'playground',
          title: 'Playground',
          description: 'Test your endpoints interactively before going to production',
        },
        {
          collectionId: 'ai-gateway',
          articleId: 'getting-started',
          title: 'Getting started',
          description: 'Set up the AI Gateway from scratch',
        },
        {
          collectionId: 'ai-gateway',
          articleId: 'virtual-keys',
          title: 'Virtual keys',
          description: 'Generate API keys for developers to access the gateway',
        },
      ],
    },
  ],
};
