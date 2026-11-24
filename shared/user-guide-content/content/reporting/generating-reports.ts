import type { ArticleContent } from '../../contentTypes';

export const generatingReportsContent: ArticleContent = {
  blocks: [
    {
      type: 'heading',
      id: 'overview',
      level: 2,
      text: 'Overview',
    },
    {
      type: 'paragraph',
      text: 'The Reporting page turns your platform data into governance and compliance reports. A report covers a single use case or your whole organization. Every report you produce is saved in the list on the page.',
    },
    {
      type: 'paragraph',
      text: 'Generated reports are useful for audits, regulatory submissions, board presentations and stakeholder communications. They pull information from across the platform into structured documents that show your governance activities.',
    },
    {
      type: 'paragraph',
      text: 'The page has four tabs:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Generate', text: 'The reports produced so far, and the **Generate report** button' },
        { bold: 'Templates', text: 'Ready-made and custom report designs you can run once or put on a schedule' },
        { bold: 'Scheduled', text: 'Reports that run on a schedule' },
        { bold: 'Archive', text: 'Reports you archived from the Generate tab' },
      ],
    },
    {
      type: 'heading',
      id: 'why-reports',
      level: 2,
      text: 'Why generate reports?',
    },
    {
      type: 'paragraph',
      text: 'Reports help you demonstrate compliance, communicate governance status and meet audit requirements. They provide evidence of due diligence and document how your organization handles AI governance.',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Compliance documentation', text: 'Create evidence packages for regulatory requirements like the EU AI Act' },
        { bold: 'Audit readiness', text: 'Generate reports that auditors can review to verify your governance practices' },
        { bold: 'Stakeholder communication', text: 'Produce summaries for boards, executives and other stakeholders' },
        { bold: 'Historical record', text: 'Build an archive of governance status over time' },
        { bold: 'Use case documentation', text: 'Document governance activities for specific AI use cases' },
      ],
    },
    {
      type: 'heading',
      id: 'report-types',
      level: 2,
      text: 'Types of reports',
    },
    {
      type: 'paragraph',
      text: 'There are two categories of reports based on scope:',
    },
    {
      type: 'icon-cards',
      items: [
        {
          icon: 'Lightbulb',
          title: 'Use case reports',
          description: 'Reports for a specific AI use case, covering its risks, compliance status and governance activities.',
        },
        {
          icon: 'Building2',
          title: 'Organization reports',
          description: 'Reports covering your entire organization\'s governance program for a framework you pick.',
        },
      ],
    },
    {
      type: 'heading',
      id: 'available-report-types',
      level: 2,
      text: 'Report sections',
    },
    {
      type: 'paragraph',
      text: 'When you generate a report, you choose which sections it includes. The sections on offer depend on the report level and the framework:',
    },
    {
      type: 'table',
      columns: [
        { key: 'group', label: 'Group', width: '25%' },
        { key: 'sections', label: 'Sections', width: '75%' },
      ],
      rows: [
        { group: 'Risk Analysis', sections: 'Use Case Risks. A use case report also offers Vendor Risks and Model Risks.' },
        { group: 'Compliance & Governance', sections: 'Use case reports only, by framework: Requirements and Assessment Tracker for the EU AI Act, Clauses & Annexes for ISO 42001 and ISO 27001, NIST Subcategories for the NIST AI RMF. The other built-in frameworks get Framework requirements, which organization reports offer too.' },
        { group: 'Organization', sections: 'AI Models, Vendors, Training Registry, Policy Manager and Incident Management.' },
      ],
    },
    {
      type: 'paragraph',
      text: 'The "Framework requirements" section covers the built-in frameworks such as SOC 2, GDPR, HIPAA and OSFI E-23. For each framework it shows how many requirements are implemented or audited and the progress of each group of requirements. It also lists the owner, due date and evidence of each requirement. Frameworks you import from Excel are not included yet.',
    },
    {
      type: 'paragraph',
      text: 'Turn on **AI-enhanced report** to add an executive summary, key findings, risk highlights and recommendations. This needs an LLM key in **Settings → LLM keys**.',
    },
    {
      type: 'heading',
      id: 'generating-use-case-report',
      level: 2,
      text: 'Generating a use case report',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'In the sidebar, open **Record > Evidence & reports > Reporting**' },
        { text: 'On the **Generate** tab, click **Generate report** and choose **Use case report**' },
        { text: 'Select the use case. The sections on offer follow the framework tied to it' },
        { text: 'Optionally enter a report name, then choose PDF or Word' },
        { text: 'Optionally turn on **AI-enhanced report**, then click **Next**' },
        { text: 'Choose the sections to include and click **Generate report**' },
      ],
    },
    {
      type: 'paragraph',
      text: 'The report is generated in the background. When it is ready it downloads and appears in the list on the Generate tab.',
    },
    {
      type: 'image',
      src: '/images/user-guide/generate-project-report.png',
      alt: 'Generate project report modal with fields for selecting a use case, report type, and custom report name',
      caption: 'Select a use case and report type to generate a use case-specific report.',
    },
    {
      type: 'heading',
      id: 'generating-org-report',
      level: 2,
      text: 'Generating an organization report',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'On the **Generate** tab, click **Generate report** and choose **Organization report**' },
        { text: 'Select the organizational project and the framework for the report' },
        { text: 'Optionally enter a report name, then choose PDF or Word' },
        { text: 'Optionally turn on **AI-enhanced report**, then click **Next**' },
        { text: 'Choose the sections to include and click **Generate report**' },
      ],
    },
    {
      type: 'image',
      src: '/images/user-guide/generate-org-report.png',
      alt: 'Generate organization report modal with fields for selecting an organizational project, framework, report type, and custom report name',
      caption: 'Organization reports cover your entire governance program for the framework you select.',
    },
    {
      type: 'heading',
      id: 'report-templates',
      level: 2,
      text: 'Report templates',
    },
    {
      type: 'paragraph',
      text: 'A template is a saved report design: its sections, its AI insights and the frameworks it covers. The **Templates** tab lists **System templates**, which come with VerifyWise, and **My templates**, which your organization creates. System templates include a weekly executive brief, an EU AI Act conformity evidence pack, an ISO 42001 internal audit pack, a board governance report and the OSFI E-23 completeness report.',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Run now', text: 'Opens the **Run report** wizard to produce one report straight away. It appears in the list on the Generate tab' },
        { bold: 'Use Template', text: 'Opens the **Schedule report** wizard to set up a recurring report (see "Scheduling reports" below)' },
        { bold: 'Duplicate', text: 'On a system template, copies it to My templates as "<name> (copy)"' },
        { bold: 'Edit', text: 'On your own template, changes its name, description and category' },
        { bold: 'Delete', text: 'On your own template, removes it. Schedules that use it keep running' },
        { bold: 'New template', text: 'The button above the list. You give the template a name, description, category and report level, then pick its sections and AI insights' },
      ],
    },
    {
      type: 'paragraph',
      text: 'Both wizards start with the template\'s sections and AI insights, and you can change them for that run or schedule. The first step also asks for PDF or Word. Some templates, such as the OSFI E-23 completeness report, add a **Report details** step for names and the reporting period.',
    },
    {
      type: 'callout',
      variant: 'info',
      title: 'Changing what a template contains',
      text: 'Edit changes a template\'s name, description and category only. Its sections and AI insights are fixed when it is created. To use different ones, change them in the wizard for a single run or schedule, or create a new template.',
    },
    {
      type: 'heading',
      id: 'scheduling-reports',
      level: 2,
      text: 'Scheduling reports',
    },
    {
      type: 'paragraph',
      text: 'Click **Use Template** on a template. After the scope, sections and AI insights steps, the wizard asks for:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Schedule', text: 'Frequency (daily, weekly, monthly or quarterly), plus the hour, minute and timezone. A quarterly schedule also asks which month to run in' },
        { bold: 'Delivery', text: 'Save to storage, send an email link or attach the file. Pick at least one. The email options take a list of recipients' },
      ],
    },
    {
      type: 'paragraph',
      text: 'Check the **Review** step and save. The schedule appears on the **Scheduled** tab, and each run adds a report to the list on the Generate tab. From a schedule\'s actions menu you can run it now, pause or resume it, edit its name, format and schedule, or delete it.',
    },
    {
      type: 'heading',
      id: 'reports-list',
      level: 2,
      text: 'Managing generated reports',
    },
    {
      type: 'paragraph',
      text: 'The Generate tab lists every report, whether it came from the Generate report button, a template run or a schedule. The list shows:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Report', text: 'The report name' },
        { bold: 'Template', text: 'The template it came from, if any' },
        { bold: 'Status', text: 'Queued, Running, Success, Partial success or Failed. Partial success means the file was produced but a delivery step, such as an email, failed' },
        { bold: 'Scope', text: 'The use case or organization the report covers' },
        { bold: 'Created', text: 'When the report was produced' },
        { bold: 'Triggered by', text: 'What started the report' },
      ],
    },
    {
      type: 'paragraph',
      text: 'The actions menu on each row offers **Download**, **View analyses** for the AI sections, **Archive** and **Delete permanently**. An OSFI E-23 report also offers **Download fix-it list**.',
    },
    {
      type: 'heading',
      id: 'deleting-reports',
      level: 2,
      text: 'Archiving and deleting reports',
    },
    {
      type: 'paragraph',
      text: '**Archive** moves a report to the Archive tab, where you can restore it. **Delete permanently** removes the report file and its record. It can\'t be undone, so download a copy first if you need one.',
    },
    {
      type: 'callout',
      variant: 'warning',
      text: 'Keep reports you may need for an audit trail. Archive them instead of deleting them.',
    },
    {
      type: 'heading',
      id: 'best-practices',
      level: 2,
      text: 'Best practices',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Name reports clearly', text: 'Use descriptive names that include the date or purpose, like "Q4 2026 compliance report" or "Annual board summary"' },
        { bold: 'Schedule regular reports', text: 'Put a template on a monthly or quarterly schedule to track progress over time' },
        { bold: 'Keep archives', text: 'Hold on to historical reports to show how your governance has changed' },
        { bold: 'Start from a template', text: 'A system template already has the sections for its purpose. Duplicate one to keep your own version' },
        { bold: 'Verify before sharing', text: 'Review generated reports before sharing with external stakeholders' },
      ],
    },
    {
      type: 'heading',
      id: 'faq',
      level: 2,
      text: 'Frequently asked questions',
    },
    {
      type: 'heading',
      id: 'faq-format',
      level: 3,
      text: 'What format are reports generated in?',
    },
    {
      type: 'paragraph',
      text: 'PDF or Word (DOCX). You choose the format when you generate, run or schedule a report.',
    },
    {
      type: 'heading',
      id: 'faq-no-use-cases',
      level: 3,
      text: 'Why is the Generate report button disabled?',
    },
    {
      type: 'paragraph',
      text: 'The button is disabled until at least one use case exists. Create a use case first, then come back to the Reporting page.',
    },
    {
      type: 'heading',
      id: 'faq-access-denied',
      level: 3,
      text: 'I received an access denied error when generating a report. What should I do?',
    },
    {
      type: 'paragraph',
      text: 'This means you may not have permission to generate reports for the selected use case. Check with your administrator to verify your role and permissions.',
    },
    {
      type: 'heading',
      id: 'faq-data-included',
      level: 3,
      text: 'What data is included in reports?',
    },
    {
      type: 'paragraph',
      text: 'Reports include current data from the platform at the time you generate them. They pull in risks, compliance status, policies, training records and other governance data for the sections you chose.',
    },
    {
      type: 'heading',
      id: 'faq-scheduling',
      level: 3,
      text: 'Can I schedule automatic report generation?',
    },
    {
      type: 'paragraph',
      text: 'Yes. On the Templates tab, click **Use Template** on a template and set the schedule and delivery. Your schedules are listed on the Scheduled tab.',
    },
    {
      type: 'heading',
      id: 'faq-edit-template',
      level: 3,
      text: 'Can I change the sections of a template?',
    },
    {
      type: 'paragraph',
      text: 'Not after it is created. Edit covers the name, description and category. You can change the sections and AI insights each time you run or schedule the template, or create a new template with the ones you want.',
    },
    {
      type: 'article-links',
      title: 'Related articles',
      items: [
        {
          collectionId: 'reporting',
          articleId: 'osfi-e23-report',
          title: 'OSFI E-23 completeness report',
          description: 'Check your E-23 checklist against your model risk records',
        },
        {
          collectionId: 'reporting',
          articleId: 'dashboard-analytics',
          title: 'Dashboard analytics',
          description: 'View governance metrics on the dashboard',
        },
        {
          collectionId: 'compliance',
          articleId: 'assessments',
          title: 'Compliance overview',
          description: 'Understand available compliance frameworks',
        },
      ],
    },
  ],
};
