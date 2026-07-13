import type { ArticleContent } from '../../contentTypes';

export const aiTrustIndexDashboardContent: ArticleContent = {
  blocks: [
    {
      type: 'heading',
      id: 'overview',
      level: 2,
      text: 'What is the AI Trust Index?',
    },
    {
      type: 'paragraph',
      text: 'The AI Trust Index is a VerifyWise module that shows how AI applications handle privacy and user data. It reads a public feed of scores and grades for common AI apps, refreshed weekly, so you have a current picture of the tools your teams use.',
    },
    {
      type: 'paragraph',
      text: 'Each app in the index has a score out of 100, a letter grade (A through F), and a displayed grade that is capped at B when serious dealbreaker flags are active. Use the displayed grade for governance decisions. It accounts for red-line violations even when the underlying score is high.',
    },
    {
      type: 'heading',
      id: 'how-it-works',
      level: 2,
      text: 'How it works',
    },
    {
      type: 'paragraph',
      text: 'VerifyWise pulls the AI Trust Index feed every Monday at 06:00 UTC. The job compares incoming scores and policy details against the last known values and detects two kinds of change:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Material changes', text: 'a change to the score, grade, dealbreaker flags, policy date, or biometrics processing. These trigger an email digest to your configured recipients.' },
        { bold: 'Editorial changes', text: 'reworded summaries or rephrased highlights. These update the stored record without sending an email.' },
      ],
    },
    {
      type: 'paragraph',
      text: 'On the first sync, VerifyWise seeds the full catalog without sending any emails. Digest emails start from the second sync onward, so you only hear about changes, not the initial data load.',
    },
    {
      type: 'heading',
      id: 'module-tabs',
      level: 2,
      text: 'Module tabs',
    },
    {
      type: 'icon-cards',
      items: [
        {
          icon: 'Search',
          title: 'Browse',
          description: 'Search and filter the full catalog of assessed AI apps. Select apps to track individually or in bulk.',
        },
        {
          icon: 'Bookmark',
          title: 'Tracked',
          description: 'Your organisation\'s tracked apps in one place. Apps removed from the public index are marked rather than dropped.',
        },
        {
          icon: 'Settings',
          title: 'Settings',
          description: 'Configure which users and email addresses receive the weekly change digest. Admin only.',
        },
      ],
    },
    {
      type: 'heading',
      id: 'grade-scale',
      level: 2,
      text: 'Understanding grades and scores',
    },
    {
      type: 'paragraph',
      text: 'Each app receives a score from 0 to 100 based on its privacy policy, data-handling disclosures, and transparency practices. The score maps to a letter grade. When an app has active dealbreaker flags (serious violations such as selling user data or lacking a privacy policy), the displayed grade is capped at B regardless of the numeric score. Check the displayed grade, not just the raw score.',
    },
    {
      type: 'table',
      columns: [
        { key: 'grade', label: 'Grade', width: '15%' },
        { key: 'meaning', label: 'What it indicates', width: '85%' },
      ],
      rows: [
        { grade: 'A', meaning: 'Strong privacy practices, transparent data handling, no dealbreaker flags' },
        { grade: 'B', meaning: 'Good practices with minor gaps, or capped from higher score due to dealbreaker flags' },
        { grade: 'C', meaning: 'Moderate concerns, such as transparency gaps or limited user control' },
        { grade: 'D', meaning: 'Significant privacy risks or opaque data practices' },
        { grade: 'F', meaning: 'Serious violations, such as selling data, having no policy, or actively harmful practices' },
      ],
    },
    {
      type: 'heading',
      id: 'access',
      level: 2,
      text: 'Accessing the AI Trust Index',
    },
    {
      type: 'paragraph',
      text: 'Open the AI Trust Index from the gauge icon in the left sidebar. You\'ll land on the Browse tab, which shows the full catalog of assessed apps. Use the Tracked tab to see only the apps your organisation is watching, and Settings to configure email notifications.',
    },
    {
      type: 'callout',
      variant: 'info',
      text: 'The AI Trust Index is read-only. VerifyWise displays the public feed but does not modify or curate scores. If you believe a score is inaccurate, refer to the source policy URL linked on each app\'s detail page.',
    },
    {
      type: 'article-links',
      title: 'Next steps',
      items: [
        { collectionId: 'ai-trust-index', articleId: 'browse', title: 'Browsing and tracking apps', description: 'Search the catalog and track the apps your organisation uses' },
        { collectionId: 'ai-trust-index', articleId: 'tracked', title: 'Your tracked apps', description: 'Manage your tracking list and see removed-app notices' },
        { collectionId: 'ai-trust-index', articleId: 'settings', title: 'Configuring email recipients', description: 'Choose who receives the weekly change digest' },
      ],
    },
  ],
};
