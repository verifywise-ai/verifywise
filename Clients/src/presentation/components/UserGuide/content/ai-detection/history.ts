import type { ArticleContent } from '@user-guide-content/contentTypes';

export const historyContent: ArticleContent = {
  blocks: [
    {
      type: 'heading',
      id: 'overview',
      level: 2,
      text: 'Overview',
    },
    {
      type: 'paragraph',
      text: 'The scan results page keeps a full record of every repository scan your organization has run. Scan records are kept indefinitely for audit purposes.',
    },
    {
      type: 'heading',
      id: 'history-table',
      level: 2,
      text: 'Results table',
    },
    {
      type: 'paragraph',
      text: 'The results table displays all scans with the following information:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Repository', text: 'Owner and name of the scanned repository' },
        { bold: 'Status', text: 'Current state — Completed, Failed, Cancelled, or Scanning' },
        { bold: 'Risk score', text: 'AGRS letter grade (A through F) and numeric score, if calculated' },
        { bold: 'Findings', text: 'Total detections: libraries, API calls, secrets, security issues' },
        { bold: 'Files scanned', text: 'Total source files analyzed' },
        { bold: 'Duration', text: 'Time taken to complete the scan' },
        { bold: 'Triggered by', text: 'User who initiated the scan, or "Scheduled" for automated scans' },
      ],
    },
    {
      type: 'paragraph',
      text: 'Click any completed scan row to see its full results: risk score, library findings, API calls, secrets, and security issues.',
    },
    {
      type: 'image',
      src: '/images/user-guide/ai-detection-history.png',
      alt: 'Scan results table showing past repository scans with status and findings',
      caption: 'Complete scan results with repository, status, risk score, findings, and duration',
    },
    {
      type: 'heading',
      id: 'scan-status',
      level: 2,
      text: 'Scan status',
    },
    {
      type: 'paragraph',
      text: 'Each scan has one of the following statuses:',
    },
    {
      type: 'icon-cards',
      items: [
        {
          icon: 'CheckCircle',
          title: 'Completed',
          description: 'Scan finished successfully. Results are available for review.',
        },
        {
          icon: 'Clock',
          title: 'Scanning',
          description: 'Scan is currently in progress.',
        },
        {
          icon: 'AlertTriangle',
          title: 'Failed',
          description: 'Scan encountered an error. Check error message for details.',
        },
      ],
    },
    {
      type: 'heading',
      id: 'risk-score-column',
      level: 2,
      text: 'Risk score column',
    },
    {
      type: 'paragraph',
      text: 'Each completed scan shows a letter grade badge (A through F) with the numeric score. Scans without a calculated score show a dash. To generate one, open the scan details and click **Calculate risk score**.',
    },
    {
      type: 'heading',
      id: 'sorting-filtering',
      level: 2,
      text: 'Sorting, filtering, and search',
    },
    {
      type: 'paragraph',
      text: 'Click column headers to sort. Use the filter button to narrow by status, repository, or who triggered the scan. The search box filters by repository name in real time. The table paginates if you have a lot of scans.',
    },
    {
      type: 'heading',
      id: 'managing-history',
      level: 2,
      text: 'Managing scan results',
    },
    {
      type: 'paragraph',
      text: 'Delete a scan record by clicking the trash icon. This is permanent and removes all its findings. Export or document anything you need before deleting.',
    },
    {
      type: 'callout',
      variant: 'tip',
      title: 'Audit trail',
      text: 'Keep scan results around as evidence of ongoing AI governance. Regular scanning shows due diligence in monitoring AI usage.',
    },
    {
      type: 'heading',
      id: 'rescanning',
      level: 2,
      text: 'Rescanning repositories',
    },
    {
      type: 'paragraph',
      text: 'To rescan a repo, go to the scan results page and click **Rescan**. This creates a new scan record and keeps the original for comparison. You can also start a new scan from the Scan page or set up a scheduled scan in Repositories.',
    },
    {
      type: 'callout',
      variant: 'info',
      text: 'Rescanning regularly catches newly added AI dependencies. Set up scheduled scans in the Repositories page for your most important repos.',
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
          articleId: 'risk-scoring',
          title: 'Risk scoring',
          description: 'Understanding the AI Governance Risk Score',
        },
        {
          collectionId: 'ai-detection',
          articleId: 'repositories',
          title: 'Repositories',
          description: 'Register and schedule repository scans',
        },
        {
          collectionId: 'reporting',
          articleId: 'generating-reports',
          title: 'Generating reports',
          description: 'Include AI Detection findings in compliance reports',
        },
      ],
    },
  ],
};
