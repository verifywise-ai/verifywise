import type { ArticleContent } from '../../contentTypes';

export const repositoriesContent: ArticleContent = {
  blocks: [
    {
      type: 'heading',
      id: 'overview',
      level: 2,
      text: 'Overview',
    },
    {
      type: 'paragraph',
      text: 'The Repositories page lets you save GitHub repositories and set up automated scans. Instead of typing a URL each time, save the repo and have it scanned on a daily, weekly, or monthly schedule.',
    },
    {
      type: 'heading',
      id: 'adding-repository',
      level: 2,
      text: 'Adding a repository',
    },
    {
      type: 'paragraph',
      text: 'Click **Add repository** to open the form. Enter the GitHub URL in full format (`https://github.com/owner/repo`) or shorthand (`owner/repo`). You can optionally set a display name and pick a branch if it\'s not `main`.',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Repository URL', text: 'Required. The GitHub URL of the repository to monitor.' },
        { bold: 'Display name', text: 'Optional. A friendly name shown in the table instead of the full URL.' },
        { bold: 'Default branch', text: 'The branch to scan. Defaults to `main`.' },
      ],
    },
    {
      type: 'heading',
      id: 'scheduled-scans',
      level: 2,
      text: 'Scheduled scans',
    },
    {
      type: 'paragraph',
      text: 'Turn on the **Scheduled scans** toggle to scan the repository automatically. Pick a frequency and time:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Daily', text: 'Runs every day at the specified hour (UTC)' },
        { bold: 'Weekly', text: 'Runs once per week on the chosen day and hour (UTC)' },
        { bold: 'Monthly', text: 'Runs once per month on the chosen day and hour (UTC)' },
      ],
    },
    {
      type: 'paragraph',
      text: 'Scheduled scans run in the background. Results show up in the scan results page automatically. The **Next scan** column shows when the next one will run.',
    },
    {
      type: 'callout',
      variant: 'tip',
      title: 'Scheduling recommendation',
      text: 'Schedule scans during off-peak hours to stay within GitHub API rate limits. Daily at 2:00 AM UTC works well for active repos.',
    },
    {
      type: 'heading',
      id: 'repository-table',
      level: 2,
      text: 'Repository table',
    },
    {
      type: 'paragraph',
      text: 'The repositories table shows all registered repositories with the following columns:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Repository', text: 'Owner and name of the repository, or the display name if set' },
        { bold: 'Schedule', text: 'Frequency and time, or "Disabled" if scheduling is off' },
        { bold: 'Last scan', text: 'When the most recent scan ran and its status' },
        { bold: 'Next scan', text: 'When the next scheduled scan will run (blank if disabled)' },
        { bold: 'Actions', text: 'Scan now, edit, and delete buttons' },
      ],
    },
    {
      type: 'heading',
      id: 'manual-scans',
      level: 2,
      text: 'Running a manual scan',
    },
    {
      type: 'paragraph',
      text: 'Click the play button in the actions column to start a scan right away. It shows a loading indicator while running. You can also start scans from the Scan page with the repo URL.',
    },
    {
      type: 'callout',
      variant: 'info',
      text: 'Only one scan can run per repository at a time. If a scan is already in progress, the play button is replaced with a loading indicator until the scan completes.',
    },
    {
      type: 'heading',
      id: 'editing-repository',
      level: 2,
      text: 'Editing a repository',
    },
    {
      type: 'paragraph',
      text: 'Click the pencil icon to edit a repository. You can change the display name, default branch, and schedule. The URL can\'t be changed after creation; delete and re-add if you need a different URL.',
    },
    {
      type: 'heading',
      id: 'deleting-repository',
      level: 2,
      text: 'Deleting a repository',
    },
    {
      type: 'paragraph',
      text: 'Click the trash icon to delete a repository. This removes it from the table and stops scheduled scans. Past scan results are kept in the scan results page.',
    },
    {
      type: 'callout',
      variant: 'warning',
      text: 'Deleting a repository cannot be undone. Scheduled scans will stop immediately. Past scan results are not affected.',
    },
    {
      type: 'article-links',
      title: 'Related articles',
      items: [
        {
          collectionId: 'ai-detection',
          articleId: 'scanning',
          title: 'Scanning repositories',
          description: 'How to scan repositories for AI/ML usage',
        },
        {
          collectionId: 'ai-detection',
          articleId: 'settings',
          title: 'AI Detection settings',
          description: 'Configure GitHub tokens for private repository access',
        },
      ],
    },
  ],
};
