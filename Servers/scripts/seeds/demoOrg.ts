/**
 * Demo data seeder — builds a realistic, isolated demo organization for the
 * "day in the life of an AI governance lead" live demo.
 *
 * SAFETY MODEL
 * ------------
 * - Seeds a DEDICATED demo org (never your existing data). All app data is
 *   scoped by organization_id, so other orgs on this database are invisible to
 *   this script and are never read or written.
 * - ~90% of the work goes through the real HTTP API (the exact code paths the
 *   UI exercises), logged in as the demo org's Admin. The API derives
 *   organization_id from the JWT, so cross-tenant writes are impossible.
 * - The only raw SQL is a small set of clearly-isolated blocks that have no
 *   create-endpoint: backdated notifications, dashboard trend snapshots, agent
 *   inventory rows, AI apps, incidents, intake submissions and LLM Evals rows.
 *   Every block is hard-scoped to the demo org id and uses ON CONFLICT /
 *   delete-then-insert so reruns cannot collide or stack.
 * - AI Gateway and Agent Control data come from the Auto Driver
 *   (POST /api/autoDrivers runs the full gateway seed), so this script does not
 *   write any ai_gateway_* table itself.
 * - Refuses to run if DEMO_ADMIN_EMAIL already belongs to a user in an org whose
 *   name is not DEMO_ORG_NAME, so it can never "adopt" (or --reset) a real org.
 * - Idempotent and self-cleaning: pass --reset to wipe the demo org's mock data
 *   (via the app's own DELETE /autoDrivers) and the SQL backfills, then
 *   reseed from scratch. Safe to run repeatedly.
 *
 * LOCAL ONLY. Never run against a shared/production database.
 *
 * Usage (from Servers/):
 *   npm run seed:demo-org                # seed (idempotent)
 *   npm run seed:demo-org:reset          # wipe demo data + reseed
 *
 * Env overrides:
 *   API_BASE           (default http://localhost:3000)
 *   DEMO_ADMIN_EMAIL   (default demo-admin@verifywise.local)
 *   DEMO_ADMIN_PASSWORD(default DemoAdmin#1)
 *   DEMO_ORG_NAME      (default "Meridian Financial Group (demo)")
 *
 * Requires the backend to be running (npm run watch) so the API is reachable.
 */

import { sequelize } from "../../database/db";
import bcrypt from "bcrypt";

const API_BASE = process.env.API_BASE || "http://localhost:3000";
const ADMIN_EMAIL = process.env.DEMO_ADMIN_EMAIL || "demo-admin@verifywise.local";
const ADMIN_PASSWORD = process.env.DEMO_ADMIN_PASSWORD || "DemoAdmin#1";
const ORG_NAME = process.env.DEMO_ORG_NAME || "Meridian Financial Group (demo)";
const RESET = process.argv.includes("--reset");

// Framework ids (see Servers/types/framework.type.ts frameworkAdditionMap).
const FRAMEWORK = { EU_AI_ACT: 1, ISO_42001: 2, ISO_27001: 3, NIST_AI_RMF: 4 };

type Ctx = { orgId: number; userId: number; token: string };

function log(msg: string) {
  console.log(`[seed] ${msg}`);
}

/** Small typed fetch wrapper that fails loudly and carries the JWT. */
async function api(token: string, method: string, path: string, body?: unknown): Promise<any> {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let parsed: any = undefined;
  try {
    parsed = text ? JSON.parse(text) : undefined;
  } catch {
    parsed = text;
  }
  if (!res.ok && res.status !== 202 && res.status !== 204) {
    throw new Error(
      `${method} ${path} -> ${res.status}: ${typeof parsed === "string" ? parsed : JSON.stringify(parsed)}`,
    );
  }
  return parsed;
}

// ── 1. Bootstrap the demo org + admin (direct SQL, mirrors seedE2EAdmin.ts) ──

async function bootstrapOrgAndAdmin(): Promise<{ orgId: number; userId: number }> {
  const [existing] = (await sequelize.query(
    `SELECT id, organization_id FROM users WHERE email = :email`,
    { replacements: { email: ADMIN_EMAIL } },
  )) as any[];
  if (existing[0]) {
    // Safety: only reuse the admin if it lives in the dedicated demo org. If the
    // email points at a user in any other org (a misconfigured DEMO_ADMIN_EMAIL),
    // refuse: --reset would otherwise wipe that org's demo data and backfills.
    const [orgRows] = (await sequelize.query(`SELECT name FROM organizations WHERE id = :id`, {
      replacements: { id: existing[0].organization_id },
    })) as any[];
    const orgName: string | undefined = orgRows[0]?.name;
    if (orgName !== ORG_NAME) {
      throw new Error(
        `DEMO_ADMIN_EMAIL ${ADMIN_EMAIL} belongs to org ${existing[0].organization_id} ` +
          `("${orgName ?? "none"}"), not the demo org "${ORG_NAME}". Refusing to seed into it. ` +
          `Use a dedicated DEMO_ADMIN_EMAIL, or set DEMO_ORG_NAME to that org's exact name.`,
      );
    }
    log(`reusing demo admin (user ${existing[0].id}, org ${existing[0].organization_id})`);
    return { orgId: existing[0].organization_id, userId: existing[0].id };
  }

  const [orgRes] = (await sequelize.query(
    `INSERT INTO organizations (name, created_at, updated_at)
     VALUES (:name, NOW(), NOW()) RETURNING id`,
    { replacements: { name: ORG_NAME } },
  )) as any[];
  const orgId = orgRes[0].id;

  const hash = await bcrypt.hash(ADMIN_PASSWORD, 10);
  const [userRes] = (await sequelize.query(
    `INSERT INTO users (name, surname, email, password_hash, role_id, organization_id, created_at, updated_at)
     VALUES ('Dr. Gorkem', 'Cetin', :email, :hash, 1, :orgId, NOW(), NOW()) RETURNING id`,
    { replacements: { email: ADMIN_EMAIL, hash, orgId } },
  )) as any[];

  log(`created demo org "${ORG_NAME}" (id ${orgId}) + admin (user ${userRes[0].id})`);
  return { orgId, userId: userRes[0].id };
}

// Additional real-named team members for the demo org, so ownership (incl.
// multiple owners per agent) has plausible people to assign. Idempotent by email.
const EXTRA_USERS = [
  { name: "Sarah", surname: "Chen", email: "sarah.chen@meridian.example", role: 1 },
  { name: "Miguel", surname: "Torres", email: "miguel.torres@meridian.example", role: 1 },
  { name: "Aisha", surname: "Khan", email: "aisha.khan@meridian.example", role: 3 },
  { name: "David", surname: "Okafor", email: "david.okafor@meridian.example", role: 3 },
];

async function seedExtraUsers(ctx: Ctx): Promise<Record<string, number>> {
  // Rename any legacy "Demo Admin" to the plausible primary name (idempotent).
  await sequelize.query(
    `UPDATE users SET name = 'Dr. Gorkem', surname = 'Cetin', updated_at = NOW()
     WHERE organization_id = :orgId AND email = :email AND name IN ('Demo', 'Gorkem')`,
    { replacements: { orgId: ctx.orgId, email: ADMIN_EMAIL } },
  );

  const hash = await bcrypt.hash(ADMIN_PASSWORD, 10);
  for (const u of EXTRA_USERS) {
    await sequelize.query(
      `INSERT INTO users (name, surname, email, password_hash, role_id, organization_id, created_at, updated_at)
       VALUES (:name, :surname, :email, :hash, :role, :orgId, NOW(), NOW())
       ON CONFLICT (email) DO NOTHING`,
      { replacements: { ...u, hash, orgId: ctx.orgId } },
    );
  }

  // Return an email → id map so the agent seeder can assign owners by name.
  const rows = (await sequelize.query(
    `SELECT id, email FROM users WHERE organization_id = :orgId`,
    { replacements: { orgId: ctx.orgId } },
  )) as any[];
  const byEmail: Record<string, number> = {};
  (rows[0] ?? []).forEach((r: any) => (byEmail[r.email] = r.id));
  log(`seeded ${EXTRA_USERS.length} extra team members (owners for agents)`);
  return byEmail;
}

