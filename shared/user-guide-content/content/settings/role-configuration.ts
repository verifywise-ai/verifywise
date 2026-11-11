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
      text: 'VerifyWise uses role-based access control (RBAC) to manage what users can see and do. Each user gets a role that sets their permissions across all features. You can use one of the four built-in roles or create custom roles for your organization.',
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
      text: 'VerifyWise has four built-in roles. Their permissions are fixed. They can\'t be renamed or deleted. If none of them fits, create a custom role (see "Custom roles" below).',
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
          description: 'Read access, plus approving items assigned to them and uploading evidence. Can\'t create or edit content.',
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
      text: 'Reviewers can view content, approve or reject items assigned to them and upload evidence files, but they can\'t create or edit content. This role works well for people who need to sign off on governance activities without authoring them.',
    },
    {
      type: 'paragraph',
      text: 'Reviewer capabilities:',
    },
    {
      type: 'checklist',
      items: [
        'View use cases, assessments and compliance status',
        'Approve or reject items in approval workflows where they are an assigned approver',
        'Approve or request changes on policies they are assigned to review',
        'View models, vendors, risks, policies and training records',
        'Upload and manage evidence files',
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
        { text: 'Create, edit or delete use cases, models, vendors, risks, policies, tasks or training records' },
        { text: 'Invite users or manage team members' },
        { text: 'Edit organization settings' },
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
        'Create, edit and delete models, vendors, risks and policies',
        'Create tasks',
        'Create and edit training records',
        'Upload and manage evidence files',
        'View organization settings',
        'Run report templates and scheduled reports',
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
        { text: 'Invite users or manage team members' },
        { text: 'Edit organization settings' },
        { text: 'Delete training records' },
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
        'View models, vendors, risks, policies and training records',
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
        { text: 'Create, edit or delete any content, including evidence files' },
        { text: 'Invite users or manage team members' },
        { text: 'Edit organization settings' },
        { text: 'Generate reports' },
        { text: 'Access integrations or API keys' },
      ],
    },
    {
      type: 'heading',
      id: 'custom-roles',
      level: 2,
      text: 'Custom roles',
    },
    {
      type: 'paragraph',
      text: 'A custom role belongs to your organization. You name it and decide, permission by permission, what it may do. Manage custom roles in the **Roles** tab under Settings. Only Admins see this tab by default; a custom role can get it too if you allow its "Create, update and delete custom organization roles" permission.',
    },
    {
      type: 'heading',
      id: 'create-custom-role',
      level: 3,
      text: 'Create a custom role',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Go to Settings > Roles' },
        { text: 'Click **New role**' },
        { text: 'Enter a name and a description. Both are required, up to 255 characters each' },
        { text: 'Click **Create role**. The new role is selected and its permission list opens' },
      ],
    },
    {
      type: 'paragraph',
      text: 'A name can\'t match a built-in role (Admin, Reviewer, Editor, Auditor) or another role in your organization. The form checks this before saving, ignoring case.',
    },
    {
      type: 'heading',
      id: 'set-permissions',
      level: 3,
      text: 'Choose what the role can do',
    },
    {
      type: 'paragraph',
      text: 'Permissions are grouped by area, such as Use cases, Risks or Groups. Each row shows the permission and a short description of what it covers. A new role starts with every permission set to Deny.',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'In Settings > Roles, select the role from the row of role buttons' },
        { text: 'Set each permission to **Allow** or **Deny**' },
        { text: 'Click **Save permissions**. The button is disabled until you change something' },
      ],
    },
    {
      type: 'heading',
      id: 'edit-custom-role',
      level: 3,
      text: 'Rename or edit a custom role',
    },
    {
      type: 'paragraph',
      text: 'Select the role and click **Edit** to change its name or description, then click **Save changes**. If you rename it, everyone with that role has to sign in again.',
    },
    {
      type: 'heading',
      id: 'delete-custom-role',
      level: 3,
      text: 'Delete a custom role',
    },
    {
      type: 'paragraph',
      text: 'Select the role, click **Delete**, then confirm with **Delete role**. Its permission settings are removed along with it.',
    },
    {
      type: 'callout',
      variant: 'warning',
      text: 'You can only delete a role that no user has. If people have it, the delete is refused. Assign them another role in Settings > Team first, then try again.',
    },
    {
      type: 'heading',
      id: 'custom-role-limits',
      level: 3,
      text: 'What custom roles don\'t change',
    },
    {
      type: 'bullet-list',
      items: [
        { text: 'Built-in roles keep their permissions. You can\'t edit, rename or delete them' },
        { text: 'Only Admins see every use case. People with a custom role see the use cases they own, are a team member of or reach through a group' },
      ],
    },
    {
      type: 'callout',
      variant: 'warning',
      text: 'Many screens still decide which buttons to show from the built-in role name (Admin, Editor, Reviewer, Auditor). People with a custom role may therefore see some screens as read-only, even where their permissions allow the action. The permissions you set are always enforced on the server, so they never get more access than the role allows. Groups, policy templates, framework import and custom roles already follow the permissions you set.',
    },
    {
      type: 'heading',
      id: 'assigning-roles',
      level: 2,
      text: 'Assigning roles',
    },
    {
      type: 'paragraph',
      text: 'Built-in and custom roles are assigned the same way, in one of two places:',
    },
    {
      type: 'heading',
      id: 'during-invitation',
      level: 3,
      text: 'During invitation',
    },
    {
      type: 'paragraph',
      text: 'When inviting a new team member, select the appropriate role in the invitation modal. The list includes your custom roles. The user will have this role when they create their account.',
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
        { feature: 'Use case team members', admin: 'Full access', reviewer: 'None', editor: 'None', auditor: 'None' },
        { feature: 'Risks', admin: 'Full access', reviewer: 'View + approve', editor: 'Full access', auditor: 'View only' },
        { feature: 'Models and model risks', admin: 'Full access', reviewer: 'View + approve', editor: 'Full access', auditor: 'View only' },
        { feature: 'Vendors and vendor risks', admin: 'Full access', reviewer: 'View + approve', editor: 'Full access', auditor: 'View only' },
        { feature: 'Policies', admin: 'Full access', reviewer: 'View + review', editor: 'Full access', auditor: 'View only' },
        { feature: 'Tasks', admin: 'Full access', reviewer: 'View assigned', editor: 'Create + manage own', auditor: 'View assigned' },
        { feature: 'Training', admin: 'Full access', reviewer: 'View only', editor: 'Create + edit', auditor: 'View only' },
        { feature: 'Evidence files', admin: 'Full access', reviewer: 'Upload + manage', editor: 'Upload + manage', auditor: 'View only' },
        { feature: 'Reports', admin: 'Generate', reviewer: 'View only', editor: 'Run templates + schedules', auditor: 'View only' },
        { feature: 'Approval workflows', admin: 'Full access', reviewer: 'Approve when assigned', editor: 'Approve when assigned', auditor: 'Approve when assigned' },
        { feature: 'Groups', admin: 'Full access', reviewer: 'View only', editor: 'View only', auditor: 'View only' },
        { feature: 'Team management', admin: 'Full access', reviewer: 'None', editor: 'None', auditor: 'None' },
        { feature: 'Custom roles', admin: 'Full access', reviewer: 'None', editor: 'None', auditor: 'None' },
        { feature: 'Organization settings', admin: 'Full access', reviewer: 'View only', editor: 'View only', auditor: 'View only' },
        { feature: 'Audit ledger and data retention', admin: 'Full access', reviewer: 'None', editor: 'None', auditor: 'None' },
        { feature: 'Integrations', admin: 'Full access', reviewer: 'None', editor: 'None', auditor: 'None' },
        { feature: 'API keys', admin: 'Full access', reviewer: 'None', editor: 'None', auditor: 'None' },
      ],
    },
    {
      type: 'paragraph',
      text: 'Admins see every use case in the organization. Other roles, custom roles included, see the use cases they own, are a team member of or reach through a group attached to the use case. Likewise, Admins see every task, and other roles see the tasks they created or are assigned to.',
    },
    {
      type: 'paragraph',
      text: '"Approve" means approving or rejecting items where the user is an assigned approver in an approval workflow. Anyone assigned as an approver can act on that step, whatever their role. "Review" means approving or requesting changes on a policy the user is assigned to review.',
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
      text: 'Yes. Go to Settings > Roles, click **New role**, then set each permission to Allow or Deny. The four built-in roles are unchanged.',
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
          collectionId: 'settings',
          articleId: 'user-groups',
          title: 'Groups',
          description: 'Give a whole team access to a use case',
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
