import type { ArticleContent } from '../../contentTypes';

export const ceMarkingContent: ArticleContent = {
  blocks: [
    {
      type: 'heading',
      id: 'overview',
      level: 2,
      text: 'Overview',
    },
    {
      type: 'paragraph',
      text: 'CE Marking is the EU\'s conformity certification for high-risk AI systems. Before you can market or deploy a high-risk AI system in the EU, you need to classify it, complete a conformity assessment, sign a declaration of conformity, and register it in the EU database.',
    },
    {
      type: 'paragraph',
      text: 'The CE Marking tab in VerifyWise walks you through this process step by step, tracking progress and linking the policies, evidence, and incidents that support your compliance claim.',
    },
    {
      type: 'heading',
      id: 'accessing',
      level: 2,
      text: 'Accessing CE Marking',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Open a project from your dashboard.' },
        { text: 'Click the **CE Marking** tab.' },
        { text: 'The first time you open this tab, a default record is created with all 7 conformity steps set to "Not started."' },
      ],
    },
    {
      type: 'heading',
      id: 'classification',
      level: 2,
      text: 'Classification & scope',
    },
    {
      type: 'paragraph',
      text: 'Start by answering 3 questions that determine your system\'s regulatory scope:',
    },
    {
      type: 'table',
      columns: [
        { key: 'field', label: 'Field', width: '30%' },
        { key: 'description', label: 'What to select', width: '70%' },
      ],
      rows: [
        { field: 'High-risk AI system', description: 'Yes or No. If Yes, the full conformity assessment workflow applies.' },
        { field: 'Role in product', description: 'Is the AI system standalone, a safety component, part of a larger product, or a foundation model in a downstream system?' },
        { field: 'Annex III category', description: 'Which of the 8 high-risk categories applies (biometric ID, critical infrastructure, education, employment, essential services, law enforcement, border control, or justice/democracy).' },
      ],
    },
    {
      type: 'heading',
      id: 'conformity-steps',
      level: 2,
      text: 'Conformity assessment steps',
    },
    {
      type: 'paragraph',
      text: 'The conformity assessment is a 7-step process. Each step can be assigned to a team member with a due date, and tracked through these statuses: Not started, In progress, Completed, or Not needed.',
    },
    {
      type: 'ordered-list',
      items: [
        { text: '**Confirm high-risk classification** — Verify that the system falls under Annex III and requires conformity assessment.' },
        { text: '**Complete EU AI Act checklist** — Work through the applicable controls and requirements.' },
        { text: '**Compile technical documentation** — Assemble the required technical documentation file.' },
        { text: '**Internal review and sign-off** — Internal stakeholders review and approve the documentation.' },
        { text: '**Notified body review** — If required, submit documentation to a notified body for independent review.' },
        { text: '**Sign declaration of conformity** — The authorized signatory signs the formal declaration.' },
        { text: '**Register in EU database** — Submit the system\'s details to the EU database.' },
      ],
    },
    {
      type: 'paragraph',
      text: 'A progress bar at the top shows how many steps are completed out of the total. Click any step row to update its status, owner, due date, or completion date.',
    },
    {
      type: 'heading',
      id: 'declaration',
      level: 2,
      text: 'Declaration of conformity',
    },
    {
      type: 'paragraph',
      text: 'The declaration section tracks the formal document that states your AI system meets EU requirements:',
    },
    {
      type: 'table',
      columns: [
        { key: 'field', label: 'Field', width: '30%' },
        { key: 'description', label: 'What it captures', width: '70%' },
      ],
      rows: [
        { field: 'Status', description: 'Draft, Ready for signature, Signed, or Archived' },
        { field: 'Signatory name', description: 'Who signed the declaration' },
        { field: 'Signed on', description: 'Date the declaration was signed' },
        { field: 'Declaration document', description: 'Link or reference to the signed document' },
      ],
    },
    {
      type: 'heading',
      id: 'registration',
      level: 2,
      text: 'EU database registration',
    },
    {
      type: 'paragraph',
      text: 'After signing the declaration, you register the system in the EU database. Track the registration status here:',
    },
    {
      type: 'table',
      columns: [
        { key: 'field', label: 'Field', width: '30%' },
        { key: 'description', label: 'What it captures', width: '70%' },
      ],
      rows: [
        { field: 'Status', description: 'Not registered, Pending, Registered, or Rejected' },
        { field: 'EU registration ID', description: 'The ID assigned by the EU database' },
        { field: 'Registration date', description: 'When the system was registered' },
        { field: 'EU record URL', description: 'Direct link to the EU database entry' },
      ],
    },
    {
      type: 'heading',
      id: 'linked-resources',
      level: 2,
      text: 'Linking policies, evidence, and incidents',
    },
    {
      type: 'paragraph',
      text: 'At the bottom of the CE Marking page, you can link supporting resources from other parts of VerifyWise:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Policies', text: 'Link governance policies that define how the system is managed and operated.' },
        { bold: 'Evidence', text: 'Attach evidence files that demonstrate compliance with specific requirements.' },
        { bold: 'Incidents', text: 'Connect any incidents that occurred during the system\'s operation.' },
      ],
    },
    {
      type: 'paragraph',
      text: 'These links create a traceable connection between your conformity claim and the documentation that supports it.',
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
        { key: 'action', label: 'Action', width: '50%' },
        { key: 'roles', label: 'Required role', width: '50%' },
      ],
      rows: [
        { action: 'View CE Marking', roles: 'Any authenticated user' },
        { action: 'Update classification and scope', roles: 'Admin or Editor' },
        { action: 'Update conformity steps', roles: 'Admin or Editor' },
        { action: 'Update declaration and registration', roles: 'Admin or Editor' },
        { action: 'Link policies, evidence, incidents', roles: 'Admin or Editor' },
      ],
    },
    {
      type: 'article-links',
      title: 'Related articles',
      items: [
        {
          collectionId: 'compliance',
          articleId: 'eu-ai-act',
          title: 'EU AI Act compliance',
          description: 'Understand the regulation that CE Marking implements.',
        },
        {
          collectionId: 'compliance',
          articleId: 'fria',
          title: 'Fundamental Rights Impact Assessment',
          description: 'Another Article 27 requirement that complements CE Marking.',
        },
        {
          collectionId: 'ai-governance',
          articleId: 'evidence-collection',
          title: 'Evidence collection',
          description: 'Manage the evidence files you link to your CE Marking.',
        },
      ],
    },
  ],
};
