import type { ArticleContent } from '../../contentTypes';

export const modelInventoryContent: ArticleContent = {
  blocks: [
    {
      type: 'heading',
      id: 'overview',
      level: 2,
      text: 'Overview',
    },
    {
      type: 'paragraph',
      text: "The model inventory is where you register every AI model your organization uses, whether it's a third-party API, an open-source model you host, or something built in-house. Each model gets an approval status, an owner, and a record of changes over time.",
    },
    {
      type: 'paragraph',
      text: "The point is visibility. If you can't answer basic questions (what AI do we run? who owns it? what data does it touch? is it approved?) then you can't govern it. The inventory gives you that baseline.",
    },
    {
      type: 'heading',
      id: 'why-inventory',
      level: 2,
      text: 'Why bother?',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Regulatory requirement', text: 'The EU AI Act (Article 60) and ISO 42001 both require documented records of AI systems in use, especially high-risk ones' },
        { bold: 'Risk visibility', text: 'You can\'t assess risks for models you don\'t know about. The inventory surfaces everything for review.' },
        { bold: 'Accountability', text: 'Every model has an owner. When something goes wrong, there\'s a clear person responsible.' },
        { bold: 'Audit readiness', text: 'Auditors ask "show me all your AI systems." With an inventory, you can answer in seconds instead of weeks.' },
      ],
    },
    {
      type: 'callout',
      variant: 'info',
      text: 'Every change to a model record is automatically logged with who, what and when. This audit trail persists even if the model is later deleted.',
    },
    {
      type: 'heading',
      id: 'accessing-inventory',
      level: 2,
      text: 'Accessing the model inventory',
    },
    {
      type: 'paragraph',
      text: 'In the sidebar, open **Record > Inventory > Models**. You get a table of all registered models with search, filters for status and provider, and summary cards showing counts by approval status at the top.',
    },
    {
      type: 'image',
      src: '/images/user-guide/model-inventory.png',
      alt: 'Model inventory page showing status cards for Approved, Restricted, Pending, and Blocked models, plus a table listing models with provider, version, approver, and security assessment columns',
      caption: 'The model inventory provides a centralized view of all AI models in your organization.',
    },
    {
      type: 'heading',
      id: 'registering-model',
      level: 2,
      text: 'Registering a new model',
    },
    {
      type: 'paragraph',
      text: 'To add a new AI model to your inventory, click the **Add model** button and provide the required information:',
    },
    {
      type: 'ordered-list',
      items: [
        { bold: 'Provider', text: '— The organization or service that provides the model (e.g., OpenAI, Anthropic, internal team)' },
        { bold: 'Model name', text: '— The specific model identifier (e.g., GPT-4, Claude 3, custom-classifier-v2)' },
        { bold: 'Version', text: '— The version number or release identifier' },
        { bold: 'Approver', text: '— The person responsible for approving this model for use. It must be a member of your organization.' },
      ],
    },
    {
      type: 'image',
      src: '/images/user-guide/add-new-model.png',
      alt: 'Add a new model form with fields for provider, model name, version, approver, status, capabilities, use cases, frameworks, reference link, biases, hosting provider, and limitations',
      caption: 'The model registration form captures comprehensive metadata for governance tracking.',
    },
    {
      type: 'heading',
      id: 'model-attributes',
      level: 2,
      text: 'Model attributes',
    },
    {
      type: 'paragraph',
      text: 'Beyond the basics, each model record supports these fields:',
    },
    {
      type: 'grid-cards',
      columns: 2,
      items: [
        { icon: 'Brain', title: 'Capabilities', description: 'Document what the model can do — text generation, classification, image analysis, etc.' },
        { icon: 'AlertTriangle', title: 'Known biases', description: 'Record any identified biases or fairness concerns with the model' },
        { icon: 'Info', title: 'Limitations', description: 'Document constraints and scenarios where the model should not be used' },
        { icon: 'Server', title: 'Hosting provider', description: 'Where the model is hosted — cloud provider, on-premises, or hybrid' },
      ],
    },
    {
      type: 'heading',
      id: 'approval-status',
      level: 2,
      text: 'Approval status',
    },
    {
      type: 'paragraph',
      text: 'Every model in the inventory has an approval status that controls whether it can be used in your organization:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Pending', text: 'Model is awaiting review and approval before use' },
        { bold: 'Approved', text: 'Model has been reviewed and authorized for production use' },
        { bold: 'Restricted', text: 'Model is approved for limited use cases or specific projects only' },
        { bold: 'Blocked', text: 'Model is not authorized for use in the organization' },
        { bold: 'Rejected', text: 'Model was reviewed and turned down' },
        { bold: 'Retired', text: 'Model has been decommissioned and is no longer in use' },
      ],
    },
    {
      type: 'heading',
      id: 'who-can-approve',
      level: 3,
      text: 'Who can approve a model',
    },
    {
      type: 'paragraph',
      text: 'Approved, Restricted, Blocked and Rejected are decisions. Once a model has an approver, only that approver or an Admin can move it to or from a decision, or change or remove its approver. Moving between Pending and Retired is open to anyone who can edit models.',
    },
    {
      type: 'bullet-list',
      items: [
        { text: 'You can\'t pick yourself as a model\'s approver unless you are an Admin.' },
        { text: 'When you name a new approver, only an Admin can also set a decision in the same save. The new approver decides afterwards.' },
        { text: 'A model with no approver can be given any status by anyone who can edit models.' },
        { text: 'To name an approver on a model that already has a decision but no approver, set it back to Pending in the same save, or ask an Admin.' },
        { text: 'If you name a new approver while a decision is selected, the status goes back to Pending (or the saved status) so the new approver can decide.' },
      ],
    },
    {
      type: 'paragraph',
      text: 'The form shows the statuses you can\'t set as unavailable. If a save is refused, you see "Only the model\'s approver or an Admin can change its approval."',
    },
    {
      type: 'paragraph',
      text: 'Setting a model to Approved, when you add it or later, sends the "risk assessment required" notice and starts the model deployment workflow.',
    },
    {
      type: 'callout',
      variant: 'tip',
      title: 'Best practice',
      text: 'Establish clear criteria for each approval status in your AI governance policy. This ensures consistent decision-making when evaluating new models.',
    },
    {
      type: 'heading',
      id: 'security-assessment',
      level: 2,
      text: 'Security assessment',
    },
    {
      type: 'paragraph',
      text: 'Models can be flagged as having completed a security assessment. When enabled, you can attach security assessment documentation directly to the model record for easy reference during audits.',
    },
    {
      type: 'heading',
      id: 'linking-evidence',
      level: 2,
      text: 'Linking evidence',
    },
    {
      type: 'paragraph',
      text: 'You can attach evidence files to any model record. Typical examples:',
    },
    {
      type: 'checklist',
      items: [
        'Model cards and technical documentation',
        'Vendor contracts and data processing agreements',
        'Security assessment reports',
        'Bias testing results and fairness evaluations',
        'Performance benchmarks and validation studies',
      ],
    },
    {
      type: 'heading',
      id: 'mlflow-integration',
      level: 2,
      text: 'MLflow integration',
    },
    {
      type: 'paragraph',
      text: 'If you use MLflow, VerifyWise can pull in model training metadata directly: training timestamps, parameters, metrics and lifecycle stage. This saves you from manually entering data that your ML platform already has.',
    },
    {
      type: 'paragraph',
      text: 'Once an Admin enables and configures the MLflow extension, an **MLflow** tab appears in Model inventory. Click **Sync** there to pull the latest models; syncing is manual. The Azure AI Foundry extension works the same way with its own **Azure AI Foundry** tab. See **Extensions** for setup.',
    },
    {
      type: 'heading',
      id: 'change-history',
      level: 2,
      text: 'Change history',
    },
    {
      type: 'paragraph',
      text: 'VerifyWise automatically maintains a complete audit trail for every model in your inventory. Each change records:',
    },
    {
      type: 'bullet-list',
      items: [
        { text: 'The field that was modified' },
        { text: 'Previous and new values' },
        { text: 'Who made the change' },
        { text: 'When the change occurred' },
      ],
    },
    {
      type: 'paragraph',
      text: 'Auditors typically ask for this when reviewing how your organization tracks AI system changes over time.',
    },
    {
      type: 'heading',
      id: 'deleting-model',
      level: 2,
      text: 'Deleting a model',
    },
    {
      type: 'paragraph',
      text: 'When a model you delete has risks, VerifyWise asks what to do with them:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Keep risks', text: 'The risks stay in the model risks list, shown with **No model**, and keep their links to use case risks. Each risk\'s history records that it lost its model.' },
        { bold: 'Delete risks too', text: 'The risks are archived, as if you had deleted each one yourself. Pick **Deleted only** in the model risks status filter to see them.' },
      ],
    },
    {
      type: 'paragraph',
      text: 'Evidence linked to the model stops listing it. Archived risks are read-only and stay out of reports.',
    },
    {
      type: 'heading',
      id: 'model-risk-owners',
      level: 2,
      text: 'Model risk owners',
    },
    {
      type: 'paragraph',
      text: 'When you add a model risk with an owner, or give an existing risk a new owner, the owner gets an in-app notification and an email with a link to the risk. Saving a risk without changing its owner sends nothing.',
    },
    {
      type: 'heading',
      id: 'datasets',
      level: 2,
      text: 'Datasets',
    },
    {
      type: 'paragraph',
      text: "Datasets have their own page in the sidebar (Inventory → Datasets). You catalog the data used for training, validation, testing and production. Each dataset can be linked to models and use cases, so you can trace which data feeds which system.",
    },
    {
      type: 'heading',
      id: 'accessing-datasets',
      level: 3,
      text: 'Accessing datasets',
    },
    {
      type: 'paragraph',
      text: 'In the sidebar, open **Record > Inventory > Datasets**. The page shows all registered datasets in a searchable table with status summary cards at the top.',
    },
    {
      type: 'heading',
      id: 'adding-dataset',
      level: 3,
      text: 'Adding a new dataset',
    },
    {
      type: 'paragraph',
      text: 'To add a new dataset to your inventory, click the **Add new dataset** button and provide the required information:',
    },
    {
      type: 'ordered-list',
      items: [
        { bold: 'Name', text: '— A descriptive name for the dataset' },
        { bold: 'Description', text: '— Detailed explanation of what the dataset contains and its intended use' },
        { bold: 'Version', text: '— The version identifier for tracking dataset iterations' },
        { bold: 'Owner', text: '— The person or team responsible for maintaining the dataset' },
        { bold: 'Type', text: '— The purpose of the dataset (training, validation, testing, production, or reference)' },
        { bold: 'Function', text: '— The dataset\'s role in AI model development' },
        { bold: 'Source', text: '— Where the data originated from' },
        { bold: 'Classification', text: '— The sensitivity level of the data' },
        { bold: 'Status', text: '— The current lifecycle stage of the dataset' },
        { bold: 'Status date', text: '— When the current status was set' },
      ],
    },
    {
      type: 'heading',
      id: 'dataset-types',
      level: 3,
      text: 'Dataset types',
    },
    {
      type: 'paragraph',
      text: 'Datasets can be categorized by their purpose in the machine learning lifecycle:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Training', text: 'Data used to train the model and learn patterns' },
        { bold: 'Validation', text: 'Data used to tune hyperparameters and prevent overfitting during training' },
        { bold: 'Testing', text: 'Data used to evaluate final model performance before deployment' },
        { bold: 'Production', text: 'Data that the deployed model processes in live environments' },
        { bold: 'Reference', text: 'Baseline or benchmark data used for comparison' },
      ],
    },
    {
      type: 'heading',
      id: 'data-classification',
      level: 3,
      text: 'Data classification',
    },
    {
      type: 'paragraph',
      text: 'Each dataset should be classified according to its sensitivity level:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Public', text: 'Data that can be freely shared without restrictions' },
        { bold: 'Internal', text: 'Data intended for use within the organization only' },
        { bold: 'Confidential', text: 'Sensitive data requiring access controls and handling procedures' },
        { bold: 'Restricted', text: 'Highly sensitive data with strict access limitations and regulatory requirements' },
      ],
    },
    {
      type: 'callout',
      variant: 'warning',
      title: 'PII handling',
      text: 'When a dataset contains personally identifiable information (PII), mark it accordingly and document the specific types of PII present. This is critical for GDPR, CCPA, and other privacy regulation compliance.',
    },
    {
      type: 'heading',
      id: 'dataset-status',
      level: 3,
      text: 'Dataset status',
    },
    {
      type: 'paragraph',
      text: 'Every dataset has a status indicating its current lifecycle stage:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Draft', text: 'Dataset is being prepared or documented but not yet ready for use' },
        { bold: 'Active', text: 'Dataset is approved and currently in use for model development or production' },
        { bold: 'Deprecated', text: 'Dataset is no longer recommended for new use but may still be referenced by existing models' },
        { bold: 'Archived', text: 'Dataset is retained for historical purposes but not available for active use' },
      ],
    },
    {
      type: 'heading',
      id: 'dataset-attributes',
      level: 3,
      text: 'Dataset attributes',
    },
    {
      type: 'paragraph',
      text: 'Each dataset can include additional attributes to support governance and data quality:',
    },
    {
      type: 'grid-cards',
      columns: 2,
      items: [
        { icon: 'AlertTriangle', title: 'Known biases', description: 'Document any identified biases in the data that could affect model outcomes' },
        { icon: 'Shield', title: 'Bias mitigation', description: 'Record steps taken to identify, measure, and reduce bias in the dataset' },
        { icon: 'Database', title: 'Collection method', description: 'Describe how the data was gathered — surveys, scraping, APIs, manual entry, etc.' },
        { icon: 'Settings', title: 'Preprocessing steps', description: 'Document transformations, cleaning, and normalization applied to the raw data' },
      ],
    },
    {
      type: 'heading',
      id: 'linking-datasets',
      level: 3,
      text: 'Linking datasets to models',
    },
    {
      type: 'paragraph',
      text: 'When creating or editing a dataset, you can link it to one or more models in your inventory. This traceability matters when a data quality issue surfaces: you can immediately see which models are affected.',
    },
    {
      type: 'callout',
      variant: 'tip',
      title: 'Best practice',
      text: 'Link every training and validation dataset to its corresponding models. When data quality issues are discovered, you can quickly identify all affected models.',
    },
    {
      type: 'heading',
      id: 'linking-projects',
      level: 3,
      text: 'Linking datasets to use cases',
    },
    {
      type: 'paragraph',
      text: 'In addition to models, datasets can be linked to specific use cases (projects) in your organization. This helps maintain a clear view of which data supports which business applications, supporting both governance oversight and impact analysis.',
    },
    {
      type: 'heading',
      id: 'optional-fields',
      level: 3,
      text: 'Optional fields',
    },
    {
      type: 'paragraph',
      text: 'Beyond the required fields, you can document additional metadata to enhance governance:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'License', text: 'The licensing terms governing data use (e.g., CC BY 4.0, MIT, proprietary)' },
        { bold: 'Format', text: 'The data format (e.g., CSV, JSON, Parquet)' },
        { bold: 'PII types', text: 'Specific types of personally identifiable information when PII is present' },
      ],
    },
    {
      type: 'article-links',
      title: 'Related articles',
      items: [
        {
          collectionId: 'ai-governance',
          articleId: 'model-lifecycle',
          title: 'Model lifecycle management',
          description: 'Learn how to track models from development through retirement',
        },
        {
          collectionId: 'ai-governance',
          articleId: 'evidence-collection',
          title: 'Evidence collection',
          description: 'Organize documentation for compliance and audits',
        },
        {
          collectionId: 'risk-management',
          articleId: 'risk-assessment',
          title: 'Conducting risk assessments',
          description: 'Evaluate risks associated with your AI models',
        },
      ],
    },
  ],
};
