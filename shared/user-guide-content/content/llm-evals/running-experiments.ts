import type { ArticleContent } from '../../contentTypes';

export const runningExperimentsContent: ArticleContent = {
  blocks: [
    {
      type: 'heading',
      id: 'overview',
      level: 2,
      text: 'What is an experiment?',
    },
    {
      type: 'paragraph',
      text: 'An experiment is a single evaluation run. You take a model, throw a dataset of prompts at it and measure how well it performs. Each experiment captures a snapshot of your model\'s capabilities at a specific point in time, making it easy to track improvements (or regressions) as you iterate.',
    },
    {
      type: 'paragraph',
      text: 'The experiment wizard walks you through four steps: configuring the model you want to test, selecting your dataset, choosing a judge LLM and picking which metrics to measure. Most experiments take just a few minutes to set up and run.',
    },
    {
      type: 'heading',
      id: 'starting-experiment',
      level: 2,
      text: 'Starting a new experiment',
    },
    {
      type: 'paragraph',
      text: 'Click **New experiment** from either the Overview or Experiments tab. This opens a step-by-step wizard that guides you through the configuration. Let\'s walk through each step.',
    },
    {
      type: 'heading',
      id: 'step-1-model',
      level: 2,
      text: 'Step 1: Choose your model',
    },
    {
      type: 'paragraph',
      text: 'First, you\'ll configure the model you want to evaluate. This is the model that will receive the prompts from your dataset and generate responses.',
    },
    {
      type: 'paragraph',
      text: 'Select a provider from the grid. Each provider card shows its logo for easy recognition:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'OpenAI', text: 'GPT-4, GPT-4 Turbo, GPT-3.5 Turbo and other OpenAI models. You\'ll need your OpenAI API key.' },
        { bold: 'Anthropic', text: 'Claude 3 Opus, Sonnet and Haiku. Great for testing against a different model family.' },
        { bold: 'Google Gemini', text: 'Gemini Pro and Ultra. Useful if you\'re considering Google\'s offerings.' },
        { bold: 'xAI', text: 'Grok models for those exploring newer providers.' },
        { bold: 'Mistral', text: 'Mistral Large and Medium. Strong open-weight alternative to closed models.' },
        { bold: 'HuggingFace', text: 'Open-source models like TinyLlama. No API key required for some models.' },
        { bold: 'Ollama', text: 'Locally-hosted models. Point to your Ollama instance to evaluate models running on your own hardware.' },
        { bold: 'Local', text: 'Any local endpoint with an OpenAI-compatible API. Enter your endpoint URL.' },
        { bold: 'Custom API', text: 'For custom deployments or proxies. Provide both the endpoint URL and any required authentication.' },
      ],
    },
    {
      type: 'paragraph',
      text: 'After selecting a provider, enter the specific model name (like `gpt-4` or `claude-3-opus`). For cloud providers, you\'ll also need to provide your API key. For local or custom endpoints, enter the endpoint URL.',
    },
    {
      type: 'callout',
      variant: 'tip',
      text: 'Testing the same model at different temperature settings? Run separate experiments and name them clearly (e.g., "GPT-4 temp=0.3" vs "GPT-4 temp=0.7") so you can compare results side by side.',
    },
    {
      type: 'heading',
      id: 'step-2-dataset',
      level: 2,
      text: 'Step 2: Select your dataset',
    },
    {
      type: 'paragraph',
      text: 'The dataset determines what prompts your model will receive. This is where you define the test cases that will reveal how well your model handles different scenarios. For more on creating and customizing datasets, see [[Managing datasets]](llm-evals/managing-datasets).',
    },
    {
      type: 'paragraph',
      text: 'You have three options for sourcing your data:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'My datasets', text: 'Custom datasets you\'ve previously uploaded. These are stored in your project and tailored to your specific use case.' },
        { bold: 'Built-in datasets', text: 'Curated test suites maintained by VerifyWise. Great for getting started or benchmarking against industry-standard prompts.' },
        { bold: 'Upload now', text: 'Upload a new JSON file on the spot. The file is saved to your project for future use.' },
      ],
    },
    {
      type: 'heading',
      id: 'dataset-modes',
      level: 3,
      text: 'Single-turn vs. conversational',
    },
    {
      type: 'paragraph',
      text: 'For chatbot evaluations, you\'ll choose between two dataset formats:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Single-turn', text: 'Each test case is an isolated prompt and response. Good for question-answering or one-shot tasks.' },
        { bold: 'Conversational (multi-turn)', text: 'Test cases include a conversation history. The model sees previous messages before generating its response. This is recommended for chatbots since it better reflects how users actually interact with them.' },
      ],
    },
    {
      type: 'callout',
      variant: 'info',
      text: 'For chatbots, conversational mode is marked as "Recommended" because real conversations rarely happen in isolation. Users reference previous messages, ask follow-ups and expect the bot to remember context.',
    },
    {
      type: 'heading',
      id: 'filtering-prompts',
      level: 3,
      text: 'Filtering and limiting prompts',
    },
    {
      type: 'paragraph',
      text: 'Built-in datasets can be large. To run faster experiments or focus on specific areas, you can:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Filter by category', text: 'Select categories like coding, mathematics, reasoning, creative, or knowledge to evaluate specific capabilities.' },
        { bold: 'Limit prompts', text: 'Set a maximum number of prompts to evaluate. Starting with 10-20 is a good way to test your configuration before running a full evaluation.' },
      ],
    },
    {
      type: 'paragraph',
      text: 'The dataset preview shows you exactly which prompts will be included. You can expand any prompt to see its full content, expected output and metadata.',
    },
    {
      type: 'heading',
      id: 'step-3-judge',
      level: 2,
      text: 'Step 3: Configure the judge LLM',
    },
    {
      type: 'paragraph',
      text: 'The judge LLM is the model that evaluates your model\'s responses. It looks at each output, compares it against the expected result and assigns scores for each metric.',
    },
    {
      type: 'paragraph',
      text: 'Choosing a good judge matters. You generally want:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'A capable model', text: 'GPT-4, Claude 3 Opus, or similar frontier models make the best judges. They\'re better at nuanced evaluation.' },
        { bold: 'Consistency', text: 'Use the same judge across experiments if you\'re comparing results. Different judges may score differently.' },
        { bold: 'Cost', text: 'Judging can get expensive since every test case requires multiple API calls. Consider using GPT-4o-mini for initial testing.' },
      ],
    },
    {
      type: 'paragraph',
      text: 'Configure your judge with these settings:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Provider and model', text: 'Same options as the model being tested. Pick a strong evaluator.' },
        { bold: 'API key', text: 'Required for cloud providers. This can be the same key as your test model if using the same provider.' },
        { bold: 'Temperature', text: 'Controls randomness in evaluations. Lower values (0.3-0.5) give more consistent scoring. Default is 0.7.' },
        { bold: 'Max tokens', text: 'How much the judge can write in its evaluation. Default of 2048 is usually plenty.' },
      ],
    },
    {
      type: 'callout',
      variant: 'warning',
      text: 'Avoid using the same model as both the test subject and the judge. Models tend to be biased toward their own outputs. If you\'re testing GPT-4, use Claude as the judge, or vice versa.',
    },
    {
      type: 'heading',
      id: 'step-4-metrics',
      level: 2,
      text: 'Step 4: Select your metrics',
    },
    {
      type: 'paragraph',
      text: 'The metrics available depend on your use case and dataset type. The wizard automatically shows relevant metrics based on your selections, so you\'re not overwhelmed with options that don\'t apply.',
    },
    {
      type: 'heading',
      id: 'use-case-metrics',
      level: 3,
      text: 'Metrics by use case',
    },
    {
      type: 'paragraph',
      text: 'Different use cases benefit from different evaluation approaches:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Chatbot', text: 'For conversational AI. Single-turn datasets show core metrics (relevancy, bias, toxicity). Multi-turn datasets unlock conversational metrics like turn relevancy, knowledge retention, coherence, helpfulness, task completion and conversation safety.' },
        { bold: 'RAG', text: 'For retrieval-augmented generation. Core metrics plus faithfulness (does it stick to the context?), hallucination detection and contextual relevancy (was the right context retrieved?).' },
        { bold: 'Agent', text: 'For AI assistants that take actions. Core metrics plus agent-specific evaluations for tool use, multi-step reasoning and task execution.' },
      ],
    },
    {
      type: 'heading',
      id: 'core-metrics',
      level: 3,
      text: 'Core metrics (all use cases)',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Answer relevancy', text: 'Does the response actually address the question? A model that gives accurate but off-topic answers scores low here.' },
        { bold: 'Bias detection', text: 'Flags responses containing gender, racial, political or other forms of bias. Important for any user-facing application.' },
        { bold: 'Toxicity detection', text: 'Catches harmful, offensive, or inappropriate language. Turn this on for any model that interacts with users.' },
      ],
    },
    {
      type: 'heading',
      id: 'conversational-metrics',
      level: 3,
      text: 'Conversational metrics (multi-turn chatbots)',
    },
    {
      type: 'paragraph',
      text: 'When you select a multi-turn dataset for chatbot evaluation, you\'ll see an expandable "Conversational metrics" accordion with these additional options:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Turn relevancy', text: 'Does each response address the user\'s current message in context?' },
        { bold: 'Knowledge retention', text: 'Does the model remember information from earlier in the conversation?' },
        { bold: 'Conversation coherence', text: 'Does the conversation flow logically without contradictions?' },
        { bold: 'Conversation helpfulness', text: 'Are responses actually useful for the user\'s goals?' },
        { bold: 'Task completion', text: 'Does the conversation successfully complete the user\'s intended task?' },
        { bold: 'Conversation safety', text: 'Is the conversation safe across all turns, even under manipulation?' },
      ],
    },
    {
      type: 'heading',
      id: 'rag-metrics',
      level: 3,
      text: 'RAG-specific metrics',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Faithfulness', text: 'When given context, does the model stick to that context or make things up?' },
        { bold: 'Hallucination detection', text: 'Identifies fabricated facts or unsupported claims.' },
        { bold: 'Contextual relevancy', text: 'Is the retrieved context actually relevant to the question?' },
      ],
    },
    {
      type: 'callout',
      variant: 'info',
      text: 'A "Multi-turn dataset detected" indicator appears when you select a conversational dataset, letting you know that additional metrics are available.',
    },
    {
      type: 'heading',
      id: 'running',
      level: 2,
      text: 'Running the experiment',
    },
    {
      type: 'paragraph',
      text: 'Click **Start Eval** to begin. The experiment will show up immediately in your experiments list with a "Running" status. Depending on your dataset size and the models involved, evaluation can take anywhere from seconds to several minutes.',
    },
    {
      type: 'paragraph',
      text: 'You can navigate away while the experiment runs, it continues in the background. When it completes, the status changes to "Completed" and you can view the results.',
    },
    {
      type: 'heading',
      id: 'understanding-results',
      level: 2,
      text: 'Understanding your results',
    },
    {
      type: 'paragraph',
      text: 'Click into any completed experiment to see the details. You\'ll find:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Overall scores', text: 'Aggregate metrics across all prompts. A quick health check of model performance.' },
        { bold: 'Per-prompt breakdown', text: 'Drill into individual test cases to see exactly where the model succeeded or struggled.' },
        { bold: 'Configuration details', text: 'What model, dataset and judge were used. Helpful when comparing experiments later.' },
        { bold: 'Timestamps', text: 'When the experiment was created and completed. Track how long evaluations take.' },
      ],
    },
    {
      type: 'heading',
      id: 'multi-turn-results',
      level: 3,
      text: 'Viewing multi-turn results',
    },
    {
      type: 'paragraph',
      text: 'Multi-turn experiments display results in a chat-style interface that mirrors actual conversation flow. Each turn shows the user message followed by the model\'s generated response, with color-coded indicators for different speakers.',
    },
    {
      type: 'paragraph',
      text: 'This format makes it easy to trace how a conversation evolved and identify exactly where the model\'s performance changed. You can see per-turn bias and toxicity scores alongside each response, highlighting problematic outputs as they occur in context.',
    },
    {
      type: 'heading',
      id: 'tracking-progress',
      level: 2,
      text: 'Tracking progress over time',
    },
    {
      type: 'paragraph',
      text: 'The Experiments tab includes a performance chart that plots your scores across all experiments. This is where patterns emerge: you can see if that prompt tweak actually helped, whether switching models improved quality or if performance has been steadily declining.',
    },
    {
      type: 'paragraph',
      text: 'Name your experiments descriptively (include the date, model version, or what you changed) so the chart tells a clear story.',
    },
    {
      type: 'article-links',
      title: 'Related articles',
      items: [
        { collectionId: 'llm-evals', articleId: 'managing-datasets', title: 'Managing datasets', description: 'Learn how to create and customize evaluation datasets' },
        { collectionId: 'llm-evals', articleId: 'configuring-scorers', title: 'Configuring scorers', description: 'Set up metrics and conversational evaluation' },
      ],
    },
  ],
};
