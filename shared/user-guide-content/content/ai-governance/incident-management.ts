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
      text: 'Go to **Incidents** in the sidebar and click **New incident**. You\'ll need to provide:',
    },
    {
      type: 'ordered-list',
      items: [
        { bold: 'AI use case or framework', text: ',Select the use case or framework involved in the incident' },
        { bold: 'Incident type', text: ',What kind of incident it is (see below)' },
        { bold: 'Severity', text: ',How serious the incident is (see below)' },
        { bold: 'Occurred date', text: ',When the incident actually happened' },
        { bold: 'Detected date', text: ',When the incident was discovered (may differ from occurrence)' },
        { bold: 'Reporter', text: ',Who is reporting the incident, picked from your organization\'s users' },
        { bold: 'Categories of harm', text: ',At least one kind of harm involved' },
        { bold: 'Description', text: ',A clear description of what occurred, at least 5 characters' },
      ],
    },
    {
      type: 'paragraph',
      text: 'Both dates start as your own today. Neither can be in the future, and the detected date cannot be before the occurred date. The status starts as Open and the approval status as Pending. The model/system version and the other impact and response fields are optional.',
    },
    {
      type: 'paragraph',
      text: 'Dates are calendar days with no time attached, so every user sees the same date whatever their time zone. The reporter and the approver show by full name. Incidents imported from Jira, and incidents recorded before reporters were picked as users, show the name that was stored with them.',
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
      id: 'critical-incident-response',
      level: 3,
      text: 'Response to Very serious incidents',
    },
    {
      type: 'paragraph',
      text: 'When an incident is recorded as Very serious, or an existing incident is raised to Very serious, VerifyWise starts a response for it. Admins get two approval requests, one after the other:',
    },
    {
      type: 'bullet-list',
      items: [
        {
          bold: 'Remediation task',
          text: 'Approving the first request creates one high-priority task to respond to the incident. It goes to the incident\'s owner. If the incident has no owner, it goes to the person who created the incident, or else to the Admin who approved it.',
        },
        {
          bold: 'Admin escalation',
          text: 'Approving the second request notifies every Admin about the incident, in the app and by email. If some Admins cannot be reached, a new request appears to try them again.',
        },
      ],
    },
    {
      type: 'paragraph',
      text: 'Rejecting either request stops the response. So does archiving the incident or lowering its severity before a request is approved. Each incident gets one response: lowering its severity and raising it to Very serious again does not start another.',
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
        { bold: 'Suspended', text: 'Incident is temporarily put on hold pending further review' },
        {
          bold: 'Emergency action',
          text: 'Incident requires immediate emergency response measures',
        },
      ],
    },
    {
      type: 'paragraph',
      text: 'You can move an incident between any of these statuses, including reopening a closed incident. To reopen one, edit the incident and change its status from Closed to the status that fits, such as Investigating. The status change is recorded in the incident\'s activity history.',
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
        'Who approved or rejected the incident (filled in automatically)',
        'Approval date (filled in automatically)',
        'Approval notes and conditions',
      ],
    },
    {
      type: 'paragraph',
      text: 'You don\'t pick the approver or the date. When someone sets the approval status to Approved or Rejected, VerifyWise records that person as the approver and today\'s date where they are as the approval date. Setting it back to Pending or Not required clears both. Changing only the approval notes keeps them.',
    },
    {
      type: 'paragraph',
      text: 'Because approval signs off the closure, reopening a closed incident that was approved sets its approval status back to Pending and clears the approver, approval date and approval notes. The previous values stay in the incident\'s activity history. Once the incident is resolved again, approve it again before closing it. If you change the approval status or approval notes in the same save that reopens the incident, your approval values are kept instead.',
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
      id: 'who-can-change-incidents',
      level: 2,
      text: 'Who can change incidents',
    },
    {
      type: 'paragraph',
      text: 'Editing an incident and approving it are separate permissions. Admins can do both. Editors can report, edit and archive incidents but cannot change the approval status or approval notes. Reviewers can record approval (the approval status and notes) but cannot change the rest of the incident, archive it or report new ones. A Reviewer opens an incident from its row, or with Record approval in the row menu, and only the approval fields can be changed. Auditors can open incidents but not change them. Only Admins can permanently delete an incident; the incidents page has no delete action.',
    },
    {
      type: 'paragraph',
      text: 'For custom roles, an Admin grants these as the "Report new AI incidents", "Edit and archive AI incidents", "Approve or reject AI incidents" and "Permanently delete AI incidents" permissions. Custom roles that could edit incidents before approval became a separate permission were given "Approve or reject AI incidents" too, so they kept what they could do. The same rules apply to requests made through the AI Advisor, which can edit incidents but not approve them.',
    },
    {
      type: 'heading',
      id: 'archiving',
      level: 2,
      text: 'Archiving incidents',
    },
    {
      type: 'paragraph',
      text: 'Archive an incident from its row menu to take it out of your active incident list. Archiving keeps the full record and its change history, and you can undo it at any time. Archived incidents are left out of:',
    },
    {
      type: 'bullet-list',
      items: [
        { text: 'The incidents page, unless you choose to show them' },
        { text: 'The dashboard incident counts' },
        { text: 'Search' },
        { text: 'The list of incidents you can link on a use case\'s CE marking tab' },
        { text: 'Reports, which note how many archived incidents were left out' },
      ],
    },
    {
      type: 'paragraph',
      text: 'To see archived incidents, change the view above the table from "Active only" to "Archived only" or "Active + archived". Archived incidents are marked "Archived" and open read-only: restore one before changing it. To bring one back, choose Restore incident in its row menu. Archiving and restoring need the same permission as editing, and both are recorded in the incident\'s change history.',
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
