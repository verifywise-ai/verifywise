import type { ArticleContent } from '../../contentTypes';

export const aiTrustCenterContent: ArticleContent = {
  blocks: [
    {
      type: 'heading',
      id: 'overview',
      level: 2,
      text: 'Overview',
    },
    {
      type: 'paragraph',
      text: 'The AI trust center is your public-facing transparency portal for AI governance. It lets you share information about your AI practices, policies and commitments with customers, partners, regulators and other stakeholders.',
    },
    {
      type: 'paragraph',
      text: 'With growing AI regulation and public scrutiny, showing responsible AI practices builds trust and sets your organization apart. The trust center makes it easy to tell your AI governance story.',
    },
    {
      type: 'heading',
      id: 'why-trust-center',
      level: 2,
      text: 'Why use an AI Trust Center?',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Build customer trust', text: 'Show your commitment to responsible AI through transparency' },
        { bold: 'Regulatory compliance', text: 'Meet disclosure requirements under the EU AI Act and other regulations' },
        { bold: 'Stand out', text: 'Set yourself apart from competitors by showing governance maturity' },
        { bold: 'Fewer repetitive questions', text: 'Publish information publicly so stakeholders can self-serve' },
      ],
    },
    {
      type: 'heading',
      id: 'accessing-trust-center',
      level: 2,
      text: 'Accessing the AI Trust Center',
    },
    {
      type: 'paragraph',
      text: 'Go to **Assurance > AI trust center** in the sidebar to configure your public transparency portal. You can customize what information to display and generate a shareable link for external stakeholders.',
    },
    {
      type: 'heading',
      id: 'content-sections',
      level: 2,
      text: 'Content sections',
    },
    {
      type: 'paragraph',
      text: 'The AI trust center is configured from a single Overview form, with per-field visibility toggles for each of these content areas:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Introduction', text: 'Share your purpose, AI statement and mission to set the tone for stakeholders' },
        { bold: 'Compliance badges', text: 'Display certifications like EU AI Act, ISO 42001, ISO 27001, SOC 2, GDPR, HIPAA and CCPA' },
        { bold: 'Company description', text: 'Describe your organization, core values and commitment to responsible AI' },
        { bold: 'Privacy and contact', text: 'Link to your privacy policy, terms of service and provide contact details' },
      ],
    },
    {
      type: 'callout',
      variant: 'info',
      text: 'You control exactly what shows up in your trust center. Sensitive or internal-only data is never exposed unless you explicitly configure it.',
    },
    {
      type: 'heading',
      id: 'customization',
      level: 2,
      text: 'Customization options',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Branding', text: 'Upload your logo and customize the header color to match your brand' },
        { bold: 'Title', text: 'Set a custom title for your AI trust center page' },
        { bold: 'Section toggles', text: 'Enable or disable individual sections to control what visitors see' },
        { bold: 'Visibility', text: 'Turn the trust center on or off, when enabled it\'s available at /ai-trust-center' },
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
        { bold: 'Keep it current', text: 'Update your trust center regularly to reflect current practices' },
        { bold: 'Be authentic', text: 'Share genuine commitments and progress, not just marketing copy' },
        { bold: 'Link from your website', text: 'Make the trust center easy to find from your main site' },
        { bold: 'Respond to feedback', text: 'Monitor for stakeholder questions and update content accordingly' },
      ],
    },
  ],
};
