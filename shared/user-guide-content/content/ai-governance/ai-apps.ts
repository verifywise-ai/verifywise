import type { ArticleContent } from '../../contentTypes';

export const aiAppsContent: ArticleContent = {
  blocks: [
    {
      type: 'heading',
      id: 'overview',
      level: 2,
      text: 'Overview',
    },
    {
      type: 'paragraph',
      text: 'The AI apps inventory is where you track the AI applications your teams use, whether you add them yourself or promote them from shadow AI monitoring. Each app records who owns it, which vendor provides it, how it was found and where it sits in your approval process.',
    },
    {
      type: 'paragraph',
      text: 'Each app also links to the models it runs on, the policies that apply to it and the data types it can access, plus a risk score you set. That gives you one record per app to work from.',
    },
    {
      type: 'heading',
      id: 'accessing',
      level: 2,
      text: 'Accessing the AI apps inventory',
    },
    {
      type: 'paragraph',
      text: 'Open **AI apps** from the sidebar. You get a table of every app, with a search box, a status filter and a **New AI app** button. Click a row to edit an app, or use the actions on each row to edit it, open the detail page or delete it.',
    },
    {
      type: 'heading',
      id: 'adding-app',
      level: 2,
      text: 'Adding an AI app',
    },
    {
      type: 'paragraph',
      text: 'Select **New AI app** and complete the form. Only the name is required; the other fields can be filled in now or later.',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Name', text: 'The name of the application, for example "ChatGPT Enterprise". This must be unique within your organization.' },
        { bold: 'Description', text: 'What the app is used for.' },
        { bold: 'Vendor', text: 'The vendor that provides the app, selected from your vendor records.' },
        { bold: 'Owner', text: 'The person responsible for the app, selected from your users.' },
        { bold: 'Status', text: 'Where the app sits in your approval process: draft, under review, approved, restricted, or banned.' },
        { bold: 'Discovered source', text: 'How the app was found: manual, shadow AI, employee report, SSO, proxy, or firewall.' },
        { bold: 'Required training', text: 'Any training a user must complete before using the app.' },
      ],
    },
    {
      type: 'callout',
      variant: 'info',
      text: 'Every field you set when adding an app can be changed afterwards. Click the app or use the edit action to reopen the form.',
    },
    {
      type: 'heading',
      id: 'statuses',
      level: 2,
      text: 'App statuses',
    },
    {
      type: 'paragraph',
      text: 'The status tracks where an app is in your governance process. You can change it from the form or from the detail page.',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Draft', text: 'The app has been added but not yet reviewed.' },
        { bold: 'Under review', text: 'The app is being assessed for approval.' },
        { bold: 'Approved', text: 'The app is cleared for use.' },
        { bold: 'Restricted', text: 'The app may be used only under specific conditions.' },
        { bold: 'Banned', text: 'The app must not be used.' },
      ],
    },
    {
      type: 'heading',
      id: 'lifecycle',
      level: 2,
      text: 'Lifecycle: in review, planned, live, retired',
    },
    {
      type: 'paragraph',
      text: 'Next to its status, every app has a lifecycle stage. The AI apps page splits the inventory into four tabs with counts: In review, Planned, Live and Retired. Status says whether an app may be used; the lifecycle says whether it is in use.',
    },
    {
      type: 'paragraph',
      text: 'On the app detail page, choose Mark as live and pick the go-live date (today or earlier), Confirm still live, or Retire. Admins, Editors and the app owner can change the lifecycle; Auditors cannot.',
    },
    {
      type: 'paragraph',
      text: 'Live apps take part in the same still-live check as use cases: when nobody has confirmed a live app within the interval set under Settings, Organization, Still-live check (30, 90 or 180 days, default 90), it is marked Stale and its owner gets one email per interval asking them to confirm it or retire it.',
    },
    {
      type: 'paragraph',
      text: 'The status moves the stage where its meaning is clear: setting an app to Under review puts a planned app in In review, leaving Under review brings it back to Planned, and banning an app retires it, which also stops its still-live checks. Approved and Restricted do not mark an app live; mark the ones in use as live yourself. Existing apps were placed the same way when the lifecycle arrived.',
    },
    {
      type: 'paragraph',
      text: 'Employees can also request an app through an intake form of type AI app. Approving the request creates the app as Approved and Planned, with the requester answers for name, description and departments, and the approver as owner.',
    },
    {
      type: 'heading',
      id: 'detail-page',
      level: 2,
      text: 'The app detail page',
    },
    {
      type: 'paragraph',
      text: 'Open an app\'s detail page from the **Details** action on its row. The page shows summary cards (status, vendor, owner, risk score, discovered source and required training) and four sections for governing the app.',
    },
    {
      type: 'heading',
      id: 'model-dependencies',
      level: 3,
      text: 'Model dependencies',
    },
    {
      type: 'paragraph',
      text: 'Link the app to the models it runs on, selected from your model inventory. Use the **Linked models** field to add or remove models, then select **Save dependencies**. The linked models appear in the table below with their provider, model, version and status.',
    },
    {
      type: 'heading',
      id: 'policy-mapping',
      level: 3,
      text: 'Policy mapping',
    },
    {
      type: 'paragraph',
      text: 'Mark which of your policies apply to the app. Each policy has an **Applicable** toggle; turn it on for the policies that govern this app and select **Save mapping**. When the app\'s name matches a known tool, suggested policies appear in a panel above the table as a starting point.',
    },
    {
      type: 'heading',
      id: 'risk-assessment',
      level: 3,
      text: 'Risk assessment',
    },
    {
      type: 'paragraph',
      text: 'Score the app\'s risk across a set of criteria using the sliders. The page shows both the current saved score and the score calculated from your slider positions. Select **Save assessment** to store it. The saved score appears on the summary card and in the list.',
    },
    {
      type: 'heading',
      id: 'data-exposure',
      level: 3,
      text: 'Data exposure',
    },
    {
      type: 'paragraph',
      text: 'Record which data types the app can access, such as public data, internal data, confidential data or customer PII. Each new app starts with a default set of data types that you can adjust.',
    },
    {
      type: 'heading',
      id: 'shadow-ai',
      level: 2,
      text: 'Promoting a shadow AI tool',
    },
    {
      type: 'paragraph',
      text: 'When shadow AI monitoring finds a tool in use, you can promote it into the AI apps inventory so it becomes a governed app. The promoted app keeps a link back to the shadow AI tool it came from, and its discovered source is recorded as shadow AI.',
    },
    {
      type: 'heading',
      id: 'editing-deleting',
      level: 2,
      text: 'Editing and deleting apps',
    },
    {
      type: 'paragraph',
      text: 'Click any row, or use the **Edit** action, to reopen the form and change the app\'s details. Use the **Delete** action to remove an app; you are asked to confirm before the app is deleted.',
    },
    {
      type: 'callout',
      variant: 'warning',
      text: 'Deleting an app also removes its linked models, policy mappings, data exposure records and department records. This cannot be undone.',
    },
  ],
};
