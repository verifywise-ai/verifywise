import type { ArticleContent } from '../../contentTypes';

export const aiTrustIndexTrackedContent: ArticleContent = {
  blocks: [
    {
      type: 'heading',
      id: 'overview',
      level: 2,
      text: 'Your tracked apps',
    },
    {
      type: 'paragraph',
      text: 'The Tracked tab shows every AI app your organisation is following. Only tracked apps are included in weekly change digest emails, so the list represents your organisation\'s active watch list for AI trust and privacy risk.',
    },
    {
      type: 'heading',
      id: 'tracked-cards',
      level: 2,
      text: 'The tracked apps grid',
    },
    {
      type: 'paragraph',
      text: 'Tracked apps appear as the same cards used in the Browse catalog (favicon, name, vendor, displayed grade, summary, category, and score), filtered to your organisation\'s tracked apps. Use the sort dropdown to order the grid by score, name, category, or tracked status.',
    },
    {
      type: 'paragraph',
      text: 'To stop tracking an app, click **Untrack** on its card or open the app detail page and click **Untrack**. The app is removed from the grid immediately and will no longer be included in digest emails.',
    },
    {
      type: 'heading',
      id: 'no-longer-in-index',
      level: 2,
      text: 'Apps no longer in the index',
    },
    {
      type: 'paragraph',
      text: 'Occasionally, an app is removed from the public AI Trust Index because it was discontinued, renamed, or merged into another product. When this happens, VerifyWise does not remove the app from your tracking list. Instead, it dims the app\'s card and marks it with a **No longer in index** badge.',
    },
    {
      type: 'paragraph',
      text: 'This design is intentional: an app disappearing from the index is itself a governance signal. You can review whether to untrack the app or take other action before it drops off your watch list.',
    },
    {
      type: 'callout',
      variant: 'info',
      text: 'When an app is first removed from the index, VerifyWise sends a one-time email to your configured recipients listing it in the "No longer assessed" section of that week\'s digest. Subsequent weekly syncs do not resend this notice for the same app.',
    },
    {
      type: 'heading',
      id: 'email-digests',
      level: 2,
      text: 'Weekly change digests',
    },
    {
      type: 'paragraph',
      text: 'Each week, if any of your tracked apps have material changes, VerifyWise sends a digest email to the configured recipients. A material change is one of:',
    },
    {
      type: 'bullet-list',
      items: [
        { text: 'The score changed' },
        { text: 'The letter grade or displayed grade changed' },
        { text: 'A dealbreaker flag was added or removed' },
        { text: 'The privacy policy date was updated' },
        { text: 'The biometrics processing status changed' },
      ],
    },
    {
      type: 'paragraph',
      text: 'Rewording of the summary or highlights in the public feed is not considered a material change and does not trigger an email. The digest groups changes into two sections: apps that changed materially, and apps that were removed from the index that week.',
    },
    {
      type: 'callout',
      variant: 'tip',
      text: 'If no tracked apps changed in a given week, no digest is sent. You only receive emails when something relevant to your watch list actually changed.',
    },
    {
      type: 'heading',
      id: 'managing-list',
      level: 2,
      text: 'Managing your tracking list',
    },
    {
      type: 'paragraph',
      text: 'Any member of your organisation can add or remove apps from the tracking list. Tracking changes take effect immediately. To add more apps, go to the Browse tab and use the Track button on a card or bulk select.',
    },
    {
      type: 'article-links',
      title: 'Related articles',
      items: [
        { collectionId: 'ai-trust-index', articleId: 'browse', title: 'Browsing and tracking apps', description: 'Find apps in the catalog and add them to your list' },
        { collectionId: 'ai-trust-index', articleId: 'settings', title: 'Configuring email recipients', description: 'Choose who receives digest emails' },
        { collectionId: 'ai-trust-index', articleId: 'dashboard', title: 'AI Trust Index overview', description: 'How scoring and change detection work' },
      ],
    },
  ],
};
