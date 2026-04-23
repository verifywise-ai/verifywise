import type { ArticleContent } from '../../contentTypes';

export const incidentManagementContent: ArticleContent = {
  blocks: [
    {
      type: 'heading',
      id: 'overview',
      level: 2,
      text: 'Overview',
    },
    {
      type: 'paragraph',
      text: 'AI incident management is the practice of detecting, documenting, responding to and learning from problems that occur with AI systems. Unlike traditional software bugs, AI incidents can be subtle. A model might produce biased outputs, make incorrect predictions or behave unexpectedly in edge cases without triggering obvious errors.',
    },
    {
      type: 'paragraph',
      text: 'Good incident management needs both reactive capabilities (handling problems when they occur) and proactive practices (learning from incidents to prevent recurrence). Teams that handle AI incidents well can respond quickly, minimize harm and keep improving their systems.',
    },
    {
      type: 'heading',
      id: 'why-incident-management',
      level: 2,
      text: 'Why manage AI incidents?',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Minimize harm', text: 'Quick response limits the impact of AI failures on users' },
        { bold: 'Regulatory compliance', text: 'Regulations require incident documentation and may mandate reporting serious incidents' },
        { bold: 'Continuous improvement', text: 'Incident analysis reveals weaknesses and drives fixes in AI systems' },
        { bold: 'Stakeholder trust', text: 'Transparent incident handling shows you take AI governance seriously' },
        { bold: 'Knowledge retention', text: 'Documented incidents preserve what your team learned for future reference' },
      ],
    },
    {
      type: 'callout',
      variant: 'warning',
      title: 'Regulatory requirement',
      text: 'Under the EU AI Act, providers and deployers of high-risk AI systems must report serious incidents to relevant authorities. Keep thorough incident records so you\'re ready when reporting is required.',
    },
    {
      type: 'image',
      src: '/images/user-guide/incident-list.png',
      alt: 'Incident management table showing columns for incident ID, AI use case, type, severity, status, occurred date, reporter, and approval status',
      caption: 'The incident list provides an overview of all reported AI incidents with filtering and sorting options.',
    },
    {
      type: 'heading',
      id: 'creating-incident',
      level: 2,
      text: 'Creating an incident',
    },
    {
      type: 'paragraph',
      text: 'Go to **Governance > Incident management** in the sidebar and click **New incident**. You\'ll need to provide:',
    },
    {
      type: 'ordered-list',
      items: [
        { bold: 'AI project', text: ',Select the project or system involved in the incident' },
        { bold: 'Model/system version', text: ',Specify which version of the model was affected' },
        { bold: 'Description', text: ',Provide a clear description of what occurred' },
        { bold: 'Reporter', text: ',Who is reporting the incident' },
        { bold: 'Date occurred', text: ',When the incident actually happened' },
        { bold: 'Date detected', text: ',When the incident was discovered (may differ from occurrence)' },
      ],
    },
    {
      type: 'image',
      src: '/images/user-guide/create-incident.png',
      alt: 'Create new incident modal showing fields for incident information, impact assessment, categories of harm, affected persons, description, and response actions',
      caption: 'The incident creation form captures details needed for investigation and regulatory reporting.',
    },
    {
      type: 'heading',
      id: 'incident-types',
      level: 2,
      text: 'Incident types',
    },
    {
      type: 'paragraph',
      text: 'VerifyWise categorizes incidents to help with analysis and reporting:',
    },
    {
      type: 'icon-cards',
      items: [
        {
          icon: 'AlertTriangle',
          title: 'Malfunction',
          description: 'The AI system failed to operate as designed or produced errors.',
        },
        {
          icon: 'Brain',
          title: 'Unexpected behavior',
          description: 'The system behaved in ways not anticipated during development or testing.',
        },
        {
          icon: 'Gauge',
          title: 'Model drift',
          description: 'Model performance degraded over time due to changes in input data patterns.',
        },
        {
          icon: 'AlertTriangle',
          title: 'Misuse',
          description: 'The AI system was used in ways outside its intended purpose.',
        },
        {
          icon: 'Database',
          title: 'Data corruption',
          description: 'Issues with training data, input data, or data pipelines affected the system.',
        },
        {
          icon: 'Shield',
          title: 'Security breach',
          description: 'Unauthorized access, adversarial attacks, or security vulnerabilities were exploited.',
        },
        {
          icon: 'Gauge',
          title: 'Performance degradation',
          description: 'Significant decline in accuracy, latency, or other performance metrics.',
        },
      ],
    },
    {
      type: 'heading',
      id: 'severity-levels',
      level: 2,
      text: 'Severity levels',
    },
    {
      type: 'paragraph',
      text: 'Classify incidents by severity to prioritize response efforts:',
    },
    {
      type: 'table',
      columns: [
        { key: 'level', label: 'Severity', width: '100px' },
        { key: 'description', label: 'Description' },
        { key: 'example', label: 'Example' },
      ],
      rows: [
        { level: 'Minor', description: 'Limited impact, no harm caused', example: 'Occasional incorrect predictions with no downstream effect' },
        { level: 'Serious', description: 'Significant impact on operations or users', example: 'Systematic bias affecting a group of users' },
        { level: 'Very serious', description: 'Potential or actual harm to individuals', example: 'Safety-critical system failure, data breach' },
      ],
    },
    {
      type: 'heading',
      id: 'incident-workflow',
      level: 2,
      text: 'Incident workflow',
    },
    {
      type: 'paragraph',
      text: 'Incidents progress through defined statuses as they are investigated and resolved:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Open', text: 'Incident has been reported and is awaiting investigation' },
        { bold: 'Investigating', text: 'Team is actively analyzing the root cause' },
        { bold: 'Mitigated', text: 'Immediate actions have been taken to address the issue' },
        { bold: 'Closed', text: 'Incident has been fully resolved and documented' },
      ],
    },
    {
      type: 'heading',
      id: 'mitigation-actions',
      level: 2,
      text: 'Documenting mitigation actions',
    },
    {
      type: 'paragraph',
      text: 'For each incident, record both immediate and long-term responses:',
    },
    {
      type: 'grid-cards',
      columns: 2,
      items: [
        { icon: 'Clock', title: 'Immediate mitigations', description: 'Actions taken to stop ongoing harm (rollback, disable feature, manual override)' },
        { icon: 'CheckCircle', title: 'Corrective actions', description: 'Planned fixes to prevent recurrence (model retraining, process changes, monitoring)' },
      ],
    },
    {
      type: 'heading',
      id: 'approval-workflow',
      level: 2,
      text: 'Approval workflow',
    },
    {
      type: 'paragraph',
      text: 'Serious incidents may require approval before being closed. The approval workflow tracks:',
    },
    {
      type: 'checklist',
      items: [
        'Approval status (Pending, Approved, Rejected, Not required)',
        'Who approved the incident closure',
        'Approval date and timestamp',
        'Approval notes and conditions',
      ],
    },
    {
      type: 'heading',
      id: 'affected-parties',
      level: 2,
      text: 'Affected parties',
    },
    {
      type: 'paragraph',
      text: 'Document which individuals or groups were affected by the incident. You\'ll need this for:',
    },
    {
      type: 'bullet-list',
      items: [
        { text: 'Regulatory reporting requirements' },
        { text: 'Communication and notification obligations' },
        { text: 'Impact assessment and remediation' },
        { text: 'Lessons learned and prevention' },
      ],
    },
    {
      type: 'heading',
      id: 'interim-reports',
      level: 2,
      text: 'Interim reports',
    },
    {
      type: 'paragraph',
      text: 'For ongoing incidents, you can mark that an interim report has been filed. This is particularly relevant for regulatory compliance where initial notifications must be submitted within specific timeframes.',
    },
    {
      type: 'heading',
      id: 'archiving',
      level: 2,
      text: 'Archiving incidents',
    },
    {
      type: 'paragraph',
      text: 'Closed incidents can be archived to keep your active incident list manageable while maintaining complete records for audit purposes. Archived incidents remain searchable and can be restored if needed.',
    },
    {
      type: 'article-links',
      title: 'Related articles',
      items: [
        {
          collectionId: 'ai-governance',
          articleId: 'model-inventory',
          title: 'Managing model inventory',
          description: 'Track the models involved in incidents',
        },
        {
          collectionId: 'risk-management',
          articleId: 'risk-assessment',
          title: 'Conducting risk assessments',
          description: 'Identify risks that could lead to incidents',
        },
        {
          collectionId: 'compliance',
          articleId: 'eu-ai-act',
          title: 'EU AI Act compliance',
          description: 'Understand incident reporting requirements',
        },
      ],
    },
  ],
};
