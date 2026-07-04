import type { ArticleContent } from '../../contentTypes';

export const complianceAndReportsContent: ArticleContent = {
  blocks: [
    { type: 'heading', id: 'overview', level: 2, text: 'Compliance, reports and exports' },
    { type: 'paragraph', text: 'If you run a separate GRC or reporting tool, you can pull governance data out of VerifyWise over the API: live compliance progress, generated reports and a handful of document exports. This article covers what is available and what is not.' },

    { type: 'heading', id: 'progress', level: 2, text: 'Compliance and assessment progress' },
    { type: 'paragraph', text: 'Progress endpoints return how far a project has come on its controls and assessment questions, as plain JSON. Use these to mirror compliance state in another system.' },
    { type: 'table', columns: [
      { key: 'method', label: 'Method & path', width: '55%' },
      { key: 'desc', label: 'Returns', width: '45%' },
    ], rows: [
      { method: 'GET /api/projects/compliance/progress/:id', desc: 'Control progress for a project.' },
      { method: 'GET /api/projects/assessment/progress/:id', desc: 'Assessment question progress for a project.' },
      { method: 'GET /api/projects/all/compliance/progress', desc: 'Control progress across all projects.' },
      { method: 'GET /api/projects/all/assessment/progress', desc: 'Assessment progress across all projects.' },
    ]},
    { type: 'code', language: 'bash', code: 'curl "http://localhost:3000/api/projects/compliance/progress/1" \\\n  -H "Authorization: Bearer <your-token>"' },
    { type: 'paragraph', text: 'The compliance response counts subcontrols; the assessment response counts questions:' },
    { type: 'code', language: 'json', code: '{ "message": "OK", "data": { "allsubControls": 45, "allDonesubControls": 23 } }\n\n{ "message": "OK", "data": { "totalQuestions": 120, "answeredQuestions": 87 } }' },
    { type: 'paragraph', text: 'Framework-specific progress is available under each framework, for example /api/eu-ai-act/compliances/progress/:id and /api/iso-27001/clauses/progress/:id, with matching all/... variants. The frameworks also expose their control structure (control categories, controls, ISO clauses and annexes) as JSON, so you can map VerifyWise controls onto your own framework model.' },

    { type: 'heading', id: 'reports', level: 2, text: 'Generating reports' },
    { type: 'paragraph', text: 'You can generate a report document on demand and stream it back. This is the same report the Reporting page produces.' },
    { type: 'table', columns: [
      { key: 'method', label: 'Method & path', width: '50%' },
      { key: 'desc', label: 'Description', width: '50%' },
    ], rows: [
      { method: 'POST /api/reporting/v2/generate-report', desc: 'Generate and download a report. Admin only.' },
      { method: 'GET /api/reporting/generate-report', desc: 'List previously generated reports.' },
      { method: 'DELETE /api/reporting/:id', desc: 'Delete a generated report.' },
    ]},
    { type: 'paragraph', text: 'The generate call takes the project, a report type and a format (pdf or docx), and responds with the document as a file attachment.' },
    { type: 'code', language: 'bash', code: 'curl -X POST "http://localhost:3000/api/reporting/v2/generate-report" \\\n  -H "Authorization: Bearer <admin-token>" \\\n  -H "Content-Type: application/json" \\\n  -d \'{ "projectId": 1, "reportType": "compliance", "format": "pdf" }\' \\\n  --output report.pdf' },
    { type: 'callout', variant: 'info', title: 'Report types', text: 'reportType selects the sections, for example compliance, assessment, projectRisks, vendorRisks, modelRisks, trainingRegistry, policyManager or all. Some report types also expect a framework id; check the Reporting page or /api/docs for the exact combination you want.' },

    { type: 'heading', id: 'exports', level: 2, text: 'Document exports' },
    { type: 'paragraph', text: 'A few resources can be exported as a file. These are targeted exports, not a general dump of your data.' },
    { type: 'table', columns: [
      { key: 'method', label: 'Method & path', width: '55%' },
      { key: 'fmt', label: 'Format', width: '45%' },
    ], rows: [
      { method: 'GET /api/policies/:id/export/pdf', fmt: 'Policy as PDF.' },
      { method: 'GET /api/policies/:id/export/docx', fmt: 'Policy as DOCX.' },
      { method: 'GET /api/ai-detection/scans/:scanId/export/ai-bom', fmt: 'AI bill of materials as JSON.' },
      { method: 'GET /api/ai-audit/export?format=csv', fmt: 'Agent Control audit log as CSV (or JSON without the param).' },
    ]},

    { type: 'callout', variant: 'warning', title: 'No general CSV export', text: 'There is no single endpoint that dumps all risks, models or evidence as CSV or JSON. To pull those, list each resource through its own endpoint (see Working with resources) and shape the data yourself. The exports above are the only file exports available today.' },

    { type: 'article-links', title: 'Related articles', items: [
      { collectionId: 'developers', articleId: 'working-with-resources', title: 'Working with resources', description: 'List and read resources over the API.' },
      { collectionId: 'developers', articleId: 'platform-rest-api', title: 'Platform REST API', description: 'Auth, base URL, response shape and limits.' },
    ]},
  ],
};
