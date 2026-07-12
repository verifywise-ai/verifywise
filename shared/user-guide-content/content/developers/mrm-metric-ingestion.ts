import type { ArticleContent } from "../../contentTypes";

export const mrmMetricIngestionContent: ArticleContent = {
  blocks: [
    { type: "heading", id: "overview", level: 2, text: "Push model metrics" },
    {
      type: "paragraph",
      text: "Use the metric ingestion API to push model monitoring readings — drift, performance, stability — from your own pipelines. You send raw values; VerifyWise evaluates each point against the model’s thresholds, records an immutable evaluation, and notifies the model’s assigned stakeholders on a breach.",
    },
    { type: "heading", id: "prerequisites", level: 2, text: "Prerequisites" },
    {
      type: "bullet-list",
      items: [
        {
          text: "A model in the model inventory with an **external key**. The key identifies the model in the URL and is set on the model record.",
        },
        {
          text: "An **ingestion token**, created under Model risk management → Settings → Metrics feed & tokens. The token is shown once at creation and only a hash is stored — keep it in your secrets manager. Tokens are org-wide or scoped to a single model, and can be rotated or revoked at any time. Rotation revokes the old token immediately — there is no overlap window, so switch every consumer to the new token as part of the same change.",
        },
      ],
    },
    { type: "heading", id: "endpoint", level: 2, text: "Endpoint" },
    {
      type: "code",
      language: "bash",
      code: "POST https://your-server/api/mrm/models/{externalModelKey}/metrics",
    },
    {
      type: "paragraph",
      text: "`externalModelKey` is your model’s external key, matched within your organization. An unknown key returns 404.",
    },
    { type: "heading", id: "auth", level: 2, text: "Authentication" },
    {
      type: "paragraph",
      text: "Send the ingestion token (it starts with mrm_) as a bearer token on every request. The token identifies your organization — no user session is involved.",
    },
    { type: "code", language: "bash", code: "Authorization: Bearer mrm_..." },
    {
      type: "bullet-list",
      items: [
        {
          text: "An unknown token and a revoked token both return 401 and are deliberately indistinguishable.",
        },
        {
          text: "A model-scoped token used against a different model returns 403.",
        },
      ],
    },
    {
      type: "heading",
      id: "single-point",
      level: 2,
      text: "Send a single point",
    },
    {
      type: "code",
      language: "bash",
      code: 'curl -X POST https://your-server/api/mrm/models/retail-pd-scorecard/metrics \\\n  -H "Authorization: Bearer mrm_..." \\\n  -H "Content-Type: application/json" \\\n  -d \'{\n    "metric": "psi",\n    "value": 0.24,\n    "at": "2026-07-02T14:00:00Z",\n    "window": "daily",\n    "segment": "subprime"\n  }\'',
    },
    {
      type: "table",
      columns: [
        { key: "field", label: "Field", width: "18%" },
        { key: "required", label: "Required", width: "14%" },
        { key: "desc", label: "Description", width: "68%" },
      ],
      rows: [
        {
          field: "metric",
          required: "Yes",
          desc: "Metric name, up to 100 characters. Free-form: a name with no matching threshold is accepted and returns no_threshold.",
        },
        {
          field: "value",
          required: "Yes",
          desc: "A finite number. Booleans, NaN and Infinity are rejected.",
        },
        {
          field: "at",
          required: "Yes",
          desc: "ISO-8601 timestamp of the reading. At most 1 hour in the future; backfilling past readings is allowed. Truncated to the second for deduplication.",
        },
        {
          field: "window",
          required: "No",
          desc: 'Aggregation window label, e.g. "daily". Defaults to none.',
        },
        {
          field: "segment",
          required: "No",
          desc: 'Population segment, e.g. "subprime". Defaults to "overall".',
        },
        {
          field: "context",
          required: "No",
          desc: "Object stored with the point for audit context. Never evaluated.",
        },
      ],
    },
    { type: "heading", id: "batch", level: 2, text: "Send a batch" },
    {
      type: "paragraph",
      text: "Wrap multiple points in a points array. The same fields apply to every point.",
    },
    {
      type: "code",
      language: "json",
      code: '{\n  "points": [\n    { "metric": "psi", "value": 0.24, "at": "2026-07-02T14:00:00Z", "segment": "subprime" },\n    { "metric": "auc", "value": 0.81, "at": "2026-07-02T14:00:00Z" }\n  ]\n}',
    },
    {
      type: "bullet-list",
      items: [
        {
          text: "Validation is all-or-nothing: if any point is invalid, the whole request is rejected with 422 and per-index errors, and nothing is written.",
        },
        {
          text: "There is no fixed cap on batch size; the per-token rate limit (5000 requests per 15 minutes in production) is the volume guard. Keep batches modest so a validation error is easy to locate.",
        },
      ],
    },
    { type: "heading", id: "response", level: 2, text: "Response" },
    {
      type: "paragraph",
      text: "A successful request returns 200 with one result per point. accepted counts newly stored points; duplicates are not included.",
    },
    {
      type: "code",
      language: "json",
      code: '{\n  "message": "OK",\n  "data": {\n    "accepted": 1,\n    "results": [\n      {\n        "metric": "psi",\n        "at": "2026-07-02T14:00:00.000Z",\n        "status": "breach",\n        "pointId": 812,\n        "threshold": { "op": "gt", "value_num": 0.25, "severity": "high" }\n      },\n      {\n        "metric": "auc",\n        "at": "2026-07-02T14:00:00.000Z",\n        "status": "duplicate",\n        "duplicate": true,\n        "pointId": null\n      }\n    ]\n  }\n}',
    },
    {
      type: "table",
      columns: [
        { key: "status", label: "Status", width: "22%" },
        { key: "meaning", label: "Meaning", width: "78%" },
      ],
      rows: [
        {
          status: "ok",
          meaning: "A threshold matched and the value is within it.",
        },
        {
          status: "warn",
          meaning: "The value breached a threshold with severity warn.",
        },
        {
          status: "breach",
          meaning: "The value breached a high or critical threshold.",
        },
        {
          status: "no_threshold",
          meaning:
            "No threshold matched this metric, segment and window. The point is stored.",
        },
        {
          status: "duplicate",
          meaning:
            "An identical point already exists. Nothing new is stored or evaluated.",
        },
      ],
    },
    {
      type: "paragraph",
      text: "When a threshold matched, the result carries a frozen snapshot of it: op is one of gt, gte, lt, lte or outside; scalar operators carry value_num, while outside carries value_lo and value_hi; severity is warn, high or critical. For no_threshold and duplicate results the threshold key is omitted entirely — check for its presence before reading it. pointId is the stored point’s id, or null for duplicates.",
    },
    {
      type: "heading",
      id: "idempotency",
      level: 2,
      text: "Idempotency and deduplication",
    },
    {
      type: "paragraph",
      text: "A point is identified by its model, metric, segment, window and timestamp truncated to the second, within your organization. Re-sending the same point returns 200 with status duplicate: no second row is stored, no second evaluation is recorded, and a breach is never double-counted. Re-delivery is safe by design.",
    },
    {
      type: "callout",
      variant: "tip",
      text: "Distinct sub-second readings of the same metric, segment and window collapse into one point. Send at most one reading per second per series, or separate them with different windows or segments.",
    },
    { type: "heading", id: "errors", level: 2, text: "Errors" },
    {
      type: "paragraph",
      text: "Error bodies vary by status: validation errors (422) return { message, data: { message, errors } } with per-point errors by index; the authentication 401s return { message, data: { message } }; other errors (400, 403, 404) return { message, data } where data is the reason as a plain string. The rate-limit response (429) is flat: { message, statusCode }.",
    },
    {
      type: "table",
      columns: [
        { key: "code", label: "Status", width: "12%" },
        { key: "when", label: "When", width: "48%" },
        { key: "message", label: "Message", width: "40%" },
      ],
      rows: [
        {
          code: "400",
          when: "Blank model key in the path.",
          message: "A model key is required",
        },
        {
          code: "401",
          when: "Missing or malformed Authorization header.",
          message: "Missing or invalid ingestion token",
        },
        {
          code: "401",
          when: "Unknown or revoked token.",
          message: "Ingestion token is invalid or has been revoked",
        },
        {
          code: "403",
          when: "Model-scoped token used on a different model.",
          message: "This token is not scoped to this model",
        },
        {
          code: "404",
          when: "No model with this external key in your organization.",
          message: "Model not found for this key",
        },
        {
          code: "422",
          when: "One or more invalid points, or an empty points array. Nothing is written; errors lists each failing point by index.",
          message: "One or more points are invalid",
        },
        {
          code: "429",
          when: "Token rate limit exceeded (5000 requests per 15 minutes in production). RateLimit headers indicate when to resume.",
          message:
            "Too many metric ingestion requests for this token, please slow down and retry",
        },
      ],
    },
    { type: "heading", id: "retries", level: 2, text: "Retry guidance" },
    {
      type: "bullet-list",
      items: [
        {
          text: "Retry 429 and 5xx with exponential backoff. The 429 response includes RateLimit headers that indicate when to resume.",
        },
        {
          text: "After a timeout or network failure, re-send the whole request. Deduplication makes re-delivery safe; already-stored points come back as duplicate.",
        },
        {
          text: "Do not retry other 4xx responses unchanged. A 422 lists exactly which points failed and why — fix them and resend.",
        },
      ],
    },
    {
      type: "heading",
      id: "after-ingestion",
      level: 2,
      text: "What happens after ingestion",
    },
    {
      type: "paragraph",
      text: "Every newly stored point gets an immutable evaluation with a frozen copy of the threshold it was judged against — the audit record examiners see. A warn or breach sends an in-app notification to the people assigned to the model’s MRM roles, and a threshold set to notify and flag for revalidation also opens or annotates a revalidation task for the model. These steps run after the response is computed and never change it.",
    },
    {
      type: "article-links",
      title: "Related articles",
      items: [
        {
          collectionId: "developers",
          articleId: "platform-rest-api",
          title: "Platform REST API",
          description:
            "Authenticate with a token and read or write your governance data over REST.",
        },
      ],
    },
  ],
};
