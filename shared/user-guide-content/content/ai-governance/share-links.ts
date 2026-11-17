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
        { text: 'Open **Model inventory**, where the app offers share links.' },
        { text: 'Click the **Share** button. It is turned off if you cannot edit what you are sharing.' },
        { text: 'Choose what fields to include in the shared view.' },
        { text: 'Set an expiration date (how long the link stays active).' },
        { text: 'Optionally allow data export from the shared view.' },
        { text: 'Optionally show the toolbar (search, filter, sort) in the shared view.' },
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
      type: 'paragraph',
      text: 'Even with **Share all fields** on, a share link never shows internal fields: organization and user IDs, external keys, model risk management (MRM) fields, security assessment files or the contact details of an external owner. A model\'s approver is shown by name.',
    },
    {
      type: 'callout',
      variant: 'warning',
      title: 'Link security',
      text: 'Anyone with the link can view the shared data until it expires. Only share links through secure channels and set the shortest expiration period that makes sense for your use case.',
    },
    {
      type: 'heading',
      id: 'policy-links',
      level: 2,
      text: 'Policy share links',
    },
    {
      type: 'paragraph',
      text: 'Policy share links can only be created through the API. A link to the policy list shows your organization\'s 100 most recently created policies, whatever their status, drafts and archived policies included. With **Share all fields** on, the link also shows the full text of every policy it covers. If data export is on (the default when a link is created without settings), anyone with the link can download what it shows.',
    },
    {
      type: 'callout',
      variant: 'warning',
      title: 'Check the warnings',
      text: 'When you create, update or list a policy share link through the API, the response includes a `warnings` list that says what the link exposes. Read it before you send the link to anyone.',
    },
    {
      type: 'heading',
      id: 'managing',
      level: 2,
      text: 'Managing share links',
    },
    {
      type: 'paragraph',
      text: 'You can view all active share links, see when they expire and revoke them early if needed. Expired links automatically stop working.',
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
        { action: 'Create or change share links', roles: 'Anyone who can edit what is shared (for example, edit models for the model list). A use case or risk link also needs access to that use case or risk; a link to the whole use case or risk list needs a role that sees every use case.' },
        { action: 'View active share links', roles: 'Any signed-in member' },
        { action: 'Revoke share links', roles: 'The creator, or an Admin for any link in the organization' },
        { action: 'Access shared view (external)', roles: 'Anyone with the link' },
      ],
    },
  ],
};
