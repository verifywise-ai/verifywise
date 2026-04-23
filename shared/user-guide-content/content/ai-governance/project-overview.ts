import type { ArticleContent } from '../../contentTypes';

export const projectOverviewContent: ArticleContent = {
  blocks: [
    {
      type: 'heading',
      id: 'overview',
      level: 2,
      text: 'The Overview tab',
    },
    {
      type: 'paragraph',
      text: "When you click into a use case, you land on the Overview tab. It's a summary of where things stand: compliance progress, risk posture and the basic details about the AI system.",
    },
    {
      type: 'heading',
      id: 'what-you-see',
      level: 2,
      text: "What's on this tab",
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Framework progress', text: 'A progress bar for each attached framework showing how many controls and assessments are complete.' },
        { bold: 'Risk summary', text: 'Counts of risks by severity: very high, high, medium, low, very low.' },
        { bold: 'Use case details', text: 'Title, owner, UC ID, creation date, last update and description.' },
        { bold: 'Intake submission', text: 'If this use case was created through an intake form, the original submission details appear here.' },
      ],
    },
    {
      type: 'heading',
      id: 'navigating-tabs',
      level: 2,
      text: 'Other tabs in the use case',
    },
    {
      type: 'paragraph',
      text: 'The tab bar at the top lets you move between different aspects of the use case:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Use case risks', text: 'A risk register scoped to this use case. Shows a badge with the current risk count.' },
        { bold: 'Linked models', text: 'Which AI models from your inventory are associated with this use case.' },
        { bold: 'Frameworks/regulations', text: 'The controls and assessments for each attached compliance framework.' },
        { bold: 'CE Marking', text: 'EU conformity assessment steps for high-risk AI systems.' },
        { bold: 'FRIA', text: 'Fundamental Rights Impact Assessment (required under EU AI Act Article 27).' },
        { bold: 'Activity', text: 'Chronological log of every change: who, what, when, old value, new value.' },
        { bold: 'Monitoring', text: 'Post-market monitoring questionnaires and recurring check cycles.' },
        { bold: 'Settings', text: 'Edit metadata, transfer ownership, manage members, add/remove frameworks or delete the use case.' },
      ],
    },
    {
      type: 'callout',
      variant: 'info',
      text: 'If an approval workflow is active and the use case hasn\'t been approved yet, all tabs except Overview and Settings will be disabled.',
    },
    {
      type: 'article-links',
      title: 'Related articles',
      items: [
        {
          collectionId: 'ai-governance',
          articleId: 'use-cases',
          title: 'Use cases',
          description: 'Full guide to creating and managing use cases.',
        },
        {
          collectionId: 'risk-management',
          articleId: 'risk-assessment',
          title: 'Risk assessments',
          description: 'How risks are identified and scored.',
        },
      ],
    },
  ],
};
