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
      text: 'The Repositories page lets you save GitHub repositories and set up automated scans. Instead of typing a URL each time, save the repo and have it scanned on a daily, weekly, or monthly schedule, or on every push and pull request through CI/CD integration.',
    },
    {
      type: 'heading',
      id: 'adding-repository',
      level: 2,
      text: 'Adding a repository',
    },
    {
      type: 'paragraph',
      text: 'Click **Add repository** to open the form. Enter the GitHub URL in full format (`https://github.com/owner/repo`) or as an SSH address (`git@github.com:owner/repo.git`). You can optionally set a display name and pick a branch if it\'s not `main`.',
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
      text: 'Schedules are set in UTC. Under the hour and minute pickers, the form shows the same time in your own time zone, for example "02:00 UTC = 21:00 your time".',
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
      id: 'ci-cd-integration',
      level: 2,
      text: 'CI/CD integration',
    },
    {
      type: 'paragraph',
      text: 'Turn on **CI/CD integration** to scan the repository from GitHub. A push to the default branch starts a full scan. Opening, reopening or updating a pull request starts a scan of the files the pull request changes. Other branches and other pull request actions are ignored.',
    },
    {
      type: 'heading',
      id: 'ci-cd-setup',
      level: 3,
      text: 'Setting up the webhook',
    },
    {
      type: 'paragraph',
      text: 'When you save a repository with CI/CD integration on, VerifyWise creates a webhook secret and shows a **Connect GitHub** step with the webhook URL, the secret and copy buttons for both. Copy the secret now: it is shown only this once. If the browser cannot copy (for example on a deployment served over plain http), VerifyWise says so and shows the value so you can select and copy it yourself. Then, in GitHub:',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'In your GitHub repository, open **Settings → Webhooks → Add webhook**.' },
        { text: 'Paste the webhook URL as the **Payload URL**, set **Content type** to `application/json` and paste the secret into **Secret**.' },
        { text: 'Choose **Let me select individual events**, tick **Pull requests** and **Pushes**, then click **Add webhook**.' },
      ],
    },
    {
      type: 'paragraph',
      text: 'GitHub sends a test delivery when you add the webhook. To check that it arrived, open the repository with the pencil icon: in the CI/CD section, **Last delivery** shows when GitHub last reached VerifyWise and whether the scan started. Only deliveries signed with the right secret are shown. If GitHub reports deliveries but **Last delivery** does not change, regenerate the secret and paste the new one into GitHub.',
    },
    {
      type: 'callout',
      variant: 'warning',
      title: 'GitHub must be able to reach VerifyWise',
      text: 'The webhook URL is built from the public address of the deployment\'s API: the `API_PUBLIC_URL` setting when it is set, otherwise the address the app uses for its API, otherwise `FRONTEND_URL`. If that address is missing, local or on a private network, the form shows a warning: GitHub cannot deliver to it until the API has a public address. Set `API_PUBLIC_URL` when the API runs on a different host from the app.',
    },
    {
      type: 'paragraph',
      text: 'VerifyWise does not show the secret again later, and it is never visible to people who can only view repositories. When you edit the repository, the CI/CD section says a secret is set. **Regenerate secret** replaces it and shows the new secret once; paste it into the webhook in GitHub too, or deliveries are rejected.',
    },
    {
      type: 'heading',
      id: 'ci-cd-results',
      level: 3,
      text: 'What GitHub shows',
    },
    {
      type: 'paragraph',
      text: 'When a webhook-triggered scan finishes, VerifyWise posts the result to GitHub using the GitHub token from AI Detection settings. Without a token, scans run but VerifyWise posts nothing to GitHub.',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Status check', text: 'A commit status named "VerifyWise AI Detection" on the scanned commit: success when the scan passes the thresholds and failure when it does not. Results are posted for completed scans only. Turn off **Post status checks** to skip it.' },
        { bold: 'Pull request comment', text: 'For pull request scans, a comment that says whether the scan passed, with the score, grade, number of findings, files scanned, scan mode, duration and a count of findings by type. Turn off **Post PR comments** to skip it.' },
      ],
    },
    {
      type: 'heading',
      id: 'ci-cd-thresholds',
      level: 3,
      text: 'Thresholds',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Minimum governance score', text: 'A whole number from 0 to 100, 70 by default. The check fails when the scan\'s governance score is below this.' },
        { bold: 'Max critical findings', text: 'A whole number of 0 or more, 0 by default. The check fails when the scan has more critical findings than this.' },
      ],
    },
    {
      type: 'callout',
      variant: 'tip',
      text: 'A failed check does not block merging on its own. To block it, add "VerifyWise AI Detection" as a required status check in the branch protection rules of your GitHub repository.',
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
        { bold: 'Next scan', text: 'When the next scheduled scan will run, or an em dash (—) if scheduling is disabled' },
        { bold: 'Actions', text: 'Scan now, edit and delete buttons' },
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
      text: 'Click the pencil icon to edit a repository. You can change the display name, default branch, schedule and CI/CD settings. The URL can\'t be changed after creation; delete and re-add if you need a different URL.',
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
