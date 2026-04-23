import type { ArticleContent } from '../../contentTypes';

export const quickStartContent: ArticleContent = {
  blocks: [
    {
      type: 'time-estimate',
      text: '**Time to complete:** Under 10 minutes',
    },
    {
      type: 'heading',
      id: 'what-youll-accomplish',
      level: 2,
      text: "What you'll have at the end",
    },
    {
      type: 'paragraph',
      text: "By the end of this guide, you'll have created an AI use case, attached a compliance framework to it, reviewed the generated controls and uploaded your first piece of evidence. That's enough to see your compliance percentage on the dashboard.",
    },
    {
      type: 'checklist',
      items: [
        'Create an AI use case',
        'Attach a compliance framework (EU AI Act, ISO 42001, etc.)',
        'Browse the controls that get generated',
        'Upload evidence to the evidence hub',
        'See progress reflected on the dashboard',
      ],
    },
    {
      type: 'heading',
      id: 'step-1',
      level: 2,
      text: 'Step 1: Create a use case',
    },
    {
      type: 'paragraph',
      text: 'A use case represents one AI system you want to govern. It gets its own risk register, framework tracking and evidence collection. You can have as many as you need.',
    },
    {
      type: 'ordered-list',
      items: [
        { bold: '', text: 'From the dashboard, open the **"Add new"** dropdown and select **"Use case"**' },
        { bold: '', text: 'Fill in the name (e.g., "Customer Support Chatbot"), owner, start date and geography' },
        { bold: '', text: 'Select the applicable regulations and AI risk classification' },
        { bold: '', text: 'Add a brief goal and description, then click **"Create"**' },
      ],
    },
    {
      type: 'image',
      src: '/images/user-guide/create-use-case.png',
      alt: 'Create new use case modal showing fields for title, owner, start date, geography, applicable regulations, AI risk classification, goal, and description',
      caption: 'The create use case form captures the key attributes of your AI system.',
    },
    {
      type: 'callout',
      variant: 'tip',
      title: 'Naming tip',
      text: "Pick a name that your colleagues will recognize. This shows up on the dashboard, in reports and in the sidebar, so \"Internal HR Screening Tool\" is better than \"Project Alpha\".",
    },
    {
      type: 'heading',
      id: 'step-2',
      level: 2,
      text: 'Step 2: Attach a compliance framework',
    },
    {
      type: 'paragraph',
      text: "Frameworks define what requirements you need to satisfy. When you attach one, VerifyWise generates the full set of controls and sub-controls for you to work through.",
    },
    {
      type: 'grid-cards',
      items: [
        { icon: 'Shield', title: 'EU AI Act', description: 'European AI regulation for high-risk systems' },
        { icon: 'FileText', title: 'ISO 42001', description: 'AI management system standard' },
        { icon: 'Shield', title: 'ISO 27001', description: 'Information security management' },
        { icon: 'AlertTriangle', title: 'NIST AI RMF', description: 'US AI risk management framework' },
      ],
    },
    {
      type: 'ordered-list',
      items: [
        { bold: '', text: 'Click into your new use case from the dashboard or sidebar (Inventory → Use cases)' },
        { bold: '', text: 'Open the **"Frameworks/regulations"** tab' },
        { bold: '', text: 'Click **"Add framework"** and select the one that applies' },
        { bold: '', text: 'The controls and sub-controls populate automatically' },
      ],
    },
    {
      type: 'heading',
      id: 'step-3',
      level: 2,
      text: 'Step 3: Review your controls',
    },
    {
      type: 'paragraph',
      text: "Controls are the individual requirements from your framework. Each one has sub-controls with specific implementation criteria. You don't need to complete them all now; just get familiar with the structure.",
    },
    {
      type: 'ordered-list',
      items: [
        { bold: '', text: 'Stay on the **"Frameworks/regulations"** tab in your use case' },
        { bold: '', text: 'Click into any framework to see its controls grouped by category' },
        { bold: '', text: 'Click a control to expand its sub-controls and detailed requirements' },
        { bold: '', text: 'Update status as you work (Not started → In progress → Implemented)' },
      ],
    },
    {
      type: 'paragraph',
      text: 'You can also see controls across all use cases from the sidebar: Assurance → Controls hub. This gives you a cross-cutting view of your entire control landscape.',
    },
    {
      type: 'heading',
      id: 'step-4',
      level: 2,
      text: 'Step 4: Upload evidence',
    },
    {
      type: 'paragraph',
      text: "Evidence is anything that proves you've implemented a control: policy documents, test results, screenshots, signed approvals, data processing agreements.",
    },
    {
      type: 'ordered-list',
      items: [
        { bold: '', text: 'In the sidebar, go to **Assurance → Evidence**' },
        { bold: '', text: 'Click **"Upload evidence"**' },
        { bold: '', text: 'Select a file (PDF, DOCX, images, etc.) and give it a title' },
        { bold: '', text: 'Add a description of what this file demonstrates' },
        { bold: '', text: 'Link it to the relevant control(s) and click **"Save"**' },
      ],
    },
    {
      type: 'callout',
      variant: 'tip',
      title: 'Start with what you have',
      text: "You probably already have documents that count as evidence: existing policies, vendor contracts, data processing agreements, model cards. Upload those first rather than creating new ones from scratch.",
    },
    {
      type: 'heading',
      id: 'step-5',
      level: 2,
      text: 'Step 5: Check your progress',
    },
    {
      type: 'paragraph',
      text: "Go back to the dashboard. Your use case now shows a compliance percentage based on how many controls you've addressed. Click into the use case to see the full breakdown on the Overview tab.",
    },
    {
      type: 'info-box',
      icon: 'FolderKanban',
      title: 'The use case overview shows',
      items: [
        'Compliance percentage, which increases as you implement controls',
        'Risk summary with counts by severity level',
        'Framework progress per attached framework',
      ],
    },
    {
      type: 'image',
      src: '/images/user-guide/project-overview.png',
      alt: 'Use case overview page showing owner, status, EU AI Act completion progress, and risk summary cards',
      caption: 'The Overview tab inside a use case shows your compliance progress and risk posture.',
    },
    {
      type: 'heading',
      id: 'whats-next',
      level: 2,
      text: "What to do next",
    },
    {
      type: 'paragraph',
      text: "You've got the basics in place. Here are good next steps depending on where you want to focus:",
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Link models', text: 'Go to the "Linked models" tab in your use case to associate specific AI models' },
        { bold: 'Add risks', text: 'Use the "Use case risks" tab to document what could go wrong and how you plan to handle it' },
        { bold: 'Invite your team', text: 'Go to Settings → User management to add colleagues with appropriate roles' },
        { bold: 'Track vendors', text: 'If you use third-party AI services, register them under Governance → Vendors' },
        { bold: 'Write policies', text: 'Document your internal AI policies under Governance → Policy manager' },
      ],
    },
    {
      type: 'callout',
      variant: 'success',
      title: "You're set up",
      text: "Governance isn't something you finish in a day. The point of VerifyWise is to track progress over time, so work through it at whatever pace makes sense for your team.",
    },
  ],
};
