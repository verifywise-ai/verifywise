import type { ArticleContent } from '../../contentTypes';

export const bulkImportDatasetsContent: ArticleContent = {
  blocks: [
    { type: 'heading', id: 'overview', level: 2, text: 'Bulk importing datasets' },
    { type: 'paragraph', text: 'You can register a dataset by uploading its file directly through the API. This is the same upload the Datasets page uses, exposed for scripts and data pipelines. The endpoint stores the file and creates a dataset record from the metadata you send with it.' },
    { type: 'callout', variant: 'info', title: 'This needs a plugin', text: 'Bulk upload is gated behind the dataset-bulk-upload plugin. If the plugin is not installed for your organization, the endpoint returns 403. An Admin can install it from the plugins marketplace.' },

    { type: 'heading', id: 'endpoint', level: 2, text: 'The endpoint' },
    { type: 'table', columns: [
      { key: 'k', label: '', width: '30%' },
      { key: 'v', label: '', width: '70%' },
    ], rows: [
      { k: 'Method and path', v: 'POST /api/dataset-bulk-upload/upload' },
      { k: 'Content type', v: 'multipart/form-data' },
      { k: 'Access', v: 'Admin or Editor, with the dataset-bulk-upload plugin installed' },
    ]},
    { type: 'paragraph', text: 'The request has two parts: the file itself in a form field named file, and an optional metadata field carrying a JSON object that describes the dataset.' },

    { type: 'heading', id: 'formats', level: 2, text: 'Accepted files' },
    { type: 'paragraph', text: 'The upload accepts CSV, XLS and XLSX files, up to 30 MB. The file is stored as-is. The endpoint does not parse rows or require particular column headers, so any valid CSV or spreadsheet is accepted; you organize the contents however your downstream process expects.' },

    { type: 'heading', id: 'request', level: 2, text: 'Making the request' },
    { type: 'paragraph', text: 'Send the file in the file field. Put the dataset details in the metadata field as a JSON string.' },
    { type: 'code', language: 'bash', code: 'curl -X POST "http://localhost:3000/api/dataset-bulk-upload/upload" \\\n  -H "Authorization: Bearer <your-token>" \\\n  -F "file=@training-data.csv" \\\n  -F \'metadata={"name":"Training data Q2","type":"Training","classification":"Internal","contains_pii":false}\'' },
    { type: 'paragraph', text: 'Every metadata field is optional and has a default. The common ones:' },
    { type: 'table', columns: [
      { key: 'field', label: 'Field', width: '28%' },
      { key: 'desc', label: 'Description', width: '52%' },
      { key: 'def', label: 'Default', width: '20%' },
    ], rows: [
      { field: 'name', desc: 'Display name for the dataset.', def: 'The file name' },
      { field: 'type', desc: 'What the dataset is used for, for example Training.', def: 'Training' },
      { field: 'classification', desc: 'Sensitivity classification.', def: 'Internal' },
      { field: 'contains_pii', desc: 'Whether the dataset holds personal data (boolean).', def: 'false' },
      { field: 'description', desc: 'Free-text description.', def: 'Empty' },
      { field: 'version', desc: 'Dataset version string.', def: '1.0' },
      { field: 'projects', desc: 'Array of project ids to link the dataset to.', def: 'Empty' },
      { field: 'models', desc: 'Array of model inventory ids to link the dataset to.', def: 'Empty' },
    ]},

    { type: 'heading', id: 'response', level: 2, text: 'Response' },
    { type: 'paragraph', text: 'A successful upload returns 201 with the new dataset id and the stored file id:' },
    { type: 'code', language: 'json', code: '{\n  "message": "Created",\n  "data": {\n    "datasetId": 42,\n    "fileId": 108\n  }\n}' },

    { type: 'heading', id: 'errors', level: 2, text: 'Errors' },
    { type: 'table', columns: [
      { key: 'code', label: 'Code', width: '15%' },
      { key: 'when', label: 'When', width: '85%' },
    ], rows: [
      { code: '400', when: 'No file was sent, or the metadata field was not valid JSON.' },
      { code: '401', when: 'Missing or invalid token.' },
      { code: '403', when: 'The dataset-bulk-upload plugin is not installed, or your role is not Admin or Editor.' },
      { code: '413', when: 'The file is larger than 30 MB.' },
      { code: '415', when: 'The file is not a CSV, XLS or XLSX.' },
    ]},

    { type: 'article-links', title: 'Related articles', items: [
      { collectionId: 'developers', articleId: 'platform-rest-api', title: 'Platform REST API', description: 'Auth, base URL, response shape and limits.' },
      { collectionId: 'ai-governance', articleId: 'datasets', title: 'Datasets', description: 'Managing datasets in the app.' },
    ]},
  ],
};
