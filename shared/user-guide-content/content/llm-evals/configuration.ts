import type { ArticleContent } from '../../contentTypes';

export const configurationContent: ArticleContent = {
  blocks: [
    {
      type: 'heading',
      id: 'overview',
      level: 2,
      text: 'Project configuration',
    },
    {
      type: 'paragraph',
      text: 'This tab sets what type of LLM application your project evaluates. The choice determines which scorers and metrics are available when you run experiments.',
    },
    {
      type: 'heading',
      id: 'use-case-types',
      level: 2,
      text: 'Use case types',
    },
    {
      type: 'paragraph',
      text: 'Each project targets one of three use case types:',
    },
    {
      type: 'grid-cards',
      columns: 3,
      items: [
        {
          title: 'RAG',
          description: 'Evaluate retrieval-augmented generation. Scorers measure recall, precision, relevancy and faithfulness.',
          icon: 'FileSearch',
        },
        {
          title: 'Chatbot',
          description: 'Evaluate single and multi-turn conversations. Scorers focus on coherence, correctness and safety.',
          icon: 'MessageSquare',
        },
        {
          title: 'Agent',
          description: 'Evaluate AI agents for planning, tool usage, task completion and step efficiency.',
          icon: 'Bot',
        },
      ],
    },
    {
      type: 'heading',
      id: 'setting',
      level: 2,
      text: 'Setting the use case',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Open your project and click the **Configuration** tab in the sidebar.' },
        { text: 'Select **RAG**, **Chatbot** or **Agent** from the radio buttons.' },
        { text: 'Click **Save changes**.' },
      ],
    },
    {
      type: 'heading',
      id: 'locking',
      level: 2,
      text: 'Use case locking',
    },
    {
      type: 'paragraph',
      text: 'Once you create your first experiment, the use case becomes locked. This prevents inconsistencies between your experiments and the configured scorers.',
    },
    {
      type: 'paragraph',
      text: 'If you need to evaluate a different use case, create a new project. The configuration page shows a **Create new project** button when the use case is locked.',
    },
    {
      type: 'callout',
      variant: 'warning',
      text: 'Choose your use case carefully before running experiments. You can\'t change it once experiments exist in the project.',
    },
  ],
};
