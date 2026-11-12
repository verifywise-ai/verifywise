import type { ArticleContent } from '../../contentTypes';

export const userGroupsContent: ArticleContent = {
  blocks: [
    {
      type: 'heading',
      id: 'overview',
      level: 2,
      text: 'Overview',
    },
    {
      type: 'paragraph',
      text: 'A group is a named set of people in your organization, such as a model risk team. Attach a group to a use case and every member gets access to it, so you don\'t have to add people one by one.',
    },
    {
      type: 'paragraph',
      text: 'Open **Settings** and select the **Groups** tab. The tab lists each group with its name, description and number of members.',
    },
    {
      type: 'heading',
      id: 'who-can-manage',
      level: 2,
      text: 'Who can manage groups',
    },
    {
      type: 'paragraph',
      text: 'Every signed-in user can open the Groups tab and see the list. Only Admins can create, edit or delete groups and change their members. A custom role can do this too if its "Create, update and delete groups and manage their membership" permission is set to Allow.',
    },
    {
      type: 'heading',
      id: 'create-group',
      level: 2,
      text: 'Create a group',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Go to **Settings** → **Groups**' },
        { text: 'Click **New group**' },
        { text: 'Enter a name. A description is optional' },
        { text: 'Pick members from the members field. You can leave it empty and add people later' },
        { text: 'Click **Create**' },
      ],
    },
    {
      type: 'callout',
      variant: 'info',
      text: 'If the group is created but its members fail to save, the form remains open and says so. Click **Save** to try the members again. The group isn\'t created twice.',
    },
    {
      type: 'heading',
      id: 'edit-group',
      level: 2,
      text: 'Edit a group or its members',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'On the Groups tab, click the pencil icon in the group\'s row' },
        { text: 'Change the name, the description or the members' },
        { text: 'Click **Save**' },
      ],
    },
    {
      type: 'paragraph',
      text: 'Membership changes apply straight away to every use case the group is attached to.',
    },
    {
      type: 'heading',
      id: 'attach-to-use-case',
      level: 2,
      text: 'Give a group access to a use case',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Open the use case and go to its **Settings** tab' },
        { text: 'Find the **Groups** field, just below **Team members**' },
        { text: 'Select one or more groups. To remove one, clear it from the field' },
      ],
    },
    {
      type: 'paragraph',
      text: 'Changes to this field save as soon as you make them, without the Save button. If a change fails, an error message appears and the field keeps the groups that were saved before.',
    },
    {
      type: 'paragraph',
      text: 'You need permission to edit use cases, which Admins and Editors have by default. You must also be able to see the use case. For other users the field is read-only.',
    },
    {
      type: 'heading',
      id: 'what-access-means',
      level: 2,
      text: 'What group access gives',
    },
    {
      type: 'paragraph',
      text: 'A group member gets the same access to a use case as someone added to its team members: the use case shows up in their list and they can open it. Their role decides what they can change. An Auditor in a group can view the use case but can\'t edit it.',
    },
    {
      type: 'paragraph',
      text: 'Admins already see every use case, so a group doesn\'t change anything for them.',
    },
    {
      type: 'heading',
      id: 'delete-group',
      level: 2,
      text: 'Delete a group',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'On the Groups tab, click the trash icon in the group\'s row' },
        { text: 'Click **Delete** to confirm' },
      ],
    },
    {
      type: 'paragraph',
      text: 'Deleting a group removes its membership list and detaches it from every use case. Members lose the access they had through the group, but they keep any use case they own or are a team member of.',
    },
    {
      type: 'heading',
      id: 'rules',
      level: 2,
      text: 'Rules and limits',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Name', text: '2 to 255 characters, and unique in your organization.' },
        { bold: 'Description', text: 'Optional, up to 2,000 characters.' },
        { bold: 'Members', text: 'Up to 500 per group. Members must belong to your organization.' },
        { bold: 'Use cases', text: 'Up to 50 groups per use case.' },
        { bold: 'Leaving the organization', text: 'When someone is removed from the organization, they\'re also removed from all its groups.' },
      ],
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
          title: 'Roles and permissions',
          description: 'Built-in roles, custom roles and permissions',
        },
      ],
    },
  ],
};
