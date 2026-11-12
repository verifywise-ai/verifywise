/**
 * LLM Evals demo data for the demo-org seeder (demoOrg.ts).
 *
 * Kept apart from demoOrg.ts so tests can import it: importing demoOrg.ts runs
 * the seed.
 *
 * Each project's `samples` are the prompts of its golden set. The seeded
 * experiments show exactly these prompts, and `dataset.path` points to a file
 * under EvaluationModule/data/datasets/ that holds the same prompts, so a real
 * run on the seeded dataset evaluates what the seeded history shows.
 * demoOrgLlmEvalsData.test.ts fails if the two drift apart.
 *
 * The files live in `demo/`, which the dataset template list does not read, so
 * they never show up as built-in templates.
 */

export type LlmEvalsSample = {
  input: string;
  /** Reference answer: the dataset's expected_output and the log's expected_outcome. */
  expected: string;
  /** What the seeded "model" answered in the backdated runs. */
  output: string;
  /** Retrieved passages for RAG projects (the dataset's retrieval_context). */
  context?: string[];
};

export type LlmEvalsProjectConfig = {
  key: string;
  name: string;
  use_case: "chatbot" | "rag";
  dataset: { name: string; path: string };
  samples: LlmEvalsSample[];
  model: string;
  metrics: string[];
  trajectory: number[]; // one score per experiment, oldest -> newest
};

const SUPPORT_SAMPLES: LlmEvalsSample[] = [
  {
    input: "How do I reset my account password?",
    expected:
      "Go to Settings > Security > Reset Password and follow the emailed link. The link expires in 30 minutes.",
    output:
      "Go to Settings > Security > Reset Password, then follow the emailed link. It expires in 30 minutes.",
  },
  {
    input: "What's your refund policy on annual plans?",
    expected:
      "Annual plans can be refunded within 30 days of purchase, prorated for any months already used.",
    output:
      "Annual plans are refundable within 30 days of purchase, prorated for any months already used.",
  },
  {
    input: "My last invoice looks wrong, can you check it?",
    expected:
      "Explain the extra line item on the last invoice (a mid-cycle seat upgrade) without asking the customer to repeat details.",
    output:
      "I can see your last invoice included a mid-cycle seat upgrade. That's the extra line item you're seeing.",
  },
  {
    input: "How do I export my data before closing my account?",
    expected:
      "Use Settings > Data Export to create a CSV or JSON archive. It is emailed within a few minutes.",
    output:
      "Use Settings > Data Export to generate a CSV/JSON archive; it's emailed to you within a few minutes.",
  },
  {
    input: "Can I change my billing email address?",
    expected: "Yes. Update the billing email at any time under Billing > Contacts.",
    output: "Yes, under Billing > Contacts you can update the billing email at any time.",
  },
  {
    input: "How do I add a new user to my team workspace?",
    expected:
      "Go to Settings > Team > Invite member, enter their email and choose a role. They get an invitation email.",
    output:
      "Open Settings > Team and click Invite member. Enter their email, pick a role, and they'll get an invite by email.",
  },
  {
    input: "Can I pay by bank transfer instead of card?",
    expected:
      "Yes, for annual plans. Choose bank transfer under Billing > Payment methods; invoices are due within 30 days.",
    output:
      "Bank transfer is available on annual plans. Select it under Billing > Payment methods; invoices are payable within 30 days.",
  },
  {
    input: "How do I turn on two-factor authentication?",
    expected:
      "Go to Settings > Security > Two-factor authentication, scan the QR code with an authenticator app and enter the code.",
    output:
      "In Settings > Security, open Two-factor authentication, scan the QR code with your authenticator app and confirm the 6-digit code.",
  },
  {
    input: "Why was my card declined?",
    expected:
      "Common causes are an expired card, a wrong billing address or a bank block. Update the card under Billing > Payment methods or contact the bank.",
    output:
      "Declines usually come from an expired card, a mismatched billing address or your bank blocking the charge. You can update the card under Billing > Payment methods.",
  },
  {
    input: "How do I cancel my subscription?",
    expected:
      "Go to Billing > Plan > Cancel subscription. Access continues until the end of the current billing period.",
    output:
      "Go to Billing > Plan and choose Cancel subscription. You keep access until the end of your current billing period.",
  },
];