async function login(): Promise<string> {
  const res = await fetch(`${API_BASE}/api/users/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
  const body = await res.json();
  const token = body?.data?.token;
  if (!token) throw new Error(`login failed: ${JSON.stringify(body)}`);
  log("logged in as demo admin");
  return token;
}

// ── 2. Baseline estate via the app's own Auto Driver (tested, transactional) ──

async function runAutoDriver(ctx: Ctx) {
  // the governance block no-ops if the org already has demo projects, and the
  // gateway / Shadow AI seeds are idempotent, so this is safe to always call
  await api(ctx.token, "POST", "/api/autoDrivers", {});
  log("auto driver: baseline project, EU AI Act framework, risks, vendor, models, tasks, policies");
}

async function deleteAutoDriver(ctx: Ctx) {
  try {
    await api(ctx.token, "DELETE", "/api/autoDrivers", {});
    log("auto driver: deleted existing mock data");
  } catch (e) {
    log(`auto driver delete skipped (${(e as Error).message})`);
  }
}

// ── 3. Demo-specific extras layered on top of the baseline ──

/**
 * Attach NIST AI RMF + ISO 42001 for the centerpiece demo.
 *
 * These two are *organizational* frameworks (is_organizational = true), so they
 * cannot attach to Auto Driver's deployer use-case project — the app enforces
 * is_framework_organizational === is_project_organizational. The correct path is
 * to create an organizational governance project carrying these frameworks;
 * creating it auto-populates both full control trees for this tenant. This is
 * the same code path the UI uses for an org-level governance project.
 */
async function seedOrgFrameworks(ctx: Ctx) {
  // The Auto Driver creates a demo organizational project carrying ISO 42001
  // when the org has none. If one exists, attach whichever of ISO 42001 / NIST
  // AI RMF it is missing (same API the UI's "add framework" uses); reruns find
  // both attached and do nothing.
  const existing = (await sequelize.query(
    `SELECT p.id, COALESCE(array_agg(pf.framework_id) FILTER (WHERE pf.framework_id IS NOT NULL), '{}') AS fws
       FROM projects p
       LEFT JOIN projects_frameworks pf
         ON pf.project_id = p.id AND pf.organization_id = p.organization_id
      WHERE p.organization_id = :orgId AND p.is_organizational = true
      GROUP BY p.id ORDER BY p.id LIMIT 1`,
    { replacements: { orgId: ctx.orgId } },
  )) as any[];
  const orgProject = existing[0]?.[0] as { id: number; fws: number[] } | undefined;
  if (orgProject) {
    for (const fw of [FRAMEWORK.ISO_42001, FRAMEWORK.NIST_AI_RMF]) {
      if (orgProject.fws.includes(fw)) continue;
      try {
        await api(
          ctx.token,
          "POST",
          `/api/frameworks/toProject?frameworkId=${fw}&projectId=${orgProject.id}`,
        );
        log(`attached framework ${fw} to org governance project ${orgProject.id}`);
      } catch (e) {
        log(`framework ${fw} attach skipped (${(e as Error).message})`);
      }
    }
    return;
  }

  try {
    await api(ctx.token, "POST", "/api/projects", {
      project_title: "AI Governance Program",
      owner: ctx.userId,
      is_organizational: true,
      start_date: new Date().toISOString(),
      goal: "Organization-wide AI governance across ISO 42001 and NIST AI RMF.",
      framework: [FRAMEWORK.ISO_42001, FRAMEWORK.NIST_AI_RMF],
      members: [ctx.userId],
    });
    log(
      "created org governance project with NIST AI RMF + ISO 42001 (control trees auto-populated)",
    );
  } catch (e) {
    log(`org framework seed skipped (${(e as Error).message})`);
  }
}

/**
 * Normalize the two demo project risks into genuine, self-consistent HIGH risks.
 *
 * Auto Driver leaves current_risk_level = 'High risk' but risk_level_autocalculated
 * / final_risk_level = 'Medium risk' (Possible × Moderate computes to Medium).
 * The dashboard counts current_risk_level, so the count reads 2 high while the
 * other columns disagree — and a drawer edit that moves the auto-calc field won't
 * change the counted field, so the count looks "stuck". We set likelihood/severity
 * high and align all three level columns so the two risks are honestly high AND
 * a real drawer edit (mitigating one down) moves every field together, dropping
 * the dashboard count live. Scoped to the demo org.
 */
async function normalizeDemoRisks(ctx: Ctx) {
  await sequelize.query(
    `UPDATE risks
        SET likelihood = 'Likely',
            severity = 'Major',
            risk_level_autocalculated = 'High risk',
            current_risk_level = 'High risk',
            final_risk_level = 'High risk'
      WHERE organization_id = :orgId`,
    { replacements: { orgId: ctx.orgId } },
  );
  log("normalized demo risks to consistent HIGH (drawer edit will drop the count live)");
}

/**
 * Populate NIST AI RMF coverage so the Act 2 "coverage view" tells the runbook
 * story: most controls Implemented (with an implementation note), exactly two
 * left thin. Status goes through the real API PATCH (so change-history fires and
 * the progress/coverage queries — which count status = 'Implemented' — reflect
 * it); the implementation note is a scoped SQL update on the same demo-org rows.
 */
async function populateNistCoverage(ctx: Ctx) {
  const rows = (await sequelize.query(
    `SELECT s.id
       FROM nist_ai_rmf_subcategories s
       JOIN projects_frameworks pf
         ON pf.id = s.projects_frameworks_id AND pf.organization_id = s.organization_id
      WHERE s.organization_id = :orgId
        AND pf.framework_id = :nist
      ORDER BY s.id`,
    { replacements: { orgId: ctx.orgId, nist: FRAMEWORK.NIST_AI_RMF } },
  )) as any[];
  const ids: number[] = (rows[0] ?? []).map((r: any) => r.id);
  if (ids.length === 0) {
    log("NIST coverage skipped — no subcategories found (framework attach may have failed)");
    return;
  }

  // Leave the last two as the deliberate "thin spots"; implement the rest.
  const thin = new Set(ids.slice(-2));
  const toImplement = ids.filter((id) => !thin.has(id));

  let ok = 0;
  for (const id of toImplement) {
    try {
      await api(ctx.token, "PATCH", `/api/nist-ai-rmf/subcategories/${id}/status`, {
        status: "Implemented",
      });
      ok++;
    } catch (e) {
      log(`  nist status ${id} skipped (${(e as Error).message})`);
    }
  }

  // Add an implementation note on the implemented rows (evidence substantiation
  // shown in the drawer). Scoped to this demo org's implemented subcategories.
  await sequelize.query(
    `UPDATE nist_ai_rmf_subcategories
        SET implementation_description =
          'Control implemented and evidenced. Policy, procedure and review records on file; last validated this quarter.'
      WHERE organization_id = :orgId
        AND status = 'Implemented'
        AND (implementation_description IS NULL OR implementation_description = '')`,
    { replacements: { orgId: ctx.orgId } },
  );

  // One real Evidence Hub record so the hub isn't empty during the demo.
  // Skipped when it already exists, so reruns don't stack copies.
  const [evidenceRows] = (await sequelize.query(
    `SELECT id FROM evidence_hub WHERE organization_id = :orgId AND evidence_name = :name LIMIT 1`,
    { replacements: { orgId: ctx.orgId, name: "AI governance policy v3" } },
  )) as any[];
  try {
    if (evidenceRows[0]) throw new Error("already present");
    await api(ctx.token, "POST", "/api/evidenceHub", {
      evidence_name: "AI governance policy v3",
      evidence_type: "Policy",
      description:
        "Board-approved AI governance policy covering oversight, roles and review cadence.",
    });
  } catch (e) {
    log(`  evidence-hub record skipped (${(e as Error).message})`);
  }

  log(
    `NIST coverage: ${ok}/${ids.length} subcategories Implemented, 2 left thin (the coverage-view story)`,
  );
}

/**
 * Populate ISO 42001 coverage the same way as NIST: most subclauses and annex
 * categories Implemented with an implementation note, a couple left thin. ISO's
 * update endpoints require multipart file upload, so status is set via scoped
 * SQL (the progress/coverage queries count status = 'Implemented' — confirmed in
 * iso42001.utils.ts). Both contributing tables (subclauses_iso, annexcategories_iso)
 * are updated; each is scoped to this demo org's ISO 42001 rows.
 */
async function populateIso42001Coverage(ctx: Ctx) {
  const NOTE =
    "Control implemented and evidenced. Policy, procedure and review records on file; last validated this quarter.";

  // Update helper: mark all but the last `keepThin` rows of a table Implemented,
  // ordered by id, scoped to the demo org's ISO 42001 projects_frameworks.
  async function fill(table: string, keepThin: number) {
    const rows = (await sequelize.query(
      `SELECT s.id
         FROM ${table} s
         JOIN projects_frameworks pf
           ON pf.id = s.projects_frameworks_id AND pf.organization_id = s.organization_id
        WHERE s.organization_id = :orgId
          AND pf.framework_id = :iso
        ORDER BY s.id`,
      { replacements: { orgId: ctx.orgId, iso: FRAMEWORK.ISO_42001 } },
    )) as any[];
    const ids: number[] = (rows[0] ?? []).map((r: any) => r.id);
    if (ids.length === 0) return { total: 0, done: 0 };

    const toImplement = ids.slice(0, Math.max(0, ids.length - keepThin));
    if (toImplement.length > 0) {
      await sequelize.query(
        `UPDATE ${table}
            SET status = 'Implemented',
                implementation_description = :note
          WHERE organization_id = :orgId
            AND id IN (:ids)`,
        { replacements: { orgId: ctx.orgId, note: NOTE, ids: toImplement } },
      );
    }
    return { total: ids.length, done: toImplement.length };
  }

  const sub = await fill("subclauses_iso", 2);
  const annex = await fill("annexcategories_iso", 2);
  if (sub.total === 0 && annex.total === 0) {
    log("ISO 42001 coverage skipped — no rows found (framework attach may have failed)");
    return;
  }
  log(
    `ISO 42001 coverage: ${sub.done}/${sub.total} subclauses + ${annex.done}/${annex.total} annex categories Implemented, 2 of each left thin`,
  );
}

/**
 * Seed a real Intake Forms record + one pending submission, so the morning
 * "triage a new intake" beat uses the actual feature instead of a stand-in task.
 * The form is created through the API (validation, slug/public_id wiring); the
 * pending submission is inserted via scoped SQL matching createSubmissionQuery's
 * columns (the public submit endpoint needs captcha/rate-limit machinery that is
 * awkward to script). A "pending" submission is exactly what shows in the review
 * queue for triage. Idempotent: skips if a form with the demo slug exists.
 */
async function seedIntakeForm(ctx: Ctx) {
  const SLUG = "new-ai-use-case-intake";
  const existing = (await sequelize.query(
    `SELECT id FROM intake_forms WHERE organization_id = :orgId AND slug = :slug`,
    { replacements: { orgId: ctx.orgId, slug: SLUG } },
  )) as any[];
  let formId: number | null = existing[0]?.[0]?.id ?? null;

  if (!formId) {
    const schema = {
      version: "1.0",
      fields: [
        {
          id: "title",
          type: "text",
          label: "Use case name",
          required: true,
          order: 1,
          entityFieldMapping: "project_title",
        },
        {
          id: "purpose",
          type: "textarea",
          label: "What is the intended purpose?",
          required: true,
          order: 2,
        },
        { id: "team", type: "text", label: "Requesting team", required: true, order: 3 },
        {
          id: "data",
          type: "textarea",
          label: "What data will it use?",
          required: false,
          order: 4,
        },
      ],
    };
    try {
      const res = await api(ctx.token, "POST", "/api/intake/forms", {
        name: "New AI use case intake",
        description: "Submit a new AI use case for governance review and classification.",
        slug: SLUG,
        entityType: "use_case",
        schema,
        status: "active",
      });
      formId = res?.data?.id ?? res?.id ?? null;
      log("created intake form 'New AI use case intake' (active)");
    } catch (e) {
      log(`intake form skipped (${(e as Error).message})`);
      return;
    }
  }
  if (!formId) {
    log("intake form: no id returned — skipping submission");
    return;
  }

  // One pending submission — the GenAI marketing assistant awaiting triage.
  const submissionData = {
    title: "GenAI marketing content assistant",
    purpose:
      "Draft campaign copy and social posts from brand guidelines, with human review before publishing.",
    team: "Marketing",
    data: "Public brand assets and prior approved campaign copy. No customer PII.",
  };
  const submitterEmail = "marketing.lead@meridian.example";
  const [pending] = (await sequelize.query(
    `SELECT id FROM intake_submissions
      WHERE organization_id = :orgId AND form_id = :formId AND submitter_email = :email LIMIT 1`,
    { replacements: { orgId: ctx.orgId, formId, email: submitterEmail } },
  )) as any[];
  if (pending[0]) {
    log("pending intake submission already present");
    return;
  }
  await sequelize.query(
    `INSERT INTO intake_submissions
       (organization_id, form_id, submitter_email, submitter_name, data, entity_type, status,
        original_submission_id, resubmission_count, ip_address, created_at, updated_at)
     VALUES
       (:orgId, :formId, :email, :name, :data, 'use_case', 'pending',
        NULL, 0, NULL, NOW() - interval '8 hours', NOW() - interval '8 hours')`,
    {
      replacements: {
        orgId: ctx.orgId,
        formId,
        email: submitterEmail,
        name: "Marketing Lead",
        data: JSON.stringify(submissionData),
      },
    },
  );
  log("added 1 pending intake submission (GenAI marketing assistant — the triage beat)");
}

// The extra models this step owns, keyed by provider_model. Kept as a constant
// so both the insert and the idempotent pre-delete reference the same set.
const EXTRA_MODELS = [
  {
    provider_model: "GPT-4o",
    model: "GPT-4o",
    provider: "OpenAI",
    version: "2024-08",
    status: "Approved",
    hosting_provider: "Azure",
  },
  {
    provider_model: "GPT-4o mini",
    model: "GPT-4o mini",
    provider: "OpenAI",
    version: "2024-07",
    status: "Approved",
    hosting_provider: "Azure",
  },
  {
    provider_model: "o1",
    model: "o1",
    provider: "OpenAI",
    version: "1",
    status: "Approved",
    hosting_provider: "Azure",
  },
  {
    provider_model: "GPT-4.1",
    model: "GPT-4.1",
    provider: "OpenAI",
    version: "2025-04",
    status: "Pending",
    hosting_provider: "Azure",
  },
  {
    provider_model: "Claude Sonnet 4.5",
    model: "Claude Sonnet 4.5",
    provider: "Anthropic",
    version: "4.5",
    status: "Approved",
    hosting_provider: "AWS Bedrock",
  },
  {
    provider_model: "Claude Opus 4.1",
    model: "Claude Opus 4.1",
    provider: "Anthropic",
    version: "4.1",
    status: "Approved",
    hosting_provider: "AWS Bedrock",
  },
  {
    provider_model: "Llama 3.1 70B",
    model: "Llama 3.1 70B",
    provider: "Meta",
    version: "3.1",
    status: "Restricted",
    hosting_provider: "Self-hosted",
  },
];

async function addExtraModels(ctx: Ctx) {
  // Runbook wants 6-10 models across 2-3 providers, one provider on several
  // use cases (for the vendor-scare flash). Idempotent: delete any prior copies
  // of exactly these models (scoped to the demo org) before re-adding, so
  // repeated runs never stack duplicates (e.g. "GPT-4o" x9).
  const names = EXTRA_MODELS.map((m) => m.provider_model);
  await sequelize.query(
    `DELETE FROM model_inventories WHERE organization_id = :orgId AND provider_model IN (:names)`,
    { replacements: { orgId: ctx.orgId, names } },
  );
  let n = 0;
  for (const m of EXTRA_MODELS) {
    try {
      await api(ctx.token, "POST", "/api/modelInventory", m);
      n++;
    } catch (e) {
      log(`model ${m.provider_model} skipped (${(e as Error).message})`);
    }
  }
  log(`added ${n} models (OpenAI provider shared across several — for the vendor flash)`);
}

// The demo agents this step owns. A realistic mix: most "discovered" via a cloud
// platform (source_system=azure-ai-foundry, is_manual=false) plus a couple added
// by hand (source_system=manual, is_manual=true) so the demo shows both intake
// lanes. The status spread lights up every stat tile (unreviewed/confirmed/
// rejected/stale). external_id is deterministic so reseeds upsert, not duplicate.
const DEMO_AGENTS = [
  {
    name: "Customer Support Copilot",
    src: "azure-ai-foundry",
    type: "copilot",
    status: "unreviewed",
    stale: false,
    manual: false,
    days: 1,
    perms: ["read:tickets", "write:responses", "read:kb"],
    cats: ["customer-data", "communication"],
  },
  {
    name: "Contract Review Agent",
    src: "azure-ai-foundry",
    type: "agent",
    status: "confirmed",
    stale: false,
    manual: false,
    days: 2,
    perms: ["read:contracts", "read:legal-kb", "write:summaries"],
    cats: ["legal", "document-processing"],
  },
  {
    name: "Fraud Detection Assistant",
    src: "azure-ai-foundry",
    type: "assistant",
    status: "confirmed",
    stale: false,
    manual: false,
    days: 1,
    perms: ["read:transactions", "write:alerts", "read:risk-models"],
    cats: ["financial-data", "security"],
  },
  {
    name: "Data Pipeline Monitor",
    src: "azure-ai-foundry",
    type: "workflow",
    status: "unreviewed",
    stale: false,
    manual: false,
    days: 3,
    perms: ["read:pipelines", "write:logs"],
    cats: ["infrastructure"],
  },
  {
    name: "Legacy Reporting Bot",
    src: "azure-ai-foundry",
    type: "bot",
    status: "unreviewed",
    stale: true,
    manual: false,
    days: 45,
    perms: ["read:reports"],
    cats: ["reporting"],
  },
  {
    name: "Sales Outreach Agent",
    src: "azure-ai-foundry",
    type: "agent",
    status: "rejected",
    stale: false,
    manual: false,
    days: 5,
    perms: ["read:crm", "write:emails", "read:leads"],
    cats: ["customer-data", "communication"],
  },
  {
    name: "HR Onboarding Assistant",
    src: "manual",
    type: "assistant",
    status: "confirmed",
    stale: false,
    manual: true,
    days: 2,
    perms: ["read:hr-docs", "write:checklists"],
    cats: ["employee-data"],
  },
  {
    name: "Internal Code Review Agent",
    src: "manual",
    type: "agent",
    status: "unreviewed",
    stale: false,
    manual: true,
    days: 1,
    perms: ["read:repos", "write:comments"],
    cats: ["source-code"],
  },
];

// Owner assignments by agent name (emails resolved via the users map). The first
// email is the primary owner. Agents not listed fall back to the admin.
const AGENT_OWNERS: Record<string, string[]> = {
  "Contract Review Agent": [
    ADMIN_EMAIL,
    "sarah.chen@meridian.example",
    "miguel.torres@meridian.example",
  ],
  "Fraud Detection Assistant": ["sarah.chen@meridian.example", "aisha.khan@meridian.example"],
  "Data Pipeline Monitor": [ADMIN_EMAIL],
  "Sales Outreach Agent": ["miguel.torres@meridian.example"],
  "HR Onboarding Assistant": ["aisha.khan@meridian.example"],
};

async function seedAgentPrimitives(ctx: Ctx, usersByEmail: Record<string, number>) {
  // No public POST endpoint seeds a full agent with source/status/staleness in
  // one shot (the app's manual-add only sets name/type/owner/notes and the sync
  // path needs a live plugin), so we insert directly — hard-scoped to the demo
  // org. Idempotent via the (organization_id, source_system, external_id) unique
  // key: ON CONFLICT re-syncs the row instead of stacking duplicates on reseed.
  let n = 0;
  for (let i = 0; i < DEMO_AGENTS.length; i++) {
    const a = DEMO_AGENTS[i];
    const externalId = a.manual ? `manual_demo_${i + 1}` : `${a.src}_demo_${i + 1}`;
    const metadata = a.manual
      ? { notes: "Added manually for governance tracking." }
      : { region: "eastus", project: "foundry-prod" };
    // Resolve this agent's owner (first listed); default to the admin. The
    // schema stores a single owner_id per agent.
    const ownerEmails = AGENT_OWNERS[a.name] || [ADMIN_EMAIL];
    const ownerIds = ownerEmails.map((e) => usersByEmail[e]).filter((v): v is number => !!v);
    const primaryOwner = ownerIds.length > 0 ? ownerIds[0] : ctx.userId;
    // reviewer for confirmed/rejected agents (drives the lifecycle attribution).
    const reviewed = a.status === "confirmed" || a.status === "rejected";
    await sequelize.query(
      `INSERT INTO agent_primitives
        (organization_id, source_system, primitive_type, external_id, display_name, owner_id,
         permissions, permission_categories, last_activity, metadata, review_status,
         reviewed_by, reviewed_at, is_stale, is_manual, created_at, updated_at)
       VALUES
        (:orgId, :src, :type, :ext, :name, :owner,
         CAST(:perms AS jsonb), CAST(:cats AS jsonb), NOW() - (:days || ' days')::interval,
         CAST(:meta AS jsonb), :status, :reviewedBy, :reviewedAt, :stale, :manual, NOW(), NOW())
       ON CONFLICT (organization_id, source_system, external_id) DO UPDATE SET
         primitive_type = EXCLUDED.primitive_type,
         display_name = EXCLUDED.display_name,
         owner_id = EXCLUDED.owner_id,
         permissions = EXCLUDED.permissions,
         permission_categories = EXCLUDED.permission_categories,
         last_activity = EXCLUDED.last_activity,
         metadata = EXCLUDED.metadata,
         review_status = EXCLUDED.review_status,
         reviewed_by = EXCLUDED.reviewed_by,
         reviewed_at = EXCLUDED.reviewed_at,
         is_stale = EXCLUDED.is_stale,
         is_manual = EXCLUDED.is_manual,
         updated_at = NOW()
       RETURNING id`,
      {
        replacements: {
          orgId: ctx.orgId,
          src: a.src,
          type: a.type,
          ext: externalId,
          name: a.name,
          owner: String(primaryOwner),
          perms: JSON.stringify(a.perms),
          cats: JSON.stringify(a.cats),
          days: a.days,
          meta: JSON.stringify(metadata),
          status: a.status,
          reviewedBy: reviewed ? primaryOwner : null,
          reviewedAt: reviewed ? new Date(Date.now() - a.days * 86400000).toISOString() : null,
          stale: a.stale,
          manual: a.manual,
        },
      },
    );

    // Resolve the agent id (RETURNING on the INSERT; refetch on ON CONFLICT).
    const [idRows] = (await sequelize.query(
      `SELECT id FROM agent_primitives
       WHERE organization_id = :orgId AND source_system = :src AND external_id = :ext`,
      { replacements: { orgId: ctx.orgId, src: a.src, ext: externalId } },
    )) as any[];
    const agentId = idRows[0]?.id;

    if (agentId) {
      // Audit trail (replace-all) so the detail page Activity timeline has content.
      await sequelize.query(
        `DELETE FROM agent_audit_log WHERE organization_id = :orgId AND agent_primitive_id = :agentId`,
        { replacements: { orgId: ctx.orgId, agentId } },
      );
      if (reviewed) {
        await sequelize.query(
          `INSERT INTO agent_audit_log
            (organization_id, agent_primitive_id, action, field_changed, old_value, new_value, performed_by, created_at)
           VALUES (:orgId, :agentId, 'review_status_changed', 'review_status', 'unreviewed', :status, :by,
                   NOW() - (:days || ' days')::interval)`,
          {
            replacements: {
              orgId: ctx.orgId,
              agentId,
              status: a.status,
              by: primaryOwner,
              days: a.days,
            },
          },
        );
      }
    }
    n++;
  }
  log(
    `seeded ${n} agents (${DEMO_AGENTS.filter((a) => a.manual).length} manual + rest discovered; owner + audit trail attached)`,
  );
}

// ── AI Apps inventory demo data ──────────────────────────────────────────────
//
// Seeds the ai_apps table (a distinct feature from agent_primitives above) so
// the /ai-apps inventory page renders like a real governance list instead of
// empty. Six realistic, real-world apps spanning every status/discovery-source
// enum value. Mirrors seedAgentPrimitives: raw sequelize.query INSERT with
// ON CONFLICT (organization_id, name), owners resolved via usersByEmail.

type DemoAiApp = {
  name: string;
  status: "draft" | "under_review" | "approved" | "restricted" | "banned";
  source: "manual" | "shadow_ai" | "employee_report" | "procurement" | "sso" | "proxy" | "firewall";
  ownerEmail: string | null;
  risk: number;
  description: string;
};

const DEMO_AI_APPS: DemoAiApp[] = [
  {
    name: "ChatGPT Enterprise",
    status: "approved",
    source: "procurement",
    ownerEmail: "sarah.chen@meridian.example",
    risk: 35,
    description: "Company-wide licensed assistant for general knowledge work.",
  },
  {
    name: "GitHub Copilot",
    status: "approved",
    source: "sso",
    ownerEmail: "miguel.torres@meridian.example",
    risk: 40,
    description: "AI pair-programmer used by the engineering team.",
  },
  {
    name: "Notion AI",
    status: "under_review",
    source: "shadow_ai",
    ownerEmail: "aisha.khan@meridian.example",
    risk: 55,
    description: "AI writing and summarization inside Notion; under governance review.",
  },
  {
    name: "Jasper",
    status: "restricted",
    source: "employee_report",
    ownerEmail: "david.okafor@meridian.example",
    risk: 68,
    description: "Marketing copy generation; restricted pending data-handling review.",
  },
  {
    name: "Midjourney",
    status: "banned",
    source: "shadow_ai",
    ownerEmail: null,
    risk: 82,
    description: "Image generation; banned due to IP and content-policy concerns.",
  },
  {
    name: "Internal HR Assistant",
    status: "draft",
    source: "manual",
    ownerEmail: ADMIN_EMAIL,
    risk: 25,
    description: "In-house assistant for HR onboarding questions; not yet reviewed.",
  },
];

async function seedAiApps(ctx: Ctx, usersByEmail: Record<string, number>) {
  // Optional vendor to attach for realism — resolved at runtime, never
  // hardcoded. If the demo org has no vendors, vendor_id stays NULL for all.
  const [vendorRows] = (await sequelize.query(
    `SELECT id FROM vendors WHERE organization_id = :orgId ORDER BY id LIMIT 1`,
    { replacements: { orgId: ctx.orgId } },
  )) as any[];
  const vendorId: number | null = vendorRows[0]?.id ?? null;

  let n = 0;
  for (let i = 0; i < DEMO_AI_APPS.length; i++) {
    const a = DEMO_AI_APPS[i];
    const ownerId = a.ownerEmail ? (usersByEmail[a.ownerEmail] ?? ctx.userId) : null;
    // Only the flagship app carries the resolved vendor id (plausible, not
    // forced onto every row); everything else is NULL.
    const vendor = i === 0 ? vendorId : null;

    await sequelize.query(
      `INSERT INTO ai_apps
         (organization_id, name, description, vendor_id, owner_id, status, risk_score,
          discovered_source, is_demo, created_at, updated_at)
       VALUES
         (:orgId, :name, :descr, :vendor, :owner, :status, :risk,
          :source, true, NOW() - (:days || ' days')::interval, NOW())
       ON CONFLICT (organization_id, name) DO UPDATE SET
         description = EXCLUDED.description,
         vendor_id = EXCLUDED.vendor_id,
         owner_id = EXCLUDED.owner_id,
         status = EXCLUDED.status,
         risk_score = EXCLUDED.risk_score,
         discovered_source = EXCLUDED.discovered_source,
         is_demo = true,
         updated_at = NOW()`,
      {
        replacements: {
          orgId: ctx.orgId,
          name: a.name,
          descr: a.description,
          vendor,
          owner: ownerId,
          status: a.status,
          risk: a.risk,
          source: a.source,
          days: i + 1,
        },
      },
    );
    n++;
  }
  log(`seeded ${n} AI apps (inventory)`);
}

// ── Incident management demo data ────────────────────────────────────────────
//
// Seeds ai_incident_managements with 5 realistic AI-governance incidents so the
// dashboard's incident tile/status-widget/recent-activity are non-zero. Tied to
// the agents/apps seeded above (Customer Support Copilot, Fraud Detection
// Assistant, Midjourney). incident_id auto-generates from a sequence default
// ('INC-'||nextval(...)) so it is never supplied on insert and ON CONFLICT can't
// key on it — idempotency here is delete-then-insert, scoped to the demo org's
// is_demo rows, so reruns always land at exactly 5 (no stacking).

type DemoIncident = {
  aiProject: string;
  type: string;
  severity: string;
  status: string;
  categoriesOfHarm: string[];
  reporter: string;
  description: string;
  relationshipCausality: string;
  immediateMitigations?: string;
  plannedCorrectiveActions?: string;
  modelSystemVersion?: string;
  occurredDaysAgo: number;
  createdDaysAgo: number;
};

const DEMO_INCIDENTS: DemoIncident[] = [
  {
    aiProject: "Customer Support Copilot",
    type: "Security breach",
    severity: "Serious",
    status: "Mitigated",
    categoriesOfHarm: ["Rights", "Property"],
    reporter: "Sarah Chen",
    description:
      "The support assistant returned a customer's email address and phone number in plain text within a chat reply, exposing PII to another user in a shared session.",
    relationshipCausality: "Guardrail gap allowed unmasked PII in the generated response.",
    immediateMitigations: "Session isolated and guardrail masking rule tightened for PII entities.",
    plannedCorrectiveActions:
      "Add regression test coverage for PII masking across shared sessions.",
    modelSystemVersion: "v2.3",
    occurredDaysAgo: 12,
    createdDaysAgo: 11,
  },
  {
    aiProject: "Fraud Detection Assistant",
    type: "Unexpected behavior",
    severity: "Very serious",
    status: "Investigating",
    categoriesOfHarm: ["Rights", "Safety"],
    reporter: "Aisha Khan",
    description:
      "The fraud model flagged transactions at a materially higher rate for one protected demographic group, indicating potential bias in scoring.",
    relationshipCausality: "Training data imbalance correlated with the protected attribute.",
    immediateMitigations: "Flagged transactions routed to manual review pending investigation.",
    plannedCorrectiveActions:
      "Rebalance training data and add fairness metrics to model monitoring.",
    modelSystemVersion: "fraud-scoring-v3",
    occurredDaysAgo: 6,
    createdDaysAgo: 5,
  },
  {
    aiProject: "Customer Support Copilot",
    type: "Misuse",
    severity: "Minor",
    status: "Open",
    categoriesOfHarm: ["Safety"],
    reporter: "Miguel Torres",
    description:
      "A crafted user message attempted to override the assistant's system instructions (prompt injection) to extract internal prompts.",
    relationshipCausality:
      "Malicious user input attempting instruction override; blocked by guardrail.",
    modelSystemVersion: "v2.3",
    occurredDaysAgo: 3,
    createdDaysAgo: 3,
  },
  {
    aiProject: "Knowledge base assistant",
    type: "Malfunction",
    severity: "Serious",
    status: "Mitigated",
    categoriesOfHarm: ["Rights"],
    reporter: "David Okafor",
    description:
      "The knowledge assistant cited a data-retention policy clause that does not exist, giving a customer incorrect governance guidance (hallucination).",
    relationshipCausality:
      "Retrieval returned low-relevance context and the model fabricated a citation.",
    immediateMitigations:
      "Incorrect guidance retracted and customer notified with correct policy text.",
    plannedCorrectiveActions:
      "Tighten retrieval relevance threshold and add citation verification step.",
    occurredDaysAgo: 9,
    createdDaysAgo: 8,
  },
  {
    aiProject: "Midjourney",
    type: "Misuse",
    severity: "Minor",
    status: "Open",
    categoriesOfHarm: ["Property"],
    reporter: "Dr. Gorkem Cetin",
    description:
      "An unapproved image-generation tool (shadow AI) was used to produce client-facing deliverables before governance review.",
    relationshipCausality: "Employee used a restricted tool outside the approved workflow.",
    occurredDaysAgo: 2,
    createdDaysAgo: 1,
  },
];

async function seedIncidents(ctx: Ctx) {
  // Idempotent via delete-then-insert: incident_id auto-generates from a
  // sequence default, so ON CONFLICT cannot key on it. Clearing this script's
  // own demo rows first (matched by description) keeps reseeds from stacking,
  // and leaves the Auto Driver's demo incidents in place.
  await sequelize.query(
    `DELETE FROM ai_incident_managements
      WHERE organization_id = :orgId AND is_demo = true AND description IN (:descriptions)`,
    {
      replacements: {
        orgId: ctx.orgId,
        descriptions: DEMO_INCIDENTS.map((inc) => inc.description),
      },
    },
  );

  let n = 0;
  for (const inc of DEMO_INCIDENTS) {
    await sequelize.query(
      `INSERT INTO ai_incident_managements
         (organization_id, ai_project, type, severity, occurred_date, date_detected,
          reporter, status, categories_of_harm, description, relationship_causality,
          immediate_mitigations, planned_corrective_actions, model_system_version,
          is_demo, created_at, updated_at)
       VALUES
         (:orgId, :aiProject, :type, :severity,
          NOW() - (:occurredDaysAgo || ' days')::interval,
          NOW() - (:occurredDaysAgo || ' days')::interval + interval '1 hour',
          :reporter, :status, CAST(:harm AS json), :description, :relationshipCausality,
          :immediateMitigations, :plannedCorrectiveActions, :modelSystemVersion,
          true,
          NOW() - (:createdDaysAgo || ' days')::interval,
          NOW() - (:createdDaysAgo || ' days')::interval)`,
      {
        replacements: {
          orgId: ctx.orgId,
          aiProject: inc.aiProject,
          type: inc.type,
          severity: inc.severity,
          reporter: inc.reporter,
          status: inc.status,
          harm: JSON.stringify(inc.categoriesOfHarm),
          description: inc.description,
          relationshipCausality: inc.relationshipCausality,
          immediateMitigations: inc.immediateMitigations ?? null,
          plannedCorrectiveActions: inc.plannedCorrectiveActions ?? null,
          modelSystemVersion: inc.modelSystemVersion ?? null,
          occurredDaysAgo: inc.occurredDaysAgo,
          createdDaysAgo: inc.createdDaysAgo,
        },
      },
    );
    n++;
  }
  log(`seeded ${n} incidents`);
}

// ── LLM Evals demo data ──────────────────────────────────────────────────────
//
// Seeds the EvalServer-side llm_evals_* tables (same physical Postgres, same
// verifywise schema, Alembic-owned) so LLM Evals is populated end-to-end: two
// demo projects (support chatbot + RAG knowledge-base assistant), one dataset
// + model + a scorer per metric each, and a run of backdated experiments per
// project showing a realistic improving trajectory (one experiment in the
// Support project deliberately failed). Delete-then-insert scoped to the demo
// org, so reseeds never stack. Logs + point metrics (Monitor data) are seeded
// by a later phase (seedLlmEvalsLogsAndMetrics) on top of the experiments this
// phase produces.

type LlmEvalsProjectConfig = {
  key: string;
  name: string;
  use_case: string;
  // `path` must point to a real file under EvaluationModule/data/datasets/
  // (built-in datasets) so the "open dataset" read endpoint
  // (GET /api/deepeval/datasets/read?path=...) resolves to an actual file
  // instead of 404ing on an invented placeholder path.
  dataset: { name: string; path: string; prompts: number };
  model: string;
  metrics: string[];
  trajectory: number[]; // one score per experiment, oldest -> newest
};

const LLM_EVALS_PROJECTS: LlmEvalsProjectConfig[] = [
  {
    key: "support",
    name: "Support chatbot",
    use_case: "chatbot",
    dataset: {
      name: "Support chatbot golden set",
      path: "chatbot/chatbot_customer_support.json",
      prompts: 25,
    },
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
      path: "rag/rag_knowledge_base_multiturn.json",
      prompts: 30,
    },
    model: "gpt-4o-mini",
    metrics: ["answerRelevancy", "faithfulness", "contextPrecision", "contextRecall"],
    trajectory: [0.66, 0.72, 0.78, 0.84],
  },
];

// The Support project's oldest experiment (index 0 in its trajectory) is the
// one that failed outright — a judge-model timeout before any scoring
// completed. Kept as a lookup by project key so both the count log and the
// generator agree on which index is the failure.
const LLM_EVALS_FAILED_INDEX: Record<string, number> = { support: 0 };

// camelCase metric key -> Title Case display name used inside
// results.detailed_results[].metric_scores (matches the EvalServer scorer
// display convention).
const LLM_EVALS_METRIC_LABEL: Record<string, string> = {
  answerRelevancy: "Relevance",
  correctness: "Correctness",
  toxicity: "Toxicity",
  bias: "Bias",
  faithfulness: "Faithfulness",
  contextPrecision: "Context Precision",
  contextRecall: "Context Recall",
};

// Metrics that are "inverted-low" (near 0 is good) vs. anchored-high metrics
// that should track close to the trajectory score.
const LLM_EVALS_INVERTED_METRICS = new Set(["toxicity", "bias"]);

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

// Deterministic per-metric offset from the trajectory anchor so reseeds
// produce identical numbers. No Math.random — purely a function of the
// experiment index and the metric's position in the project's metric list.
function llmEvalsMetricScore(
  metric: string,
  anchor: number,
  expIndex: number,
  metricIdx: number,
): number {
  if (metric === "answerRelevancy") return clamp01(anchor);
  if (LLM_EVALS_INVERTED_METRICS.has(metric)) {
    // Low is good: ~0.02-0.05, nudged slightly by index for variety.
    const base = 0.02 + ((expIndex + metricIdx) % 3) * 0.015;
    return clamp01(base);
  }
  // Other quality metrics track the trajectory ± a small deterministic offset.
  const offset = (((expIndex + 1) * (metricIdx + 1)) % 5) * 0.01 - 0.02; // -0.02..+0.02
  return clamp01(anchor + offset);
}

type LlmEvalsPromptSample = { input: string; output: string };

// A few plausible input/output pairs per use case, cycled by index.
const LLM_EVALS_SAMPLES: Record<string, LlmEvalsPromptSample[]> = {
  chatbot: [
    {
      input: "How do I reset my account password?",
      output:
        "Go to Settings > Security > Reset Password, then follow the emailed link. It expires in 30 minutes.",
    },
    {
      input: "What's your refund policy on annual plans?",
      output:
        "Annual plans are refundable within 30 days of purchase, prorated for any months already used.",
    },
    {
      input: "My last invoice looks wrong, can you check it?",
      output:
        "I can see your last invoice included a mid-cycle seat upgrade — that's the extra line item you're seeing.",
    },
    {
      input: "How do I export my data before closing my account?",
      output:
        "Use Settings > Data Export to generate a CSV/JSON archive; it's emailed to you within a few minutes.",
    },
    {
      input: "Can I change my billing email address?",
      output: "Yes — under Billing > Contacts you can update the billing email at any time.",
    },
  ],
  rag: [
    {
      input: "What is our data retention policy for customer support tickets?",
      output:
        "Per the retention policy document, support tickets are retained for 24 months, then anonymized.",
    },
    {
      input: "Summarize the onboarding checklist for new enterprise customers.",
      output:
        "The checklist covers: kickoff call, SSO setup, data migration, admin training, and a 30-day check-in.",
    },
    {
      input: "What SLA tier applies to a Priority 1 incident?",
      output: "Priority 1 incidents carry a 1-hour response SLA and a 4-hour resolution target.",
    },
    {
      input: "Where is the API rate limit documented?",
      output:
        "The API reference's 'Rate limits' section lists 100 requests/minute for standard tier keys.",
    },
    {
      input: "What's the process for requesting a security questionnaire?",
      output:
        "Security questionnaires are requested via the Trust Center form and are typically returned in 3 business days.",
    },
  ],
};

async function seedLlmEvalsScaffold(
  ctx: Ctx,
): Promise<{ projectIds: Record<string, string>; datasetIds: Record<string, number> }> {
  const projectIds: Record<string, string> = {};
  const datasetIds: Record<string, number> = {};

  for (const p of LLM_EVALS_PROJECTS) {
    const projectId = `proj_${p.key}`;
    projectIds[p.key] = projectId;

    await sequelize.query(
      `INSERT INTO llm_evals_projects
         (id, name, description, use_case, organization_id, created_at, updated_at, created_by)
       VALUES
         (:id, :name, :descr, :useCase, :orgId,
          NOW() - interval '28 days', NOW() - interval '28 days', :createdBy)`,
      {
        replacements: {
          id: projectId,
          name: p.name,
          descr: `Evaluation project for the ${p.name.toLowerCase()} use case.`,
          useCase: p.use_case,
          orgId: ctx.orgId,
          createdBy: String(ctx.userId),
        },
      },
    );

    const [dsRows] = (await sequelize.query(
      `INSERT INTO llm_evals_datasets
         (name, path, size, prompt_count, dataset_type, turn_type, organization_id,
          created_at, updated_at, created_by)
       VALUES
         (:name, :path, :size, :prompts, :dsType, 'single-turn', :orgId,
          NOW() - interval '28 days', NOW() - interval '28 days', :createdBy)
       RETURNING id`,
      {
        replacements: {
          name: p.dataset.name,
          path: p.dataset.path,
          size: p.dataset.prompts * 512,
          prompts: p.dataset.prompts,
          dsType: p.use_case,
          orgId: ctx.orgId,
          createdBy: String(ctx.userId),
        },
      },
    )) as any[];
    datasetIds[p.key] = dsRows[0].id;

    await sequelize.query(
      `INSERT INTO llm_evals_models
         (id, name, provider, model_id, config, organization_id, created_at, updated_at, created_by)
       VALUES
         (:id, :name, 'openrouter', :modelId, CAST(:config AS jsonb), :orgId,
          NOW() - interval '28 days', NOW() - interval '28 days', :createdBy)`,
      {
        replacements: {
          id: `mdl_${p.key}`,
          name: p.model,
          modelId: p.model,
          config: JSON.stringify({}),
          orgId: ctx.orgId,
          createdBy: String(ctx.userId),
        },
      },
    );

    for (const metric of p.metrics) {
      const scorerConfig = {
        judgeModel: { name: "gpt-4o-mini", provider: "openrouter" },
        choiceScores: [
          { label: "PASS", score: 1 },
          { label: "FAIL", score: 0 },
        ],
      };
      await sequelize.query(
        `INSERT INTO llm_evals_scorers
           (id, name, description, type, metric_key, config, enabled, default_threshold,
            weight, organization_id, created_at, updated_at, created_by)
         VALUES
           (:id, :name, :descr, 'llm', :metricKey, CAST(:config AS jsonb), true, 0.5,
            1, :orgId, NOW() - interval '28 days', NOW() - interval '28 days', :createdBy)`,
        {
          replacements: {
            id: `scr_${p.key}_${metric}`,
            name: `${LLM_EVALS_METRIC_LABEL[metric] ?? metric} (${p.name})`,
            descr: `LLM-judge scorer for ${LLM_EVALS_METRIC_LABEL[metric] ?? metric}.`,
            metricKey: metric,
            config: JSON.stringify(scorerConfig),
            orgId: ctx.orgId,
            createdBy: String(ctx.userId),
          },
        },
      );
    }
  }

  return { projectIds, datasetIds };
}

type LlmEvalsExperimentSummary = {
  id: string;
  projectKey: string;
  status: "completed" | "failed";
  avgScores: Record<string, number> | null;
  totalPrompts: number;
};

// Build a deterministic, backdated timestamp-shaped id suffix, e.g.
// "20260615093042123" (yyyyMMddHHmmssSSS), so ids look like real generated
// experiment ids rather than a positional "exp_support_1" placeholder.
function llmEvalsTimestampSuffix(date: Date): string {
  const pad = (n: number, len = 2) => String(n).padStart(len, "0");
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}` +
    pad(date.getUTCMilliseconds(), 3)
  );
}

