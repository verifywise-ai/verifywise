import type { ArticleContent } from '../../contentTypes';

export const aiTrustIndexBrowseContent: ArticleContent = {
  blocks: [
    {
      type: 'heading',
      id: 'overview',
      level: 2,
      text: 'Browsing the catalog',
    },
    {
      type: 'paragraph',
      text: 'The Browse tab shows the full catalog of AI apps in the index as a grid of cards. Results are server-paginated with 24 apps per page, sorted by score (highest first) by default. You can search by name, filter by category or grade, and change the sort order at any time.',
    },
    {
      type: 'heading',
      id: 'searching',
      level: 2,
      text: 'Searching and filtering',
    },
    {
      type: 'paragraph',
      text: 'Use the search box at the top of the Browse tab to find apps by name or vendor. Results update as you type, so there is no separate submit button.',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Category filter', text: 'Narrow to a specific app type: Assistant, Image & video, Audio, Companion, Productivity, and more.' },
        { bold: 'Grade filter', text: 'Show only apps with a particular displayed grade (A through F).' },
        { bold: 'Sort', text: 'Order the grid by best or worst score, name (A–Z or Z–A), vendor, or category using the sort dropdown.' },
      ],
    },
    {
      type: 'callout',
      variant: 'info',
      text: 'The Browse tab only shows apps that are currently active in the public index. Apps that have been removed from the index no longer appear here but remain visible in the Tracked tab if your organisation was following them.',
    },
    {
      type: 'heading',
      id: 'app-card',
      level: 2,
      text: 'What each card shows',
    },
    {
      type: 'paragraph',
      text: 'Each app appears as a card in the grid, showing:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Select checkbox', text: 'Select this app for bulk tracking (see below).' },
        { bold: 'Favicon and name', text: 'The app\'s icon and name, with a warning icon when a dealbreaker flag is active.' },
        { bold: 'Vendor or category', text: 'The vendor when it differs from the name, otherwise the category.' },
        { bold: 'Grade', text: 'Colour-coded chip showing the displayed grade. This is the B-capped grade when dealbreaker flags are active, and it is the grade to use for governance decisions.' },
        { bold: 'Summary', text: 'A short editorial description of the assessment (trimmed to a few lines on the card).' },
        { bold: 'Category and score', text: 'A category chip and the numeric score out of 100.' },
        { bold: 'Track', text: 'A button to add or remove this app from your organisation\'s tracking list.' },
      ],
    },
    {
      type: 'heading',
      id: 'app-detail',
      level: 2,
      text: 'Viewing app details',
    },
    {
      type: 'paragraph',
      text: 'Click a card (outside the checkbox or track button) to open the full detail page for that app. The detail page shows:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'App header', text: 'favicon, name, vendor, displayed grade, a score meter, the confidence level, and a Track/Untrack button.' },
        { bold: 'Verdict', text: 'a plain-language sentence summarising how well the app discloses its data practices for its grade.' },
        { bold: 'Comparison', text: 'where the app ranks among all assessed apps and how its score compares to its category average.' },
        { bold: 'Grade scale', text: 'the A–F bands with the app\'s band highlighted.' },
        { bold: 'Summary', text: 'a short editorial description of the overall assessment.' },
        { bold: 'Highlights', text: 'a set of specific findings, each with a label and explanation.' },
        { bold: 'What the policy is silent or vague on', text: 'the weaker areas, taken from the indicator assessment.' },
        { bold: 'Privacy rating', text: 'a per-domain breakdown with the full indicator checklist. Apps assessed on the current rubric show the breakdown; others show a short note until their next scoring pass.' },
        { bold: 'Dealbreaker flags', text: 'listed when present, so you can see which violations triggered a grade cap.' },
        { bold: 'Policy details', text: 'a link to the privacy policy, the date it was last updated (if known), the data modalities the app processes, and whether biometric data is involved.' },
        { bold: 'Related apps', text: 'other apps in the same category, with their grades.' },
      ],
    },
    {
      type: 'heading',
      id: 'tracking-single',
      level: 2,
      text: 'Tracking an app',
    },
    {
      type: 'paragraph',
      text: 'To track an individual app, use the Track button on its card or the Track button on its detail page. Tracked apps appear in the Tracked tab and are included in the weekly change digest emails when their score, grade, or policy details change materially.',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Find the app in the Browse catalog.' },
        { text: 'Click **Track** on the app\'s card, or open the detail page and click **Track**.' },
        { text: 'The button switches to **Untrack** immediately. The app now appears in your Tracked tab.' },
      ],
    },
    {
      type: 'heading',
      id: 'tracking-bulk',
      level: 2,
      text: 'Tracking multiple apps at once',
    },
    {
      type: 'paragraph',
      text: 'If you want to start tracking several apps in one step, use bulk select:',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Check the select checkbox on each app card you want to track. You can select apps across multiple pages before applying.' },
        { text: 'The **Track selected (N)** button in the filter bar shows the count of selected apps.' },
        { text: 'Click **Track selected (N)** to add all selected apps to your tracking list in one operation.' },
        { text: 'Already-tracked apps in your selection are skipped automatically, so no duplicates are created.' },
      ],
    },
    {
      type: 'callout',
      variant: 'tip',
      text: 'Bulk tracking is capped at 200 apps per request. If you need to track more, submit in batches.',
    },
    {
      type: 'article-links',
      title: 'Related articles',
      items: [
        { collectionId: 'ai-trust-index', articleId: 'dashboard', title: 'AI Trust Index overview', description: 'How the index works and what scores mean' },
        { collectionId: 'ai-trust-index', articleId: 'tracked', title: 'Your tracked apps', description: 'Manage your tracking list' },
        { collectionId: 'ai-trust-index', articleId: 'settings', title: 'Configuring email recipients', description: 'Who receives change digests' },
      ],
    },
  ],
};