const KB_SAMPLES: LlmEvalsSample[] = [
  {
    input: "What is our data retention policy for customer support tickets?",
    expected: "Support tickets are kept for 24 months and then anonymized.",
    output:
      "Per the retention policy document, support tickets are retained for 24 months, then anonymized.",
    context: [
      "Data retention policy, section 4.2: Customer support tickets are retained for 24 months from closure, after which personal data is anonymized.",
    ],
  },
  {
    input: "Summarize the onboarding checklist for new enterprise customers.",
    expected: "Kickoff call, SSO setup, data migration, admin training, and a 30-day check-in.",
    output:
      "The checklist covers: kickoff call, SSO setup, data migration, admin training, and a 30-day check-in.",
    context: [
      "Enterprise onboarding checklist: 1. Kickoff call. 2. SSO setup. 3. Data migration. 4. Admin training. 5. 30-day check-in with the customer success manager.",
    ],
  },
  {
    input: "What SLA tier applies to a Priority 1 incident?",
    expected: "Priority 1 incidents have a 1-hour response SLA and a 4-hour resolution target.",
    output: "Priority 1 incidents carry a 1-hour response SLA and a 4-hour resolution target.",
    context: [
      "Support SLA matrix: Priority 1 (service down) - response within 1 hour, resolution target 4 hours. Priority 2 - response within 4 hours, resolution target 2 business days.",
    ],
  },
  {
    input: "Where is the API rate limit documented?",
    expected:
      "In the 'Rate limits' section of the API reference: 100 requests per minute for standard tier keys.",
    output:
      "The API reference's 'Rate limits' section lists 100 requests/minute for standard tier keys.",
    context: [
      "API reference, Rate limits: Standard tier keys are limited to 100 requests per minute. Enterprise keys can request a higher limit through support.",
    ],
  },
  {
    input: "What's the process for requesting a security questionnaire?",
    expected:
      "Request it through the Trust Center form. Questionnaires are usually returned within 3 business days.",
    output:
      "Security questionnaires are requested via the Trust Center form and are typically returned in 3 business days.",
    context: [
      "Trust Center: Customers request security questionnaires through the Trust Center request form. The security team returns completed questionnaires within 3 business days.",
    ],
  },
  {
    input: "How often must Tier 1 models be revalidated?",
    expected:
      "Tier 1 models are revalidated at least once a year, and again after any material change.",
    output:
      "Tier 1 models need a full revalidation every 12 months, plus an out-of-cycle review after any material change.",
    context: [
      "Model risk management standard, section 6: Tier 1 models undergo independent revalidation at least annually and after any material change to data, methodology or use.",
    ],
  },
  {
    input: "Who approves exceptions to the AI acceptable use policy?",
    expected:
      "The Chief Risk Officer approves exceptions, through the policy exception form, for up to 90 days.",
    output:
      "Exceptions go through the policy exception form and are approved by the Chief Risk Officer, for a maximum of 90 days.",
    context: [
      "AI acceptable use policy, section 9: Exceptions require written approval from the Chief Risk Officer via the policy exception form. Approved exceptions expire after at most 90 days.",
    ],
  },
  {
    input: "Can I paste customer data into a public generative AI tool?",
    expected:
      "No. Only public information may be entered into public AI tools; customer personal data and confidential data are prohibited.",
    output:
      "No. Public AI tools may only receive public information. Customer personal data and anything classified confidential must never be pasted in.",
    context: [
      "AI acceptable use policy, section 5: Only information classified Public may be entered into public generative AI tools. Customer personal data and Confidential or Restricted data are prohibited.",
    ],
  },
  {
    input: "How long do we keep audit logs?",
    expected: "Audit logs are kept for 7 years.",
    output: "Audit logs are retained for seven years, per the data retention policy.",
    context: [
      "Data retention policy, section 4.5: System and access audit logs are retained for 7 years to meet regulatory record-keeping requirements.",
    ],
  },
  {
    input: "What do I do if I suspect a model is producing biased outcomes?",
    expected:
      "Log it in the incident register within 24 hours; the model owner and the model risk team are notified.",
    output:
      "Record it in the incident register within 24 hours. That notifies the model owner and the model risk management team, who triage it.",
    context: [
      "AI incident procedure: Suspected bias or unfair outcomes must be logged in the incident register within 24 hours of discovery. Logging notifies the model owner and the model risk management team.",
    ],
  },
];

export const LLM_EVALS_PROJECTS: LlmEvalsProjectConfig[] = [
  {
    key: "support",
    name: "Support chatbot",
    use_case: "chatbot",
    dataset: {
      name: "Support chatbot golden set",
      path: "demo/support_chatbot_golden_set.json",
    },
    samples: SUPPORT_SAMPLES,
    model: "gpt-4o-mini",
    metrics: ["answerRelevancy", "correctness", "toxicity", "bias"],
    trajectory: [0.61, 0.68, 0.74, 0.82, 0.85],
  },
  {
    key: "kb",
    name: "Knowledge base assistant",
    use_case: "rag",
    dataset: {
      name: "Knowledge base assistant golden set",
      path: "demo/knowledge_base_golden_set.json",
    },
    samples: KB_SAMPLES,
    model: "gpt-4o-mini",
    metrics: ["answerRelevancy", "faithfulness", "contextPrecision", "contextRecall"],
    trajectory: [0.66, 0.72, 0.78, 0.84],
  },
];