async function seedLlmEvalsExperiments(
  ctx: Ctx,
  ids: { projectIds: Record<string, string>; datasetIds: Record<string, number> },
): Promise<LlmEvalsExperimentSummary[]> {
  const summaries: LlmEvalsExperimentSummary[] = [];

  for (const p of LLM_EVALS_PROJECTS) {
    const projectId = ids.projectIds[p.key];
    const n = p.trajectory.length;
    const failedIdx = LLM_EVALS_FAILED_INDEX[p.key];
    const samples = LLM_EVALS_SAMPLES[p.use_case] ?? LLM_EVALS_SAMPLES.chatbot;

    for (let i = 0; i < n; i++) {
      // Spread experiments across the last ~3 weeks: oldest experiment ~21
      // days ago, newest ~1 day ago, oldest = lowest score (the regression
      // story runs low -> high as time moves forward). A per-project minute
      // offset (derived from the project key) keeps the two projects'
      // timestamps from colliding even when their day offsets coincide.
      const projectOffsetMin = p.key.split("").reduce((acc, ch) => acc + ch.charCodeAt(0), 0) % 30;
      const daysAgo = Math.round(21 - (i * 20) / Math.max(1, n - 1));
      const createdAt = new Date(Date.now() - daysAgo * 86400000);
      createdAt.setUTCHours(9 + i, 15 + i * 3 + projectOffsetMin, 0, 0);
      const experimentId = `exp_${llmEvalsTimestampSuffix(createdAt)}`;

      const config = {
        model: { name: p.model, provider: "openrouter" },
        dataset: { name: p.dataset.name },
        metrics: p.metrics,
        judgeLlm: { name: "gpt-4o-mini", provider: "openrouter" },
        evaluationMode: "standard",
      };

      const isFailed = i === failedIdx;

      if (isFailed) {
        await sequelize.query(
          `INSERT INTO llm_evals_experiments
             (id, project_id, name, description, config, status, results, error_message,
              started_at, completed_at, organization_id, created_at, updated_at, created_by)
           VALUES
             (:id, :projectId, :name, :descr, CAST(:config AS jsonb), 'failed', NULL,
              :errorMessage, :startedAt, NULL, :orgId, :createdAt, :createdAt, :createdBy)`,
          {
            replacements: {
              id: experimentId,
              projectId,
              name: `${p.name} eval — run ${i + 1}`,
              descr: `Evaluation run ${i + 1} of ${n} for ${p.name}.`,
              config: JSON.stringify(config),
              errorMessage: "Judge model timed out",
              startedAt: createdAt.toISOString(),
              orgId: ctx.orgId,
              createdAt: createdAt.toISOString(),
              createdBy: String(ctx.userId),
            },
          },
        );
        summaries.push({
          id: experimentId,
          projectKey: p.key,
          status: "failed",
          avgScores: null,
          totalPrompts: p.dataset.prompts,
        });
        continue;
      }

      const avgScores: Record<string, number> = {};
      p.metrics.forEach((metric, metricIdx) => {
        avgScores[metric] = llmEvalsMetricScore(metric, p.trajectory[i], i, metricIdx);
      });

      const detailedCount = Math.min(samples.length, 3 + (i % 3)); // 3-5 entries
      const detailedResults = Array.from({ length: detailedCount }, (_, di) => {
        const sample = samples[di % samples.length];
        const metricScores: Record<string, { score: number; passed: boolean; reason: string }> = {};
        p.metrics.forEach((metric, metricIdx) => {
          const score = clamp01(
            llmEvalsMetricScore(metric, p.trajectory[i], i, metricIdx) +
              (((di + 1) * (metricIdx + 1)) % 3) * 0.01,
          );
          const label = LLM_EVALS_METRIC_LABEL[metric] ?? metric;
          const isInverted = LLM_EVALS_INVERTED_METRICS.has(metric);
          const passed = isInverted ? score < 0.5 : score >= 0.5;
          let reason: string;
          if (isInverted) {
            reason = passed
              ? `No significant ${label.toLowerCase()} detected in the response.`
              : `Notable ${label.toLowerCase()} detected in the response, exceeding the judge's threshold.`;
          } else {
            reason = passed
              ? `${label} criteria satisfied for this response.`
              : `${label} fell short of the judge's threshold for this response.`;
          }
          metricScores[label] = {
            score,
            passed,
            reason,
          };
        });
        return {
          input: sample.input,
          output: sample.output,
          metric_scores: metricScores,
        };
      });

      const completedAt = new Date(createdAt.getTime() + 6 * 60000 + i * 30000);

      const results = {
        total_prompts: p.dataset.prompts,
        avg_scores: avgScores,
        detailed_results: detailedResults,
        completed_at: completedAt.toISOString(),
      };
      await sequelize.query(
        `INSERT INTO llm_evals_experiments
           (id, project_id, name, description, config, status, results, error_message,
            started_at, completed_at, organization_id, created_at, updated_at, created_by)
         VALUES
           (:id, :projectId, :name, :descr, CAST(:config AS jsonb), 'completed',
            CAST(:results AS jsonb), NULL, :startedAt, :completedAt, :orgId, :createdAt,
            :completedAt, :createdBy)`,
        {
          replacements: {
            id: experimentId,
            projectId,
            name: `${p.name} eval — run ${i + 1}`,
            descr: `Evaluation run ${i + 1} of ${n} for ${p.name}.`,
            config: JSON.stringify(config),
            results: JSON.stringify(results),
            startedAt: createdAt.toISOString(),
            completedAt: completedAt.toISOString(),
            orgId: ctx.orgId,
            createdAt: createdAt.toISOString(),
            createdBy: String(ctx.userId),
          },
        },
      );

      summaries.push({
        id: experimentId,
        projectKey: p.key,
        status: "completed",
        avgScores,
        totalPrompts: p.dataset.prompts,
      });
    }
  }

  return summaries;
}

