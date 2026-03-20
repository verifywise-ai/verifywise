/**
 * Shadow AI demo data for the autoDriver.
 *
 * Provides insert and delete functions that participate in the autoDriver's
 * transaction so Shadow AI is populated/cleaned alongside governance entities.
 *
 * Data: 10 tools, ~650 events across 40 fake employees in 6 departments,
 * daily + monthly rollups, 3 rules, and 8 alert-history records.
 */

import { Transaction, QueryTypes } from "sequelize";
import { sequelize } from "../../database/db";

// ---------------------------------------------------------------------------
// Seeded RNG (deterministic output)
// ---------------------------------------------------------------------------

class SeededRandom {
  private seed: number;
  constructor(seed: number) {
    this.seed = seed;
  }
  next(): number {
    this.seed = (this.seed * 16807 + 0) % 2147483647;
    return this.seed / 2147483647;
  }
  int(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }
  pick<T>(arr: T[]): T {
    return arr[this.int(0, arr.length - 1)];
  }
}

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

interface ToolDefinition {
  name: string;
  vendor: string;
  domains: string[];
  status: string;
  risk_score: number;
  total_users: number;
  total_events: number;
  trains_on_data: boolean;
  soc2_certified: boolean;
  gdpr_compliant: boolean;
  sso_support: boolean;
  encryption_at_rest: boolean;
  data_residency: string | null;
  uri_paths: string[];
}

const TOOLS: ToolDefinition[] = [
  {
    name: "ChatGPT",
    vendor: "OpenAI",
    domains: ["chat.openai.com", "chatgpt.com"],
    status: "approved",
    risk_score: 45,
    total_users: 32,
    total_events: 1247,
    trains_on_data: true,
    soc2_certified: true,
    gdpr_compliant: true,
    sso_support: true,
    encryption_at_rest: true,
    data_residency: "US",
    uri_paths: [
      "/backend-api/conversation",
      "/backend-api/models",
      "/api/auth/session",
    ],
  },
  {
    name: "Claude AI",
    vendor: "Anthropic",
    domains: ["claude.ai"],
    status: "under_review",
    risk_score: 38,
    total_users: 28,
    total_events: 986,
    trains_on_data: false,
    soc2_certified: true,
    gdpr_compliant: true,
    sso_support: true,
    encryption_at_rest: true,
    data_residency: "US",
    uri_paths: [
      "/api/messages",
      "/api/organizations",
      "/api/chat_conversations",
    ],
  },
  {
    name: "Cursor",
    vendor: "Anysphere",
    domains: ["cursor.sh", "cursor.com", "api2.cursor.sh"],
    status: "detected",
    risk_score: 52,
    total_users: 15,
    total_events: 2103,
    trains_on_data: false,
    soc2_certified: false,
    gdpr_compliant: false,
    sso_support: false,
    encryption_at_rest: true,
    data_residency: null,
    uri_paths: [
      "/aiserver.v1.AiService/StreamChat",
      "/api/usage",
      "/api/auth/me",
    ],
  },
  {
    name: "GitHub Copilot",
    vendor: "GitHub/Microsoft",
    domains: ["copilot.github.com", "copilot.githubassets.com"],
    status: "approved",
    risk_score: 30,
    total_users: 22,
    total_events: 3450,
    trains_on_data: false,
    soc2_certified: true,
    gdpr_compliant: true,
    sso_support: true,
    encryption_at_rest: true,
    data_residency: "US",
    uri_paths: [
      "/v1/engines/copilot-codex/completions",
      "/v1/completions",
      "/telemetry",
    ],
  },
  {
    name: "Midjourney",
    vendor: "Midjourney",
    domains: ["midjourney.com", "www.midjourney.com"],
    status: "restricted",
    risk_score: 72,
    total_users: 8,
    total_events: 234,
    trains_on_data: true,
    soc2_certified: false,
    gdpr_compliant: false,
    sso_support: false,
    encryption_at_rest: false,
    data_residency: null,
    uri_paths: ["/api/app/job/imagine", "/api/app/recent-jobs", "/api/auth"],
  },
  {
    name: "Gemini",
    vendor: "Google",
    domains: ["gemini.google.com"],
    status: "detected",
    risk_score: 42,
    total_users: 18,
    total_events: 567,
    trains_on_data: true,
    soc2_certified: true,
    gdpr_compliant: true,
    sso_support: true,
    encryption_at_rest: true,
    data_residency: "US",
    uri_paths: [
      "/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate",
      "/app",
      "/faq",
    ],
  },
  {
    name: "Perplexity",
    vendor: "Perplexity AI",
    domains: ["perplexity.ai", "www.perplexity.ai"],
    status: "detected",
    risk_score: 48,
    total_users: 12,
    total_events: 389,
    trains_on_data: false,
    soc2_certified: false,
    gdpr_compliant: false,
    sso_support: false,
    encryption_at_rest: true,
    data_residency: null,
    uri_paths: ["/api/query", "/api/search", "/api/auth/signin"],
  },
  {
    name: "DALL-E",
    vendor: "OpenAI",
    domains: ["labs.openai.com"],
    status: "blocked",
    risk_score: 85,
    total_users: 5,
    total_events: 67,
    trains_on_data: true,
    soc2_certified: true,
    gdpr_compliant: true,
    sso_support: true,
    encryption_at_rest: true,
    data_residency: "US",
    uri_paths: ["/api/labs/tasks", "/api/labs/generations", "/api/labs/edits"],
  },
  {
    name: "Hugging Face",
    vendor: "Hugging Face",
    domains: ["huggingface.co", "api-inference.huggingface.co"],
    status: "detected",
    risk_score: 55,
    total_users: 7,
    total_events: 156,
    trains_on_data: false,
    soc2_certified: true,
    gdpr_compliant: true,
    sso_support: true,
    encryption_at_rest: true,
    data_residency: "US/EU",
    uri_paths: ["/api/models", "/api/inference", "/api/datasets"],
  },
  {
    name: "Bolt.new",
    vendor: "StackBlitz",
    domains: ["bolt.new"],
    status: "detected",
    risk_score: 61,
    total_users: 4,
    total_events: 89,
    trains_on_data: false,
    soc2_certified: false,
    gdpr_compliant: false,
    sso_support: false,
    encryption_at_rest: false,
    data_residency: null,
    uri_paths: ["/api/chat", "/api/project", "/api/enhance"],
  },
];

