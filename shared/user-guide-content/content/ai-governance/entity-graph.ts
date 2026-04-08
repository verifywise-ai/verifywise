import type { ArticleContent } from '@user-guide-content/contentTypes';

export const entityGraphContent: ArticleContent = {
  blocks: [
    {
      type: 'heading',
      id: 'overview',
      level: 2,
      text: 'Overview',
    },
    {
      type: 'paragraph',
      text: 'The Entity Graph provides an interactive visualization of relationships between entities in your AI governance system. It helps you understand how use cases, models, vendors, risks, and compliance frameworks are connected.',
    },
    {
      type: 'paragraph',
      text: 'The graph displays your governance data as an interactive network diagram. Each entity appears as a node, and the connections between them show their relationships. You can explore the graph by clicking, dragging, and zooming.',
    },
    {
      type: 'heading',
      id: 'accessing',
      level: 2,
      text: 'Accessing the Entity Graph',
    },
    {
      type: 'paragraph',
      text: 'The Entity Graph is accessed through the **View relationships** button, available on:',
    },
    {
      type: 'bullet-list',
      items: [
        { text: 'Model inventory rows' },
        { text: 'Vendor rows' },
        { text: 'Risk rows' },
        { text: 'Use case rows' },
      ],
    },
    {
      type: 'paragraph',
      text: 'When you click this button, the graph opens in a full-screen modal, automatically centered on the selected entity.',
    },
    {
      type: 'heading',
      id: 'entity-types',
      level: 2,
      text: 'Entity types',
    },
    {
      type: 'paragraph',
      text: 'The graph displays six types of entities, each with a distinct color:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Use cases', text: '(Green) — Your AI projects and initiatives' },
        { bold: 'Models', text: '(Blue) — AI/ML models in your inventory' },
        { bold: 'Vendors', text: '(Purple) — Third-party AI service providers' },
        { bold: 'Risks', text: '(Red) — Identified project and vendor risks' },
        { bold: 'Evidence', text: '(Orange) — Supporting documentation and files' },
        { bold: 'Frameworks', text: '(Grey) — Compliance frameworks (EU AI Act, ISO, etc.)' },
      ],
    },
    {
      type: 'heading',
      id: 'filtering',
      level: 2,
      text: 'Filtering entities',
    },
    {
      type: 'paragraph',
      text: 'Use the toggle buttons in the top-left panel to show or hide specific entity types. By default, use cases, models, vendors, and risks are visible.',
    },
    {
      type: 'heading',
      id: 'search',
      level: 2,
      text: 'Search',
    },
    {
      type: 'paragraph',
      text: 'Type in the search box to filter entities by name. The search updates as you type.',
    },
    {
      type: 'heading',
      id: 'problems-filter',
      level: 2,
      text: 'Show problems only',
    },
    {
      type: 'paragraph',
      text: 'Enable **Show problems only** to display only entities with issues:',
    },
    {
      type: 'bullet-list',
      items: [
        { text: 'High-risk items' },
        { text: 'Entities with compliance gaps' },
        { text: 'Items requiring attention' },
      ],
    },
    {
      type: 'paragraph',
      text: 'A notification appears explaining what the filter shows.',
    },
    {
      type: 'heading',
      id: 'entity-details',
      level: 2,
      text: 'Entity details',
    },
    {
      type: 'paragraph',
      text: 'Click any entity node to open the detail sidebar on the right. The sidebar displays:',
    },
    {
      type: 'bullet-list',
      items: [
        { text: 'Entity name and type' },
        { text: 'Status or risk level' },
        { text: 'Key details (owner, dates, descriptions)' },
        { text: 'Connected entities with quick navigation' },
      ],
    },
    {
      type: 'heading',
      id: 'navigation',
      level: 2,
      text: 'Navigation',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Pan', text: '— Click and drag the background' },
        { bold: 'Zoom', text: '— Scroll or use the zoom controls (bottom-left)' },
        { bold: 'Mini-map', text: '— Use the overview in the bottom-right corner' },
        { bold: 'Navigate to entity', text: '— Click a connected entity in the sidebar to focus on it' },
        { bold: 'Go to full page', text: '— Click "Go to [entity]" to navigate to the entity\'s dedicated page' },
      ],
    },
    {
      type: 'heading',
      id: 'relationships',
      level: 2,
      text: 'Understanding relationships',
    },
    {
      type: 'paragraph',
      text: 'Lines between entities represent their connections:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Use case → Model', text: '— The use case uses this model' },
        { bold: 'Use case → Vendor', text: '— The vendor provides services for this use case' },
        { bold: 'Entity → Risk', text: '— A risk is associated with this entity' },
        { bold: 'Model → Framework', text: '— The model complies with this framework' },
      ],
    },
    {
      type: 'callout',
      variant: 'tip',
      title: 'Tips',
      text: 'When the graph opens from a specific entity, that entity is highlighted with an orange border. Hover over any node to see additional details in a tooltip. The statistics bar shows how many entities and relationships are currently visible. Drag nodes to rearrange the graph layout.',
    },
    {
      type: 'article-links',
      title: 'Related articles',
      items: [
        {
          collectionId: 'ai-governance',
          articleId: 'model-inventory',
          title: 'Model inventory',
          description: 'Learn how to manage your AI model inventory',
        },
        {
          collectionId: 'risk-management',
          articleId: 'vendor-management',
          title: 'Vendor management',
          description: 'Manage third-party AI vendors and their risks',
        },
        {
          collectionId: 'risk-management',
          articleId: 'risk-assessment',
          title: 'Risk assessment',
          description: 'Evaluate risks associated with your AI systems',
        },
      ],
    },
  ],
};