// ── LLM Evals logs + point metrics (render-critical) ─────────────────────────
//
// ExperimentDetailContent.tsx does NOT read the experiment `results` JSONB for
// samples/prompt count — it calls getLogs({experiment_id, limit:1000}) against
// llm_evals_logs. PROMPTS = logs.length; the samples table reads
// log.input_text + log.metadata.metric_scores (camelCase keys) +
// log.metadata.expected_outcome. Without log rows every experiment shows
// "PROMPTS: 0 / No samples found". This phase seeds those rows plus the
// llm_evals_metrics rows the Monitor dashboard reads.

const LLM_EVALS_LOG_COUNT = 10; // 8-12, fixed per experiment for determinism

// A short, plausible "expected" answer per use case, cycled by index — shown
// in the sample detail drawer as metadata.expected_outcome.
const LLM_EVALS_EXPECTED: Record<string, string[]> = {
  chatbot: [
    "Directs the customer to Settings > Security > Reset Password and mentions the link expiry.",
    "States the 30-day refund window for annual plans, prorated for used months.",
    "Explains the invoice line item without asking the customer to repeat details already provided.",
    "Points to Settings > Data Export and sets expectations on delivery time.",
    "Confirms the billing email can be changed under Billing > Contacts.",
  ],
  rag: [
    "Cites the 24-month retention period for support tickets before anonymization.",
    "Lists all five onboarding checklist steps in order.",
    "States the 1-hour response / 4-hour resolution SLA for Priority 1 incidents.",
    "References the API reference's rate-limit section and the 100 req/min figure.",
    "Names the Trust Center form and the 3-business-day turnaround.",
  ],
};

