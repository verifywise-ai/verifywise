import type { ArticleContent } from '../../contentTypes';

export const homeContent: ArticleContent = {
  blocks: [
    {
      type: 'heading',
      id: 'overview',
      level: 2,
      text: 'What Home shows',
    },
    {
      type: 'paragraph',
      text: 'Home answers one question: what needs me today? It has two tabs. **Today** lists the items that are waiting on you, from the approval workflows, tasks, intake, risks, policies, vendors, incidents and model risk findings you work in. **Get started** holds the setup checklist, short videos and shortcuts that used to live on the Start here page.',
    },
    {
      type: 'paragraph',
      text: 'Click "Home" at the top of the sidebar to open it. In the classic look the sidebar keeps the Start here item instead, which opens the same Get started content. Each tab has its own link, so `/home` opens Today and `/home?tab=get-started` opens Get started.',
    },
    {
      type: 'heading',
      id: 'needs-your-attention',
      level: 2,
      text: 'Needs your attention',
    },
    {
      type: 'paragraph',
      text: 'The list on the Today tab only contains items that are yours. Each row shows a title, one line of context (the module, the reason and a due date or how long it has been waiting) and a link that opens the record where you act. Home does not approve or change anything itself.',
    },
    {
      type: 'paragraph',
      text: 'Items are sorted with overdue ones first, then by due date (soonest first), then by how long they have been waiting. Overdue items carry an "Overdue" label. Use the "Show" menu to look at one source at a time.',
    },
    {
      type: 'heading',
      id: 'where-items-come-from',
      level: 2,
      text: 'Where each item comes from',
    },
    {
      type: 'table',
      columns: [
        { key: 'source', label: 'Source', width: '170px' },
        { key: 'rule', label: 'What puts an item on your list' },
      ],
      rows: [
        { source: 'Approvals', rule: 'An approval request is waiting on your decision at its current step and you have not answered yet. Requests you raised are not listed.' },
        { source: 'Tasks', rule: 'A task assigned to you that is Open, In progress or Overdue. It shows as overdue when its due date has passed.' },
        { source: 'Intake', rule: 'A submission waiting for your first review, or an approved submission with a second review open that you are asked to do. Only people who can edit intake forms see this source. When review routing is on, a submission appears for the reviewers named on its lane.' },
        { source: 'AI risks', rule: 'A risk you own that is Not started or Requires review, or whose deadline has passed and is not Completed or Canceled.' },
        { source: 'Policy reviews', rule: 'A policy you own or are assigned to review that is not archived or deprecated, with a next review date within the next 14 days or already past.' },
        { source: 'Vendor reviews', rule: 'A vendor you are the reviewer of (or the assignee, when no reviewer is set) with a review date within the next 14 days or already past. A vendor marked Reviewed leaves the list once its review date has passed.' },
        { source: 'Incidents', rule: 'An incident assigned to you that is not Closed and not archived.' },
        { source: 'Model risk findings', rule: 'A model risk management finding you own that is not Resolved or Closed.' },
      ],
    },
    {
      type: 'paragraph',
      text: 'A source only appears if you can see it. If one source cannot be loaded, Home says so under the list, for example "Incidents couldn\'t be loaded", instead of showing it as empty. "Nothing needs you right now." only appears when every source answered and none had anything for you.',
    },
    {
      type: 'heading',
      id: 'counts',
      level: 2,
      text: 'The counts strip',
    },
    {
      type: 'paragraph',
      text: 'Below the list, a strip of counts is grouped as Record, Track and Enforce. Unlike the list, these counts cover the whole organization, not only your items. Each one links to the page behind it.',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Record', text: 'Intake waiting (submissions pending a first decision, shown to people who can edit intake forms), agents to review and AI on the record (use cases, models, AI apps and agents together; rejected agents are not counted).' },
        { bold: 'Track', text: 'Risks needing attention (not started, or past their deadline and not completed or canceled) and vendor reviews due.' },
        { bold: 'Enforce', text: 'Policy reviews due and prompts blocked or masked by AI Gateway guardrails in the last 24 hours. The prompts count is left out when AI Gateway is not set up for your deployment.' },
      ],
    },
    {
      type: 'paragraph',
      text: 'A dash in place of a number means that count could not be loaded when the page opened. It is never a zero.',
    },
    {
      type: 'callout',
      variant: 'info',
      title: 'Not shown on Home yet',
      text: 'Agent approvals, Advisor AI approvals, evidence that is about to expire, training, AI Detection and Shadow AI decisions, post-market monitoring and FRIA are not part of the list yet. Open those modules directly. Agent approvals are decided in AI Gateway.',
    },
    {
      type: 'heading',
      id: 'refreshing',
      level: 2,
      text: 'When the list updates',
    },
    {
      type: 'paragraph',
      text: 'Home reloads every time you open it, and when you come back to the browser tab and the data is more than a minute old. After you finish an item in another page, return to Home to see it leave the list.',
    },
    {
      type: 'heading',
      id: 'get-started',
      level: 2,
      text: 'The Get started tab',
    },
    {
      type: 'paragraph',
      text: 'Get started has the onboarding checklist with your progress, a notice if no LLM API key is set up yet, introductory videos, shortcuts to the main modules and links to the user guide. You can open it any time, including from the empty state of the Today tab.',
    },
    {
      type: 'article-links',
      title: 'Continue reading',
      items: [
        {
          collectionId: 'getting-started',
          articleId: 'quick-start',
          title: 'Quick start guide',
          description: 'Create your first use case and attach a framework',
        },
        {
          collectionId: 'getting-started',
          articleId: 'dashboard',
          title: 'Navigating the dashboard',
          description: 'The dashboard, its views and the governance score',
        },
      ],
    },
  ],
};
