import type { ArticleContent } from '../../contentTypes';

export const frameworkImportContent: ArticleContent = {
  blocks: [
    {
      type: 'heading',
      id: 'overview',
      level: 2,
      text: 'Overview',
    },
    {
      type: 'paragraph',
      text: 'Framework import lets you bring in your own framework, such as an internal AI policy, from an Excel file. You describe it as topics with their subtopics, one framework per file. Then you add it to a use case. There you assess each topic or subtopic with a status, owner, reviewer, approver, due date, evidence and linked risks.',
    },
    {
      type: 'paragraph',
      text: 'Imported frameworks belong to your organization. Other organizations never see them.',
    },
    {
      type: 'heading',
      id: 'before-you-start',
      level: 2,
      text: 'Before you start',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Turn on the extension', text: 'An Admin enables **Framework Import** on the Extensions page. There is nothing to configure. Until then, none of the import controls appear.' },
        { bold: 'Organizational project', text: 'Import controls are on the Organizational Frameworks page, which needs an organization-level project. If the page says "No Organizational Project Found", create one first.' },
        { bold: 'Permission', text: 'Importing, re-importing and deleting need the "Import frameworks from a spreadsheet" permission (module **Extensions**). By default **Admin** and **Editor** have it.' },
      ],
    },
    {
      type: 'heading',
      id: 'import',
      level: 2,
      text: 'Importing a framework',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Click **Frameworks** in the sidebar.' },
        { text: 'Click **Manage frameworks** > **Import framework from Excel**. You can also open the **Settings** tab and click **Import from Excel** in the **Imported frameworks** section.' },
        { text: 'In the **Import a framework from Excel** dialog, click **Download template** to get `framework_import_template.xlsx`.' },
        { text: 'Fill in the template (see the format below) and save it.' },
        { text: 'Click **Choose file** and pick your file. A preview shows how many rows were found, with the first 5 rows.' },
        { text: 'Click **Import framework**.' },
      ],
    },
    {
      type: 'paragraph',
      text: 'When the import works, you see "Framework imported: N topic(s) and N subtopic(s)." The framework then appears under **Imported frameworks** on the **Settings** tab, with its topic and subtopic counts.',
    },
    {
      type: 'heading',
      id: 'file-format',
      level: 2,
      text: 'Spreadsheet format',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'File type', text: 'Excel `.xlsx` only. Other files are refused with "Please upload an Excel file (.xlsx)".' },
        { bold: 'Worksheet', text: 'Only the first worksheet is read. Row 1 holds the column headers; data starts on row 2.' },
        { bold: 'One row per subtopic', text: 'Repeat the framework and topic on every row of that topic. To create a topic with no subtopics, leave the subtopic columns empty on its row.' },
        { bold: 'One framework per file', text: 'Every row must have the same framework name.' },
        { bold: 'Row limit', text: 'At most 5,000 rows. Empty rows are skipped and don\'t count.' },
      ],
    },
    {
      type: 'paragraph',
      text: 'Keep the template\'s header names. Columns marked * are required:',
    },
    {
      type: 'table',
      columns: [
        { key: 'column', label: 'Column', width: '28%' },
        { key: 'required', label: 'Required', width: '17%' },
        { key: 'rule', label: 'Rule', width: '55%' },
      ],
      rows: [
        { column: 'Framework Name *', required: 'Yes', rule: '2 to 255 characters. The same on every row.' },
        { column: 'Framework Description', required: 'No', rule: 'At most 1,000 characters. Taken from the first row.' },
        { column: 'Topic Number *', required: 'Yes', rule: 'At most 50 characters, for example 1 or A.' },
        { column: 'Topic Name *', required: 'Yes', rule: 'At most 500 characters. Every row of a topic must use the same name.' },
        { column: 'Topic Description', required: 'No', rule: 'At most 1,000 characters.' },
        { column: 'Subtopic Number', required: 'With a subtopic name', rule: 'At most 50 characters. Unique within its topic.' },
        { column: 'Subtopic Name', required: 'With a subtopic number', rule: 'At most 500 characters.' },
        { column: 'Subtopic Description', required: 'No', rule: 'At most 1,000 characters.' },
      ],
    },
    {
      type: 'heading',
      id: 'errors',
      level: 2,
      text: 'When an import fails',
    },
    {
      type: 'paragraph',
      text: 'Every row is checked before anything is saved. If any row fails, nothing is imported and the dialog says "Nothing was imported. Fix the rows below in your file and upload it again." A table lists each problem with its **Row** (the row number in your spreadsheet), **Field** and **Error**. Problems that apply to the whole file, such as too many rows, show "-" as the row.',
    },
    {
      type: 'paragraph',
      text: 'Common errors:',
    },
    {
      type: 'bullet-list',
      items: [
        { text: '"Framework name is required", "Topic number is required", "Topic name is required"' },
        { text: '"All rows must define the same framework"' },
        { text: '"Subtopic number is required when subtopic name is provided" (and the reverse)' },
        { text: 'A topic number used with two different topic names, or a subtopic number repeated under the same topic. The message names the row where it first appeared.' },
        { text: '"A file can have at most 5000 rows; split the framework or remove empty rows"' },
      ],
    },
    {
      type: 'heading',
      id: 're-import',
      level: 2,
      text: 'Updating a framework',
    },
    {
      type: 'paragraph',
      text: 'To change an imported framework, edit your file and import it again with the same framework name. Upper and lower case don\'t matter. VerifyWise updates the existing framework in place. Assessments on use cases are kept.',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Matching', text: 'Topics are matched by topic number. Subtopics are matched by subtopic number within their topic. Matched items take the names and descriptions from the file.' },
        { bold: 'New items', text: 'Rows with new numbers are added, including to every use case that already uses the framework.' },
        { bold: 'Missing items', text: 'An item no longer in the file is removed, unless some use case has assessment data on it (a status other than Not started, any text, owner, reviewer, approver, due date, evidence or linked risk). Those items are retired instead: they remain, marked **Retired**. A topic remains while one of its subtopics is retired. A retired item that comes back in a later file is restored.' },
      ],
    },
    {
      type: 'paragraph',
      text: 'The result reads "Framework updated: N added, N updated, N retired, N removed."',
    },
    {
      type: 'heading',
      id: 'add-to-use-case',
      level: 2,
      text: 'Adding an imported framework to a use case',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Click **Use cases** in the sidebar and open the use case.' },
        { text: 'Open the **Frameworks/regulations** tab.' },
        { text: 'Click **Manage frameworks/regulations** (or **Add Framework** if the use case has none yet).' },
        { text: 'In the **AI Frameworks** dialog, scroll to **Imported frameworks** and click **Add** on the framework. It shows an **Added** badge.' },
      ],
    },
    {
      type: 'paragraph',
      text: 'The framework then appears in the use case\'s framework switcher next to the built-in ones. Adding or removing one needs permission to edit use cases, which Admin and Editor have by default. Imported frameworks can be added to use cases only, not to the organizational project.',
    },
    {
      type: 'heading',
      id: 'assess',
      level: 2,
      text: 'Assessing an imported framework',
    },
    {
      type: 'paragraph',
      text: 'Pick the framework in the use case\'s framework switcher. Topics and their subtopics are listed with a progress count, a status filter and a search box. Change an item\'s status straight from the list:',
    },
    {
      type: 'bullet-list',
      items: [
        { text: 'Not started, Draft, In progress, Awaiting review, Awaiting approval, Implemented, Audited, Needs rework' },
      ],
    },
    {
      type: 'paragraph',
      text: 'Click an item to open its drawer:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Details', text: 'Implementation description, status, owner, reviewer, approver, due date and auditor feedback' },
        { bold: 'Evidence', text: 'Upload evidence files' },
        { bold: 'Cross mappings', text: 'Link risks from this use case' },
      ],
    },
    {
      type: 'paragraph',
      text: 'Imported framework items have no **Notes** tab.',
    },
    {
      type: 'heading',
      id: 'remove-from-use-case',
      level: 2,
      text: 'Removing an imported framework from a use case',
    },
    {
      type: 'paragraph',
      text: 'In the **AI Frameworks** dialog, click **Remove** on the framework and confirm. This deletes its assessment in that use case (statuses, descriptions, owners, due dates, evidence links and risk links). This cannot be undone.',
    },
    {
      type: 'heading',
      id: 'delete',
      level: 2,
      text: 'Deleting an imported framework',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'On the Frameworks page, open the **Settings** tab and click **Delete** next to the framework under **Imported frameworks**.' },
        { text: 'Click **Delete** in the "Delete this imported framework?" dialog.' },
      ],
    },
    {
      type: 'paragraph',
      text: 'The framework is removed with all its topics and subtopics. You can import it again from your file later.',
    },
    {
      type: 'callout',
      variant: 'warning',
      text: 'You can\'t delete a framework that a use case uses. The dialog names those use cases. Remove the framework from each of them first.',
    },
    {
      type: 'heading',
      id: 'turning-off',
      level: 2,
      text: 'If the extension is turned off',
    },
    {
      type: 'paragraph',
      text: 'Disabling **Framework Import** hides the import controls and the **Imported frameworks** sections. Imported frameworks can no longer be added to use cases. Use cases that already use one keep it, and you can go on assessing it. Nothing is deleted.',
    },
    {
      type: 'article-links',
      title: 'Related articles',
      items: [
        {
          collectionId: 'integrations',
          articleId: 'extensions',
          title: 'Extensions',
          description: 'Enable and disable the built-in extensions',
        },
        {
          collectionId: 'compliance',
          articleId: 'adding-frameworks',
          title: 'Adding frameworks',
          description: 'Add built-in frameworks to your organization or a use case',
        },
        {
          collectionId: 'ai-governance',
          articleId: 'use-cases',
          title: 'Use cases',
          description: 'Create and manage the AI systems you govern',
        },
      ],
    },
  ],
};
