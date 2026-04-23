import type { ArticleContent } from '../../contentTypes';

export const pluginsContent: ArticleContent = {
  blocks: [
    {
      type: 'heading',
      id: 'overview',
      level: 2,
      text: 'Overview',
    },
    {
      type: 'paragraph',
      text: 'Plugins extend VerifyWise with extra compliance frameworks, integrations and features. The marketplace lists everything available. Install the ones you need and they show up in your sidebar and project views.',
    },
    {
      type: 'heading',
      id: 'marketplace',
      level: 2,
      text: 'Browsing the marketplace',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Go to **Plugins** from the sidebar.' },
        { text: 'Click **Marketplace** to see all available plugins.' },
        { text: 'Each plugin card shows the name, description, version and category.' },
        { text: 'Click a plugin to see its full description and requirements.' },
      ],
    },
    {
      type: 'heading',
      id: 'installing',
      level: 2,
      text: 'Installing a plugin',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Find the plugin in the marketplace.' },
        { text: 'Click **Install**.' },
        { text: 'The plugin downloads and installs automatically.' },
        { text: 'Once installed, it appears under **My plugins** and its features become available in the relevant parts of the app.' },
      ],
    },
    {
      type: 'heading',
      id: 'types',
      level: 2,
      text: 'Types of plugins',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Framework plugins', text: 'Add compliance frameworks like SOC 2, GDPR, HIPAA, PCI DSS, NYC Local Law 144 or Saudi PDPL. Once installed, these appear as framework options when configuring projects.' },
        { bold: 'Integration plugins', text: 'Connect VerifyWise to external tools and services (e.g., Azure AI Foundry).' },
        { bold: 'Utility plugins', text: 'Add features like risk import tools or specialized reporting.' },
      ],
    },
    {
      type: 'heading',
      id: 'managing',
      level: 2,
      text: 'Managing installed plugins',
    },
    {
      type: 'paragraph',
      text: 'Under **My plugins**, you can see everything you\'ve installed. Click **Manage** on any plugin to view its configuration, check for updates or uninstall it.',
    },
    {
      type: 'callout',
      variant: 'info',
      title: 'Plugin data',
      text: 'Uninstalling a plugin removes its features from the interface but doesn\'t delete any data created while it was active. Your compliance records and assessments are preserved.',
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
        { action: 'Browse marketplace', roles: 'Any authenticated user' },
        { action: 'Install or uninstall plugins', roles: 'Admin' },
        { action: 'Manage plugin settings', roles: 'Admin' },
      ],
    },
  ],
};