function llmEvalsErrorMessage(projectKey: string): string {
  return projectKey === "kb"
    ? "Retrieval timeout: knowledge base vector search exceeded 30s."
    : "Judge model timed out scoring this sample.";
}

async function seedLlmEvalsLogsAndMetrics(
  ctx: Ctx,
  experiments: LlmEvalsExperimentSummary[],
): Promise<{ logCount: number; metricCount: number }> {
  const logRows: Array<Record<string, unknown>> = [];
  const metricRows: Array<Record<string, unknown>> = [];

  for (const exp of experiments) {
    if (exp.status !== "completed" || !exp.avgScores) {
      // Failed experiment: correctly shows 0 samples — no logs seeded.
      continue;
    }

    const project = LLM_EVALS_PROJECTS.find((p) => p.key === exp.projectKey)!;
    const samples = LLM_EVALS_SAMPLES[project.use_case] ?? LLM_EVALS_SAMPLES.chatbot;
    const expected = LLM_EVALS_EXPECTED[project.use_case] ?? LLM_EVALS_EXPECTED.chatbot;
    const metrics = project.metrics;
    const N = LLM_EVALS_LOG_COUNT;

    // Window the logs' timestamps between the experiment's started_at and
    // completed_at so they land "within" the run.
    const [expRow] = (await sequelize.query(
      `SELECT started_at, completed_at, project_id FROM llm_evals_experiments
        WHERE id = :id AND organization_id = :orgId`,
      { replacements: { id: exp.id, orgId: ctx.orgId } },
    )) as any[];
    const startedAt = new Date(expRow[0].started_at).getTime();
    const completedAt = new Date(expRow[0].completed_at).getTime();
    const span = Math.max(1, completedAt - startedAt);
    const projectId = expRow[0].project_id as string;

    const latencies: number[] = [];
    const tokenCounts: number[] = [];
    const costs: number[] = [];

    // Deterministic ~1-in-12 error rate: hash the experiment id to a stable
    // slot in [0, 12) and only error out if that slot falls within this
    // experiment's N rows. At N=8-12 this yields 0-1 error rows per
    // experiment (rare, as intended) without depending on Math.random.
    const expHash = exp.id.split("").reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
    const errorSlot = expHash % 12;

    for (let i = 0; i < N; i++) {
      const sample = samples[i % samples.length];
      const isError = i === errorSlot;

      const metricScores: Record<string, { score: number; passed: boolean; reason: string }> = {};
      metrics.forEach((metric, metricIdx) => {
        const jitter = (((i + 1) * (metricIdx + 3)) % 5) * 0.01 - 0.02; // -0.02..+0.02
        const score = clamp01((exp.avgScores as Record<string, number>)[metric] + jitter);
        const isInverted = LLM_EVALS_INVERTED_METRICS.has(metric);
        const passed = isInverted ? score < 0.5 : score >= 0.5;
        const label = LLM_EVALS_METRIC_LABEL[metric] ?? metric;
        const reason = isInverted
          ? passed
            ? `No significant ${label.toLowerCase()} detected in the response.`
            : `Notable ${label.toLowerCase()} detected in the response, exceeding the judge's threshold.`
          : passed
            ? `${label} criteria satisfied for this response.`
            : `${label} fell short of the judge's threshold for this response.`;
        metricScores[metric] = { score, passed, reason }; // camelCase key
      });

      const latency = 200 + ((i * 137 + 53) % 1300); // 200-1500ms
      const tokenCount = 100 + ((i * 71 + 17) % 800); // 100-900
      const cost = Number((tokenCount * 1e-6).toFixed(6));
      latencies.push(latency);
      tokenCounts.push(tokenCount);
      costs.push(cost);

      const timestamp = new Date(startedAt + Math.round((span * (i + 1)) / (N + 1)));

      logRows.push({
        project_id: projectId,
        experiment_id: exp.id,
        input_text: sample.input,
        output_text: isError ? "" : sample.output,
        model_name: `openai/${project.model}`,
        metadata: {
          metric_scores: isError ? {} : metricScores,
          expected_outcome: expected[i % expected.length],
        },
        latency_ms: latency,
        token_count: tokenCount,
        cost,
        status: isError ? "error" : "success",
        error_message: isError ? llmEvalsErrorMessage(project.key) : null,
        organization_id: ctx.orgId,
        timestamp: timestamp.toISOString(),
      });
    }

    // Per-experiment llm_evals_metrics: one `quality` row per metric (avg for
    // that metric) + the four Monitor rows.
    metrics.forEach((metric) => {
      metricRows.push({
        project_id: projectId,
        experiment_id: exp.id,
        metric_name: metric,
        metric_type: "quality",
        value: (exp.avgScores as Record<string, number>)[metric],
        dimensions: {},
        organization_id: ctx.orgId,
        timestamp: new Date(completedAt).toISOString(),
      });
    });

    // Monitor dashboard reads these 4 literal names; real pipeline only
    // writes 'latency'; other three are demo-only so Monitor tiles populate.
    const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    const avgTokens = tokenCounts.reduce((a, b) => a + b, 0) / tokenCounts.length;
    const totalCost = costs.reduce((a, b) => a + b, 0);
    const qualityValues = metrics.map((m) => (exp.avgScores as Record<string, number>)[m]);
    const scoreAverage = qualityValues.reduce((a, b) => a + b, 0) / qualityValues.length;

    const monitorRows: Array<[string, string, number]> = [
      ["latency", "performance", avgLatency],
      ["token_count", "performance", avgTokens],
      ["cost", "performance", totalCost],
      ["score_average", "quality", scoreAverage],
    ];
    monitorRows.forEach(([name, type, value]) => {
      metricRows.push({
        project_id: projectId,
        experiment_id: exp.id,
        metric_name: name,
        metric_type: type,
        value,
        dimensions: {},
        organization_id: ctx.orgId,
        timestamp: new Date(completedAt).toISOString(),
      });
    });

    // PROMPTS in the UI = logs.length. Keep results.total_prompts and the
    // dataset's prompt_count in sync with the N rows actually seeded, so the
    // header and the samples table never disagree.
    await sequelize.query(
      `UPDATE llm_evals_experiments
          SET results = jsonb_set(results, '{total_prompts}', to_jsonb(:n::int))
        WHERE id = :id AND organization_id = :orgId`,
      { replacements: { n: N, id: exp.id, orgId: ctx.orgId } },
    );
    await sequelize.query(
      `UPDATE llm_evals_datasets
          SET prompt_count = :n
        WHERE organization_id = :orgId
          AND name = :name`,
      { replacements: { n: N, orgId: ctx.orgId, name: project.dataset.name } },
    );
  }

  // Bulk insert both tables via jsonb_to_recordset (mirrors the Agent Control
  // audit-stream pattern): one round trip per chunk instead of one INSERT per row.
  const CHUNK = 250;
  for (let i = 0; i < logRows.length; i += CHUNK) {
    const chunk = logRows.slice(i, i + CHUNK);
    await sequelize.query(
      `INSERT INTO llm_evals_logs
         (project_id, experiment_id, trace_id, input_text, output_text, model_name,
          metadata, latency_ms, token_count, cost, status, error_message,
          organization_id, timestamp)
       SELECT r.project_id, r.experiment_id, gen_random_uuid(), r.input_text, r.output_text,
              r.model_name, r.metadata, r.latency_ms, r.token_count, r.cost, r.status,
              r.error_message, :orgId, r.timestamp
       FROM jsonb_to_recordset(CAST(:rows AS jsonb)) AS r(
         project_id text, experiment_id text, input_text text, output_text text,
         model_name text, metadata jsonb, latency_ms integer, token_count integer,
         cost numeric, status text, error_message text, timestamp timestamptz)`,
      { replacements: { orgId: ctx.orgId, rows: JSON.stringify(chunk) } },
    );
  }

  for (let i = 0; i < metricRows.length; i += CHUNK) {
    const chunk = metricRows.slice(i, i + CHUNK);
    await sequelize.query(
      `INSERT INTO llm_evals_metrics
         (project_id, experiment_id, metric_name, metric_type, value, dimensions,
          organization_id, timestamp)
       SELECT r.project_id, r.experiment_id, r.metric_name, r.metric_type, r.value,
              r.dimensions, :orgId, r.timestamp
       FROM jsonb_to_recordset(CAST(:rows AS jsonb)) AS r(
         project_id text, experiment_id text, metric_name text, metric_type text,
         value double precision, dimensions jsonb, timestamp timestamptz)`,
      { replacements: { orgId: ctx.orgId, rows: JSON.stringify(chunk) } },
    );
  }

  return { logCount: logRows.length, metricCount: metricRows.length };
}

