import type { ArticleContent } from '../../contentTypes';

export const datasetsContent: ArticleContent = {
  blocks: [
    {
      type: 'heading',
      id: 'overview',
      level: 2,
      text: 'Overview',
    },
    {
      type: 'paragraph',
      text: 'The Datasets page is where you register and track every dataset your organization uses for AI systems. Each dataset record captures what the data contains, where it came from, whether it includes personal information, and what biases have been identified.',
    },
    {
      type: 'paragraph',
      text: 'Datasets can be linked to models and projects, so you have a clear picture of which data feeds into which system.',
    },
    {
      type: 'heading',
      id: 'viewing-datasets',
      level: 2,
      text: 'Viewing datasets',
    },
    {
      type: 'paragraph',
      text: 'The main page shows all datasets in a table with columns for name, description, status, type, classification, owner, and source. Above the table, summary cards show how many datasets are in each status (Draft, Active, Deprecated, Archived).',
    },
    {
      type: 'paragraph',
      text: 'You can search by name or description, filter by status, type, or classification, and group datasets by any of those fields to organize them into collapsible sections.',
    },
    {
      type: 'heading',
      id: 'adding-dataset',
      level: 2,
      text: 'Adding a dataset',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Click **Add dataset** in the top right.' },
        { text: 'Fill in the basic fields: name, description, version, and owner.' },
        { text: 'Set the type (Training, Validation, Testing, Production, or Reference) and classification (Public, Internal, Confidential, or Restricted).' },
        { text: 'If the dataset contains personal data, check **Contains PII** and list the PII types present.' },
        { text: 'Document any known biases and mitigation steps.' },
        { text: 'Link the dataset to relevant models and projects.' },
        { text: 'Click **Save**.' },
      ],
    },
    {
      type: 'heading',
      id: 'dataset-fields',
      level: 2,
      text: 'Dataset fields',
    },
    {
      type: 'table',
      columns: [
        { key: 'field', label: 'Field', width: '25%' },
        { key: 'purpose', label: 'What it captures', width: '75%' },
      ],
      rows: [
        { field: 'Name', purpose: 'A short, recognizable name for the dataset' },
        { field: 'Description', purpose: 'What the dataset contains and what it is used for' },
        { field: 'Version', purpose: 'Version identifier (e.g., 1.0.0)' },
        { field: 'Owner', purpose: 'Person or team responsible for the dataset' },
        { field: 'Type', purpose: 'Training, Validation, Testing, Production, or Reference' },
        { field: 'Classification', purpose: 'Public, Internal, Confidential, or Restricted' },
        { field: 'Source', purpose: 'Where the data came from' },
        { field: 'Format', purpose: 'File format (CSV, JSON, Parquet, etc.)' },
        { field: 'License', purpose: 'Data license or usage terms' },
        { field: 'Contains PII', purpose: 'Whether the dataset includes personally identifiable information' },
        { field: 'PII types', purpose: 'Specific PII categories present (email, SSN, phone, etc.)' },
        { field: 'Known biases', purpose: 'Documented bias issues in the data' },
        { field: 'Bias mitigation', purpose: 'Steps taken to address identified biases' },
        { field: 'Collection method', purpose: 'How the data was gathered' },
        { field: 'Preprocessing', purpose: 'Cleaning or transformation steps applied' },
      ],
    },
    {
      type: 'heading',
      id: 'bulk-upload',
      level: 2,
      text: 'Bulk upload',
    },
    {
      type: 'paragraph',
      text: 'If you have multiple dataset files to register at once, use the bulk upload feature instead of adding them one by one.',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Click **Bulk upload** in the top right.' },
        { text: 'Drag and drop files (CSV, XLS, or XLSX, up to 30 MB each) or click to browse.' },
        { text: 'The system scans column headers for potential PII (email, phone, SSN, address, etc.) and flags any matches.' },
        { text: 'Review the auto-detected metadata for each file. Edit names, types, or classifications before uploading.' },
        { text: 'Click **Upload** to register all files as dataset records.' },
      ],
    },
    {
      type: 'callout',
      variant: 'info',
      title: 'PII auto-detection',
      text: 'During bulk upload, the system checks column headers against 49 known PII keywords (email, ssn, phone, salary, credit_card, etc.). If any match, the dataset is automatically flagged as containing PII. You can override this in the review step.',
    },
    {
      type: 'heading',
      id: 'linking',
      level: 2,
      text: 'Linking datasets to models and projects',
    },
    {
      type: 'paragraph',
      text: 'Each dataset can be linked to one or more models from the model inventory and one or more projects. These links create a traceable chain from data to model to use case, which is what auditors look for when verifying data governance.',
    },
    {
      type: 'paragraph',
      text: 'Set these links when creating or editing a dataset. You can also view all datasets linked to a specific model from the model inventory page.',
    },
    {
      type: 'heading',
      id: 'statuses',
      level: 2,
      text: 'Dataset statuses',
    },
    {
      type: 'table',
      columns: [
        { key: 'status', label: 'Status', width: '20%' },
        { key: 'meaning', label: 'When to use', width: '80%' },
      ],
      rows: [
        { status: 'Draft', meaning: 'Dataset is being documented but not yet in use' },
        { status: 'Active', meaning: 'Dataset is currently used by one or more models or systems' },
        { status: 'Deprecated', meaning: 'Dataset is being phased out and should not be used for new work' },
        { status: 'Archived', meaning: 'Dataset is no longer in use but kept for audit records' },
      ],
    },
    {
      type: 'heading',
      id: 'change-history',
      level: 2,
      text: 'Change history',
    },
    {
      type: 'paragraph',
      text: 'Every edit to a dataset is tracked in a change history log. This gives auditors a record of what changed, when, and by whom.',
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
        { action: 'View datasets', roles: 'Any authenticated user' },
        { action: 'Add or edit datasets', roles: 'Admin or Editor' },
        { action: 'Bulk upload', roles: 'Admin or Editor' },
        { action: 'Delete datasets', roles: 'Admin or Editor' },
      ],
    },
    {
      type: 'article-links',
      title: 'Related articles',
      items: [
        {
          collectionId: 'ai-governance',
          articleId: 'model-inventory',
          title: 'Managing model inventory',
          description: 'View and manage the models that use your datasets.',
        },
        {
          collectionId: 'ai-governance',
          articleId: 'use-cases',
          title: 'Use cases',
          description: 'Link datasets to the projects and use cases they support.',
        },
      ],
    },
  ],
};
