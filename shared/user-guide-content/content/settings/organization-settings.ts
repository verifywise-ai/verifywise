import type { ArticleContent } from '../../contentTypes';

export const organizationSettingsContent: ArticleContent = {
  blocks: [
    {
      type: 'heading',
      id: 'overview',
      level: 2,
      text: 'Overview',
    },
    {
      type: 'paragraph',
      text: 'Organization settings let you configure your organization\'s identity and branding in VerifyWise. These settings control how your organization appears across the platform and in generated reports.',
    },
    {
      type: 'heading',
      id: 'accessing-org-settings',
      level: 2,
      text: 'Accessing organization settings',
    },
    {
      type: 'paragraph',
      text: 'To access organization settings:',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Click on Settings in the sidebar footer' },
        { text: 'Select the Organization tab' },
      ],
    },
    {
      type: 'callout',
      variant: 'info',
      text: 'Only users with the Admin role can modify organization settings. Editors, Reviewers and Auditors can see the settings but can\'t make changes.',
    },
    {
      type: 'heading',
      id: 'organization-name',
      level: 2,
      text: 'Organization name',
    },
    {
      type: 'paragraph',
      text: 'The organization name identifies your company or team across VerifyWise. It shows up in reports, documentation and throughout the platform.',
    },
    {
      type: 'paragraph',
      text: 'To update your organization name:',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Enter the new name in the Organization name field' },
        { text: 'Click Save to apply the change' },
      ],
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Name requirements', text: 'The organization name must be between 2 and 50 characters' },
        { bold: 'Updates apply right away', text: 'The new name appears across the platform once saved' },
        { bold: 'Reports use current name', text: 'Generated reports show the organization name at the time of generation' },
      ],
    },
    {
      type: 'heading',
      id: 'organization-logo',
      level: 2,
      text: 'Organization logo',
    },
    {
      type: 'paragraph',
      text: 'Upload your organization\'s logo to brand your VerifyWise instance. The logo appears in various places across the platform.',
    },
    {
      type: 'heading',
      id: 'uploading-logo',
      level: 3,
      text: 'Uploading a logo',
    },
    {
      type: 'paragraph',
      text: 'To upload an organization logo:',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Click the Update button below the logo placeholder' },
        { text: 'Select an image file from your computer' },
        { text: 'The logo uploads and displays automatically' },
      ],
    },
    {
      type: 'image',
      src: '/images/user-guide/organization-settings.png',
      alt: 'Organization settings tab showing organization name field and logo upload with Delete and Update options',
      caption: 'Configure your organization name and logo from the Organization settings tab.',
    },
    {
      type: 'paragraph',
      text: 'Logo requirements:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Recommended size', text: '200 x 200 pixels for best display quality' },
        { bold: 'Maximum file size', text: '5MB' },
        { bold: 'Supported formats', text: 'PNG, JPG, JPEG, GIF and SVG' },
      ],
    },
    {
      type: 'heading',
      id: 'removing-logo',
      level: 3,
      text: 'Removing the logo',
    },
    {
      type: 'paragraph',
      text: 'To remove your organization logo:',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Click the Delete button below the current logo' },
        { text: 'Confirm the removal when prompted' },
        { text: 'The logo is removed and a placeholder is shown' },
      ],
    },
    {
      type: 'callout',
      variant: 'tip',
      title: 'Logo tips',
      text: 'Use a square logo with a transparent background for the best look. The logo displays in a circular frame, so centered designs work best.',
    },
    {
      type: 'heading',
      id: 'first-time-setup',
      level: 2,
      text: 'First-time setup',
    },
    {
      type: 'paragraph',
      text: 'When you first log in, you may be asked to set your organization name if it hasn\'t been configured yet. This makes sure your governance docs and reports show the right organization identifier from the start.',
    },
    {
      type: 'heading',
      id: 'faq',
      level: 2,
      text: 'Frequently asked questions',
    },
    {
      type: 'heading',
      id: 'faq-change-name',
      level: 3,
      text: 'Can I change the organization name after initial setup?',
    },
    {
      type: 'paragraph',
      text: 'Yes. You can update the organization name at any time from the Organization tab in Settings. The change takes effect right away across the platform.',
    },
    {
      type: 'heading',
      id: 'faq-logo-reports',
      level: 3,
      text: 'Does the logo appear in generated reports?',
    },
    {
      type: 'paragraph',
      text: 'The logo is used for branding within the platform. Whether it appears in reports depends on the specific report type.',
    },
    {
      type: 'heading',
      id: 'faq-who-can-edit',
      level: 3,
      text: 'Who can modify organization settings?',
    },
    {
      type: 'paragraph',
      text: 'Users with the Admin role can modify organization settings. Editors, Reviewers and Auditors can view them but can\'t make changes. If you need to update settings but don\'t have permission, contact your organization\'s administrator.',
    },
    {
      type: 'article-links',
      title: 'Related articles',
      items: [
        {
          collectionId: 'settings',
          articleId: 'user-management',
          title: 'User management',
          description: 'Manage team members and access',
        },
        {
          collectionId: 'settings',
          articleId: 'role-configuration',
          title: 'Role configuration',
          description: 'Understand roles and permissions',
        },
      ],
    },
  ],
};
