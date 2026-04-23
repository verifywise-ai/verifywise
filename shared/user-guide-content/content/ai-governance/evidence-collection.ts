import type { ArticleContent } from '../../contentTypes';

export const evidenceCollectionContent: ArticleContent = {
  blocks: [
    {
      type: 'heading',
      id: 'overview',
      level: 2,
      text: 'Overview',
    },
    {
      type: 'paragraph',
      text: 'Evidence collection is the practice of gathering and organizing documentation that proves your AI governance activities are actually happening. Good governance isn\'t just about having policies, it\'s about demonstrating that those policies are being followed through tangible artifacts like test results, approval records, audit logs and compliance assessments.',
    },
    {
      type: 'paragraph',
      text: 'When auditors, regulators or internal stakeholders ask how you govern AI, evidence is what transforms your answer from "we have a process" to "here\'s the documented proof." Without organized evidence, even well-governed AI programs struggle to show their practices. That creates unnecessary compliance risk and audit friction.',
    },
    {
      type: 'heading',
      id: 'why-collect-evidence',
      level: 2,
      text: 'Why collect evidence?',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Audit readiness', text: 'Respond quickly to audit requests with organized documentation' },
        { bold: 'Regulatory compliance', text: 'Satisfy documentation requirements from EU AI Act, ISO 42001 and other frameworks' },
        { bold: 'Accountability', text: 'Create clear records of who approved what, when and why' },
        { bold: 'Institutional memory', text: 'Preserve knowledge about how decisions were made as teams change' },
        { bold: 'Continuous improvement', text: 'Evidence of past practices helps you see what\'s working and what needs fixing' },
      ],
    },
    {
      type: 'callout',
      variant: 'info',
      text: 'Start collecting evidence early in your AI projects. You\'ll thank yourself later when an audit comes up and you don\'t have to scramble for documentation across ISO 42001, EU AI Act or NIST AI RMF.',
    },
    {
      type: 'heading',
      id: 'evidence-hub',
      level: 2,
      text: 'The evidence hub',
    },
    {
      type: 'paragraph',
      text: 'The evidence hub is your central place for all governance documentation. You can access it from Assurance > Evidence in the sidebar, or through linked records in your model inventory. It provides:',
    },
    {
      type: 'checklist',
      items: [
        'Searchable storage for all evidence files',
        'Categorization by evidence type',
        'Linking between evidence and AI models',
        'Expiry tracking for time-sensitive documents',
        'Upload history and metadata',
      ],
    },
    {
      type: 'image',
      src: '/images/user-guide/evidence-hub.png',
      alt: 'Evidence and documents page showing a table of uploaded files with columns for file name, use case, upload date, uploader, source, and actions',
      caption: 'The evidence hub stores all your governance documentation in one place.',
    },
    {
      type: 'heading',
      id: 'adding-evidence',
      level: 2,
      text: 'Adding evidence',
    },
    {
      type: 'paragraph',
      text: 'To add new evidence to the hub, click **Add evidence** and provide:',
    },
    {
      type: 'ordered-list',
      items: [
        { bold: 'Evidence name', text: ',A descriptive name for easy identification' },
        { bold: 'Evidence type', text: ',Category of documentation (see types below)' },
        { bold: 'Description', text: ',Optional details about the evidence content' },
        { bold: 'Files', text: ',Upload one or more supporting documents' },
        { bold: 'Linked models', text: ',Associate with relevant AI models in your inventory' },
        { bold: 'Expiry date', text: ',Optional date when the evidence needs renewal' },
      ],
    },
    {
      type: 'image',
      src: '/images/user-guide/upload-files.png',
      alt: 'Upload files modal with drag and drop area supporting documents, images, and videos up to 30MB',
      caption: 'Upload evidence files by dragging and dropping or clicking to browse.',
    },
    {
      type: 'heading',
      id: 'evidence-types',
      level: 2,
      text: 'Evidence types',
    },
    {
      type: 'paragraph',
      text: 'Categorize your evidence to make it easier to locate during audits:',
    },
    {
      type: 'icon-cards',
      items: [
        {
          icon: 'FileText',
          title: 'Technical documentation',
          description: 'Model cards, architecture diagrams, API specifications, and system documentation.',
        },
        {
          icon: 'Shield',
          title: 'Risk assessments',
          description: 'Risk analysis reports, impact assessments, and mitigation plans.',
        },
        {
          icon: 'CheckCircle',
          title: 'Testing and validation',
          description: 'Test results, performance benchmarks, bias evaluations, and validation reports.',
        },
        {
          icon: 'FileText',
          title: 'Policies and procedures',
          description: 'AI governance policies, operating procedures, and guidelines.',
        },
        {
          icon: 'Database',
          title: 'Data documentation',
          description: 'Data processing agreements, data sheets, and provenance records.',
        },
        {
          icon: 'Settings',
          title: 'Contracts and agreements',
          description: 'Vendor contracts, SLAs, and data processing agreements.',
        },
      ],
    },
    {
      type: 'heading',
      id: 'linking-models',
      level: 2,
      text: 'Linking evidence to models',
    },
    {
      type: 'paragraph',
      text: 'You can link evidence to one or more AI models in your inventory. This creates a traceable connection between your documentation and the systems it covers. When auditors review a specific model, they can pull up all the associated evidence right away.',
    },
    {
      type: 'paragraph',
      text: 'To link evidence to models, use the **Mapped models** field when creating or editing evidence. You can also add evidence links directly from the model inventory view.',
    },
    {
      type: 'heading',
      id: 'file-management',
      level: 2,
      text: 'File management',
    },
    {
      type: 'paragraph',
      text: 'VerifyWise supports various file formats for evidence. Each uploaded file tracks:',
    },
    {
      type: 'bullet-list',
      items: [
        { text: 'Original filename and file type' },
        { text: 'File size' },
        { text: 'Who uploaded the file' },
        { text: 'Upload date and time' },
      ],
    },
    {
      type: 'callout',
      variant: 'tip',
      title: 'Best practice',
      text: 'Use consistent naming for your evidence files. Include the date, document type and relevant model or project name so they\'re easy to find later.',
    },
    {
      type: 'heading',
      id: 'expiry-tracking',
      level: 2,
      text: 'Expiry tracking',
    },
    {
      type: 'paragraph',
      text: 'Some evidence has a limited validity period. Examples include:',
    },
    {
      type: 'bullet-list',
      items: [
        { text: 'Annual security assessments' },
        { text: 'Vendor certifications' },
        { text: 'Periodic risk reviews' },
        { text: 'Training completion records' },
      ],
    },
    {
      type: 'paragraph',
      text: 'Set an expiry date on time-sensitive evidence to receive reminders when renewal is needed.',
    },
    {
      type: 'heading',
      id: 'compliance-mapping',
      level: 2,
      text: 'Compliance mapping',
    },
    {
      type: 'paragraph',
      text: 'Evidence in VerifyWise can be organized by the compliance requirement it supports. This helps you quickly identify:',
    },
    {
      type: 'checklist',
      items: [
        'Which requirements have supporting evidence',
        'Gaps where documentation is missing',
        'Evidence that supports multiple requirements',
        'Documents that need updating',
      ],
    },
    {
      type: 'heading',
      id: 'audit-preparation',
      level: 2,
      text: 'Preparing for audits',
    },
    {
      type: 'paragraph',
      text: 'When preparing for a compliance audit, use the Evidence Hub to:',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Review all evidence linked to the systems in scope' },
        { text: 'Check expiry dates and renew outdated documents' },
        { text: 'Verify that all required evidence types are present' },
        { text: 'Export evidence packages for auditor review' },
      ],
    },
    {
      type: 'heading',
      id: 'assessment-evidence',
      level: 2,
      text: 'Assessment evidence',
    },
    {
      type: 'paragraph',
      text: 'Beyond the evidence hub, you can attach evidence directly to compliance assessments. This links specific assessment questions to the documentation that backs up your compliance.',
    },
    {
      type: 'paragraph',
      text: 'Evidence attached to assessments is organized by:',
    },
    {
      type: 'bullet-list',
      items: [
        { text: 'Assessment tracker groups' },
        { text: 'Compliance tracker groups' },
        { text: 'Management system clauses' },
        { text: 'Reference controls' },
      ],
    },
    {
      type: 'article-links',
      title: 'Related articles',
      items: [
        {
          collectionId: 'ai-governance',
          articleId: 'model-inventory',
          title: 'Managing model inventory',
          description: 'Link evidence to your registered AI models',
        },
        {
          collectionId: 'compliance',
          articleId: 'assessments',
          title: 'Compliance assessments',
          description: 'Attach evidence to assessment responses',
        },
        {
          collectionId: 'compliance',
          articleId: 'iso-42001',
          title: 'ISO 42001 certification',
          description: 'Evidence requirements for AI management systems',
        },
      ],
    },
  ],
};
