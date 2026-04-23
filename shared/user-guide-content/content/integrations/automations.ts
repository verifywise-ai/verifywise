import type { ArticleContent } from '../../contentTypes';

export const automationsContent: ArticleContent = {
  blocks: [
    {
      type: 'heading',
      id: 'overview',
      level: 2,
      text: 'Overview',
    },
    {
      type: 'paragraph',
      text: 'Automations let you set up rules that run when certain conditions are met. Instead of doing repetitive governance tasks by hand, you define a trigger, set conditions and choose an action. VerifyWise handles the rest.',
    },
    {
      type: 'heading',
      id: 'how-they-work',
      level: 2,
      text: 'How automations work',
    },
    {
      type: 'paragraph',
      text: 'Each automation has 3 parts:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Trigger', text: 'What event starts the automation (e.g., a risk is created, a policy status changes, a model is registered).' },
        { bold: 'Conditions', text: 'Optional filters that narrow when the automation fires (e.g., only for high-severity risks, only in a specific project).' },
        { bold: 'Action', text: 'What happens when the trigger fires and conditions are met (e.g., send a notification, create a task, update a field).' },
      ],
    },
    {
      type: 'heading',
      id: 'creating',
      level: 2,
      text: 'Creating an automation',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Go to **Automations** from the sidebar.' },
        { text: 'Click **Create automation**.' },
        { text: 'Give it a name and description.' },
        { text: 'Select a trigger event from the dropdown.' },
        { text: 'Optionally add conditions to filter when the automation runs.' },
        { text: 'Choose the action and configure its parameters.' },
        { text: 'Toggle the automation **Active** and click **Save**.' },
      ],
    },
    {
      type: 'heading',
      id: 'managing',
      level: 2,
      text: 'Managing automations',
    },
    {
      type: 'paragraph',
      text: 'The automations list shows all your rules with their name, trigger, status (active or inactive) and last run time. You can toggle automations on and off without deleting them, edit their configuration or remove them entirely.',
    },
    {
      type: 'callout',
      variant: 'tip',
      title: 'Start simple',
      text: 'Begin with a single automation for your most common manual task. Once you see it working, add conditions and create more. Overcomplicating automations early makes them harder to debug.',
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
        { action: 'View automations', roles: 'Any authenticated user' },
        { action: 'Create, edit or delete automations', roles: 'Admin' },
        { action: 'Toggle automations on/off', roles: 'Admin' },
      ],
    },
  ],
};
