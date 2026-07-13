import type { ArticleContent } from '../../contentTypes';

export const developersOverviewContent: ArticleContent = {
  blocks: [
    { type: 'heading', id: 'overview', level: 2, text: 'Developer guide' },
    {
      type: 'paragraph',
      text: 'These docs are for developers building on top of VerifyWise. They cover how to connect your own systems to the platform, with quickstarts, how things behave and API references. For step-by-step help using the screens, see the product guides instead.',
    },
    { type: 'heading', id: 'whats-here', level: 2, text: "What's covered today" },
    {
      type: 'paragraph',
      text: 'The guide covers two areas. Agent Control is how you connect a terminal agent so its tool calls are checked before they run. Claude Code and Cursor have ready-made wiring, and any other agent can use the generic contract. The platform REST API is how you read and write your governance data programmatically with a bearer token.',
    },
    {
      type: 'callout',
      variant: 'info',
      title: 'More guides are coming',
      text: 'This section will grow to cover other developer topics, such as routing model calls through the LLM proxy. For now, start with Agent Control or the platform REST API below.',
    },
    { type: 'heading', id: 'agent-control', level: 2, text: 'Agent Control' },
    {
      type: 'paragraph',
      text: 'Agent Control governs what your agent does. Read these in order, or jump to the API reference when you need a specific endpoint.',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Agent Control: how it works', text: 'What Agent Control governs and the two ways to connect an agent.' },
        { bold: 'Connect your agent', text: 'Get a tool call checked in about 5 minutes, with wiring for Claude Code and Cursor.' },
        { bold: 'Connect any agent', text: 'The generic contract and the MCP proxy path for any other terminal agent.' },
        { bold: 'Governing tool calls', text: 'The four decisions, approval polling, run correlation and fail-modes.' },
        { bold: 'API reference', text: 'Endpoints, headers, auth and error codes for the tool-call hook.' },
      ],
    },
    { type: 'heading', id: 'platform-api', level: 2, text: 'Platform REST API' },
    {
      type: 'paragraph',
      text: 'Read and write your governance data (projects, risks, vendors, models and more) over REST. Authenticate with a token you create in the app, then call the endpoints listed in the interactive API reference.',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Platform REST API', text: 'The base URL, authentication, response shape, status codes and the current limits that apply to every endpoint.' },
        { bold: 'Working with resources', text: 'The CRUD pattern for projects, risks, vendors and more, with the few places they differ.' },
        { bold: 'Bulk importing datasets', text: 'Upload a CSV or spreadsheet to register a dataset through the API.' },
        { bold: 'Automations API', text: 'Create and manage automations programmatically.' },
        { bold: 'Compliance, reports and exports', text: 'Pull compliance progress, generate reports and use the document exports.' },
        { bold: 'Inbound integrations', text: 'Create incidents from another system and submit public intake forms.' },
      ],
    },
    {
      type: 'article-links',
      title: 'Start here',
      items: [
        {
          collectionId: 'developers',
          articleId: 'agent-control-overview',
          title: 'Agent Control: how it works',
          description: 'The concepts behind connecting an agent.',
        },
        {
          collectionId: 'developers',
          articleId: 'connect-your-agent',
          title: 'Connect your agent',
          description: 'The 5-minute quickstart.',
        },
        {
          collectionId: 'developers',
          articleId: 'platform-rest-api',
          title: 'Platform REST API',
          description: 'Authenticate and call the platform endpoints.',
        },
      ],
    },
  ],
};