// ---------------------------------------------------------------------------
// Employee pool (~40 fake users across 6 departments)
// ---------------------------------------------------------------------------

interface Employee {
  email: string;
  department: string;
  job_title: string;
  manager_email: string;
}

const DEPARTMENTS: Record<string, { titles: string[]; manager: string }> = {
  Engineering: {
    titles: [
      "Software Engineer",
      "Senior Software Engineer",
      "Staff Engineer",
      "Engineering Manager",
      "DevOps Engineer",
      "QA Engineer",
      "Frontend Developer",
      "Backend Developer",
    ],
    manager: "david.kumar@acmecorp.com",
  },
  Product: {
    titles: [
      "Product Manager",
      "Senior Product Manager",
      "Product Designer",
      "UX Researcher",
      "Product Analyst",
    ],
    manager: "sarah.chen@acmecorp.com",
  },
  Marketing: {
    titles: [
      "Marketing Manager",
      "Content Strategist",
      "Growth Analyst",
      "Brand Designer",
      "SEO Specialist",
    ],
    manager: "emily.wright@acmecorp.com",
  },
  Finance: {
    titles: [
      "Financial Analyst",
      "Senior Accountant",
      "Finance Manager",
      "Revenue Analyst",
    ],
    manager: "robert.james@acmecorp.com",
  },
  Legal: {
    titles: [
      "Legal Counsel",
      "Compliance Officer",
      "Privacy Analyst",
      "Paralegal",
    ],
    manager: "maria.rodriguez@acmecorp.com",
  },
  HR: {
    titles: [
      "HR Business Partner",
      "Talent Acquisition Lead",
      "People Operations Manager",
      "Compensation Analyst",
    ],
    manager: "jessica.patel@acmecorp.com",
  },
};

