import type { ArticleContent } from '../../contentTypes';

export const extensionsContent: ArticleContent = {
  blocks: [
    {
      type: 'heading',
      id: 'overview',
      level: 2,
      text: 'Overview',
    },
    {
      type: 'paragraph',
      text: 'Extensions are optional features built into VerifyWise. Some connect VerifyWise to tools you already use (Slack, MLflow, Azure AI Foundry, Jira Assets, Jira incidents). Others add extra tools inside the app (Model Lifecycle, Risk Import, Dataset Bulk Upload).',
    },
    {
      type: 'paragraph',
      text: 'All eight extensions ship with VerifyWise, so there is nothing to download or install. Each one stays off until an Admin enables it for the organization.',
    },
    {
      type: 'callout',
      variant: 'info',
      title: 'Admin only',
      text: 'Only Admins can open the Extensions page and enable, configure or disable extensions. Other roles see the Extensions button greyed out with the tooltip "Admin access required."',
    },
    {
      type: 'callout',
      variant: 'tip',
      title: 'Looking for compliance frameworks?',
      text: 'Frameworks such as SOC 2, GDPR and HIPAA are not extensions. They are built in and available to every organization. See **Adding frameworks** to add one to your organization or a use case.',
    },
    {
      type: 'heading',
      id: 'finding-extensions',
      level: 2,
      text: 'Finding extensions',
    },
    {
      type: 'paragraph',
      text: 'There are two ways to open the **Extensions** page:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Header', text: 'Click the **Extensions** button (package icon) in the top header. Its tooltip reads "Enable or disable extensions for your organization."' },
        { bold: 'Start here', text: 'Open **Start here** in the sidebar and click the **Extensions** card.' },
      ],
    },
    {
      type: 'paragraph',
      text: 'The page lists one card per extension. Each card shows the extension name, its category and version (for example "ML Ops · v1.0.0"), and " · Configuration required" when you need to fill in settings before you can enable it. Enabled extensions carry an **Enabled** badge.',
    },
    {
      type: 'heading',
      id: 'enabling',
      level: 2,
      text: 'Enabling and configuring an extension',
    },
    {
      type: 'paragraph',
      text: 'The buttons on each card depend on the extension and its state:',
    },
    {
      type: 'table',
      columns: [
        { key: 'button', label: 'Button', width: '30%' },
        { key: 'meaning', label: 'What it does', width: '70%' },
      ],
      rows: [
        { button: 'Enable', meaning: 'Turns the extension on straight away. Shown when the extension needs no settings up front.' },
        { button: 'Configure to enable', meaning: 'Opens the settings page so you can fill in the required settings, then enable. Shown for MLflow and Azure AI Foundry.' },
        { button: 'Configure', meaning: 'Opens the settings page of an enabled extension that has settings.' },
        { button: 'Disable', meaning: 'Turns the extension off. Shown once the extension is enabled.' },
      ],
    },
    {
      type: 'paragraph',
      text: 'The settings page (reached through **Configure** or **Configure to enable**) has a **Back to extensions** link and, depending on the extension:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Configuration', text: 'A form with the extension\'s connection settings. Password and token fields are stored encrypted. Leave a secret field blank to keep the existing value.' },
        { bold: 'Extension panel', text: 'Slack, Model Lifecycle, Jira Assets and Jira incidents show their own setup panel here once enabled.' },
        { bold: 'Enable / Disable', text: 'Turns the extension on or off.' },
        { bold: 'Save configuration', text: 'Saves changes to the Configuration form after the extension is enabled. You see "Configuration saved." when it works.' },
        { bold: 'Test connection', text: 'Checks the saved settings against the external service. Available for MLflow, Azure AI Foundry and Jira incidents. Jira Assets has its own **Test Connection** button in its panel, and Jira incidents also has a **Test connection** button in its panel that checks the values you have typed before you save them.' },
      ],
    },
    {
      type: 'paragraph',
      text: 'If something goes wrong, the page shows the error returned by the server, or a short message such as "Enable failed", "Save failed" or "Test failed".',
    },
    {
      type: 'heading',
      id: 'disabling',
      level: 2,
      text: 'Disabling an extension',
    },
    {
      type: 'paragraph',
      text: 'Click **Disable** on the card or on the settings page. The extension turns off immediately, without a confirmation step, and its tabs, buttons and menu items disappear from the app.',
    },
    {
      type: 'callout',
      variant: 'success',
      title: 'Disabling keeps your data',
      text: 'Disabling does not delete anything. The extension\'s configuration and any data it created stay in place, and everything comes back when you enable it again. There is no uninstall.',
    },
    {
      type: 'heading',
      id: 'available-extensions',
      level: 2,
      text: 'Available extensions',
    },
    {
      type: 'table',
      columns: [
        { key: 'name', label: 'Extension', width: '28%' },
        { key: 'category', label: 'Category', width: '22%' },
        { key: 'summary', label: 'What it does', width: '50%' },
      ],
      rows: [
        { name: 'Slack', category: 'Communication', summary: 'Sends VerifyWise notifications to Slack channels' },
        { name: 'MLflow', category: 'ML Ops', summary: 'Pulls models and runs from an MLflow tracking server' },
        { name: 'Azure AI Foundry', category: 'ML Ops', summary: 'Imports model deployments from an Azure AI Foundry project' },
        { name: 'Model Lifecycle', category: 'ML Ops', summary: 'Adds configurable lifecycle phases to each model' },
        { name: 'Risk Import', category: 'Data management', summary: 'Creates risks in bulk from an Excel template' },
        { name: 'Jira Assets Integration', category: 'Data management', summary: 'Imports "AI System" objects from Jira Service Management Assets as use cases' },
        { name: 'Jira incidents', category: 'Data management', summary: 'Imports new Jira issues as incidents and keeps their status in sync both ways' },
        { name: 'Dataset Bulk Upload', category: 'Data management', summary: 'Uploads many dataset files at once, with PII detection' },
      ],
    },
    {
      type: 'heading',
      id: 'slack',
      level: 3,
      text: 'Slack',
    },
    {
      type: 'paragraph',
      text: 'Sends VerifyWise notifications to channels in your Slack workspace.',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Click **Enable** on the Slack card, then **Configure**.' },
        { text: 'Click **Add to Slack**. Slack asks you to pick a workspace and the channel to post to, and to approve the connection.' },
        { text: 'Back in VerifyWise, the connection appears in the table (Team Name, Channel, Creation Date, Active, Action). You can add more connections the same way.' },
        { text: 'Click **Configure** to open **Notification Routing**, choose the notification types under "Apply to all workspaces", and click **Save Changes**.' },
      ],
    },
    {
      type: 'paragraph',
      text: '**Where it shows up:** notifications arrive in the Slack channels you connected. See **Slack integration** for routing, troubleshooting and removing connections.',
    },
    {
      type: 'callout',
      variant: 'info',
      title: 'Self-hosted installations',
      text: 'Slack needs a Slack app. On a self-hosted installation, set `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET` and `SLACK_API_URL` on the server, and `VITE_SLACK_CLIENT_ID` and `VITE_SLACK_URL` on the client, before you click **Add to Slack**.',
    },
    {
      type: 'heading',
      id: 'mlflow',
      level: 3,
      text: 'MLflow',
    },
    {
      type: 'paragraph',
      text: 'Pulls models and runs from your MLflow tracking server into VerifyWise.',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Click **Configure to enable** on the MLflow card.' },
        { text: 'Fill in the Configuration form (see the table below).' },
        { text: 'Click **Enable**, then **Test connection** to check the server is reachable.' },
      ],
    },
    {
      type: 'table',
      columns: [
        { key: 'field', label: 'Field', width: '35%' },
        { key: 'notes', label: 'Notes', width: '65%' },
      ],
      rows: [
        { field: 'Tracking server URL', notes: 'Required. Base URL of your MLflow tracking server, for example https://mlflow.example.com.' },
        { field: 'Authentication method', notes: 'None, Basic (username / password) or Token. Defaults to None.' },
        { field: 'Username', notes: 'Needed for Basic authentication.' },
        { field: 'Password', notes: 'Needed for Basic authentication. Stored encrypted.' },
        { field: 'API token', notes: 'Needed for Token authentication. Stored encrypted.' },
        { field: 'Request timeout (seconds)', notes: 'Between 1 and 600. Defaults to 30. Applies to each request to MLflow.' },
      ],
    },
    {
      type: 'paragraph',
      text: '**Where it shows up:** an **MLFlow** tab in **Model inventory**. Click **Sync** there to pull the latest runs. Syncing is manual; nothing syncs on a schedule.',
    },
    {
      type: 'heading',
      id: 'azure-ai-foundry',
      level: 3,
      text: 'Azure AI Foundry',
    },
    {
      type: 'paragraph',
      text: 'Imports the model deployments in an Azure AI Foundry project. The AI agents page also uses this connection as one of its sources.',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Click **Configure to enable** on the Azure AI Foundry card.' },
        { text: 'Fill in the Configuration form (see the table below).' },
        { text: 'Click **Enable**, then **Test connection**.' },
      ],
    },
    {
      type: 'table',
      columns: [
        { key: 'field', label: 'Field', width: '35%' },
        { key: 'notes', label: 'Notes', width: '65%' },
      ],
      rows: [
        { field: 'Project endpoint', notes: 'Required. In the form https://<project>.services.ai.azure.com.' },
        { field: 'API key', notes: 'Required. Stored encrypted.' },
        { field: 'Subscription ID', notes: 'Optional. Only needed for the Azure Resource Manager API.' },
        { field: 'Resource group', notes: 'Optional. Only needed for the Azure Resource Manager API.' },
        { field: 'Resource name', notes: 'Optional. Only needed for the Azure Resource Manager API.' },
      ],
    },
    {
      type: 'paragraph',
      text: '**Where it shows up:** an **Azure AI Foundry** tab in **Model inventory**. Click **Sync** there to refresh the deployments.',
    },
    {
      type: 'heading',
      id: 'model-lifecycle',
      level: 3,
      text: 'Model Lifecycle',
    },
    {
      type: 'paragraph',
      text: 'Lets you define lifecycle phases for your models, each with its own items such as approvals, documents and responsible people.',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Click **Enable** on the Model Lifecycle card, then **Configure**.' },
        { text: 'Click **Configure Phases** to open **Configure Model Lifecycle**.' },
        { text: 'Click **Add new phase**, give it a name and an optional description.' },
        { text: 'Inside a phase, click **Add item**, name it and pick its type: Text, Text Area, Documents, People, Classification, Checklist or Approval.' },
      ],
    },
    {
      type: 'callout',
      variant: 'info',
      text: 'The extension starts with no phases. Nothing appears on your models until you create at least one phase.',
    },
    {
      type: 'paragraph',
      text: '**Where it shows up:** a **View lifecycle** button on each row in **Model inventory**, and a lifecycle section on each model\'s detail page.',
    },
    {
      type: 'heading',
      id: 'risk-import',
      level: 3,
      text: 'Risk Import',
    },
    {
      type: 'paragraph',
      text: 'Creates many risks at once from a filled-in Excel template. Click **Enable** on the card; there is nothing to configure.',
    },
    {
      type: 'paragraph',
      text: '**Where it shows up:** in **Risk management**, click **Add new risk** and choose **Import from Excel**. The **Import Risks from Excel** dialog walks you through three steps:',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Step 1: click **Download Template**.' },
        { text: 'Step 2: fill in the template and upload it with **Choose File**.' },
        { text: 'Step 3: click **Import Risks**.' },
      ],
    },
    {
      type: 'paragraph',
      text: 'Columns marked with * in the template are required: Risk Name, Risk Owner, AI Lifecycle Phase, Likelihood and Severity. Each row also needs a Risk Description, or the import rejects that row. Admins and Editors can import risks.',
    },
    {
      type: 'heading',
      id: 'jira-assets',
      level: 3,
      text: 'Jira Assets Integration',
    },
    {
      type: 'paragraph',
      text: 'Imports "AI System" objects from Jira Service Management Assets and turns them into VerifyWise use cases.',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Click **Enable** on the Jira Assets Integration card, then **Configure**.' },
        { text: 'Choose a **Deployment Type**: JIRA Cloud (Atlassian-hosted) or JIRA Data Center / Server (Self-hosted).' },
        { text: 'Fill in **JIRA Base URL**, then **Workspace ID** (Cloud) or **Insight Object Schema ID** (Data Center), then **Email** and **API Token** (Cloud) or **Username** and **Password / Token** (Data Center).' },
        { text: 'Click **Test Connection**, then **Save Configuration**.' },
        { text: 'Pick the **Schema** and the **Object Type (AI Systems)** to import from.' },
        { text: 'In the **Import & Sync** section, click **Import**, select the objects you want and click **Import N Selected**. The list shows up to 1,000 objects at a time; if Jira has more, click **Load more**.' },
      ],
    },
    {
      type: 'paragraph',
      text: '**Where it shows up:** imported objects appear as use cases under **Use cases**. To refresh them later, click **Sync Now** in the **Import & Sync** section.',
    },
    {
      type: 'callout',
      variant: 'info',
      title: 'Automatic sync',
      text: 'Under **Step 3: Sync Settings**, turn on **Enable automatic sync** and pick a **Sync Interval** (every hour up to every 48 hours). Both are saved as soon as you change them; if saving fails, the settings switch back to what was last saved and an error appears. On that interval, counted from the last sync, VerifyWise refreshes the use cases you have imported with their latest details from Jira. Automatic sync never imports new objects. **Sync Now** runs in the background (the button shows progress and the result appears when it finishes) and also imports new objects of the selected type. Automatic sync starts after at least one use case has been imported and stops while the extension is disabled. Only one sync or import runs at a time; if one is already running you see "A sync is already running". Only Admins can change these settings or run a sync.',
    },
    {
      type: 'callout',
      variant: 'warning',
      title: 'Syncs never delete use cases',
      text: 'No sync, manual or automatic, removes a use case. When a sync has received every object of the type from Jira and an imported object is no longer there, the use case is flagged instead: it appears under **Missing in Jira** in the panel, with the date it went missing, and its overview shows a **Missing in Jira** chip. If the object comes back in Jira, the next sync clears the flag. To delete flagged use cases, an Admin ticks them in the list (nothing is selected by default; there is also a select-all), clicks **Remove selected use cases** and confirms; this permanently deletes those use cases and their data in VerifyWise. A use case that a sync found again in the meantime is not removed. A sync only flags use cases imported from the object type it is syncing, so changing the object type never flags the use cases imported from the previous one.',
    },
    {
      type: 'heading',
      id: 'jira-incidents',
      level: 3,
      text: 'Jira incidents',
    },
    {
      type: 'paragraph',
      text: 'Imports new issues from a Jira Cloud project as VerifyWise incidents, then keeps their status in sync in both directions.',
    },
    {
      type: 'callout',
      variant: 'info',
      title: 'What it does and doesn\'t do',
      text: 'Only issues created in Jira after this is set up are imported. VerifyWise doesn\'t create Jira issues. After import, only status stays in sync, in both directions. Later changes to other Jira fields aren\'t copied. If a Jira status move needs a field such as Resolution, VerifyWise can\'t make it. Those incidents show an error, and you can change the status in Jira.',
    },
    {
      type: 'paragraph',
      text: '**Before you start**, you need:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'A Jira Cloud site', text: 'such as https://your-company.atlassian.net. Jira Data Center and Server are not supported.' },
        { bold: 'A service account', text: 'a Jira user that VerifyWise acts as. In the project you import from, it needs the Jira permissions **Browse projects**, **Transition issues** and **Link issues**.' },
        { bold: 'A classic API token', text: 'for that account, created at id.atlassian.com. Scoped API tokens aren\'t supported.' },
      ],
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Click **Enable** on the Jira incidents card, then **Configure**.' },
        { text: 'Under **Connection**, enter the **Jira site URL**, the **Service account email** and the **API token**. Click **Test connection** to check them; once a project is chosen, it also checks the three permissions.' },
        { text: 'Click **Save**. VerifyWise checks the token with Jira and loads your projects and priorities.' },
        { text: 'Under **Which issues to import**, choose the **Jira project** and the **Issue type**. Optionally enter a **Label** to import only issues with that label; matching labels from Jira appear as you type.' },
        { text: 'Under **Status mapping**, check the two tables. **Jira to VerifyWise** has a row for every status in the issue type\'s workflow, and each one needs a VerifyWise status. **VerifyWise to Jira** has a row for each VerifyWise status; pick the Jira status to move the issue to, or **Don\'t change Jira**. Both are filled in from Jira\'s status categories to start with.' },
        { text: 'Under **Severity mapping**, map each Jira priority to Minor, Serious or Very serious. The starting values are Highest and High → Very serious, Medium → Serious, Low and Lowest → Minor, and Serious for any other priority.' },
        { text: 'Under **Defaults for imported incidents**, choose the **Use case** and **Incident type** and enter the **Reporter**.' },
        { text: 'Click **Save**. Once everything is filled in, syncing starts on its own, every hour by default.' },
      ],
    },
    {
      type: 'paragraph',
      text: '**What an imported incident contains:** the issue\'s summary and description as the description, the severity from your mapping (Serious when the issue has no priority), the status from your mapping, the issue\'s created date as the date it occurred and was detected, and your default use case, type and reporter. Its approval status starts as Pending. A new imported incident runs the same automations as any new incident, and a Very serious one starts the incident response workflow. If your VerifyWise server has its web address configured, the Jira issue also gets a link back to the incident. If adding that link fails, the next syncs try again.',
    },
    {
      type: 'paragraph',
      text: '**Where it shows up:** imported incidents show the Jira key, for example SEC-42, next to the incident ID in the incidents table and in the incident\'s edit header. Click it to open the issue in Jira. A dot on the key means the link needs attention: a sync error, a conflict, or an issue deleted in Jira. Hover over or tab to the key to see the reason.',
    },
    {
      type: 'callout',
      variant: 'info',
      title: 'How syncing works',
      text: 'Each sync first imports issues created since the last sync, then compares status on both sides. A status changed in Jira is copied to the incident, and a status changed in VerifyWise moves the Jira issue, unless you chose **Don\'t change Jira** for it. If both changed since the last sync, the more recent change wins, and the other side is updated to match. Once an incident is closed on both sides, scheduled syncs check its Jira issue once a day, so reopening it in Jira can take up to a day to show in VerifyWise. **Sync now** checks it straight away. The **Sync** section lets you click **Sync now** or change how often it runs, from every hour to every 48 hours. **Sync activity** lists the latest 50 events with links to the incident and the Jira issue. Changing the project, issue type or label affects new imports only. Only Admins can open these settings.',
    },
    {
      type: 'table',
      columns: [
        { key: 'problem', label: 'You see', width: '40%' },
        { key: 'fix', label: 'What to do', width: '60%' },
      ],
      rows: [
        { problem: 'Jira rejected the API token. It may have expired or been revoked.', fix: 'Create a new classic API token for the service account, enter it under **Connection** and click **Save**.' },
        { problem: 'Jira status \'Awaiting vendor\' isn\'t mapped', fix: 'A status was added to the workflow. Open the settings page, where it now appears in **Jira to VerifyWise**, check its mapping and click **Save**.' },
        { problem: 'No move from \'Done\' to \'In Progress\' in this workflow, or Moving to \'Done\' needs a value for Resolution', fix: 'The Jira workflow does not let VerifyWise make that move. Change the status in Jira; the incident keeps its VerifyWise status.' },
        { problem: 'VerifyWise can no longer read Jira project SEC', fix: 'Give the service account **Browse projects** on the project again. Nothing is changed until it can read the project.' },
        { problem: 'Deleted in Jira', fix: 'The issue was deleted or is no longer visible to the service account. The incident is kept. If the issue comes back, syncing resumes.' },
        { problem: 'Rate limited by Jira. The next sync continues where this one stopped.', fix: 'Nothing; the next sync picks up the rest.' },
      ],
    },
    {
      type: 'paragraph',
      text: 'Deleting an imported incident in VerifyWise does not touch the Jira issue, and the issue is not imported again.',
    },
    {
      type: 'heading',
      id: 'dataset-bulk-upload',
      level: 3,
      text: 'Dataset Bulk Upload',
    },
    {
      type: 'paragraph',
      text: 'Registers many datasets at once. Click **Enable** on the card; there is nothing to configure.',
    },
    {
      type: 'paragraph',
      text: '**Where it shows up:** a **Bulk upload** button on the **Datasets** page, available to Admins and Editors. You can upload up to 20 CSV, XLSX or XLS files at a time, up to 30 MB each. VerifyWise checks column headers for likely personal data and flags matching datasets. Developers can use the same upload through the API.',
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
        { key: 'action', label: 'Action', width: '60%' },
        { key: 'roles', label: 'Required role', width: '40%' },
      ],
      rows: [
        { action: 'Open the Extensions page', roles: 'Admin' },
        { action: 'Enable, configure or disable an extension', roles: 'Admin' },
        { action: 'Import risks from Excel (Risk Import)', roles: 'Admin, Editor' },
        { action: 'Bulk upload datasets (Dataset Bulk Upload)', roles: 'Admin, Editor' },
        { action: 'See the Jira key on imported incidents (Jira incidents)', roles: 'Anyone who can see incidents' },
      ],
    },
    {
      type: 'article-links',
      title: 'Related articles',
      items: [
        {
          collectionId: 'integrations',
          articleId: 'slack-integration',
          title: 'Slack integration',
          description: 'Connect workspaces and route notifications',
        },
        {
          collectionId: 'compliance',
          articleId: 'adding-frameworks',
          title: 'Adding frameworks',
          description: 'Add built-in compliance frameworks to your organization or use cases',
        },
        {
          collectionId: 'ai-governance',
          articleId: 'datasets',
          title: 'Datasets',
          description: 'Register and manage datasets',
        },
        {
          collectionId: 'developers',
          articleId: 'bulk-import-datasets',
          title: 'Bulk importing datasets',
          description: 'Upload dataset files through the API',
        },
      ],
    },
  ],
};