async function seedLlmEvals(ctx: Ctx): Promise<LlmEvalsExperimentSummary[]> {
  // Guard: these tables belong to the EvalServer Alembic chain. Same physical
  // Postgres + schema in local dev; skip this phase loudly (without failing
  // the rest of the seed) if that chain hasn't been applied here.
  const [guard] = (await sequelize.query(
    `SELECT to_regclass('verifywise.llm_evals_experiments') AS t`,
  )) as any[];
  if (!guard[0]?.t) {
    log("llm evals SKIPPED: llm_evals_* tables not found — apply EvalServer alembic migrations");
    return [];
  }

  // Reseed: delete-then-insert, hard-scoped to the demo org, FK-safe order
  // (children before parents; datasets/models/scorers have no FK to
  // experiments so order among them doesn't matter, but experiments must go
  // before projects).
  for (const t of [
    "llm_evals_metrics",
    "llm_evals_logs",
    "llm_evals_experiments",
    "llm_evals_scorers",
    "llm_evals_models",
    "llm_evals_datasets",
    "llm_evals_projects",
  ]) {
    await sequelize.query(`DELETE FROM ${t} WHERE organization_id = :orgId`, {
      replacements: { orgId: ctx.orgId },
    });
  }

  const ids = await seedLlmEvalsScaffold(ctx);
  const summaries = await seedLlmEvalsExperiments(ctx, ids);
  const { logCount, metricCount } = await seedLlmEvalsLogsAndMetrics(ctx, summaries);

  const projectCount = LLM_EVALS_PROJECTS.length;
  log(
    `llm evals: seeded ${projectCount} projects, ${summaries.length} experiments, ` +
      `${logCount} logs, ${metricCount} metrics`,
  );

  // Self-verification: each project should have all four Monitor metric_names
  // present (latency/token_count/cost/score_average) across its experiments.
  const MONITOR_NAMES = ["latency", "token_count", "cost", "score_average"];
  for (const p of LLM_EVALS_PROJECTS) {
    const projectId = ids.projectIds[p.key];
    const [rows] = (await sequelize.query(
      `SELECT DISTINCT metric_name FROM llm_evals_metrics
        WHERE organization_id = :orgId AND project_id = :projectId
          AND metric_name IN (:names)`,
      { replacements: { orgId: ctx.orgId, projectId, names: MONITOR_NAMES } },
    )) as any[];
    const present = new Set((rows ?? []).map((r: any) => r.metric_name));
    const all = MONITOR_NAMES.every((n) => present.has(n));
    log(
      `  monitor: ${p.name} latency/token_count/cost/score_average ${
        all ? "present" : `MISSING (${MONITOR_NAMES.filter((n) => !present.has(n)).join(", ")})`
      }`,
    );
  }

  return summaries;
}