const FIRST_NAMES = [
  "James", "Olivia", "Liam", "Emma", "Noah", "Ava", "Ethan", "Sophia",
  "Mason", "Isabella", "Lucas", "Mia", "Alexander", "Charlotte", "Daniel",
  "Amelia", "Henry", "Harper", "Sebastian", "Evelyn", "Jack", "Abigail",
  "Owen", "Ella", "Ryan", "Lily", "Nathan", "Grace", "Caleb", "Chloe",
  "Adrian", "Zoe", "Leo", "Hannah", "Isaac", "Nora", "Aaron", "Riley",
  "Connor", "Aria",
];

const LAST_NAMES = [
  "Anderson", "Martinez", "Thompson", "Garcia", "Robinson", "Clark",
  "Lewis", "Lee", "Walker", "Hall", "Young", "Hernandez", "King",
  "Wright", "Lopez", "Hill", "Scott", "Green", "Adams", "Baker",
  "Nelson", "Carter", "Mitchell", "Perez", "Roberts", "Turner",
  "Phillips", "Campbell", "Parker", "Evans", "Edwards", "Collins",
  "Stewart", "Morris", "Murphy", "Rivera", "Cook", "Rogers", "Morgan",
  "Cooper",
];

const DEPT_WEIGHTS: Record<string, number> = {
  Engineering: 14,
  Product: 7,
  Marketing: 7,
  Finance: 5,
  Legal: 4,
  HR: 3,
};

