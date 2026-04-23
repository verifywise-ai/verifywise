import type { ArticleContent } from '../../contentTypes';

export const roleConfigurationContent: ArticleContent = {
  blocks: [
    {
      type: 'heading',
      id: 'overview',
      level: 2,
      text: 'Overview',
    },
    {
      type: 'paragraph',
      text: 'VerifyWise uses role-based access control (RBAC) to manage what users can see and do. Each user gets a role that sets their permissions across all features.',
    },
    {
      type: 'paragraph',
      text: 'Understanding roles helps you make sure team members have the right access level for their responsibilities while keeping security tight.',
    },
    {
      type: 'heading',
      id: 'available-roles',
      level: 2,
      text: 'Available roles',
    },
    {
      type: 'paragraph',
      text: 'VerifyWise has four predefined roles:',
    },
    {
      type: 'icon-cards',
      items: [
        {
          icon: 'Shield',
          title: 'Admin',
          description: 'Full access to all features including user management, organization settings and integrations.',
        },
        {
          icon: 'CheckCircle',
          title: 'Reviewer',
          description: 'Read access plus the ability to approve or reject items. Can\'t create or edit content.',
        },
        {
          icon: 'Edit',
          title: 'Editor',
          description: 'Can create, edit and manage most content but has limited access to admin functions.',
        },
        {
          icon: 'Eye',
          title: 'Auditor',
          description: 'Read-only access for audit and review purposes.',
        },
      ],
    },
    {
      type: 'heading',
      id: 'admin-role',
      level: 2,
      text: 'Admin role',
    },
    {
      type: 'paragraph',
      text: 'Admins have full control over the platform. This role is for users responsible for platform governance and user management.',
    },
    {
      type: 'paragraph',
      text: 'Admin capabilities:',
    },
    {
      type: 'checklist',
      items: [
        'Full access to all platform features',
        'Create, edit and delete use cases and assessments',
        'Manage models, vendors, policies and training records',
        'Invite new users and change user roles',
        'Configure organization settings and branding',
        'Set up and manage integrations (Slack, MLflow)',
        'Create and manage API keys',
        'Generate all report types',
        'Access all settings tabs',
      ],
    },
    {
      type: 'callout',
      variant: 'warning',
      text: 'Admins can\'t delete their own account if they\'re the only administrator. Make sure at least one other admin exists before removing an admin user.',
    },
    {
      type: 'heading',
      id: 'reviewer-role',
      level: 2,
      text: 'Reviewer role',
    },
    {
      type: 'paragraph',
      text: 'Reviewers can view content and approve or reject items, but they can\'t create or edit content. This role works well for people who need to sign off on governance activities without authoring them.',
    },
    {
      type: 'paragraph',
      text: 'Reviewer capabilities:',
    },
    {
      type: 'checklist',
      items: [
        'View use cases, assessments and compliance status',
        'Approve or reject items in approval workflows',
        'View models, vendors, policies and training records',
        'View reports',
        'Access dashboard',
        'Update personal profile and preferences',
      ],
    },
    {
      type: 'paragraph',
      text: 'Reviewers can\'t:',
    },
    {
      type: 'bullet-list',
      items: [
        { text: 'Create, edit or delete content' },
        { text: 'Invite users or manage team members' },
        { text: 'Access organization settings' },
        { text: 'Generate reports' },
        { text: 'Access integrations or API keys' },
      ],
    },
    {
      type: 'heading',
      id: 'editor-role',
      level: 2,
      text: 'Editor role',
    },
    {
      type: 'paragraph',
      text: 'Editors can work with most platform content but have limited access to admin functions. This role fits team members who contribute to governance activities without needing full system control.',
    },
    {
      type: 'paragraph',
      text: 'Editor capabilities:',
    },
    {
      type: 'checklist',
      items: [
        'Create, edit and delete use cases and assessments',
        'Manage models, vendors, policies and training records',
        'Invite new team members',
        'Update organization settings (name and logo)',
        'Generate reports',
        'Access most settings tabs',
      ],
    },
    {
      type: 'paragraph',
      text: 'Editors can\'t:',
    },
    {
      type: 'bullet-list',
      items: [
        { text: 'Manage integrations (Slack, MLflow)' },
        { text: 'Create or delete API keys' },
        { text: 'Change their own role' },
      ],
    },
    {
      type: 'heading',
      id: 'auditor-role',
      level: 2,
      text: 'Auditor role',
    },
    {
      type: 'paragraph',
      text: 'Auditors have read-only access to the platform. This role is meant for people who need to review governance information without changing anything, like external auditors or compliance reviewers.',
    },
    {
      type: 'paragraph',
      text: 'Auditor capabilities:',
    },
    {
      type: 'checklist',
      items: [
        'View use cases, assessments and compliance status',
        'View models, vendors, policies and training records',
        'View reports (can\'t generate new ones)',
        'Access dashboard',
        'Update personal profile and preferences',
      ],
    },
    {
      type: 'paragraph',
      text: 'Auditors can\'t:',
    },
    {
      type: 'bullet-list',
      items: [
        { text: 'Create, edit or delete any content' },
        { text: 'Invite users or manage team members' },
        { text: 'Access organization settings' },
        { text: 'Generate reports' },
        { text: 'Access integrations or API keys' },
      ],
    },
    {
      type: 'heading',
      id: 'assigning-roles',
      level: 2,
      text: 'Assigning roles',
    },
    {
      type: 'paragraph',
      text: 'Roles are assigned in two ways:',
    },
    {
      type: 'heading',
      id: 'during-invitation',
      level: 3,
      text: 'During invitation',
    },
    {
      type: 'paragraph',
      text: 'When inviting a new team member, select the appropriate role in the invitation modal. The user will have this role when they create their account.',
    },
    {
      type: 'heading',
      id: 'changing-existing-role',
      level: 3,
      text: 'Changing an existing user\'s role',
    },
    {
      type: 'paragraph',
      text: 'To change a user\'s role after they\'ve joined:',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Go to Settings > Team' },
        { text: 'Find the user in the team table' },
        { text: 'Click on the role dropdown in their row' },
        { text: 'Select the new role' },
        { text: 'The change takes effect right away' },
      ],
    },
    {
      type: 'heading',
      id: 'permission-reference',
      level: 2,
      text: 'Permission reference',
    },
    {
      type: 'paragraph',
      text: 'Here\'s a summary of key permissions by role:',
    },
    {
      type: 'table',
      columns: [
        { key: 'feature', label: 'Feature', width: '2fr' },
        { key: 'admin', label: 'Admin', width: '1fr' },
        { key: 'reviewer', label: 'Reviewer', width: '1fr' },
        { key: 'editor', label: 'Editor', width: '1fr' },
        { key: 'auditor', label: 'Auditor', width: '1fr' },
      ],
      rows: [
        { feature: 'Use cases', admin: 'Full access', reviewer: 'View + approve', editor: 'Full access', auditor: 'View only' },
        { feature: 'Models', admin: 'Full access', reviewer: 'View + approve', editor: 'Full access', auditor: 'View only' },
        { feature: 'Vendors', admin: 'Full access', reviewer: 'View + approve', editor: 'Full access', auditor: 'View only' },
        { feature: 'Policies', admin: 'Full access', reviewer: 'View + approve', editor: 'Full access', auditor: 'View only' },
        { feature: 'Training', admin: 'Full access', reviewer: 'View only', editor: 'Full access', auditor: 'View only' },
        { feature: 'Reports', admin: 'Generate', reviewer: 'View only', editor: 'Generate', auditor: 'View only' },
        { feature: 'Team management', admin: 'Full access', reviewer: 'None', editor: 'Invite only', auditor: 'None' },
        { feature: 'Organization settings', admin: 'Full access', reviewer: 'View only', editor: 'Edit', auditor: 'View only' },
        { feature: 'Integrations', admin: 'Full access', reviewer: 'None', editor: 'None', auditor: 'None' },
        { feature: 'API keys', admin: 'Full access', reviewer: 'None', editor: 'None', auditor: 'None' },
      ],
    },
    {
      type: 'heading',
      id: 'best-practices',
      level: 2,
      text: 'Best practices',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Limit admin accounts', text: 'Only give the Admin role to users who need full platform control. Most users should be Editors, Reviewers or Auditors.' },
        { bold: 'Review roles regularly', text: 'Check user roles from time to time to make sure they still match current responsibilities.' },
        { bold: 'Use Auditor for external access', text: 'For external auditors or stakeholders who need to review your governance, use the Auditor role.' },
        { bold: 'Document role decisions', text: 'Keep a record of why users were assigned specific roles for audit purposes.' },
      ],
    },
    {
      type: 'heading',
      id: 'faq',
      level: 2,
      text: 'Frequently asked questions',
    },
    {
      type: 'heading',
      id: 'faq-custom-roles',
      level: 3,
      text: 'Can I create custom roles with specific permissions?',
    },
    {
      type: 'paragraph',
      text: 'Not right now. VerifyWise has four predefined roles (Admin, Reviewer, Editor, Auditor). Custom role configuration isn\'t available in this version.',
    },
    {
      type: 'heading',
      id: 'faq-change-own-role',
      level: 3,
      text: 'Can I change my own role?',
    },
    {
      type: 'paragraph',
      text: 'No. Another administrator has to update your role. This prevents accidental loss of admin access.',
    },
    {
      type: 'heading',
      id: 'faq-multiple-admins',
      level: 3,
      text: 'How many administrators should we have?',
    },
    {
      type: 'paragraph',
      text: 'At least two is a good idea, so there\'s always a backup if one admin is unavailable. But keep the total number low and limited to people who truly need full access.',
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
          collectionId: 'integrations',
          articleId: 'api-access',
          title: 'API access',
          description: 'Manage API keys for integrations',
        },
      ],
    },
  ],
};
