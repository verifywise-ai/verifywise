import type { ArticleContent } from '../../contentTypes';

export const governanceOsContent: ArticleContent = {
  blocks: [
    {
      type: 'heading',
      id: 'overview',
      level: 2,
      text: 'Overview',
    },
    {
      type: 'paragraph',
      text: 'Core Governance OS is the cross-framework intelligence layer that connects EU AI Act, ISO 42001, ISO 27001, and NIST AI RMF into a unified governance view. Instead of managing each framework independently, Governance OS shows you where controls overlap, recommends which frameworks to prioritize, and measures coverage across your projects.',
    },
    {
      type: 'paragraph',
      text: 'The module has three main tools: Framework Mapper for exploring control relationships, Scenario Builder for getting governance recommendations, and Unified Insights for per-project coverage analysis.',
    },
    {
      type: 'heading',
      id: 'framework-mapper',
      level: 2,
      text: 'Framework Mapper',
    },
    {
      type: 'paragraph',
      text: 'The Framework Mapper shows how controls in one framework relate to controls in another. Select a source and target framework to see all known mappings between them.',
    },
    {
      type: 'heading',
      id: 'mapping-strength',
      level: 3,
      text: 'Mapping strength',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Direct', text: 'The controls address the same requirement. Implementing one fully satisfies the other.' },
        { bold: 'Partial', text: 'The controls overlap but each has unique aspects. You get partial credit toward the other.' },
        { bold: 'Related', text: 'The controls cover similar topics but from different angles. Useful context but not a substitute.' },
      ],
    },
    {
      type: 'heading',
      id: 'domain-filtering',
      level: 3,
      text: 'Domain filtering',
    },
    {
      type: 'paragraph',
      text: 'Mappings are tagged with governance domains (like data governance, transparency, or risk management). Click a domain tile to filter the list and focus on one area at a time. Click again to clear the filter.',
    },
    {
      type: 'heading',
      id: 'scenario-builder',
      level: 2,
      text: 'Scenario Builder',
    },
    {
      type: 'paragraph',
      text: 'The Scenario Builder helps you decide which frameworks to adopt and in what order. It uses a rule-based recommendation engine that considers your industry, region, risk level, and use case type.',
    },
    {
      type: 'heading',
      id: 'getting-recommendations',
      level: 3,
      text: 'Getting recommendations',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Select your industry, region, risk level, and use case type from the dropdowns. You can leave fields blank to broaden results.' },
        { text: 'Click Get Recommendations. The engine scores each pre-built scenario against your criteria.' },
        { text: 'Review the results. Each recommended scenario shows a match percentage and which rules it matched.' },
        { text: 'Click Select on the scenario that fits your organization. This saves it as your active governance strategy.' },
      ],
    },
    {
      type: 'heading',
      id: 'scenarios-explained',
      level: 3,
      text: 'What is a scenario?',
    },
    {
      type: 'paragraph',
      text: 'A governance scenario defines a framework priority order: which framework is primary (your main compliance target), which are secondary (supporting frameworks), and which are supplementary (nice-to-have). This priority guides resource allocation and task sequencing.',
    },
    {
      type: 'heading',
      id: 'unified-insights',
      level: 2,
      text: 'Unified Insights',
    },
    {
      type: 'paragraph',
      text: 'Unified Insights provides per-project coverage analysis. Select a project to see how well it covers each of its assigned frameworks.',
    },
    {
      type: 'heading',
      id: 'reading-coverage',
      level: 3,
      text: 'Reading coverage data',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Coverage percentage', text: 'How many controls in that framework have been mapped to implemented controls in the project.' },
        { bold: 'Gaps', text: 'Controls that are required by the framework but not yet addressed. These need attention.' },
        { bold: 'Synergies', text: 'Controls that satisfy requirements in multiple frameworks simultaneously. These represent efficiency gains.' },
      ],
    },
    {
      type: 'heading',
      id: 'refreshing-coverage',
      level: 3,
      text: 'Refreshing coverage',
    },
    {
      type: 'paragraph',
      text: 'Coverage data is computed on demand. Click Refresh Coverage after making changes to your project controls to recalculate the numbers. The summary cards at the top update automatically after a refresh.',
    },
  ],
};