// Titles this step owns — used for the idempotent pre-delete.
const EXTRA_TASK_TITLES = [
  "Approve vendor assessment: LLM provider",
  "Close overdue mitigation: model access controls",
];

async function addDatedTasks(ctx: Ctx) {
  // Idempotent: remove prior copies of exactly these tasks (scoped to the demo
  // org) before re-adding, so reseeds don't accumulate duplicate tasks.
  await sequelize.query(`DELETE FROM tasks WHERE organization_id = :orgId AND title IN (:titles)`, {
    replacements: { orgId: ctx.orgId, titles: EXTRA_TASK_TITLES },
  });
  try {
    await api(ctx.token, "POST", "/api/tasks", {
      title: EXTRA_TASK_TITLES[0],
      priority: "High",
      status: "Open",
      due_date: daysFromNow(4),
    });
    await api(ctx.token, "POST", "/api/tasks", {
      title: EXTRA_TASK_TITLES[1],
      priority: "High",
      status: "Open",
      due_date: daysFromNow(-1), // overdue, for the risk sweep beat
    });
    log("added dated tasks (one due this week, one overdue)");
  } catch (e) {
    log(`dated tasks skipped (${(e as Error).message})`);
  }
}

// ── 4. Raw-SQL backfills (no create-endpoint exists). Hard-scoped to demo org ──

