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
      text: 'The super admin panel is a separate interface for managing the entire VerifyWise installation. It\'s only visible to super admin users and is accessed at /super-admin/settings after login.',
    },
    {
      type: 'callout',
      variant: 'warning',
      title: 'Super admin only',
      text: 'This section only applies to super admins. Regular users (Admin, Reviewer, Editor, Auditor) don\'t have access to this panel.',
    },
    {
      type: 'heading',
      id: 'setup',
      level: 2,
      text: 'Setting up the super admin',
    },
    {
      type: 'paragraph',
      text: 'There is no sign-up for the super admin. The account is created once, when the installation is first set up, from two environment variables: SUPERADMIN_EMAIL and SUPERADMIN_PASSWORD. The password must be at least 8 characters. On first run these seed the single super admin account, and you log in with those credentials.',
    },
    {
      type: 'callout',
      variant: 'info',
      title: 'There is only one super admin',
      text: 'An installation has exactly one super admin account, enforced at the database level. You cannot create a second one, and the super admin role cannot be assigned through the invite flow.',
    },
    {
      type: 'heading',
      id: 'organizations',
      level: 2,
      text: 'Managing organizations',
    },
    {
      type: 'paragraph',
      text: 'The Organizations page lists all organizations in the system. For each one, you can see the name, number of users and creation date. Click "View users" to see everyone in that organization.',
    },
    {
      type: 'callout',
      variant: 'info',
      title: 'Read-only inside an organization',
      text: 'When the super admin views an organization\'s data, access is read-only. You can see everything but cannot change an organization\'s records from inside it. Managing organizations and users is done from the super admin panel itself, where these actions are allowed.',
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
        { bold: 'Invite', text: 'Click "Invite user" to add someone to a specific organization with a role.' },
        { bold: 'Edit', text: 'Click any user row to change their name, email, role or organization.' },
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
        { text: 'Enter the user\'s name, surname and email.' },
        { text: 'Select the organization they belong to.' },
        { text: 'Choose a role: Admin, Reviewer, Editor or Auditor. The super admin role cannot be assigned here.' },
        { text: 'Click **Invite**. The user receives an invitation to set their own password.' },
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
      text: 'The Settings page at /super-admin/settings lets the super admin update their own profile and password. It uses the same layout as the regular settings page but is scoped to the super admin account.',
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
        { role: 'Super admin', scope: 'Full access to all organizations, users and system settings' },
        { role: 'Admin', scope: 'Full access within their own organization' },
        { role: 'Reviewer', scope: 'Read access plus approve/reject actions within their organization' },
        { role: 'Editor', scope: 'Read and write access within their organization' },
        { role: 'Auditor', scope: 'Read-only access for audit purposes' },
      ],
    },
  ],
};
