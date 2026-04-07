import type { ArticleContent } from '../../contentTypes';

export const shareLinksContent: ArticleContent = {
  blocks: [
    {
      type: 'heading',
      id: 'overview',
      level: 2,
      text: 'Overview',
    },
    {
      type: 'paragraph',
      text: 'Share links let you give external stakeholders read-only access to specific resources in VerifyWise without requiring them to create an account. Each link is a unique URL with a token that expires after a set period.',
    },
    {
      type: 'heading',
      id: 'creating',
      level: 2,
      text: 'Creating a share link',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Navigate to the resource you want to share (e.g., a project, risk, or report).' },
        { text: 'Click the **Share** button.' },
        { text: 'Choose what fields to include in the shared view.' },
        { text: 'Set an expiration date (how long the link stays active).' },
        { text: 'Optionally allow data export from the shared view.' },
        { text: 'Click **Create link**. The URL is copied to your clipboard.' },
      ],
    },
    {
      type: 'heading',
      id: 'what-recipients-see',
      level: 2,
      text: 'What recipients see',
    },
    {
      type: 'paragraph',
      text: 'When someone opens a share link, they see a read-only view of the resource with only the fields you selected. They don\'t need a VerifyWise account. The shared view shows VerifyWise branding and a note that the link was shared by your organization.',
    },
    {
      type: 'callout',
      variant: 'warning',
      title: 'Link security',
      text: 'Anyone with the link can view the shared data until it expires. Only share links through secure channels and set the shortest expiration period that makes sense for your use case.',
    },
    {
      type: 'heading',
      id: 'managing',
      level: 2,
      text: 'Managing share links',
    },
    {
      type: 'paragraph',
      text: 'You can view all active share links, see when they expire, and revoke them early if needed. Expired links automatically stop working.',
    },
    {
      type: 'heading',
      id: 'roles',
      level: 2,
      text: 'Who can do what',
    },
    {
      type: 'table',
      columns: [
        { key: 'action', label: 'Action', width: '50%' },
        { key: 'roles', label: 'Required role', width: '50%' },
      ],
      rows: [
        { action: 'Create share links', roles: 'Admin or Editor' },
        { action: 'View active share links', roles: 'Admin or Editor' },
        { action: 'Revoke share links', roles: 'Admin' },
        { action: 'Access shared view (external)', roles: 'Anyone with the link' },
      ],
    },
  ],
};
