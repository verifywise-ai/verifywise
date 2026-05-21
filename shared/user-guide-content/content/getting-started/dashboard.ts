import type { ArticleContent } from '../../contentTypes';

export const dashboardContent: ArticleContent = {
  blocks: [
    {
      type: 'heading',
      id: 'overview',
      level: 2,
      text: 'Dashboard overview',
    },
    {
      type: 'paragraph',
      text: "The dashboard is what you see after logging in. It gives you a snapshot of your entire AI governance program: how many models you're tracking, which risks need attention, where your compliance stands and what tasks are overdue.",
    },
    {
      type: 'paragraph',
      text: 'You can get back here from anywhere by clicking "Dashboard" in the sidebar or the VerifyWise logo at the top.',
    },
    {
      type: 'heading',
      id: 'dashboard-views',
      level: 2,
      text: 'Two views: operations and executive',
    },
    {
      type: 'paragraph',
      text: "There's a toggle in the top-right corner that switches between two layouts. Your choice is saved to your browser, so it persists between sessions.",
    },
    {
      type: 'grid-cards',
      items: [
        {
          icon: 'Settings',
          title: 'Operations view',
          description: 'Leads with task radar, incident status and evidence coverage. Designed for people doing the day-to-day governance work.',
        },
        {
          icon: 'BarChart3',
          title: 'Executive view',
          description: 'Leads with organizational framework progress and governance score. Designed for leadership reviewing posture at a glance.',
        },
      ],
    },
    {
      type: 'heading',
      id: 'governance-score',
      level: 2,
      text: 'AI governance score',
    },
    {
      type: 'paragraph',
      text: 'The ring chart in the executive view summarizes your governance posture as a single number from 0 to 100. It rolls up five areas into one weighted score, so leadership can see at a glance where the program is strong and where attention is needed. Each area is also shown next to the ring with its own 0–100% score.',
    },
    {
      type: 'paragraph',
      text: "The overall score is a weighted average of the five areas. The weights reflect how much each area contributes to your governance posture — risk and vendor management together account for 60% of the score.",
    },
    {
      type: 'grid-cards',
      items: [
        {
          icon: 'AlertTriangle',
          title: 'Risk management — 30%',
          description: 'Share of risks moved to Mitigation status = Completed, with a penalty for any unmitigated risks at Very high risk level.',
        },
        {
          icon: 'Building2',
          title: 'Vendor management — 30%',
          description: 'Share of vendors marked Review status = Reviewed, with a penalty for vendors with a risk score of 70 or higher.',
        },
        {
          icon: 'FolderTree',
          title: 'Project governance — 25%',
          description: 'Share of use cases moved to status Completed, plus share of use cases with at least one compliance framework attached. Organizational frameworks (ISO 42001, etc.) are not counted here.',
        },
        {
          icon: 'Brain',
          title: 'Model lifecycle — 10%',
          description: 'Share of models at status Approved, with a penalty for any models in status Blocked.',
        },
        {
          icon: 'ScrollText',
          title: 'Policy & documentation — 5%',
          description: 'Share of policies at status Published, with a penalty for any overdue (past next review date and not yet Published).',
        },
      ],
    },
    {
      type: 'paragraph',
      text: 'To improve a category, progress its items through their lifecycle:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Risk management', text: 'Set Mitigation status = Completed on risks as they are remediated. Lower or close any unmitigated Very high risk items first — they carry the steepest penalty.' },
        { bold: 'Vendor management', text: 'Mark vendors as Reviewed once their assessment is finished. Bring a vendor’s risk score below 70 to remove the high-risk penalty.' },
        { bold: 'Project governance', text: 'Move use cases to Completed when finished, and attach at least one compliance framework to each.' },
        { bold: 'Model lifecycle', text: 'Promote vetted models from Pending to Approved. Avoid leaving models in Blocked status — each one removes 25 points from this area.' },
        { bold: 'Policy & documentation', text: 'Move policies to Published status once they are released, and keep the next review date up to date so policies don’t become overdue.' },
      ],
    },
    {
      type: 'callout',
      variant: 'info',
      title: 'Why a category may show 0%',
      text: 'The score measures workflow completion, not inventory size. If you have items registered (risks, vendors, models, etc.) but none of them have been moved into a “completed” state (Mitigated, Reviewed, Approved, Published), that category reads as 0% governed. An empty category — no items at all — also shows 0%, not 100%, by design.',
    },
    {
      type: 'heading',
      id: 'header-cards',
      level: 2,
      text: 'Summary cards',
    },
    {
      type: 'paragraph',
      text: 'The row of cards at the top shows counts across your key registries. Each card is clickable and takes you to the full page for that area.',
    },
    {
      type: 'grid-cards',
      items: [
        {
          icon: 'Brain',
          title: 'Models',
          description: 'Total AI models in your inventory.',
        },
        {
          icon: 'Building2',
          title: 'Vendors',
          description: 'Third-party vendors you manage.',
        },
        {
          icon: 'ScrollText',
          title: 'Policies',
          description: 'Policies across all statuses.',
        },
        {
          icon: 'GraduationCap',
          title: 'Trainings',
          description: 'Training sessions assigned to staff.',
        },
        {
          icon: 'AlertCircle',
          title: 'Incidents',
          description: 'AI-related incidents on record.',
        },
      ],
    },
    {
      type: 'heading',
      id: 'framework-cards',
      level: 2,
      text: 'Organizational framework cards',
    },
    {
      type: 'paragraph',
      text: "If you've enabled organizational frameworks (ISO 42001, ISO 27001 or NIST AI RMF), each one gets its own card showing implementation progress.",
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'ISO 42001 and ISO 27001', text: 'Arrow buttons in the card header toggle between clauses and annexes progress.' },
        { bold: 'NIST AI RMF', text: 'Shows control implementation status broken down by function (Govern, Map, Measure, Manage).' },
      ],
    },
    {
      type: 'paragraph',
      text: 'Clicking any framework card takes you to the framework management page where you can work on individual controls.',
    },
    {
      type: 'heading',
      id: 'risk-cards',
      level: 2,
      text: 'Risk overview',
    },
    {
      type: 'paragraph',
      text: 'Risk cards display donut charts showing how your risks distribute across severity levels (critical, high, medium, low). There are 3 separate cards:',
    },
    {
      type: 'grid-cards',
      items: [
        {
          icon: 'AlertTriangle',
          title: 'Use case and framework risks',
          description: 'Risks attached to your AI use cases and their compliance assessments.',
        },
        {
          icon: 'Building2',
          title: 'Vendor risks',
          description: 'Risks associated with third-party vendors.',
        },
        {
          icon: 'Brain',
          title: 'Model risks',
          description: 'Risks tied to specific AI models in your inventory.',
        },
      ],
    },
    {
      type: 'heading',
      id: 'task-radar',
      level: 2,
      text: 'Task radar',
    },
    {
      type: 'paragraph',
      text: 'The task radar groups your open tasks by urgency:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Overdue', text: 'Past due date. These need immediate attention.' },
        { bold: 'Due soon', text: 'Due within the next 7 days.' },
        { bold: 'Upcoming', text: 'More than 7 days away.' },
      ],
    },
    {
      type: 'paragraph',
      text: 'Click the card to open the full tasks page with filtering and assignment options.',
    },
    {
      type: 'heading',
      id: 'metrics-cards',
      level: 2,
      text: 'Metrics cards',
    },
    {
      type: 'paragraph',
      text: 'The remaining cards cover specific governance areas:',
    },
    {
      type: 'grid-cards',
      items: [
        {
          icon: 'GraduationCap',
          title: 'Training completion',
          description: 'Planned, in-progress and completed training sessions.',
        },
        {
          icon: 'ScrollText',
          title: 'Policy status',
          description: 'Policies grouped by status: draft, under review, approved, published, archived.',
        },
        {
          icon: 'AlertCircle',
          title: 'Incident status',
          description: 'Incidents grouped by status: open, investigating, mitigated, closed.',
        },
        {
          icon: 'FileCheck',
          title: 'Evidence coverage',
          description: 'Percentage of models with uploaded evidence and total evidence count.',
        },
        {
          icon: 'Brain',
          title: 'Model lifecycle',
          description: 'Models grouped by approval status: approved, pending, restricted, blocked.',
        },
      ],
    },
    {
      type: 'heading',
      id: 'use-cases-table',
      level: 2,
      text: 'Recent use cases table',
    },
    {
      type: 'paragraph',
      text: 'At the bottom of the dashboard, a table lists your most recently updated AI use cases with these columns:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Use case name', text: 'The name you gave the use case when creating it.' },
        { bold: 'Framework', text: 'Which compliance framework(s) are attached.' },
        { bold: 'Progress', text: 'Percentage of sub-controls completed.' },
        { bold: 'Status', text: 'Current use case status.' },
        { bold: 'Updated', text: 'Last modification timestamp.' },
      ],
    },
    {
      type: 'heading',
      id: 'sidebar',
      level: 2,
      text: 'Sidebar navigation',
    },
    {
      type: 'paragraph',
      text: "The sidebar on the left is your main navigation. It's divided into a top section and 3 labeled groups:",
    },
    {
      type: 'icon-cards',
      items: [
        {
          icon: 'LayoutDashboard',
          title: 'Top items',
          description: 'Start here, Dashboard, Tasks (with open count badge), and Frameworks.',
        },
        {
          icon: 'FolderTree',
          title: 'Inventory',
          description: 'Use cases, Model inventory, Datasets, and Agent discovery.',
        },
        {
          icon: 'Shield',
          title: 'Assurance',
          description: 'Risk management, Training registry, Evidence, Reporting, and AI trust center.',
        },
        {
          icon: 'Building2',
          title: 'Governance',
          description: 'Vendors, Policy manager, and Incident management.',
        },
      ],
    },
    {
      type: 'paragraph',
      text: "At the bottom of the sidebar you'll find Event tracker (audit log), Settings, and your user profile with logout.",
    },
    {
      type: 'heading',
      id: 'quick-actions',
      level: 2,
      text: 'Add new (quick actions)',
    },
    {
      type: 'paragraph',
      text: 'The "Add new" dropdown in the dashboard header lets you create records without navigating away:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Use case', text: 'Register a new AI use case.' },
        { bold: 'Vendor', text: 'Add a third-party vendor.' },
        { bold: 'Model', text: 'Add a model to your inventory.' },
        { bold: 'Risk', text: 'Log a new use-case-level risk.' },
        { bold: 'Policy', text: 'Create a governance policy.' },
        { bold: 'Vendor risk', text: 'Log a risk tied to a specific vendor.' },
        { bold: 'Model risk', text: 'Log a risk tied to a specific model.' },
        { bold: 'Training', text: 'Create a training session.' },
        { bold: 'Incident', text: 'Report an AI-related incident.' },
      ],
    },
    {
      type: 'callout',
      variant: 'tip',
      title: 'Next step',
      text: 'Head to the quick start guide to create your first use case, attach a framework and upload evidence.',
    },
  ],
};
