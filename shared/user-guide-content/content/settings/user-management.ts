import type { ArticleContent } from '../../contentTypes';

export const userManagementContent: ArticleContent = {
  blocks: [
    {
      type: 'heading',
      id: 'overview',
      level: 2,
      text: 'Overview',
    },
    {
      type: 'paragraph',
      text: 'User management lets administrators control who has access to the platform and what they can do. From the Settings page, you can manage your own profile, update security credentials and administer team members.',
    },
    {
      type: 'heading',
      id: 'settings-tabs',
      level: 2,
      text: 'Settings tabs',
    },
    {
      type: 'paragraph',
      text: 'The Settings page has several tabs for different configuration areas:',
    },
    {
      type: 'icon-cards',
      items: [
        {
          icon: 'User',
          title: 'Profile',
          description: 'Update your personal information and profile photo.',
        },
        {
          icon: 'Lock',
          title: 'Password',
          description: 'Change your account password.',
        },
        {
          icon: 'Users',
          title: 'Team',
          description: 'Manage team members, roles and invitations.',
        },
        {
          icon: 'Building2',
          title: 'Organization',
          description: 'Configure organization name and branding.',
        },
        {
          icon: 'Settings',
          title: 'Preferences',
          description: 'Set personal preferences like date format.',
        },
        {
          icon: 'Key',
          title: 'API keys',
          description: 'Manage API tokens for programmatic access.',
        },
      ],
    },
    {
      type: 'heading',
      id: 'profile-settings',
      level: 2,
      text: 'Profile settings',
    },
    {
      type: 'paragraph',
      text: 'The Profile tab is where you manage your personal account information.',
    },
    {
      type: 'heading',
      id: 'personal-info',
      level: 3,
      text: 'Personal information',
    },
    {
      type: 'paragraph',
      text: 'You can update the following:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Name', text: 'Your first name (2-50 characters)' },
        { bold: 'Surname', text: 'Your last name (2-50 characters)' },
        { bold: 'Email', text: 'Your email address (read-only, can\'t be changed)' },
      ],
    },
    {
      type: 'paragraph',
      text: 'Click Save after making changes to update your profile.',
    },
    {
      type: 'heading',
      id: 'profile-photo',
      level: 3,
      text: 'Profile photo',
    },
    {
      type: 'paragraph',
      text: 'You can upload a profile photo that appears next to your name throughout the platform:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Update', text: 'Click Update to select a new photo from your computer' },
        { bold: 'Delete', text: 'Click Delete to remove your current photo' },
        { bold: 'Requirements', text: 'Recommended 200x200 pixels, max 5MB, PNG/JPG/GIF/SVG formats' },
      ],
    },
    {
      type: 'heading',
      id: 'delete-account',
      level: 3,
      text: 'Deleting your account',
    },
    {
      type: 'paragraph',
      text: 'You can permanently delete your account from the Profile tab. This removes all your data from the system and can\'t be undone.',
    },
    {
      type: 'callout',
      variant: 'warning',
      text: 'Admins can\'t delete their own account while they\'re the only admin. Make sure another admin exists before trying to delete an admin account.',
    },
    {
      type: 'heading',
      id: 'password',
      level: 2,
      text: 'Changing your password',
    },
    {
      type: 'paragraph',
      text: 'The Password tab lets you update your account password.',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Go to Settings and select the Password tab' },
        { text: 'Enter your current password' },
        { text: 'Enter your new password' },
        { text: 'Confirm your new password' },
        { text: 'Click Save to apply the change' },
      ],
    },
    {
      type: 'callout',
      variant: 'tip',
      title: 'Password best practices',
      text: 'Use a strong password with a mix of uppercase, lowercase, numbers and special characters. Change your password from time to time.',
    },
    {
      type: 'heading',
      id: 'team-management',
      level: 2,
      text: 'Team management',
    },
    {
      type: 'paragraph',
      text: 'The Team tab lets admins manage users in your organization.',
    },
    {
      type: 'heading',
      id: 'viewing-team',
      level: 3,
      text: 'Viewing team members',
    },
    {
      type: 'paragraph',
      text: 'The team table lists all users with the following information:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Name', text: 'The user\'s full name' },
        { bold: 'Email', text: 'The user\'s email address' },
        { bold: 'Role', text: 'The user\'s assigned role (Admin, Reviewer, Editor, Auditor; Super Admin where applicable)' },
        { bold: 'Action', text: 'Delete button to remove the user' },
      ],
    },
    {
      type: 'image',
      src: '/images/user-guide/team-members.png',
      alt: 'Team members table showing users with their names, email addresses, roles, and action buttons, with filter tabs for All, Admin, Reviewer, Editor, and Auditor',
      caption: 'The Team tab shows all team members with role filters and an option to invite new members.',
    },
    {
      type: 'paragraph',
      text: 'Use the filter buttons at the top to show all users or filter by role. Click column headers to sort the table.',
    },
    {
      type: 'heading',
      id: 'inviting-users',
      level: 3,
      text: 'Inviting new team members',
    },
    {
      type: 'paragraph',
      text: 'To invite a new user to your organization:',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Click "Invite team member"' },
        { text: 'Enter the user\'s email address' },
        { text: 'Select the role to assign (Admin, Reviewer, Editor or Auditor)' },
        { text: 'Click Send invitation' },
      ],
    },
    {
      type: 'image',
      src: '/images/user-guide/invite-member.png',
      alt: 'Invite new team member modal with fields for Name, Surname, Email, and Role selection dropdown',
      caption: 'Invite new team members by entering their details and selecting a role.',
    },
    {
      type: 'paragraph',
      text: 'The user gets an email with a link to create their account and join your organization.',
    },
    {
      type: 'heading',
      id: 'changing-roles',
      level: 3,
      text: 'Changing user roles',
    },
    {
      type: 'paragraph',
      text: 'To change a user\'s role:',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Find the user in the team table' },
        { text: 'Click on the role dropdown in their row' },
        { text: 'Select the new role' },
        { text: 'The change saves automatically' },
      ],
    },
    {
      type: 'callout',
      variant: 'info',
      text: 'You can\'t change your own role. Another admin has to update it for you.',
    },
    {
      type: 'heading',
      id: 'removing-users',
      level: 3,
      text: 'Removing team members',
    },
    {
      type: 'paragraph',
      text: 'To remove a user from your organization:',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Find the user in the team table' },
        { text: 'Click the delete icon in the Action column' },
        { text: 'Confirm the deletion when prompted' },
      ],
    },
    {
      type: 'paragraph',
      text: 'Removed users lose access to the platform right away. You can\'t delete your own account from the Team tab.',
    },
    {
      type: 'heading',
      id: 'preferences',
      level: 2,
      text: 'Preferences',
    },
    {
      type: 'paragraph',
      text: 'The Preferences tab lets you customize how information is displayed for your account.',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Date format', text: 'Choose how dates appear throughout the platform (e.g., DD-MM-YYYY, MM-DD-YYYY, YYYY-MM-DD)' },
      ],
    },
    {
      type: 'paragraph',
      text: 'Click Save after changing your preferences. Settings are stored and applied whenever you log in.',
    },
    {
      type: 'heading',
      id: 'faq',
      level: 2,
      text: 'Frequently asked questions',
    },
    {
      type: 'heading',
      id: 'faq-email',
      level: 3,
      text: 'Why can\'t I change my email address?',
    },
    {
      type: 'paragraph',
      text: 'Email addresses are used as unique identifiers and can\'t be changed after registration. If you need a different email, you\'ll have to create a new account.',
    },
    {
      type: 'heading',
      id: 'faq-invite-not-received',
      level: 3,
      text: 'A team member didn\'t receive their invitation email. What should I do?',
    },
    {
      type: 'paragraph',
      text: 'Ask them to check their spam or junk folder. If it\'s not there, send a new invitation. Some organizations have email filtering that may block invitation emails.',
    },
    {
      type: 'heading',
      id: 'faq-who-can-invite',
      level: 3,
      text: 'Who can invite new team members?',
    },
    {
      type: 'paragraph',
      text: 'Users with Admin or Editor roles can invite new team members. Reviewers and Auditors can\'t send invitations.',
    },
    {
      type: 'article-links',
      title: 'Related articles',
      items: [
        {
          collectionId: 'settings',
          articleId: 'role-configuration',
          title: 'Role configuration',
          description: 'Understand roles and permissions',
        },
        {
          collectionId: 'settings',
          articleId: 'organization-settings',
          title: 'Organization settings',
          description: 'Configure organization details',
        },
      ],
    },
  ],
};
