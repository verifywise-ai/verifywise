import type { ArticleContent } from '../../contentTypes';

export const superAdminContent: ArticleContent = {
  blocks: [
    {
      type: 'heading',
      id: 'overview',
      level: 2,
      text: 'Overview',
    },
    {
      type: 'paragraph',
      text: 'The super admin panel is a separate interface for managing the entire VerifyWise installation. It\'s only visible to users with the super admin role and is accessed at /super-admin after login.',
    },
    {
      type: 'callout',
      variant: 'warning',
      title: 'Super admin only',
      text: 'This section only applies to super admins. Regular users (Admin, Editor, Reviewer, Auditor) do not have access to this panel.',
    },
    {
      type: 'heading',
      id: 'organizations',
      level: 2,
      text: 'Managing organizations',
    },
    {
      type: 'paragraph',
      text: 'The Organizations page lists all organizations in the system. For each organization, you can see the name, number of users, and creation date. Click "View users" to see all users in that organization.',
    },
    {
      type: 'heading',
      id: 'users',
      level: 2,
      text: 'Managing users',
    },
    {
      type: 'paragraph',
      text: 'The All users page shows every user across all organizations. You can:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Search', text: 'Find users by name or email.' },
        { bold: 'Invite', text: 'Click "Invite user" to add a new user to a specific organization with a role.' },
        { bold: 'Edit', text: 'Click any user row to change their name, email, role, or organization.' },
        { bold: 'Remove', text: 'Remove a user from the system.' },
      ],
    },
    {
      type: 'heading',
      id: 'invite',
      level: 3,
      text: 'Inviting a user',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Click **Invite user** on the Users page.' },
        { text: 'Enter the user\'s name, surname, and email.' },
        { text: 'Select the organization they belong to.' },
        { text: 'Choose a role: Admin, Reviewer, Editor, or Auditor.' },
        { text: 'Set a temporary password.' },
        { text: 'Click **Invite**.' },
      ],
    },
    {
      type: 'heading',
      id: 'settings',
      level: 2,
      text: 'Super admin settings',
    },
    {
      type: 'paragraph',
      text: 'The Settings page lets the super admin update their own profile and password. It uses the same layout as the regular settings page but is scoped to the super admin account.',
    },
    {
      type: 'heading',
      id: 'roles',
      level: 2,
      text: 'Role reference',
    },
    {
      type: 'table',
      columns: [
        { key: 'role', label: 'Role', width: '25%' },
        { key: 'scope', label: 'Scope', width: '75%' },
      ],
      rows: [
        { role: 'Super admin', scope: 'Full access to all organizations, users, and system settings' },
        { role: 'Admin', scope: 'Full access within their own organization' },
        { role: 'Editor', scope: 'Read and write access within their organization' },
        { role: 'Reviewer', scope: 'Read access plus approve/reject actions' },
        { role: 'Auditor', scope: 'Read-only access for audit purposes' },
      ],
    },
  ],
};
