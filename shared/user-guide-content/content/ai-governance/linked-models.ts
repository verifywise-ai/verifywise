import type { ArticleContent } from '../../contentTypes';

export const linkedModelsContent: ArticleContent = {
  blocks: [
    {
      type: 'heading',
      id: 'overview',
      level: 2,
      text: 'Overview',
    },
    {
      type: 'paragraph',
      text: 'The Linked models tab in a project shows which AI models from your model inventory are connected to that use case. This gives you a direct view of what models power the project and lets you navigate to their inventory records.',
    },
    {
      type: 'heading',
      id: 'viewing',
      level: 2,
      text: 'Viewing linked models',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Open a project from your dashboard.' },
        { text: 'Click the **Linked models** tab.' },
        { text: 'You\'ll see a list of all models that have been linked to this project, with their name, provider, version, and status.' },
      ],
    },
    {
      type: 'paragraph',
      text: 'Click any model row to open its full record in the model inventory.',
    },
    {
      type: 'heading',
      id: 'linking',
      level: 2,
      text: 'How models get linked',
    },
    {
      type: 'paragraph',
      text: 'Models are linked to projects through the model inventory. When you create or edit a model in the inventory, you can assign it to one or more projects. The linked models tab is a read-only view of those associations.',
    },
    {
      type: 'callout',
      variant: 'tip',
      title: 'Where to link',
      text: 'To add or remove model links, go to the model inventory and edit the model\'s project associations. The linked models tab on the project is a view, not an editor.',
    },
    {
      type: 'heading',
      id: 'why-it-matters',
      level: 2,
      text: 'Why this matters',
    },
    {
      type: 'paragraph',
      text: 'Auditors and compliance reviewers need to know exactly which AI models are used in each project. The linked models tab provides that traceability without requiring you to maintain a separate spreadsheet.',
    },
    {
      type: 'article-links',
      title: 'Related articles',
      items: [
        {
          collectionId: 'ai-governance',
          articleId: 'model-inventory',
          title: 'Managing model inventory',
          description: 'Register and manage your AI models.',
        },
        {
          collectionId: 'ai-governance',
          articleId: 'datasets',
          title: 'Datasets',
          description: 'Track the datasets that feed into your models.',
        },
      ],
    },
  ],
};
