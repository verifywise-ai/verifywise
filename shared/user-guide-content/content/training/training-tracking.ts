import type { ArticleContent } from '../../contentTypes';

export const trainingTrackingContent: ArticleContent = {
  blocks: [
    {
      type: 'heading',
      id: 'overview',
      level: 2,
      text: 'Overview',
    },
    {
      type: 'paragraph',
      text: 'The Training registry helps you track AI-related training programs across your organization. Keeping a record of training activities shows that your team has the knowledge and skills to develop, deploy and govern AI systems responsibly.',
    },
    {
      type: 'paragraph',
      text: 'Training records matter for compliance with AI regulations that require organizations to demonstrate staff competency. The registry gives you a central place to document what training happened, who took part and what\'s planned next.',
    },
    {
      type: 'heading',
      id: 'why-track-training',
      level: 2,
      text: 'Why track AI training?',
    },
    {
      type: 'paragraph',
      text: 'AI governance takes more than policies and technical controls. People need the right knowledge and skills to put governance into practice. Tracking training helps you build and maintain those competencies.',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Compliance requirements', text: 'Many AI regulations require documented evidence of staff training on AI risks, ethics and governance' },
        { bold: 'Competency assurance', text: 'Show that teams working with AI systems have appropriate knowledge' },
        { bold: 'Audit readiness', text: 'Give auditors clear records of training activities and participation' },
        { bold: 'Gap identification', text: 'Spot where more training is needed based on roles and responsibilities' },
        { bold: 'Continuous improvement', text: 'Track training over time to keep knowledge current as AI technology changes' },
      ],
    },
    {
      type: 'heading',
      id: 'training-registry-screen',
      level: 2,
      text: 'The training registry screen',
    },
    {
      type: 'paragraph',
      text: 'The Training registry, found under Assurance in the sidebar, shows all training programs in a table. Each row is a training program with key info visible at a glance.',
    },
    {
      type: 'paragraph',
      text: 'The table has these columns:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Training name', text: 'The title of the training program' },
        { bold: 'Duration', text: 'How long the training takes (in hours or days)' },
        { bold: 'Provider', text: 'Who delivers the training (internal team, external vendor, online platform)' },
        { bold: 'Department', text: 'Which department the training is for or organized by' },
        { bold: 'Status', text: 'Current state of the training (Planned, In progress, Completed)' },
        { bold: 'People', text: 'Number of participants' },
      ],
    },
    {
      type: 'image',
      src: '/images/user-guide/training-registry.png',
      alt: 'AI Training Registry page showing a table of training programs with columns for training name, duration, provider, department, status, and number of participants',
      caption: 'The Training registry shows all AI-related training programs across your organization.',
    },
    {
      type: 'heading',
      id: 'training-status',
      level: 2,
      text: 'Training status workflow',
    },
    {
      type: 'paragraph',
      text: 'Training programs move through a simple lifecycle:',
    },
    {
      type: 'icon-cards',
      items: [
        {
          icon: 'Calendar',
          title: 'Planned',
          description: 'Training is scheduled but hasn\'t started yet.',
        },
        {
          icon: 'PlayCircle',
          title: 'In progress',
          description: 'Training is underway. Participants are actively engaged.',
        },
        {
          icon: 'CheckCircle',
          title: 'Completed',
          description: 'Training is done. All sessions have been delivered.',
        },
      ],
    },
    {
      type: 'heading',
      id: 'adding-training',
      level: 2,
      text: 'Adding a training program',
    },
    {
      type: 'paragraph',
      text: 'To add a new training program:',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Click "New training" in the toolbar' },
        { text: 'Enter a training name that clearly describes the program' },
        { text: 'Specify the duration' },
        { text: 'Enter the provider (who delivers the training)' },
        { text: 'Select the department' },
        { text: 'Set the status (Planned, In progress or Completed)' },
        { text: 'Enter the number of participants' },
        { text: 'Add a description with details about content and objectives' },
        { text: 'Save the training record' },
      ],
    },
    {
      type: 'callout',
      variant: 'info',
      text: 'Only users with Admin or Editor roles can add new training programs.',
    },
    {
      type: 'heading',
      id: 'training-fields',
      level: 2,
      text: 'Training record fields',
    },
    {
      type: 'paragraph',
      text: 'Each training record includes:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Training name', text: 'A clear, descriptive title' },
        { bold: 'Duration', text: 'The length of the training (e.g., 2 hours, 1 day, 2 weeks)' },
        { bold: 'Provider', text: 'The organization or team delivering the training' },
        { bold: 'Department', text: 'The department organizing or participating in the training' },
        { bold: 'Status', text: 'Current lifecycle stage (Planned, In progress, Completed)' },
        { bold: 'Number of people', text: 'How many participants are enrolled or have completed the training' },
        { bold: 'Description', text: 'Details about content, objectives and outcomes' },
      ],
    },
    {
      type: 'heading',
      id: 'filtering-searching',
      level: 2,
      text: 'Filtering and searching',
    },
    {
      type: 'paragraph',
      text: 'The training registry gives you several ways to find specific programs:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Filter', text: 'Filter by training name, status, provider, department or duration' },
        { bold: 'Group by', text: 'Group programs by status, provider or department' },
        { bold: 'Search', text: 'Search for programs by name' },
      ],
    },
    {
      type: 'callout',
      variant: 'tip',
      title: 'Finding relevant training',
      text: 'Use "Group by" to organize training by department and quickly see what each team has completed. Group by status to find planned training that needs scheduling or in-progress training that needs monitoring.',
    },
    {
      type: 'heading',
      id: 'editing-deleting',
      level: 2,
      text: 'Editing and deleting training records',
    },
    {
      type: 'paragraph',
      text: 'To edit a training record, click on it in the table to open the detail view. Make your changes and save. Common updates include changing status as training moves forward or updating the participant count.',
    },
    {
      type: 'paragraph',
      text: 'To delete a training record, use the delete action in the table. Think about whether you want to keep completed records for historical reference and audits before deleting.',
    },
    {
      type: 'heading',
      id: 'uploading-evidence',
      level: 2,
      text: 'Uploading training evidence',
    },
    {
      type: 'paragraph',
      text: 'Each training record has an Evidence tab where you can attach supporting documents such as certificates, attendance records and assessment results. This gives auditors direct proof that the training actually took place and that participants completed it.',
    },
    {
      type: 'paragraph',
      text: 'To upload evidence:',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Open a training record and switch to the Evidence tab' },
        { text: 'Click "Upload evidence"' },
        { text: 'Enter an evidence name that identifies the document' },
        { text: 'Choose an evidence type (see the list below)' },
        { text: 'Optionally add a description with notes about the evidence' },
        { text: 'Optionally set an expiry date for time-sensitive evidence such as certifications' },
        { text: 'Drag and drop files into the upload area, or click to browse' },
        { text: 'Save the evidence' },
      ],
    },
    {
      type: 'heading',
      id: 'evidence-types',
      level: 3,
      text: 'Evidence types',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Training certificate', text: 'A formal certificate of completion issued by the training provider' },
        { bold: 'Attendance record', text: 'A sign-in sheet, register or other proof that participants attended' },
        { bold: 'Course completion', text: 'A summary report confirming the course was finished' },
        { bold: 'Assessment result', text: 'Test or quiz results showing participants met the required level' },
        { bold: 'Other', text: 'Any other supporting documentation that does not fit the categories above' },
      ],
    },
    {
      type: 'callout',
      variant: 'tip',
      title: 'Set expiry dates for renewable certifications',
      text: 'When evidence covers a certification that expires (for example, an annual AI ethics training certificate), set the expiry date so you get a reminder when renewal is needed.',
    },
    {
      type: 'paragraph',
      text: 'You can upload multiple files per evidence record. Use "Add more files" to attach additional documents, or remove individual files before saving. To remove or replace evidence later, open the training record and use the delete action next to each evidence entry.',
    },
    {
      type: 'heading',
      id: 'common-training-types',
      level: 2,
      text: 'Common AI training topics',
    },
    {
      type: 'paragraph',
      text: 'Organizations typically track training across several AI-related areas:',
    },
    {
      type: 'checklist',
      items: [
        'AI fundamentals and concepts for non-technical staff',
        'AI ethics and responsible AI development',
        'AI risk management and assessment',
        'Regulatory compliance (EU AI Act, ISO 42001, etc.)',
        'Bias detection and mitigation techniques',
        'AI security and privacy considerations',
        'Model development and testing best practices',
        'AI incident response and escalation',
        'Human oversight of AI systems',
        'AI transparency and explainability',
      ],
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
        { bold: 'Document all AI training', text: 'Record both formal programs and informal learning related to AI governance' },
        { bold: 'Track by role', text: 'Make sure training fits different roles (developers, managers, compliance staff)' },
        { bold: 'Update status promptly', text: 'Keep training status current so the registry reflects reality' },
        { bold: 'Include external training', text: 'Record training from external providers and conferences, not just internal programs' },
        { bold: 'Link to compliance', text: 'Note which programs satisfy specific regulatory or framework requirements' },
        { bold: 'Plan ahead', text: 'Use Planned status to schedule future training and keep development going' },
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
      id: 'faq-required',
      level: 3,
      text: 'What training is required for AI compliance?',
    },
    {
      type: 'paragraph',
      text: 'It depends on the regulation and your organization\'s AI activities. The EU AI Act requires providers of high-risk AI systems to make sure staff have sufficient AI literacy. ISO 42001 requires organizations to determine the competence needed for roles affecting AI management. Start by identifying which regulations apply to you, then figure out what training your teams need.',
    },
    {
      type: 'heading',
      id: 'faq-frequency',
      level: 3,
      text: 'How often should AI training be refreshed?',
    },
    {
      type: 'paragraph',
      text: 'AI technology and regulations move fast, so training should be refreshed more often than typical corporate training. Annual refreshers for core topics is a good baseline, with extra sessions when major regulatory changes happen or new AI technologies are adopted. Use the registry to track when refreshers are due.',
    },
    {
      type: 'heading',
      id: 'faq-who',
      level: 3,
      text: 'Who needs AI training?',
    },
    {
      type: 'paragraph',
      text: 'Anyone involved in developing, deploying, using or governing AI systems should get appropriate training. That includes data scientists and engineers, product managers, compliance and legal staff and executives making AI governance decisions. Tailor the content to each role\'s responsibilities.',
    },
    {
      type: 'heading',
      id: 'faq-evidence',
      level: 3,
      text: 'How do we demonstrate training compliance to auditors?',
    },
    {
      type: 'paragraph',
      text: 'The training registry gives auditors what they need. Share the registry to show what training was completed, who took part and when. Keep training materials and attendance records as backup evidence. The registry works as a summary with details available on request.',
    },
    {
      type: 'heading',
      id: 'faq-external',
      level: 3,
      text: 'Should we track external training and certifications?',
    },
    {
      type: 'paragraph',
      text: 'Yes. External training, conferences, certifications and self-directed learning all build your organization\'s AI competency. Record them in the registry with the provider field showing the external source. This gives a complete picture of your team\'s AI knowledge.',
    },
    {
      type: 'article-links',
      title: 'Related articles',
      items: [
        {
          collectionId: 'compliance',
          articleId: 'iso-42001',
          title: 'ISO 42001 certification',
          description: 'Competence requirements for AI management systems',
        },
        {
          collectionId: 'policies',
          articleId: 'policy-management',
          title: 'Policy management basics',
          description: 'Create training-related policies',
        },
      ],
    },
  ],
};
