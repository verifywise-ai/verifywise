import type { ArticleContent } from '../../contentTypes';

export const regulationsTrackerSettingsContent: ArticleContent = {
  blocks: [
    {
      type: 'heading',
      id: 'overview',
      level: 2,
      text: 'Settings overview',
    },
    {
      type: 'paragraph',
      text: 'The Settings tab controls who is notified when a tracked country’s regulations change, lets you check for updates on demand, and turns on impact analysis. These settings apply to your whole organization.',
    },
    {
      type: 'callout',
      variant: 'warning',
      text: 'Only administrators can change these settings. Other users see a notice that the settings are administrator-only.',
    },
    {
      type: 'heading',
      id: 'recipients',
      level: 2,
      text: 'Choosing who gets notified',
    },
    {
      type: 'paragraph',
      text: 'Set the people who receive a notification when a tracked country’s regulations change:',
    },
    {
      type: 'bullet-list',
      items: [
        {
          bold: 'Recipients',
          text: 'Select organization users from the dropdown.',
        },
        {
          bold: 'Additional emails',
          text: 'Type any extra email address and press Enter to add it.',
        },
      ],
    },
    {
      type: 'paragraph',
      text: 'Changes save automatically a moment after you make them. If no recipients are set, no email digest is sent.',
    },
    {
      type: 'heading',
      id: 'check-now',
      level: 2,
      text: 'Checking for updates',
    },
    {
      type: 'paragraph',
      text: 'The feed is checked automatically on a regular schedule, and recipients are notified only when a tracked country’s regulations change. You do not need to check manually. If you want to run a check immediately, select Check for updates now. A progress panel walks through retrieving the feed, validating it, and comparing it against your tracked countries, then shows what changed.',
    },
    {
      type: 'heading',
      id: 'impact-analysis',
      level: 2,
      text: 'Impact analysis',
    },
    {
      type: 'paragraph',
      text: 'Turn on Analyse how regulation changes affect my organisation to have VerifyWise check which of your AI systems, controls, policies, vendors, and assessments may be affected when a tracked country’s regulations change. You get a short summary in the change notification and on the country’s detail page.',
    },
    {
      type: 'info-box',
      icon: 'Info',
      title: 'How impact analysis works',
      items: [
        'The analysis runs during the scheduled check, using your organization’s configured LLM key, so each run uses LLM credits.',
        'It sends the updated regulation text and the names and descriptions of your possibly-relevant entities to your LLM provider.',
        'When the setting is off, you still receive regulation-change notifications, without the impact summary.',
      ],
    },
    {
      type: 'heading',
      id: 'llm-key',
      level: 3,
      text: 'Connecting an LLM key',
    },
    {
      type: 'paragraph',
      text: 'Impact analysis needs an LLM key. The Settings tab shows your current status:',
    },
    {
      type: 'bullet-list',
      items: [
        {
          bold: 'No key configured',
          text: 'You are prompted to add an LLM key, with a link to the API keys settings.',
        },
        {
          bold: 'Key configured',
          text: 'The tab shows which provider and model the analysis will use, with a link to manage your keys.',
        },
      ],
    },
    {
      type: 'paragraph',
      text: 'The Last impact run line shows when impact analysis last ran, or notes that it has not run yet.',
    },
    {
      type: 'heading',
      id: 'on-country-page',
      level: 3,
      text: 'Impact on the country page',
    },
    {
      type: 'paragraph',
      text: 'When impact analysis has run for a tracked country, that country’s detail page shows a section titled How this change affects your organisation. It groups affected items into AI systems, controls, policies, vendors, and assessments, and gives a short reason for each. If the analysis is older than the latest change, a banner offers a Re-analyse action to run it again.',
    },
    {
      type: 'article-links',
      title: 'Related',
      items: [
        {
          collectionId: 'regulations-tracker',
          articleId: 'browse',
          title: 'Browsing and tracking countries',
          description: 'Find and track the jurisdictions relevant to your organization.',
        },
        {
          collectionId: 'regulations-tracker',
          articleId: 'tracked',
          title: 'Managing tracked countries',
          description: 'Review and update the countries you follow.',
        },
      ],
    },
  ],
};
