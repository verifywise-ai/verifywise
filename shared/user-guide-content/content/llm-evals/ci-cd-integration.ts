import type { ArticleContent } from '../../contentTypes';

export const ciCdIntegrationContent: ArticleContent = {
  blocks: [
    {
      type: 'heading',
      id: 'overview',
      level: 2,
      text: 'Overview',
    },
    {
      type: 'paragraph',
      text: 'You can run LLM evaluations automatically in your CI/CD pipeline. Every time someone opens a pull request or pushes to a branch, the pipeline evaluates your model against a test dataset and blocks the merge if quality drops below your threshold.',
    },
    {
      type: 'paragraph',
      text: 'This works with GitHub Actions out of the box. For other CI systems (GitLab, Jenkins, CircleCI), a standalone Python script and CLI are available too.',
    },
    {
      type: 'heading',
      id: 'what-it-does',
      level: 2,
      text: 'What it does',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Creates an evaluation experiment on your VerifyWise instance.' },
        { text: 'Runs your model against the dataset you specify.' },
        { text: 'An LLM judge scores each response on the metrics you chose (answer_relevancy, bias, toxicity, faithfulness, hallucination, contextual_relevancy).' },
        { text: 'If any metric falls below the threshold, the CI step fails and the PR is blocked.' },
        { text: 'Results are posted as a PR comment, uploaded as build artifacts and stored in your VerifyWise dashboard.' },
      ],
    },
    {
      type: 'heading',
      id: 'github-actions',
      level: 2,
      text: 'GitHub Actions setup',
    },
    {
      type: 'paragraph',
      text: 'Add this file to your repository at `.github/workflows/llm-eval.yml`:',
    },
    {
      type: 'code',
      language: 'yaml',
      code: `name: LLM Quality Gate

on:
  pull_request:
    branches: [main, develop]

jobs:
  eval:
    name: Evaluate LLM
    runs-on: ubuntu-latest
    permissions:
      pull-requests: write
      contents: read
    steps:
      - uses: actions/checkout@v4

      - name: Run evaluation
        uses: verifywise-ai/verifywise-eval-action@v1
        with:
          api_url: https://your-verifywise-instance.com
          project_id: proj_abc
          dataset_id: '2'
          metrics: answer_relevancy,faithfulness,hallucination
          model_name: gpt-4o-mini
          model_provider: openai
          threshold: '0.7'
          vw_api_token: \${{ secrets.VW_API_TOKEN }}
          llm_api_key: \${{ secrets.LLM_API_KEY }}`,
    },
    {
      type: 'heading',
      id: 'secrets',
      level: 2,
      text: 'Required secrets',
    },
    {
      type: 'paragraph',
      text: 'Add these in your GitHub repo under Settings > Secrets and variables > Actions:',
    },
    {
      type: 'table',
      columns: [
        { key: 'secret', label: 'Secret', width: '25%' },
        { key: 'required', label: 'Required', width: '15%' },
        { key: 'description', label: 'Where to get it', width: '60%' },
      ],
      rows: [
        { secret: 'VW_API_TOKEN', required: 'Yes', description: 'VerifyWise dashboard > Settings > API tokens' },
        { secret: 'LLM_API_KEY', required: 'Yes', description: 'API key for the model being evaluated (OpenAI, Anthropic, etc.)' },
        { secret: 'JUDGE_API_KEY', required: 'No', description: 'API key for the judge LLM. Only needed when the model and judge use different providers.' },
      ],
    },
    {
      type: 'callout',
      variant: 'info',
      title: 'Model vs judge',
      text: 'The evaluation uses two LLMs: the model generates responses and the judge scores them. If both use the same provider (e.g. both OpenAI), a single LLM_API_KEY is enough. If they use different providers, set JUDGE_API_KEY separately.',
    },
    {
      type: 'heading',
      id: 'inputs',
      level: 2,
      text: 'Configuration options',
    },
    {
      type: 'table',
      columns: [
        { key: 'input', label: 'Input', width: '25%' },
        { key: 'default', label: 'Default', width: '15%' },
        { key: 'description', label: 'Description', width: '60%' },
      ],
      rows: [
        { input: 'api_url', default: '(required)', description: 'Base URL of your VerifyWise instance' },
        { input: 'project_id', default: '(required)', description: 'Project ID from the VerifyWise dashboard' },
        { input: 'dataset_id', default: '(required)', description: 'Dataset to evaluate against' },
        { input: 'metrics', default: '(required)', description: 'Comma-separated metric names' },
        { input: 'model_name', default: '(required)', description: 'Model to evaluate (e.g. gpt-4o-mini)' },
        { input: 'model_provider', default: '(required)', description: 'openai, anthropic, google, mistral, xai, or self-hosted' },
        { input: 'threshold', default: '0.7', description: 'Pass/fail threshold (0.0 to 1.0)' },
        { input: 'judge_model', default: 'gpt-4o', description: 'LLM used to score responses' },
        { input: 'judge_provider', default: 'openai', description: 'Provider for the judge LLM' },
        { input: 'timeout_minutes', default: '30', description: 'Max wait time before timing out' },
        { input: 'fail_on_threshold', default: 'true', description: 'Set to false to report without failing the build' },
        { input: 'post_pr_comment', default: 'true', description: 'Post results as a PR comment' },
      ],
    },
    {
      type: 'heading',
      id: 'metrics',
      level: 2,
      text: 'Available metrics',
    },
    {
      type: 'paragraph',
      text: 'Choose the metrics that matter for your use case. Standard metrics pass when the score is at or above the threshold. Inverted metrics (hallucination, toxicity, bias) pass when the score is at or below the threshold.',
    },
    {
      type: 'table',
      columns: [
        { key: 'metric', label: 'Metric', width: '25%' },
        { key: 'category', label: 'Category', width: '15%' },
        { key: 'description', label: 'What it measures', width: '60%' },
      ],
      rows: [
        { metric: 'answer_relevancy', category: 'Universal', description: 'Is the response relevant to what was asked?' },
        { metric: 'hallucination', category: 'Universal', description: 'How much of the response is fabricated? (lower is better)' },
        { metric: 'toxicity', category: 'Universal', description: 'Does the response contain harmful content? (lower is better)' },
        { metric: 'bias', category: 'Universal', description: 'Does the response exhibit unfair bias? (lower is better)' },
        { metric: 'faithfulness', category: 'RAG', description: 'Is the response grounded in the provided context?' },
        { metric: 'contextual_relevancy', category: 'RAG', description: 'Is the retrieved context relevant?' },
      ],
    },
    {
      type: 'callout',
      variant: 'info',
      title: 'RAG metrics are off by default',
      text: '`faithfulness` and `contextual_relevancy` are only meaningful when the model has retrieved context to evaluate against. Enable them in your experiment config only for RAG use cases; for non-RAG evaluations leave them disabled to avoid noisy or incorrect scores.',
    },
    {
      type: 'heading',
      id: 'other-ci',
      level: 2,
      text: 'Using with other CI systems',
    },
    {
      type: 'paragraph',
      text: 'For GitLab CI, Jenkins, CircleCI or any other system, use the standalone Python script. It only needs the requests library:',
    },
    {
      type: 'code',
      language: 'bash',
      code: `pip install requests

python ci_eval_runner.py \\
  --api-url "$VW_API_URL" --token "$VW_API_TOKEN" \\
  --project-id "$VW_PROJECT_ID" --dataset-id "$VW_DATASET_ID" \\
  --metrics "answer_relevancy,faithfulness" \\
  --model-name "gpt-4o-mini" --model-provider "openai" \\
  --threshold 0.7 \\
  --output results.json --markdown-output summary.md`,
    },
    {
      type: 'paragraph',
      text: 'The script exits with code 0 if all metrics pass, 1 if any metric fails and 2 on errors. Download ci_eval_runner.py from the verifywise-eval-action repository.',
    },
    {
      type: 'heading',
      id: 'python-sdk',
      level: 2,
      text: 'Python SDK',
    },
    {
      type: 'paragraph',
      text: 'For more control, install the Python SDK and call the API directly:',
    },
    {
      type: 'code',
      language: 'python',
      code: `pip install verifywise

from verifywise import VerifyWiseClient

client = VerifyWiseClient(
    api_url="https://your-instance.com",
    token="your-token"
)

results = client.experiments.run_and_wait(
    project_id="proj_abc",
    name="Nightly Eval",
    model_name="gpt-4o-mini",
    model_provider="openai",
    dataset_id="2",
    metrics=["answer_relevancy", "hallucination"],
    threshold=0.7,
)

assert results.passed, f"Failed: {[m.name for m in results.metrics if not m.passed]}"`,
    },
    {
      type: 'heading',
      id: 'finding-ids',
      level: 2,
      text: 'Finding your project and dataset IDs',
    },
    {
      type: 'ordered-list',
      items: [
        { text: '**Project ID**: Open LLM Evals in the sidebar, click on your project. The ID is in the URL.' },
        { text: '**Dataset ID**: Go to the Datasets tab in your project. Click any dataset to see its ID.' },
        { text: '**API token**: Go to Settings > API tokens in the main VerifyWise sidebar.' },
      ],
    },
    {
      type: 'heading',
      id: 'viewing-results',
      level: 2,
      text: 'Viewing results',
    },
    {
      type: 'paragraph',
      text: 'CI-triggered experiments appear in the same Experiments list as manually run ones. You can see the scores, compare against previous runs and drill into individual prompt-level results from the VerifyWise dashboard.',
    },
    {
      type: 'article-links',
      title: 'Related articles',
      items: [
        {
          collectionId: 'llm-evals',
          articleId: 'running-experiments',
          title: 'Running experiments',
          description: 'Learn how to run evaluations manually from the dashboard.',
        },
        {
          collectionId: 'llm-evals',
          articleId: 'managing-datasets',
          title: 'Managing datasets',
          description: 'Upload and manage the test datasets used by CI evaluations.',
        },
        {
          collectionId: 'llm-evals',
          articleId: 'configuring-scorers',
          title: 'Configuring scorers',
          description: 'Customize the LLM judge metrics used in evaluations.',
        },
      ],
    },
  ],
};
