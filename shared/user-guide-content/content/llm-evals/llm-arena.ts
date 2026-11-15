import type { ArticleContent } from '../../contentTypes';

export const llmArenaContent: ArticleContent = {
  blocks: [
    {
      type: 'heading',
      id: 'overview',
      level: 2,
      text: 'What is LLM Arena?',
    },
    {
      type: 'paragraph',
      text: 'LLM Arena lets you compare two models side by side on the same prompt. You send a question to both models at once and see their responses together, making it easy to spot differences in quality, style and accuracy.',
    },
    {
      type: 'heading',
      id: 'turning-on',
      level: 2,
      text: 'Turning Arena on',
    },
    {
      type: 'paragraph',
      text: 'Arena is off by default. An Admin can turn it on under **Arena** in **Settings**, the last item under **Enforce > LLM Evals** in the sidebar. While Arena is off, it is hidden from the sidebar and comparisons can\'t be created, opened or deleted. Turning Arena off keeps your comparisons, and they reappear when an Admin turns it back on.',
    },
    {
      type: 'paragraph',
      text: 'Organizations that ran Arena comparisons before this setting existed have Arena on until an Admin changes it.',
    },
    {
      type: 'heading',
      id: 'starting',
      level: 2,
      text: 'Starting a comparison',
    },
    {
      type: 'paragraph',
      text: 'In the sidebar, open **Enforce > LLM Evals** and click **Arena**. Select two models to compare by choosing a provider and model name for each side. You can compare models from different providers (e.g., GPT-4 vs Claude) or different versions of the same provider\'s models.',
    },
    {
      type: 'heading',
      id: 'running',
      level: 2,
      text: 'Running comparisons',
    },
    {
      type: 'paragraph',
      text: 'Type your prompt in the input field and click **Send**. Both models receive the same prompt and generate responses independently. Responses appear side by side so you can compare them directly.',
    },
    {
      type: 'paragraph',
      text: 'You can run multiple comparisons in a single session. Each prompt and response pair is saved, letting you build up a collection of comparison results.',
    },
    {
      type: 'heading',
      id: 'evaluation',
      level: 2,
      text: 'Evaluating responses',
    },
    {
      type: 'paragraph',
      text: 'After both models respond, you can optionally run an automated evaluation using a judge LLM. The judge scores each response on metrics like relevancy, helpfulness and accuracy, giving you objective data alongside your subjective assessment.',
    },
    {
      type: 'heading',
      id: 'results',
      level: 2,
      text: 'Viewing results',
    },
    {
      type: 'paragraph',
      text: 'Arena results are saved and can be reviewed later. Each result shows the prompt, both model responses and any evaluation scores. Use this to build evidence for model selection decisions.',
    },
    {
      type: 'callout',
      text: 'Arena is great for quick qualitative comparisons. For systematic evaluation across many prompts, use Experiments instead.',
    },
  ],
};