/**
 * Backdated notifications — the "overnight activity" that makes the morning
 * feel real. No POST /notifications endpoint exists; these are normally emitted
 * by domain events. We insert directly, scoped to the demo org + admin user,
 * with valid enum types and backdated created_at.
 */
async function backfillNotifications(ctx: Ctx) {
  const rows = [
    {
      type: "task_assigned",
      title: "New task assigned",
      message: "Singapore team filed a use-case review overnight.",
      hoursAgo: 9,
      entity_type: "task",
    },
    {
      type: "approval_requested",
      title: "Approval requested",
      message: "Vendor assessment awaiting your approval.",
      hoursAgo: 14,
      entity_type: "vendor",
    },
    {
      type: "vendor_review_due",
      title: "Vendor review due",
      message: "A vendor's scheduled risk review is coming up this week.",
      hoursAgo: 6,
      entity_type: "vendor",
    },
    {
      type: "policy_due_soon",
      title: "Policy review due",
      message: "An AI usage policy is approaching its review date.",
      hoursAgo: 20,
      entity_type: "policy",
    },
  ];
  // Idempotent: clear this demo org's notifications first so reseeds don't
  // stack duplicate "overnight" notifications.
  await sequelize.query(`DELETE FROM notifications WHERE organization_id = :orgId`, {
    replacements: { orgId: ctx.orgId },
  });
  for (const r of rows) {
    await sequelize.query(
      `INSERT INTO notifications
         (organization_id, user_id, type, title, message, entity_type, is_read, created_at, created_by)
       VALUES
         (:orgId, :userId, CAST(:type AS verifywise.enum_notification_type), :title, :message,
          CAST(:entityType AS verifywise.enum_notification_entity_type), false,
          NOW() - (:hoursAgo || ' hours')::interval, :userId)`,
      {
        replacements: {
          orgId: ctx.orgId,
          userId: ctx.userId,
          type: r.type,
          title: r.title,
          message: r.message,
          entityType: r.entity_type,
          hoursAgo: r.hoursAgo,
        },
      },
    );
  }
  log(`backfilled ${rows.length} backdated notifications (scoped to demo org ${ctx.orgId})`);
}

/**
 * Dashboard trend history — the app writes one snapshot per day, so a fresh org
 * has a flat line. We backfill ~45 org-level daily rows (project_id NULL) with a
 * gently improving trend. ON CONFLICT DO NOTHING respects the (organization_id,
 * snapshot_date) partial unique index and never fights the daily job.
 */
async function backfillTrend(ctx: Ctx) {
  const days = 45;
  // Idempotent: clear this demo org's snapshots first. The table's unique index
  // is partial (WHERE project_id IS NULL), which a bare ON CONFLICT DO NOTHING
  // does not reliably engage, so reseeds were stacking a second row per date.
  await sequelize.query(`DELETE FROM risk_portfolio_snapshots WHERE organization_id = :orgId`, {
    replacements: { orgId: ctx.orgId },
  });
  let inserted = 0;
  for (let i = days; i >= 0; i--) {
    // gentle downward ALE trend (posture improving) with mild noise
    const base = 1_200_000 - (days - i) * 9_000;
    const noise = ((i * 37) % 11) * 3_500; // deterministic, no Math.random
    const totalAle = Math.max(300_000, base + noise);
    const residual = Math.round(totalAle * 0.42);
    const mitigation = Math.round(totalAle * 0.15);
    const riskCount = 18 + ((i * 7) % 6);
    await sequelize.query(
      `INSERT INTO risk_portfolio_snapshots
         (organization_id, project_id, total_ale, total_residual_ale, total_mitigation_cost, risk_count, snapshot_date, created_at)
       VALUES
         (:orgId, NULL, :ale, :residual, :mitigation, :riskCount,
          (CURRENT_DATE - :i::int), NOW())
       ON CONFLICT DO NOTHING`,
      {
        replacements: {
          orgId: ctx.orgId,
          ale: totalAle,
          residual,
          mitigation,
          riskCount,
          i,
        },
      },
    );
    inserted++;
  }
  log(`backfilled ${inserted} daily trend snapshots (org-level, demo org ${ctx.orgId})`);
}

async function clearBackfills(ctx: Ctx) {
  await sequelize.query(`DELETE FROM notifications WHERE organization_id = :orgId`, {
    replacements: { orgId: ctx.orgId },
  });
  await sequelize.query(`DELETE FROM risk_portfolio_snapshots WHERE organization_id = :orgId`, {
    replacements: { orgId: ctx.orgId },
  });

  // Demo agents this script owns (scoped to the demo org). The seeder upserts on
  // reseed, but --reset wipes them so a fresh run rebuilds the exact demo set.
  await sequelize.query(`DELETE FROM agent_primitives WHERE organization_id = :orgId`, {
    replacements: { orgId: ctx.orgId },
  });

  // Demo AI apps inventory (distinct feature/table from agent_primitives).
  await sequelize.query(`DELETE FROM ai_apps WHERE organization_id = :orgId AND is_demo = true`, {
    replacements: { orgId: ctx.orgId },
  });

  // Demo incidents (also cleared by seedIncidents itself, but consistent with
  // the other demo tables cleared here on --reset).
  await sequelize.query(
    `DELETE FROM ai_incident_managements WHERE organization_id = :orgId AND is_demo = true`,
    { replacements: { orgId: ctx.orgId } },
  );

  // Delete the organizational governance project THROUGH THE API. The project
  // delete path runs frameworkDeletionMap, which clears the NIST/ISO control
  // trees — those child tables have NO cascading FK on projects_frameworks_id,
  // so a raw SQL project delete would orphan ~70 rows per framework per reseed.
  const orgProjects = (await sequelize.query(
    `SELECT id FROM projects WHERE organization_id = :orgId AND is_organizational = true`,
    { replacements: { orgId: ctx.orgId } },
  )) as any[];
  for (const p of orgProjects[0] ?? []) {
    try {
      await api(ctx.token, "DELETE", `/api/projects/${p.id}`);
    } catch (e) {
      log(`  org project ${p.id} delete skipped (${(e as Error).message})`);
    }
  }

  // Safety net: purge any orphaned NIST/ISO control-tree rows left by earlier
  // reseeds (rows whose projects_frameworks parent no longer exists). Scoped to
  // the demo org, so it only ever touches demo data.
  await sequelize.query(
    `DELETE FROM nist_ai_rmf_subcategories s
      WHERE s.organization_id = :orgId
        AND NOT EXISTS (SELECT 1 FROM projects_frameworks pf WHERE pf.id = s.projects_frameworks_id)`,
    { replacements: { orgId: ctx.orgId } },
  );
  await sequelize.query(
    `DELETE FROM subclauses_iso s
      WHERE s.organization_id = :orgId
        AND NOT EXISTS (SELECT 1 FROM projects_frameworks pf WHERE pf.id = s.projects_frameworks_id)`,
    { replacements: { orgId: ctx.orgId } },
  );
  await sequelize.query(
    `DELETE FROM annexcategories_iso s
      WHERE s.organization_id = :orgId
        AND NOT EXISTS (SELECT 1 FROM projects_frameworks pf WHERE pf.id = s.projects_frameworks_id)`,
    { replacements: { orgId: ctx.orgId } },
  );
  // Evidence hub records for this demo org, so reseeds don't stack duplicates.
  await sequelize.query(`DELETE FROM evidence_hub WHERE organization_id = :orgId`, {
    replacements: { orgId: ctx.orgId },
  });

  // Intake submissions + forms for this demo org (submissions first — FK).
  await sequelize.query(`DELETE FROM intake_submissions WHERE organization_id = :orgId`, {
    replacements: { orgId: ctx.orgId },
  });
  await sequelize.query(`DELETE FROM intake_forms WHERE organization_id = :orgId`, {
    replacements: { orgId: ctx.orgId },
  });

  log(
    "cleared demo org notifications, trend, org project (via API), orphaned control trees, evidence, intake",
  );
}

function daysFromNow(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

// ── main ──────────────────────────────────────────────────────────────────

async function main() {
  log(`target API: ${API_BASE}`);
  const { orgId, userId } = await bootstrapOrgAndAdmin();
  const token = await login();
  const ctx: Ctx = { orgId, userId, token };

  if (RESET) {
    log("--reset: wiping demo data before reseed");
    await deleteAutoDriver(ctx);
    await clearBackfills(ctx);
  }

  await runAutoDriver(ctx);
  await normalizeDemoRisks(ctx);
  await seedOrgFrameworks(ctx);
  await populateNistCoverage(ctx);
  await populateIso42001Coverage(ctx);
  await addExtraModels(ctx);
  const usersByEmail = await seedExtraUsers(ctx);
  await seedAgentPrimitives(ctx, usersByEmail);
  await seedAiApps(ctx, usersByEmail);
  await seedIncidents(ctx);
  await seedLlmEvals(ctx);
  await seedIntakeForm(ctx);
  await addDatedTasks(ctx);
  await backfillNotifications(ctx);
  await backfillTrend(ctx);

  log("");
  log("done. Demo org ready.");
  log(`  org id:   ${orgId}`);
  log(`  login:    ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
  log(`  re-seed:  npm run seed:demo-org:reset`);
}

main()
  .then(async () => {
    await sequelize.close();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error("[seed] FAILED:", err);
    await sequelize.close();
    process.exit(1);
  });
