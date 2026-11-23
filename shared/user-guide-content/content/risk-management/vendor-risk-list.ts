import type { ArticleContent } from '../../contentTypes';

export const vendorRiskListContent: ArticleContent = {
  blocks: [
    {
      type: 'heading',
      id: 'overview',
      level: 2,
      text: 'Overview',
    },
    {
      type: 'paragraph',
      text: 'The Risks tab of the Vendors page lists the risks of all your vendors. Each risk belongs to one vendor and shows once, even when its vendor serves several use cases.',
    },
    {
      type: 'heading',
      id: 'summary-cards',
      level: 2,
      text: 'Summary cards',
    },
    {
      type: 'paragraph',
      text: 'The cards above the table count risks by risk level: Total, Very high, High, Medium, Low and No risk. Select a card to show only the risks at that level. Select it again, or select Total, to show every risk.',
    },
    {
      type: 'paragraph',
      text: 'The cards follow the status filter and the use case filter. Search and the other filters narrow the table but not the cards.',
    },
    {
      type: 'heading',
      id: 'insights',
      level: 2,
      text: 'Insights',
    },
    {
      type: 'paragraph',
      text: 'Four sections sit between the cards and the table. Each one opens when you select it, and your browser remembers which ones you left open.',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Heat map', text: 'Places each risk by likelihood and severity. Select a cell to show only its risks in the table; select it again to show every risk.' },
        { bold: 'Blast radius', text: 'For each vendor, how many project risks inherit from its risks and which use cases they sit in. Admins also get a "View on map" link to the risk inheritance graph.' },
        { bold: 'Duplicate vendor risks', text: 'Pairs of one vendor\'s risks that read like the same risk entered twice. Nothing is merged or deleted for you: open either risk to clean up.' },
        { bold: 'Framework coverage', text: 'Active vendor risks that aren\'t mapped to a framework. Coverage gaps are risks whose vendor serves a use case with a framework attached; the rest have no framework to map to yet.' },
      ],
    },
    {
      type: 'heading',
      id: 'finding-risks',
      level: 2,
      text: 'Finding risks',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Status', text: 'Active only (the default), Active + deleted or Deleted only.' },
        { bold: 'Filter', text: 'Use case, risk description, vendor, risk severity, risk level and action owner. The use case filter here is separate from the one on the Vendors tab.' },
        { bold: 'Search', text: 'Matches the risk description.' },
        { bold: 'Columns', text: 'Show or hide the vendor, use case, action owner, risk severity, risk level and inherited by columns. Risk description always shows.' },
      ],
    },
    {
      type: 'heading',
      id: 'table-columns',
      level: 2,
      text: 'Table columns',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Risk description', text: 'Hover to read the full text.' },
        { bold: 'Vendor', text: 'The vendor the risk belongs to.' },
        { bold: 'Use case', text: 'The use cases the vendor serves. When there are several, the first shows with a count of the rest; hover to see them all.' },
        { bold: 'Action owner', text: 'The person responsible for the action plan.' },
        { bold: 'Risk severity', text: 'The severity you picked.' },
        { bold: 'Risk level', text: 'Set from the likelihood and severity.' },
        { bold: 'Inherited by', text: 'How many project risks are confirmed as children of this risk. Select it to open the risk\'s Linked risks tab. A risk with only suggestions shows how many are suggested.' },
      ],
    },
    {
      type: 'paragraph',
      text: 'Custom fields for vendor risks appear as extra columns. Select a column heading to sort by it, and select a row to open the risk.',
    },
    {
      type: 'heading',
      id: 'exporting',
      level: 2,
      text: 'Exporting',
    },
    {
      type: 'paragraph',
      text: 'Export downloads the risks the table shows after the status filter, search, filters, card and heat map cell, each risk once. The file has the risk description, vendor, use case, action owner, risk severity, likelihood and risk level.',
    },
    {
      type: 'heading',
      id: 'adding-risks',
      level: 2,
      text: 'Adding and editing a risk',
    },
    {
      type: 'paragraph',
      text: 'Select "Add new risk" and fill in:',
    },
    {
      type: 'ordered-list',
      items: [
        { bold: 'Vendor', text: 'The vendor the risk belongs to. If there are no vendors yet, add one on the Vendors tab first.' },
        { bold: 'Action owner', text: 'The person responsible for the action plan' },
        { bold: 'Risk description', text: 'What could go wrong with this vendor' },
        { bold: 'Action plan', text: 'The steps or controls that reduce the risk' },
        { bold: 'Impact description', text: 'What happens if the risk occurs' },
        { bold: 'Applicable frameworks', text: 'Optional. The organization-level frameworks the risk applies to' },
        { bold: 'Likelihood and severity', text: 'These set the risk level. The level is a weighted score: likelihood plus three times severity' },
      ],
    },
    {
      type: 'paragraph',
      text: 'All fields except the frameworks are required. The Custom fields tab holds your organization\'s vendor risk fields. An existing risk also has an Activity tab and a Linked risks tab. Select a row to edit its risk.',
    },
    {
      type: 'heading',
      id: 'deleting-restoring',
      level: 2,
      text: 'Deleting and restoring',
    },
    {
      type: 'paragraph',
      text: 'Delete a risk from its row menu. It moves to the deleted risks. To see them, pick Deleted only or Active + deleted in the status filter; deleted rows are struck through.',
    },
    {
      type: 'paragraph',
      text: 'A deleted risk opens read-only and has no Linked risks tab. Choose Restore in its row menu, or Restore in the risk window, to bring it back. Its Activity tab records the delete and the restore.',
    },
    {
      type: 'heading',
      id: 'permissions',
      level: 2,
      text: 'Who can do what',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'View the tab, the insights and the risks, and export', text: 'Everyone who can open the Vendors page' },
        { bold: 'Add, edit, delete and restore risks', text: 'Admins and Editors, or a custom role with the vendor.edit permission. Adding also needs at least one use case' },
        { bold: '"View on map" in Blast radius', text: 'Admins' },
      ],
    },
    {
      type: 'paragraph',
      text: 'Without vendor.edit, "Add new risk" is disabled, rows have no menu and a risk opens read-only. Who can link risks is covered in Vendor risk assessment.',
    },
    {
      type: 'article-links',
      title: 'Related articles',
      items: [
        {
          collectionId: 'risk-management',
          articleId: 'vendor-risks',
          title: 'Vendor risk assessment',
          description: 'Scorecards, risk levels and linked risks',
        },
        {
          collectionId: 'risk-management',
          articleId: 'vendor-management',
          title: 'Vendor management',
          description: 'Manage your complete vendor registry',
        },
      ],
    },
  ],
};