function buildEmployeePool(): Employee[] {
  const pool: Employee[] = [];
  let idx = 0;
  for (const dept of Object.keys(DEPARTMENTS)) {
    const count = DEPT_WEIGHTS[dept];
    const info = DEPARTMENTS[dept];
    for (let i = 0; i < count; i++) {
      const first = FIRST_NAMES[idx % FIRST_NAMES.length].toLowerCase();
      const last = LAST_NAMES[idx % LAST_NAMES.length].toLowerCase();
      pool.push({
        email: `${first}.${last}@acmecorp.com`,
        department: dept,
        job_title: info.titles[i % info.titles.length],
        manager_email: info.manager,
      });
      idx++;
    }
  }
  return pool;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateTimestamp(rng: SeededRandom, daysBack: number): Date {
  const now = new Date();
  const msBack = daysBack * 24 * 60 * 60 * 1000;

  if (rng.next() < 0.7) {
    const dayOffset = rng.int(0, daysBack - 1);
    const target = new Date(now.getTime() - dayOffset * 24 * 60 * 60 * 1000);
    const dow = target.getUTCDay();
    if (dow === 0) target.setUTCDate(target.getUTCDate() + 1);
    if (dow === 6) target.setUTCDate(target.getUTCDate() - 1);
    target.setUTCHours(rng.int(8, 17), rng.int(0, 59), rng.int(0, 59), 0);
    return target;
  }

  const earliest = now.getTime() - msBack;
  return new Date(earliest + rng.next() * msBack);
}

function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

function buildToolWeights(tools: ToolDefinition[]): number[] {
  const total = tools.reduce((s, t) => s + t.total_events, 0);
  return tools.map((t) => t.total_events / total);
}

function weightedPick(rng: SeededRandom, weights: number[]): number {
  const r = rng.next();
  let cumulative = 0;
  for (let i = 0; i < weights.length; i++) {
    cumulative += weights[i];
    if (r <= cumulative) return i;
  }
  return weights.length - 1;
}

// ---------------------------------------------------------------------------
// Check whether shadow AI tables exist in the public schema
// ---------------------------------------------------------------------------

async function shadowAiTablesExist(
  transaction: Transaction
): Promise<boolean> {
  const result = await sequelize.query(
    `SELECT to_regclass('shadow_ai_tools') AS tbl`,
    { type: QueryTypes.SELECT, transaction }
  );
  return !!(result[0] as any)?.tbl;
}

// ---------------------------------------------------------------------------
// INSERT
// ---------------------------------------------------------------------------

const BATCH_SIZE = 100;

export async function insertShadowAiDemoData(
  organizationId: number,
  userId: number,
  transaction: Transaction
): Promise<void> {
  // Gracefully skip if shadow AI tables don't exist
  if (!(await shadowAiTablesExist(transaction))) {
    return;
  }

  // Idempotent: skip if tools already seeded for this organization
  const existing = await sequelize.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM shadow_ai_tools WHERE organization_id = :organizationId`,
    { type: QueryTypes.SELECT, transaction, replacements: { organizationId } }
  );
  if (parseInt(existing[0].count) > 0) {
    return;
  }

  const rng = new SeededRandom(42);
  const now = new Date();

  // ---- 1. Insert tools ----

  const toolIdMap = new Map<string, number>();

  for (const tool of TOOLS) {
    const firstDetected = new Date(
      now.getTime() - rng.int(7, 30) * 24 * 60 * 60 * 1000
    );
    const lastSeen = new Date(
      now.getTime() - rng.int(0, 3) * 24 * 60 * 60 * 1000
    );

    const [inserted] = await sequelize.query<{ id: number }>(
      `INSERT INTO shadow_ai_tools
        (organization_id, name, vendor, domains, status, risk_score, first_detected_at, last_seen_at,
         total_users, total_events, trains_on_data, soc2_certified, gdpr_compliant,
         data_residency, sso_support, encryption_at_rest, created_at, updated_at)
       VALUES
        (:organizationId, :name, :vendor, :domains, :status, :risk_score, :first_detected_at, :last_seen_at,
         :total_users, :total_events, :trains_on_data, :soc2_certified, :gdpr_compliant,
         :data_residency, :sso_support, :encryption_at_rest, NOW(), NOW())
       RETURNING id`,
      {
        type: QueryTypes.SELECT,
        transaction,
        replacements: {
          organizationId,
          name: tool.name,
          vendor: tool.vendor,
          domains: `{${tool.domains.join(",")}}`,
          status: tool.status,
          risk_score: tool.risk_score,
          first_detected_at: firstDetected.toISOString(),
          last_seen_at: lastSeen.toISOString(),
          total_users: tool.total_users,
          total_events: tool.total_events,
          trains_on_data: tool.trains_on_data,
          soc2_certified: tool.soc2_certified,
          gdpr_compliant: tool.gdpr_compliant,
          data_residency: tool.data_residency,
          sso_support: tool.sso_support,
          encryption_at_rest: tool.encryption_at_rest,
        },
      }
    );

    toolIdMap.set(tool.name, inserted.id);
  }

  // ---- 2. Generate and insert events ----

  const employees = buildEmployeePool();
  const toolWeights = buildToolWeights(TOOLS);
  const eventCount = rng.int(550, 750);

  interface EventRow {
    user_email: string;
    destination: string;
    uri_path: string;
    http_method: string;
    action: string;
    detected_tool_id: number;
    event_timestamp: string;
    department: string;
    job_title: string;
    manager_email: string;
  }

  const events: EventRow[] = [];

  for (let i = 0; i < eventCount; i++) {
    const toolIdx = weightedPick(rng, toolWeights);
    const tool = TOOLS[toolIdx];
    const employee = rng.pick(employees);
    const domain = rng.pick(tool.domains);
    const uriPath = rng.pick(tool.uri_paths);
    const httpMethod = rng.next() < 0.7 ? "POST" : "GET";

    let action: string;
    if (tool.status === "blocked") {
      action = "blocked";
    } else {
      action = rng.next() < 0.9 ? "allowed" : "blocked";
    }

    const ts = generateTimestamp(rng, 30);

    events.push({
      user_email: employee.email,
      destination: domain,
      uri_path: uriPath,
      http_method: httpMethod,
      action,
      detected_tool_id: toolIdMap.get(tool.name)!,
      event_timestamp: ts.toISOString(),
      department: employee.department,
      job_title: employee.job_title,
      manager_email: employee.manager_email,
    });
  }

  // Batch insert events
  const eventBatches = chunk(events, BATCH_SIZE);
  let insertedEvents = 0;

  for (const batch of eventBatches) {
    const valuePlaceholders: string[] = [];
    const flatReplacements: Record<string, any> = { organizationId };

    batch.forEach((evt, idx) => {
      const prefix = `e${insertedEvents + idx}`;
      valuePlaceholders.push(
        `(:organizationId, :${prefix}_ue, :${prefix}_dest, :${prefix}_uri, :${prefix}_hm, :${prefix}_act, :${prefix}_tid, :${prefix}_ts, NOW(), :${prefix}_dept, :${prefix}_jt, :${prefix}_me)`
      );
      flatReplacements[`${prefix}_ue`] = evt.user_email;
      flatReplacements[`${prefix}_dest`] = evt.destination;
      flatReplacements[`${prefix}_uri`] = evt.uri_path;
      flatReplacements[`${prefix}_hm`] = evt.http_method;
      flatReplacements[`${prefix}_act`] = evt.action;
      flatReplacements[`${prefix}_tid`] = evt.detected_tool_id;
      flatReplacements[`${prefix}_ts`] = evt.event_timestamp;
      flatReplacements[`${prefix}_dept`] = evt.department;
      flatReplacements[`${prefix}_jt`] = evt.job_title;
      flatReplacements[`${prefix}_me`] = evt.manager_email;
    });

    await sequelize.query(
      `INSERT INTO shadow_ai_events
        (organization_id, user_email, destination, uri_path, http_method, action, detected_tool_id,
         event_timestamp, ingested_at, department, job_title, manager_email)
       VALUES ${valuePlaceholders.join(", ")}`,
      { replacements: flatReplacements, transaction }
    );

    insertedEvents += batch.length;
  }

  // ---- 3. Build and insert daily rollups ----

  const rollupKey = (date: string, email: string, toolId: number) =>
    `${date}|${email}|${toolId}`;

  interface RollupAccum {
    rollup_date: string;
    user_email: string;
    tool_id: number;
    department: string;
    total_events: number;
    post_events: number;
    blocked_events: number;
  }

  const rollupMap = new Map<string, RollupAccum>();

  for (const evt of events) {
    const dateStr = evt.event_timestamp.slice(0, 10);
    const key = rollupKey(dateStr, evt.user_email, evt.detected_tool_id);

    if (!rollupMap.has(key)) {
      rollupMap.set(key, {
        rollup_date: dateStr,
        user_email: evt.user_email,
        tool_id: evt.detected_tool_id,
        department: evt.department,
        total_events: 0,
        post_events: 0,
        blocked_events: 0,
      });
    }

    const acc = rollupMap.get(key)!;
    acc.total_events++;
    if (evt.http_method === "POST") acc.post_events++;
    if (evt.action === "blocked") acc.blocked_events++;
  }

  const rollups = Array.from(rollupMap.values());
  const rollupBatches = chunk(rollups, BATCH_SIZE);
  let insertedRollups = 0;

  for (const batch of rollupBatches) {
    const valuePlaceholders: string[] = [];
    const flatReplacements: Record<string, any> = { organizationId };

    batch.forEach((r, idx) => {
      const prefix = `r${insertedRollups + idx}`;
      valuePlaceholders.push(
        `(:organizationId, :${prefix}_rd, :${prefix}_ue, :${prefix}_tid, :${prefix}_dept, :${prefix}_te, :${prefix}_pe, :${prefix}_be, NOW())`
      );
      flatReplacements[`${prefix}_rd`] = r.rollup_date;
      flatReplacements[`${prefix}_ue`] = r.user_email;
      flatReplacements[`${prefix}_tid`] = r.tool_id;
      flatReplacements[`${prefix}_dept`] = r.department;
      flatReplacements[`${prefix}_te`] = r.total_events;
      flatReplacements[`${prefix}_pe`] = r.post_events;
      flatReplacements[`${prefix}_be`] = r.blocked_events;
    });

    await sequelize.query(
      `INSERT INTO shadow_ai_daily_rollups
        (organization_id, rollup_date, user_email, tool_id, department, total_events, post_events, blocked_events, created_at)
       VALUES ${valuePlaceholders.join(", ")}`,
      { replacements: flatReplacements, transaction }
    );

    insertedRollups += batch.length;
  }

  // ---- 4. Build and insert monthly rollups ----

  const monthlyKey = (month: string, toolId: number, dept: string) =>
    `${month}|${toolId}|${dept}`;

  interface MonthlyAccum {
    rollup_month: string;
    tool_id: number;
    department: string;
    unique_users: Set<string>;
    total_events: number;
    post_events: number;
    blocked_events: number;
  }

  const monthlyMap = new Map<string, MonthlyAccum>();

  for (const evt of events) {
    const monthStr = evt.event_timestamp.slice(0, 7) + "-01"; // YYYY-MM-01
    const key = monthlyKey(monthStr, evt.detected_tool_id, evt.department);

    if (!monthlyMap.has(key)) {
      monthlyMap.set(key, {
        rollup_month: monthStr,
        tool_id: evt.detected_tool_id,
        department: evt.department,
        unique_users: new Set(),
        total_events: 0,
        post_events: 0,
        blocked_events: 0,
      });
    }

    const acc = monthlyMap.get(key)!;
    acc.unique_users.add(evt.user_email);
    acc.total_events++;
    if (evt.http_method === "POST") acc.post_events++;
    if (evt.action === "blocked") acc.blocked_events++;
  }

  for (const acc of monthlyMap.values()) {
    await sequelize.query(
      `INSERT INTO shadow_ai_monthly_rollups
        (organization_id, rollup_month, tool_id, department, unique_users, total_events, post_events, blocked_events, created_at)
       VALUES (:organizationId, :rollup_month, :tool_id, :department, :unique_users, :total_events, :post_events, :blocked_events, NOW())`,
      {
        replacements: {
          organizationId,
          rollup_month: acc.rollup_month,
          tool_id: acc.tool_id,
          department: acc.department,
          unique_users: acc.unique_users.size,
          total_events: acc.total_events,
          post_events: acc.post_events,
          blocked_events: acc.blocked_events,
        },
        transaction,
      }
    );
  }

  // ---- 5. Insert rules ----

  const ruleIdMap = new Map<string, number>();

  const rules = [
    {
      name: "New AI tool alert",
      description:
        "Fires when a previously unseen AI tool is detected in network traffic.",
      trigger_type: "new_tool_detected",
      trigger_config: {},
      actions: { notify: true, create_alert: true },
    },
    {
      name: "High risk tool alert",
      description:
        "Fires when a detected tool has a risk score above the configured threshold.",
      trigger_type: "risk_score_exceeded",
      trigger_config: { risk_score_min: 70 },
      actions: { notify: true, create_alert: true, auto_block: false },
    },
    {
      name: "Sensitive department usage",
      description:
        "Fires when employees in sensitive departments use shadow AI tools.",
      trigger_type: "sensitive_department",
      trigger_config: { departments: ["Finance", "Legal", "HR"] },
      actions: { notify: true, create_alert: true },
    },
  ];

  for (const rule of rules) {
    const [inserted] = await sequelize.query<{ id: number }>(
      `INSERT INTO shadow_ai_rules
        (organization_id, name, description, is_active, trigger_type, trigger_config, actions, created_by, created_at, updated_at)
       VALUES
        (:organizationId, :name, :description, false, :trigger_type, :trigger_config, :actions, :created_by, NOW(), NOW())
       RETURNING id`,
      {
        type: QueryTypes.SELECT,
        transaction,
        replacements: {
          organizationId,
          name: rule.name,
          description: rule.description,
          trigger_type: rule.trigger_type,
          trigger_config: JSON.stringify(rule.trigger_config),
          actions: JSON.stringify(rule.actions),
          created_by: userId,
        },
      }
    );

    ruleIdMap.set(rule.trigger_type, inserted.id);
  }

  // ---- 6. Insert alert history ----

  const alerts = [
    {
      trigger_type: "new_tool_detected",
      rule_name: "New AI tool alert",
      trigger_data: {
        tool_name: "Cursor",
        vendor: "Anysphere",
        first_user: "liam.thompson@acmecorp.com",
      },
      actions_taken: { notified_users: [userId], alert_created: true },
      days_ago: 22,
    },
    {
      trigger_type: "new_tool_detected",
      rule_name: "New AI tool alert",
      trigger_data: {
        tool_name: "Bolt.new",
        vendor: "StackBlitz",
        first_user: "leo.stewart@acmecorp.com",
      },
      actions_taken: { notified_users: [userId], alert_created: true },
      days_ago: 14,
    },
    {
      trigger_type: "new_tool_detected",
      rule_name: "New AI tool alert",
      trigger_data: {
        tool_name: "Perplexity",
        vendor: "Perplexity AI",
        first_user: "henry.wright@acmecorp.com",
      },
      actions_taken: { notified_users: [userId], alert_created: true },
      days_ago: 9,
    },
    {
      trigger_type: "risk_score_exceeded",
      rule_name: "High risk tool alert",
      trigger_data: {
        tool_name: "DALL-E",
        risk_score: 85,
        threshold: 70,
      },
      actions_taken: { notified_users: [userId], alert_created: true },
      days_ago: 18,
    },
    {
      trigger_type: "risk_score_exceeded",
      rule_name: "High risk tool alert",
      trigger_data: {
        tool_name: "Midjourney",
        risk_score: 72,
        threshold: 70,
      },
      actions_taken: { notified_users: [userId], alert_created: true },
      days_ago: 11,
    },
    {
      trigger_type: "sensitive_department",
      rule_name: "Sensitive department usage",
      trigger_data: {
        user_email: "nathan.green@acmecorp.com",
        department: "Finance",
        tool_name: "ChatGPT",
      },
      actions_taken: { notified_users: [userId], alert_created: true },
      days_ago: 20,
    },
    {
      trigger_type: "sensitive_department",
      rule_name: "Sensitive department usage",
      trigger_data: {
        user_email: "caleb.baker@acmecorp.com",
        department: "Legal",
        tool_name: "Claude AI",
      },
      actions_taken: { notified_users: [userId], alert_created: true },
      days_ago: 7,
    },
    {
      trigger_type: "sensitive_department",
      rule_name: "Sensitive department usage",
      trigger_data: {
        user_email: "aaron.nelson@acmecorp.com",
        department: "HR",
        tool_name: "Gemini",
      },
      actions_taken: { notified_users: [userId], alert_created: true },
      days_ago: 3,
    },
  ];

  for (const alert of alerts) {
    const ruleId = ruleIdMap.get(alert.trigger_type);
    const firedAt = new Date(
      now.getTime() - alert.days_ago * 24 * 60 * 60 * 1000
    );

    await sequelize.query(
      `INSERT INTO shadow_ai_alert_history
        (organization_id, rule_id, rule_name, trigger_type, trigger_data, actions_taken, fired_at)
       VALUES
        (:organizationId, :rule_id, :rule_name, :trigger_type, :trigger_data, :actions_taken, :fired_at)`,
      {
        transaction,
        replacements: {
          organizationId,
          rule_id: ruleId ?? null,
          rule_name: alert.rule_name,
          trigger_type: alert.trigger_type,
          trigger_data: JSON.stringify(alert.trigger_data),
          actions_taken: JSON.stringify(alert.actions_taken),
          fired_at: firedAt.toISOString(),
        },
      }
    );
  }
}

// ---------------------------------------------------------------------------
// DELETE — wipe every shadow AI table so no artifacts remain
// ---------------------------------------------------------------------------

export async function deleteShadowAiDemoData(
  organizationId: number,
  transaction: Transaction
): Promise<void> {
  // Gracefully skip if shadow AI tables don't exist
  if (!(await shadowAiTablesExist(transaction))) {
    return;
  }

  // Delete in FK-safe order (children before parents).
  // We delete only rows for this organization.
  const tables = [
    "shadow_ai_alert_history",
    "shadow_ai_rule_notifications",
    "shadow_ai_rules",
    "shadow_ai_monthly_rollups",
    "shadow_ai_daily_rollups",
    "shadow_ai_events",
    "shadow_ai_tools",
    // Also clean config/settings tables to leave zero artifacts
    "shadow_ai_api_keys",
    "shadow_ai_syslog_config",
    "shadow_ai_settings",
  ];

  for (const table of tables) {
    try {
      await sequelize.query(
        `DELETE FROM ${table} WHERE organization_id = :organizationId`,
        { replacements: { organizationId }, transaction }
      );
    } catch {
      // Table may not exist — safe to skip
    }
  }
}
