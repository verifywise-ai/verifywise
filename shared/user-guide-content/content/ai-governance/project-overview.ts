import type { ArticleContent } from '../../contentTypes';

export const projectOverviewContent: ArticleContent = {
  blocks: [
    {
      type: 'heading',
      id: 'overview',
      level: 2,
      text: 'Overview',
    },
    {
      type: 'paragraph',
      text: 'The project overview tab is the first thing you see when you open a use case. It shows the project\'s compliance progress, risk summary, and key metadata in one place.',
    },
    {
      type: 'heading',
      id: 'what-you-see',
      level: 2,
      text: 'What you see',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Compliance progress', text: 'Progress bars showing how many controls and assessments have been completed for each linked framework (EU AI Act, ISO 42001, etc.).' },
        { bold: 'Risk summary', text: 'Breakdown of project risks by severity level (very high, high, medium, low, very low).' },
        { bold: 'Project metadata', text: 'Project title, owner, creation date, last updated date, and description.' },
        { bold: 'Intake submission', text: 'If the project was created from an intake form, the original submission details are shown here.' },
      ],
    },
    {
      type: 'heading',
      id: 'navigating-tabs',
      level: 2,
      text: 'Project tabs',
    },
    {
      type: 'paragraph',
      text: 'From the overview, you can navigate to other tabs:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Use case risks', text: 'View and manage risks specific to this project.' },
        { bold: 'Linked models', text: 'See which AI models are connected to this project.' },
        { bold: 'Frameworks/regulations', text: 'Work through compliance controls and assessments.' },
        { bold: 'CE Marking', text: 'Manage EU conformity assessment for high-risk systems.' },
        { bold: 'FRIA', text: 'Complete the Fundamental Rights Impact Assessment.' },
        { bold: 'Activity', text: 'View the change history for this project.' },
        { bold: 'Monitoring', text: 'Set up and track post-market monitoring cycles.' },
        { bold: 'Settings', text: 'Edit project details, team members, and linked frameworks.' },
      ],
    },
    {
      type: 'article-links',
      title: 'Related articles',
      items: [
        {
          collectionId: 'ai-governance',
          articleId: 'use-cases',
          title: 'Use cases',
          description: 'Create and manage AI use cases.',
        },
        {
          collectionId: 'risk-management',
          articleId: 'risk-assessment',
          title: 'Conducting risk assessments',
          description: 'Learn about the risk data shown in the overview.',
        },
      ],
    },
  ],
};
