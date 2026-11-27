import type { ArticleContent } from '../../contentTypes';

export const addingFrameworksContent: ArticleContent = {
  blocks: [
    {
      type: 'heading',
      id: 'overview',
      level: 2,
      text: 'Overview',
    },
    {
      type: 'paragraph',
      text: 'VerifyWise comes with 29 compliance frameworks: EU AI Act, ISO 42001, ISO 27001 and NIST AI RMF, plus 25 more bundled frameworks covering privacy, security, sector rules and AI ethics. Every framework is available to every organization. There is nothing to enable or install; you add the ones you need.',
    },
    {
      type: 'paragraph',
      text: 'Each framework is one of two types, and the type decides where you add it:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Organization-level', text: 'Applies to the organization as a whole. You add it on the **Frameworks** page.' },
        { bold: 'Use case-level', text: 'Applies to one AI system. You add it to a use case from its **Frameworks/regulations** tab.' },
      ],
    },
    {
      type: 'heading',
      id: 'organization-frameworks',
      level: 2,
      text: 'Organization-level frameworks',
    },
    {
      type: 'table',
      columns: [
        { key: 'name', label: 'Framework', width: '100%' },
      ],
      rows: [
        { name: 'ISO 42001' },
        { name: 'ISO 27001' },
        { name: 'NIST AI RMF' },
        { name: 'SOC 2 Type II Framework' },
        { name: 'GDPR Compliance Framework' },
        { name: 'CCPA Compliance Framework' },
        { name: 'DORA Compliance Framework' },
        { name: 'CIS Controls v8' },
        { name: 'Data Governance Framework' },
        { name: 'NIST Cybersecurity Framework' },
        { name: 'EN 18286' },
        { name: 'UAE Personal Data Protection Law' },
        { name: 'Saudi Arabia Personal Data Protection Law' },
        { name: 'Saudi National AI Index (NAII)' },
        { name: 'Qatar Personal Data Privacy Law' },
        { name: 'Bahrain Personal Data Protection Law' },
        { name: 'Quebec Law 25 Compliance Framework' },
        { name: 'OSFI E-23 Model Risk Management' },
      ],
    },
    {
      type: 'heading',
      id: 'use-case-frameworks',
      level: 2,
      text: 'Use case-level frameworks',
    },
    {
      type: 'table',
      columns: [
        { key: 'name', label: 'Framework', width: '100%' },
      ],
      rows: [
        { name: 'EU AI Act' },
        { name: 'PCI-DSS Lite Framework' },
        { name: 'HIPAA Security Rule Framework' },
        { name: 'ALTAI - Assessment List for Trustworthy AI' },
        { name: 'FTC AI Guidelines' },
        { name: 'NYC Local Law 144 - Automated Employment Decision Tools' },
        { name: 'AI Ethics & Governance Framework' },
        { name: 'OECD AI Principles' },
        { name: 'Texas Responsible AI Governance Act Framework' },
        { name: 'Colorado Artificial Intelligence Act Framework' },
        { name: 'EN 18286 AI systems' },
      ],
    },
    {
      type: 'heading',
      id: 'saudi-naii',
      level: 2,
      text: 'Saudi National AI Index (NAII)',
    },
    {
      type: 'paragraph',
      text: 'The Saudi National AI Index is published by the Saudi Data and AI Authority (SDAIA, document SDAIA-P123, May 2025). It measures how ready a government entity is to adopt AI. In VerifyWise it is an organization-level framework with 7 sub-pillars and 23 domains, matching the index one to one:',
    },
    {
      type: 'table',
      columns: [
        { key: 'subPillar', label: 'Sub-pillar', width: '35%' },
        { key: 'domains', label: 'Domains', width: '65%' },
      ],
      rows: [
        { subPillar: 'Directions: Strategy', domains: 'Planning and performance, Initiatives, Budget' },
        { subPillar: 'Directions: Governance', domains: 'Frameworks and policies, Regulatory enablement, Reliability and safety, Regulatory compliance' },
        { subPillar: 'Enablers: Data', domains: 'Availability and accessibility, Quality and integration, Reliability' },
        { subPillar: 'Enablers: Infrastructure', domains: 'Technical standards, Availability and monitoring, Operational resilience' },
        { subPillar: 'Enablers: Human capabilities', domains: 'Headcount and diversity, Professional development, Academic collaboration, Job stability' },
        { subPillar: 'Outputs: Applications', domains: 'Development and deployment, Privacy and security, Operation and management' },
        { subPillar: 'Outputs: Impact', domains: 'Operational efficiency, Employee productivity, Service quality and improvement' },
      ],
    },
    {
      type: 'paragraph',
      text: 'SDAIA scores each entity on 6 adoption levels. VerifyWise tracks the status of each domain and does not calculate this level, because SDAIA does not publish the weight of each domain.',
    },
    {
      type: 'table',
      columns: [
        { key: 'level', label: 'Level', width: '35%' },
        { key: 'score', label: 'Score', width: '65%' },
      ],
      rows: [
        { level: '0: Absence of capabilities', score: '0% to 4.9%' },
        { level: '1: Establishing', score: '5% to 24.9%' },
        { level: '2: Activated', score: '25% to 49.9%' },
        { level: '3: Managed', score: '50% to 79.9%' },
        { level: '4: Excellence', score: '80% to 94.9%' },
        { level: '5: Pioneer', score: '95% to 100%' },
      ],
    },
    {
      type: 'callout',
      variant: 'info',
      title: 'Questions are guidance',
      text: "SDAIA shares its questionnaire only with the entities it assesses. The questions and evidence examples in each domain's drawer are VerifyWise guidance, written from SDAIA's domain descriptions. Attach the evidence SDAIA asks for to each domain so it is ready for the assessment.",
    },
    {
      type: 'heading',
      id: 'add-to-organization',
      level: 2,
      text: 'Adding a framework to your organization',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Click **Frameworks** in the sidebar.' },
        { text: 'Click **Manage frameworks** and choose **Add/remove frameworks**.' },
        { text: 'In the **AI Frameworks** dialog, click **Add** on each framework you want. Added frameworks show an **Added** badge.' },
        { text: 'Click **Done**.' },
      ],
    },
    {
      type: 'paragraph',
      text: 'The dialog only lists organization-level frameworks. Your frameworks then appear on the **Requirements and Controls** tab; use the switcher at the top of the tab to move between them. The page also has **Dashboard**, **Framework risks**, **Linked models** and **Settings** tabs.',
    },
    {
      type: 'callout',
      variant: 'info',
      title: 'First time on the Frameworks page',
      text: 'If your organization has no organization-level project yet, the page says "No Organizational Project Found". Open the **Create new framework** form, choose frameworks under **Applicable regulations (optional)** if you like, and click **Create framework**. After that, **Manage frameworks** is available.',
    },
    {
      type: 'callout',
      variant: 'tip',
      title: 'Use Manage frameworks, not the Settings tab',
      text: 'The **Settings** tab on the Frameworks page only offers ISO 27001, ISO 42001 and NIST AI RMF. To add any of the other organization-level frameworks, use **Manage frameworks** > **Add/remove frameworks**.',
    },
    {
      type: 'heading',
      id: 'add-to-use-case',
      level: 2,
      text: 'Adding a framework to a use case',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Click **Use cases** in the sidebar and open the use case.' },
        { text: 'Open the **Frameworks/regulations** tab.' },
        { text: 'Click **Manage frameworks/regulations**. If the use case has no frameworks yet ("No frameworks installed"), click **Add Framework** instead.' },
        { text: 'In the **AI Frameworks** dialog, click **Add** on each framework you want, then click **Done**.' },
      ],
    },
    {
      type: 'paragraph',
      text: 'The dialog only lists use case-level frameworks. You can also pick frameworks when you create a use case, in the **Applicable regulations (optional)** field.',
    },
    {
      type: 'heading',
      id: 'rules',
      level: 2,
      text: 'Rules to know',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'No duplicates', text: 'A framework can only be added once to the same organization or use case.' },
        { bold: 'Type must match', text: 'Organization-level frameworks go on the Frameworks page, use case-level frameworks go on use cases. You can\'t mix them.' },
        { bold: 'EU AI Act (organization)', text: 'Added for you, not from the dialog. It is the part of EU AI Act that applies to the organization as a whole, shown with the same requirements and assessments screens and numbers as EU AI Act. The first time a use case gets EU AI Act, VerifyWise adds EU AI Act (organization) to the Frameworks page, and creates the organization-level project if there is none. While a use case has EU AI Act, it can\'t be removed and the organization-level project can\'t be deleted.' },
        { bold: 'Pending approval', text: 'While a use case has a pending approval request, you can\'t add or remove its frameworks. VerifyWise shows "This use case has a pending approval request…" until the approval process is complete.' },
        { bold: 'Starting point', text: 'Adding a framework creates all of its requirements with the status "Not started".' },
      ],
    },
    {
      type: 'heading',
      id: 'removing',
      level: 2,
      text: 'Removing a framework',
    },
    {
      type: 'paragraph',
      text: 'Open the same **AI Frameworks** dialog and click **Remove** on the framework. Confirm in the **Confirm framework removal** dialog by clicking **Remove**.',
    },
    {
      type: 'callout',
      variant: 'warning',
      title: 'Removing deletes your work on that framework',
      text: 'Removing a framework deletes all of its implementation data for that organization or use case: statuses, assignments, due dates, and links to evidence and risks. Adding it again starts from "Not started".',
    },
    {
      type: 'heading',
      id: 'working-requirements',
      level: 2,
      text: 'Working on a requirement',
    },
    {
      type: 'paragraph',
      text: 'In any of the 25 bundled frameworks, click a requirement to open its drawer. The drawer has four tabs:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Details', text: 'Read what the requirement asks for, and set the **Status**, **Owner**, **Reviewer**, **Approver** and **Due date**.' },
        { bold: 'Evidence', text: 'Add proof with **Upload new files**, or reuse files already in VerifyWise with **Attach existing files**.' },
        { bold: 'Cross mappings', text: 'Link the risks this requirement addresses with **Add/remove risks**.' },
        { bold: 'Notes', text: 'Leave notes for your team.' },
      ],
    },
    {
      type: 'paragraph',
      text: 'Click **Save** to keep your changes. The available statuses are Not started, Draft, In progress, Awaiting review, Awaiting approval, Implemented, Audited and Needs rework.',
    },
    {
      type: 'heading',
      id: 'reports',
      level: 2,
      text: 'Reports',
    },
    {
      type: 'callout',
      variant: 'info',
      text: 'Generated reports include the 25 bundled frameworks through the Framework requirements section, alongside EU AI Act, ISO 42001, ISO 27001 and NIST AI RMF. See Generating reports for how to select it.',
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
        { key: 'action', label: 'Action', width: '60%' },
        { key: 'roles', label: 'Required role', width: '40%' },
      ],
      rows: [
        { action: 'View frameworks and requirements', roles: 'Admin, Editor, Auditor' },
        { action: 'Add or remove frameworks', roles: 'Admin, Editor' },
        { action: 'Update requirements', roles: 'Admin, Editor' },
      ],
    },
    {
      type: 'heading',
      id: 'custom-frameworks',
      level: 2,
      text: 'Frameworks that aren\'t listed',
    },
    {
      type: 'callout',
      variant: 'info',
      text: 'If you need a framework that isn\'t listed, you can import your own from an Excel file once an Admin enables the Framework import extension. See Importing your own framework.',
    },
    {
      type: 'article-links',
      title: 'Related articles',
      items: [
        {
          collectionId: 'compliance',
          articleId: 'framework-import',
          title: 'Importing your own framework',
          description: 'Import a framework from Excel, add it to use cases and assess it',
        },
        {
          collectionId: 'compliance',
          articleId: 'assessments',
          title: 'Compliance overview',
          description: 'Compare frameworks and choose the right ones',
        },
        {
          collectionId: 'ai-governance',
          articleId: 'use-cases',
          title: 'Use cases',
          description: 'Create and manage the AI systems you govern',
        },
        {
          collectionId: 'ai-governance',
          articleId: 'approval-workflows',
          title: 'Approval workflows',
          description: 'How approvals affect changes to a use case',
        },
        {
          collectionId: 'reporting',
          articleId: 'generating-reports',
          title: 'Generating reports',
          description: 'Create reports for audits and stakeholders',
        },
      ],
    },
  ],
};
