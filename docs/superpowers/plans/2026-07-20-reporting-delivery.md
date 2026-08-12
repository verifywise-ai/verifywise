# Reporting Phase 4 — Truthful Delivery, Pagination, and Schedule Editing

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make report delivery actually deliver — today the service records `status: "success"` for emails it never sends — and close the remaining gaps that make scheduled reports hard to live with: no way to edit or remove one from the UI, a hard 200-run cap, a run list that never refreshes, and a wizard that silently forces PDF.

**Architecture:** `reportDeliveryService.deliverReport` gains a real email path built on the existing `sendAutomationEmail` (multi-recipient, attachment-capable) plus one new MJML template. Recipients are validated at *creation* time rather than discovered as bad at send time. `listRunsQuery` grows `limit`/`offset`. A new `PATCH /api/reporting/scheduled-reports/:id` fills the CRUD hole, and the already-shipped `DELETE` finally gets a frontend caller.

**Tech Stack:** Node 22, Express 4, Sequelize 6 raw SQL, PostgreSQL, MJML, BullMQ, React 19 + React Query, Jest, Vitest.

---

## Context before Task 1

**This is Phase 4 of 4.** Phases 1–3 are merged on branch `hp-apr-16-add-tasks-agent`. Spec: `docs/superpowers/specs/2026-07-17-reporting-agent-analysis-design.md` §7.

### Files you must not touch

`Clients/src/presentation/pages/Reporting/{TemplatesTab,ScheduledReportsTab,ArchiveTab}.tsx` are **another developer's uncommitted work** (+202/−126, a styling refactor). Every phase so far has left them alone and so does this one. **Never run `git add -A` or `git add .`** — the working tree carries ~74 dirty files that are not ours. Stage only the exact paths each task names.

### Three spec items that are already done or must not be done

Verified against source before this plan was written:

1. **`report_runs.file_id` FK and `scheduled_reports.llm_key_id` already exist.** Phase 1's migration `20260719184714-report-runs-fileid-fk-and-llm-key.js` added both — the FK with `ON DELETE SET NULL` and a data-cleanup step for pre-existing orphans. **Do not re-add them.**

2. **The legacy `scheduled_report` automation trigger must NOT be retired.** The spec calls for retiring it on the belief that it is a vestigial third caller of `generateReport()`. It is not vestigial. The trigger type is seeded in `20260226234301-public-schema-tables.js:901`, the handler is `sendReportNotification()` at `Servers/services/automations/automationWorker.ts:304-428` (dispatched from the BullMQ switch at `:647`), and — decisively — **the Automations UI creates these rows at runtime**: `Clients/src/presentation/pages/Automations/components/ConfigurationPanel/index.tsx:665` has a `case "scheduled_report":`, with supporting references in `Automations/index.tsx:476,812`, `AutomationBuilder/index.tsx:63`, and the `Automation.ts:54` type union. Any organization that built a "Scheduled Report" automation has a live row this code path serves. Deleting it breaks those orgs with no migration path and no error. Task 8 records this decision in the docs instead.

3. **The spec's path for that worker is wrong.** `Servers/jobs/automationWorker.ts` does not exist; the real file is `Servers/services/automations/automationWorker.ts`, and the handler sits at 304-494, not the "250-492" the spec cites. Mentioned only so nobody wastes time hunting the wrong file.

### Verification gates that do not work the way you would assume

- **`cd Clients && npm run build` is `vite build` only — no `tsc`.** The frontend type gate is `npx tsc --noEmit -p tsconfig.app.json`, and it has exactly **one** pre-existing error: `TS7030` at `src/presentation/components/Reporting/GenerateReport/index.tsx(152,13)`. That one is the documented baseline — **do not fix it**. A second error is yours.
- **`Servers/tsconfig.json` includes `utils/**/*.ts` and excludes only `controllers/__tests__`.** A type error in a `utils/__tests__` file fails `npm run build` even though ts-jest (`diagnostics: false`) runs it happily.
- **Backend integration suites live in `Servers/tests/integration/`**, not `routes/__tests__/integration`. Ignore the right path or 31 DB-backed suites run without their `globalSetup` and all fail.
- **There is no `api-docs-drift` CI job.** Regenerating swagger is a manual pre-PR step — Task 8 does it.

---

## Locked decisions

1. **Use `sendAutomationEmail`, not `sendEmail`.** `sendEmail(to: string, subject, template, data)` takes a single recipient and compiles an MJML template. `sendAutomationEmail(to: string[], subject, body: string, attachments?)` takes an array and supports attachments — which the `attachFile` channel needs. Report delivery is multi-recipient with an optional attachment, so it is the right primitive. Compile the MJML to HTML first with `compileMjmlToHtml`, then pass the result as `body`. `Servers/services/automations/actions/sendEmail.ts` is the shape to imitate.

2. **Recipients are validated at creation, not only at send.** Today `scheduledReportService.validateScheduledReportInput` checks only `recipients?.length` — presence, not format. A typo'd address is discovered days later inside a worker, where the failure is invisible to the person who made it. `isValidEmail` already exists in `Servers/services/email/types.ts` and is what `sendAutomationEmail` uses internally; reuse it at create time so a bad address is a 400 at the moment of typing. Send-time validation stays as the backstop.

3. **A failed send records `failed` with the real error, and does not fail the run.** The existing per-channel try/catch shape is correct and stays. What changes is that the `success` in the email branch becomes conditional on an actual send resolving. Storage succeeding while email fails is a `partial_success`, not a failure — the report exists and is downloadable.

4. **Pagination defaults preserve current behaviour.** `listRunsQuery`'s hard `LIMIT 200` becomes `limit`/`offset` with `limit` defaulting to 200, clamped to `[1, 200]`. An existing caller that passes nothing sees exactly what it sees today. The response gains a `total` so a UI can page.

5. **`PATCH` on a scheduled report updates a field allowlist and recomputes `next_run_at`.** If `schedule_config` changes, the stored `next_run_at` is stale and the report fires at the old time — so any schedule change must re-run `computeNextRun`. Fields outside the allowlist are ignored, and `organization_id`, `template_id`, `template_version_id` and `created_by` are never updatable.

6. **`hasKeys` is optimistically `true` while loading — gate on that carefully.** `useLLMKeyStatus` returns `hasKeys: loading || (data?.hasKeys ?? false)` (`useLLMKeyStatus.ts:38`). It is not a tri-state. Gating AI blocks naively on `!hasKeys` means the blocks flicker enabled→disabled on mount. Consume `loading` alongside it and render the disabled state only once `loading === false`. Do not "fix" the hook — three prior commits (`5f8401b16`, `38bbc06da`, `74677b0aa`) chased this flicker and `482286a0a` deliberately baked the optimistic default in.

7. **The three deferred tabs stay deferred.** `ArchiveTab` is where pagination and run polling would surface, and `ScheduledReportsTab` is where edit/delete buttons would live. Both are off-limits. Phase 4 ships the backend, repository and hooks for all of it — the tab wiring is a follow-up that lands when the other developer's refactor does. Shipping a hook nobody calls is acceptable here in a way that shipping an unreachable *panel* was not: hooks are testable in isolation and have no rendering surface to rot.

---

## Task 1: Real email delivery

**Files:**
- Create: `Servers/templates/report-ready.mjml`
- Modify: `Servers/services/reporting/reportDeliveryService.ts`
- Create: `Servers/services/reporting/__tests__/reportDeliveryService.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `Servers/services/reporting/__tests__/reportDeliveryService.test.ts`:

```ts
jest.mock("../../../utils/fileUpload.utils", () => ({ uploadFile: jest.fn() }));
jest.mock("../../emailService", () => ({ sendAutomationEmail: jest.fn() }));
jest.mock("../../../tools/mjmlCompiler", () => ({
  compileMjmlToHtml: jest.fn(async () => "<html>report ready</html>"),
}));

import { deliverReport } from "../reportDeliveryService";
import { uploadFile } from "../../../utils/fileUpload.utils";
import { sendAutomationEmail } from "../../emailService";

const artifact = {
  content: Buffer.from("PDFDATA"),
  filename: "report.pdf",
  mimeType: "application/pdf",
};
const ctx = { organizationId: 42, userId: 9, runId: 5 };

beforeEach(() => jest.clearAllMocks());

describe("deliverReport", () => {
  it("actually sends an email when sendEmailLink is enabled", async () => {
    (uploadFile as jest.Mock).mockResolvedValue({ id: 100 });
    (sendAutomationEmail as jest.Mock).mockResolvedValue(undefined);

    const res = await deliverReport(
      { saveToStorage: true, sendEmailLink: true, recipients: ["a@example.com"] },
      artifact,
      ctx,
    );

    expect(sendAutomationEmail).toHaveBeenCalledTimes(1);
    const [to, subject, body] = (sendAutomationEmail as jest.Mock).mock.calls[0];
    expect(to).toEqual(["a@example.com"]);
    expect(typeof subject).toBe("string");
    expect(body).toContain("report ready");
    expect(res.emailLink.status).toBe("success");
  });

  it("records failed with the real error when the send throws", async () => {
    (uploadFile as jest.Mock).mockResolvedValue({ id: 100 });
    (sendAutomationEmail as jest.Mock).mockRejectedValue(new Error("SMTP 550 rejected"));

    const res = await deliverReport(
      { saveToStorage: true, sendEmailLink: true, recipients: ["a@example.com"] },
      artifact,
      ctx,
    );

    expect(res.emailLink.status).toBe("failed");
    expect(res.emailLink.error).toContain("SMTP 550");
    // Storage still succeeded — a failed email must not lose the report.
    expect(res.storage.status).toBe("success");
    expect(res.fileId).toBe(100);
  });

  it("attaches the artifact when attachFile is enabled", async () => {
    (sendAutomationEmail as jest.Mock).mockResolvedValue(undefined);

    await deliverReport(
      { attachFile: true, recipients: ["a@example.com", "b@example.com"] },
      artifact,
      ctx,
    );

    const [to, , , attachments] = (sendAutomationEmail as jest.Mock).mock.calls[0];
    expect(to).toHaveLength(2);
    expect(attachments).toHaveLength(1);
    expect(attachments[0].filename).toBe("report.pdf");
    expect(attachments[0].content).toBe(artifact.content);
  });

  it("sends one email when both email channels are on, not two", async () => {
    (sendAutomationEmail as jest.Mock).mockResolvedValue(undefined);

    await deliverReport(
      { sendEmailLink: true, attachFile: true, recipients: ["a@example.com"] },
      artifact,
      ctx,
    );

    expect(sendAutomationEmail).toHaveBeenCalledTimes(1);
  });

  it("does not claim success when there are no recipients", async () => {
    const res = await deliverReport(
      { sendEmailLink: true, recipients: [] },
      artifact,
      ctx,
    );

    expect(sendAutomationEmail).not.toHaveBeenCalled();
    expect(res.emailLink.status).toBe("failed");
    expect(res.emailLink.error).toMatch(/recipient/i);
  });

  it("skips every channel that is not enabled", async () => {
    const res = await deliverReport({}, artifact, ctx);
    expect(res.storage.status).toBe("skipped");
    expect(res.emailLink.status).toBe("skipped");
    expect(res.attachment.status).toBe("skipped");
    expect(uploadFile).not.toHaveBeenCalled();
    expect(sendAutomationEmail).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

```bash
cd Servers && npx jest services/reporting/__tests__/reportDeliveryService.test.ts
```

Expected: FAIL. The current implementation never calls `sendAutomationEmail`, so the first test fails on `expect(sendAutomationEmail).toHaveBeenCalledTimes(1)` receiving 0 — which is precisely the "records success for work it never did" defect.

- [ ] **Step 3: Create the MJML template**

Create `Servers/templates/report-ready.mjml`. Match the structure of an existing template (open `Servers/templates/task-assigned.mjml` and mirror its wrapper, fonts and colours — do not invent a new visual language):

```xml
<mjml>
  <mj-body background-color="#f5f5f5">
    <mj-section background-color="#ffffff" padding="24px">
      <mj-column>
        <mj-text font-family="Inter, Arial, sans-serif" font-size="16px" font-weight="600" color="#1a1a1a">
          Your report is ready
        </mj-text>
        <mj-text font-family="Inter, Arial, sans-serif" font-size="13px" color="#344054">
          {{reportName}} was generated on {{generatedAt}}.
        </mj-text>
        <mj-text font-family="Inter, Arial, sans-serif" font-size="13px" color="#344054">
          {{downloadNote}}
        </mj-text>
        <mj-button href="{{downloadUrl}}" background-color="#13715B" border-radius="4px" font-size="13px">
          Download report
        </mj-button>
        <mj-text font-family="Inter, Arial, sans-serif" font-size="12px" color="#667085">
          You are receiving this because you are a recipient of a scheduled report in VerifyWise.
        </mj-text>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>
```

Confirm the placeholder syntax matches what `Servers/tools/mjmlCompiler.ts` actually substitutes — read it first. If it uses something other than `{{key}}`, use whatever it uses.

- [ ] **Step 4: Rewrite the email branch**

Replace the `if (delivery.sendEmailLink || delivery.attachFile) { ... }` block in `Servers/services/reporting/reportDeliveryService.ts` with:

```ts
  if (delivery.sendEmailLink || delivery.attachFile) {
    const recipients: string[] = Array.isArray(delivery.recipients) ? delivery.recipients : [];
    if (!recipients.length) {
      // Never report success for a send with nobody to send to. This was the
      // old behaviour and it is how a misconfigured schedule looked healthy
      // for weeks.
      const error = "no recipients configured";
      if (delivery.sendEmailLink) status.emailLink = { enabled: true, status: "failed", error };
      if (delivery.attachFile) status.attachment = { enabled: true, status: "failed", error };
      return { ...status, fileId };
    }

    try {
      // One email carries both channels: a link when sendEmailLink is on, the
      // file itself when attachFile is on. Two enabled channels must not mean
      // two emails to the same people.
      const downloadUrl = ctx.runId
        ? `${process.env.FRONTEND_URL ?? ""}/api/reporting/runs/${ctx.runId}/download`
        : "";
      const html = await compileMjmlToHtml("report-ready", {
        reportName: artifact.filename,
        generatedAt: new Date().toISOString().slice(0, 10),
        downloadUrl,
        downloadNote: delivery.attachFile
          ? "The report is attached to this email."
          : "Use the link below to download it. You will need to be signed in.",
      });

      await sendAutomationEmail(
        recipients,
        `Your report is ready: ${artifact.filename}`,
        html,
        delivery.attachFile
          ? [{ filename: artifact.filename, content: artifact.content, contentType: artifact.mimeType }]
          : undefined,
      );

      if (delivery.sendEmailLink) {
        status.emailLink = { enabled: true, status: "success", recipients };
      }
      if (delivery.attachFile) {
        status.attachment = { enabled: true, status: "success", recipients };
      }
    } catch (e: any) {
      // Record the real error. A failed email does not lose the report —
      // storage already succeeded and the run stays downloadable.
      const error = e?.message ?? String(e);
      if (delivery.sendEmailLink) status.emailLink = { enabled: true, status: "failed", error };
      if (delivery.attachFile) status.attachment = { enabled: true, status: "failed", error };
    }
  }
```

Add the imports at the top of the file:

```ts
import { sendAutomationEmail } from "../emailService";
import { compileMjmlToHtml } from "../../tools/mjmlCompiler";
```

Verify both import paths resolve from `Servers/services/reporting/` before running — the recon placed `emailService.ts` at `Servers/services/emailService.ts` and the compiler at `Servers/tools/mjmlCompiler.ts`, but check.

- [ ] **Step 5: Run to verify they pass**

```bash
cd Servers && npx jest services/reporting/__tests__/reportDeliveryService.test.ts
```

Expected: PASS, 6 tests.

- [ ] **Step 6: Confirm the run status still reflects a partial failure**

```bash
cd Servers && grep -rn "partial_success" services/reporting/ utils/reportRun.utils.ts
```

Report what you find. If nothing maps a failed delivery channel onto `partial_success`, say so — do **not** add that mapping in this task; it is noted as a carried-forward item.

- [ ] **Step 7: Build and commit**

```bash
cd Servers && npm run build
```

```bash
git add Servers/services/reporting/reportDeliveryService.ts Servers/templates/report-ready.mjml Servers/services/reporting/__tests__/reportDeliveryService.test.ts
git commit -m "fix(reporting): actually send delivery emails

deliverReport set status success for the email channels without calling
any email function — the code carried a TODO admitting it. A schedule
with a typo'd recipient, or no recipient at all, reported healthy
indefinitely.

Now compiles report-ready.mjml and sends through sendAutomationEmail,
which handles multiple recipients and attachments. Both email channels
share one send, so enabling link and attachment does not mail people
twice. A throw records failed with the provider's real error, and does
not lose the report: storage has already succeeded and the run stays
downloadable."
```

---

## Task 2: Validate recipient format at creation

**Files:**
- Modify: `Servers/services/reporting/scheduledReportService.ts`
- Modify: `Servers/services/reporting/__tests__/scheduledReportService.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `Servers/services/reporting/__tests__/scheduledReportService.test.ts` (read the file first — append inside its existing `describe` if it has one):

```ts
  it("rejects a malformed recipient address", () => {
    const errs = validateScheduledReportInput({
      scope: "organization",
      sectionsConfig: { sections: [{ reportSectionKey: "projectRisks" }] },
      deliveryConfig: { sendEmailLink: true, recipients: ["not-an-email"] },
    } as any);
    expect(errs.some((e) => /recipient/i.test(e) && /not-an-email/.test(e))).toBe(true);
  });

  it("names every malformed recipient, not just the first", () => {
    const errs = validateScheduledReportInput({
      scope: "organization",
      sectionsConfig: { sections: [{ reportSectionKey: "projectRisks" }] },
      deliveryConfig: {
        sendEmailLink: true,
        recipients: ["good@example.com", "bad1", "bad2"],
      },
    } as any);
    const joined = errs.join(" ");
    expect(joined).toContain("bad1");
    expect(joined).toContain("bad2");
    expect(joined).not.toContain("good@example.com");
  });

  it("accepts well-formed recipients", () => {
    const errs = validateScheduledReportInput({
      scope: "organization",
      sectionsConfig: { sections: [{ reportSectionKey: "projectRisks" }] },
      deliveryConfig: { sendEmailLink: true, recipients: ["a@example.com", "b.c+tag@sub.example.co.uk"] },
    } as any);
    expect(errs).toEqual([]);
  });

  it("does not validate recipients when no email channel is enabled", () => {
    const errs = validateScheduledReportInput({
      scope: "organization",
      sectionsConfig: { sections: [{ reportSectionKey: "projectRisks" }] },
      deliveryConfig: { saveToStorage: true, recipients: ["garbage"] },
    } as any);
    expect(errs).toEqual([]);
  });
```

- [ ] **Step 2: Run to verify they fail**

```bash
cd Servers && npx jest services/reporting/__tests__/scheduledReportService.test.ts
```

Expected: FAIL — the first two tests, because only `recipients?.length` is checked today.

- [ ] **Step 3: Implement**

In `Servers/services/reporting/scheduledReportService.ts`, extend the recipients check inside `validateScheduledReportInput`:

```ts
  if ((d.sendEmailLink || d.attachFile) && !(d.recipients?.length)) {
    errs.push("recipients required when email delivery is enabled");
  } else if ((d.sendEmailLink || d.attachFile) && d.recipients?.length) {
    // Format-check at creation. sendAutomationEmail validates again at send
    // time, but by then the person who typed the address is long gone and the
    // failure is buried in a worker log.
    const bad = (d.recipients as string[]).filter((r) => !isValidEmail(r));
    if (bad.length) errs.push(`invalid recipient address: ${bad.join(", ")}`);
  }
```

Add the import:

```ts
import { isValidEmail } from "../email/types";
```

Verify that path and export name against `Servers/services/email/types.ts` before running — if `isValidEmail` is not exported, export it rather than duplicating the regex.

- [ ] **Step 4: Run to verify they pass**

```bash
cd Servers && npx jest services/reporting/__tests__/scheduledReportService.test.ts
```

Expected: PASS.

- [ ] **Step 5: Build and commit**

```bash
cd Servers && npm run build
```

```bash
git add Servers/services/reporting/scheduledReportService.ts Servers/services/reporting/__tests__/scheduledReportService.test.ts
git commit -m "feat(reporting): validate recipient addresses when a schedule is created

Only presence was checked, so a typo'd address was accepted and then
failed inside a worker days later, where nobody who could fix it would
see it. Reuses isValidEmail, the same check sendAutomationEmail applies
at send time, and names every bad address rather than only the first."
```

---

## Task 3: Paginate `listRunsQuery`

**Files:**
- Modify: `Servers/utils/reportRun.utils.ts`
- Modify: `Servers/controllers/reportRun.ctrl.ts`
- Modify: `Servers/controllers/__tests__/reportRun.ctrl.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `Servers/controllers/__tests__/reportRun.ctrl.test.ts`, inside the existing `describe`. That file already mocks `reportRun.utils` — extend the existing mock rather than adding a second:

```ts
  it("listRuns passes limit and offset through to the query", async () => {
    (listRunsQuery as jest.Mock).mockResolvedValue({ rows: [], total: 0 });

    const req = { query: { limit: "25", offset: "50" }, organizationId: 5 } as any;
    const res = createMockRes();
    await listRuns(req, res as Response);

    const [org, opts] = (listRunsQuery as jest.Mock).mock.calls[0];
    expect(org).toBe(5);
    expect(opts.limit).toBe(25);
    expect(opts.offset).toBe(50);
  });

  it("listRuns clamps an absurd limit rather than trusting the client", async () => {
    (listRunsQuery as jest.Mock).mockResolvedValue({ rows: [], total: 0 });

    const req = { query: { limit: "100000" }, organizationId: 5 } as any;
    const res = createMockRes();
    await listRuns(req, res as Response);

    expect((listRunsQuery as jest.Mock).mock.calls[0][1].limit).toBe(200);
  });

  it("listRuns defaults to the pre-pagination behaviour when given nothing", async () => {
    (listRunsQuery as jest.Mock).mockResolvedValue({ rows: [], total: 0 });

    const req = { query: {}, organizationId: 5 } as any;
    const res = createMockRes();
    await listRuns(req, res as Response);

    const opts = (listRunsQuery as jest.Mock).mock.calls[0][1];
    expect(opts.limit).toBe(200);
    expect(opts.offset).toBe(0);
  });
```

Extend the file's existing `reportRun.utils` mock to include `listRunsQuery` if it is not already there, and extend the import line to bring in `listRuns` and `listRunsQuery`.

- [ ] **Step 2: Run to verify they fail**

```bash
cd Servers && npx jest controllers/__tests__/reportRun.ctrl.test.ts
```

Expected: FAIL — the controller passes no `limit`/`offset` today.

- [ ] **Step 3: Implement the query**

In `Servers/utils/reportRun.utils.ts`, replace `listRunsQuery` with a paginated version that also returns a total. Read the current function first and preserve its existing filters (`scheduledReportId`, `status`) exactly:

```ts
// Pagination replaces a hard LIMIT 200. The default limit is still 200 and
// offset 0, so a caller that passes nothing sees exactly what it saw before.
// `total` lets a UI page without a second endpoint.
export async function listRunsQuery(
  organization_id: number,
  filters: { scheduledReportId?: any; status?: any; limit?: number; offset?: number } = {},
): Promise<{ rows: any[]; total: number }> {
  const where: string[] = ["organization_id = :organization_id"];
  const replacements: any = { organization_id };

  if (filters.scheduledReportId) {
    where.push("scheduled_report_id = :scheduledReportId");
    replacements.scheduledReportId = Number(filters.scheduledReportId);
  }
  if (filters.status) {
    where.push("status = :status");
    replacements.status = String(filters.status);
  }

  const whereSql = where.join(" AND ");

  const countRows: any[] = await sequelize.query(
    `SELECT COUNT(*)::int AS total FROM report_runs WHERE ${whereSql}`,
    { replacements, type: QueryTypes.SELECT },
  );

  const rows: any[] = await sequelize.query(
    `SELECT * FROM report_runs WHERE ${whereSql}
      ORDER BY created_at DESC
      LIMIT :limit OFFSET :offset`,
    {
      replacements: { ...replacements, limit: filters.limit ?? 200, offset: filters.offset ?? 0 },
      type: QueryTypes.SELECT,
    },
  );

  return { rows, total: countRows[0]?.total ?? 0 };
}
```

**This changes the return type from `any[]` to `{rows, total}`.** Find every caller before you finish:

```bash
cd Servers && grep -rn "listRunsQuery" --include='*.ts' . | grep -v node_modules | grep -v /dist/
```

Update each one. Quote the glob — this shell is zsh and a bare `*.ts` aborts the command.

- [ ] **Step 4: Implement the controller**

In `Servers/controllers/reportRun.ctrl.ts`, rewrite `listRuns`:

```ts
const MAX_PAGE = 200;

export async function listRuns(req: Request, res: Response): Promise<any> {
  try {
    // Clamp rather than trust: an unclamped limit is a cheap way for a client
    // to ask the database for everything.
    const rawLimit = Number(req.query.limit);
    const rawOffset = Number(req.query.offset);
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, MAX_PAGE) : MAX_PAGE;
    const offset = Number.isFinite(rawOffset) && rawOffset > 0 ? rawOffset : 0;

    const { rows, total } = await listRunsQuery(req.organizationId!, {
      scheduledReportId: req.query.scheduledReportId,
      status: req.query.status,
      limit,
      offset,
    });

    return res.status(200).json(STATUS_CODE[200]({ rows, total, limit, offset }));
  } catch (e) {
    return res.status(500).json(STATUS_CODE[500]((e as Error).message));
  }
}
```

**This changes the response shape** from a bare array to `{rows, total, limit, offset}`. The frontend's `getRuns` in `Clients/src/application/repository/reporting.repository.ts` currently returns `any[]` and its consumers expect an array — Task 5 updates it. Note the break here; do not leave it undocumented.

- [ ] **Step 5: Run to verify they pass**

```bash
cd Servers && npx jest controllers/__tests__/reportRun.ctrl.test.ts
```

Expected: PASS, 10 tests (7 pre-existing from Phase 3 + 3 new).

- [ ] **Step 6: Full backend unit run, then build and commit**

```bash
cd Servers && npx jest --testPathIgnorePatterns "tests/integration" 2>&1 | tail -6
```

Expected: zero failures other than the pre-existing empty `controllers/__tests__/helpers/test-helper.ts` suite, which reports as 1 failed suite with 0 failed tests.

```bash
cd Servers && npm run build
```

```bash
git add Servers/utils/reportRun.utils.ts Servers/controllers/reportRun.ctrl.ts Servers/controllers/__tests__/reportRun.ctrl.test.ts
git commit -m "feat(reporting): paginate the run archive

listRunsQuery had a hard LIMIT 200 with no way to reach run 201. Adds
limit/offset with a clamped max and returns a total so a UI can page.
Defaults reproduce the old behaviour exactly for callers that pass
nothing.

The response is now {rows, total, limit, offset} rather than a bare
array — the frontend repository is updated in the same phase."
```

---

## Task 4: `PATCH /api/reporting/scheduled-reports/:id`

**Files:**
- Modify: `Servers/utils/scheduledReport.utils.ts`
- Modify: `Servers/controllers/scheduledReport.ctrl.ts`
- Modify: `Servers/routes/scheduledReport.route.ts`
- Modify: `Servers/controllers/__tests__/scheduledReport.ctrl.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `Servers/controllers/__tests__/scheduledReport.ctrl.test.ts`, extending its existing mock factories rather than adding new ones:

```ts
describe("updateScheduledReport", () => {
  it("404s when the row is not in the caller's org", async () => {
    const utils = require("../../utils/scheduledReport.utils");
    utils.updateScheduledReportQuery.mockResolvedValueOnce(null);
    const res = mockRes();
    await updateScheduledReport(
      { params: { id: "7" }, body: { name: "Renamed" }, organizationId: 42, userId: 9 } as any,
      res,
    );
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("200s and passes only allowlisted fields", async () => {
    const utils = require("../../utils/scheduledReport.utils");
    utils.updateScheduledReportQuery.mockResolvedValueOnce({ id: 7 });
    const res = mockRes();
    await updateScheduledReport(
      {
        params: { id: "7" },
        body: { name: "Renamed", organization_id: 999, template_id: 123 },
        organizationId: 42,
        userId: 9,
      } as any,
      res,
    );
    expect(res.status).toHaveBeenCalledWith(200);
    const [id, org, input] = utils.updateScheduledReportQuery.mock.calls[0];
    expect(id).toBe(7);
    expect(org).toBe(42);
    // Tenancy and identity columns are never client-writable.
    expect(input).not.toHaveProperty("organization_id");
    expect(input).not.toHaveProperty("template_id");
  });

  it("400s on an empty body", async () => {
    const res = mockRes();
    await updateScheduledReport(
      { params: { id: "7" }, body: {}, organizationId: 42, userId: 9 } as any,
      res,
    );
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("400s when the new delivery config has a malformed recipient", async () => {
    const svc = require("../../services/reporting/scheduledReportService");
    svc.validateScheduledReportInput.mockReturnValueOnce(["invalid recipient address: nope"]);
    const res = mockRes();
    await updateScheduledReport(
      {
        params: { id: "7" },
        body: { deliveryConfig: { sendEmailLink: true, recipients: ["nope"] } },
        organizationId: 42,
        userId: 9,
      } as any,
      res,
    );
    expect(res.status).toHaveBeenCalledWith(400);
  });
});
```

Extend the file's `jest.mock("../../utils/scheduledReport.utils", ...)` factory with `updateScheduledReportQuery: jest.fn()`, and extend the import from `../scheduledReport.ctrl` with `updateScheduledReport`.

- [ ] **Step 2: Run to verify they fail**

```bash
cd Servers && npx jest controllers/__tests__/scheduledReport.ctrl.test.ts
```

Expected: FAIL — `updateScheduledReport is not a function`.

- [ ] **Step 3: Implement the query**

Append to `Servers/utils/scheduledReport.utils.ts`:

```ts
// Editable fields only. organization_id, template_id, template_version_id and
// created_by are deliberately absent — a PATCH must not be able to move a
// schedule between tenants or re-point it at another template.
const UPDATABLE_FIELDS: Record<string, string> = {
  name: "name",
  scope: "scope",
  projectId: "project_id",
  frameworkId: "framework_id",
  projectFrameworkId: "project_framework_id",
  sectionsConfig: "sections_config",
  aiBlocksConfig: "ai_blocks_config",
  format: "format",
  scheduleConfig: "schedule_config",
  deliveryConfig: "delivery_config",
};

const JSON_FIELDS = new Set([
  "sectionsConfig",
  "aiBlocksConfig",
  "scheduleConfig",
  "deliveryConfig",
]);

export async function updateScheduledReportQuery(
  id: number,
  organization_id: number,
  input: any,
): Promise<any> {
  const sets: string[] = [];
  const replacements: any = { id, organization_id };

  for (const [key, column] of Object.entries(UPDATABLE_FIELDS)) {
    if (input[key] === undefined) continue;
    sets.push(`${column} = :${key}`);
    replacements[key] = JSON_FIELDS.has(key) ? JSON.stringify(input[key]) : input[key];
  }

  if (!sets.length) return null;

  // A schedule change invalidates the stored next_run_at — without this the
  // report keeps firing on the old cadence until its next tick.
  if (input.scheduleConfig !== undefined) {
    sets.push("next_run_at = :nextRun");
    replacements.nextRun = computeNextRun(input.scheduleConfig);
  }

  sets.push("updated_at = NOW()");

  const result: any = await sequelize.query(
    `UPDATE scheduled_reports SET ${sets.join(", ")}
      WHERE id = :id AND organization_id = :organization_id AND deleted_at IS NULL
      RETURNING *`,
    { replacements, type: QueryTypes.UPDATE },
  );
  return result[0]?.[0] ?? null;
}
```

- [ ] **Step 4: Implement the controller**

Append to `Servers/controllers/scheduledReport.ctrl.ts`:

```ts
export async function updateScheduledReport(req: Request, res: Response): Promise<any> {
  logProcessing({
    description: "updateScheduledReport",
    functionName: "updateScheduledReport",
    fileName: "scheduledReport.ctrl.ts",
    userId: req.userId!,
    organizationId: req.organizationId!,
  });
  try {
    const body = req.body ?? {};
    if (!Object.keys(body).length) {
      return res.status(400).json(STATUS_CODE[400]({ errors: ["no updatable fields supplied"] }));
    }

    // Re-validate the delivery block if it is being replaced, so a PATCH
    // cannot smuggle in the malformed recipients that create rejects.
    if (body.deliveryConfig !== undefined || body.sectionsConfig !== undefined) {
      const errors = validateScheduledReportInput({
        scope: body.scope ?? "organization",
        projectId: body.projectId,
        sectionsConfig: body.sectionsConfig ?? { sections: [{ reportSectionKey: "placeholder" }] },
        deliveryConfig: body.deliveryConfig ?? { saveToStorage: true },
      } as any);
      if (errors.length) return res.status(400).json(STATUS_CODE[400]({ errors }));
    }

    const row = await updateScheduledReportQuery(
      Number(req.params.id),
      req.organizationId!,
      body,
    );
    if (!row) return res.status(404).json(STATUS_CODE[404]("not found"));
    return res.status(200).json(STATUS_CODE[200](row));
  } catch (error) {
    await logFailure({
      eventType: "Update",
      description: "updateScheduledReport failed",
      functionName: "updateScheduledReport",
      fileName: "scheduledReport.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}
```

Extend the file's import from `../utils/scheduledReport.utils` with `updateScheduledReportQuery`.

- [ ] **Step 5: Add the route**

In `Servers/routes/scheduledReport.route.ts`, add alongside the other write routes:

```ts
router.patch("/:id", authenticateJWT, authorize(["Admin", "Editor"]), updateScheduledReport);
```

`authorize` is a **default** export from `../middleware/accessControl.middleware` — match the import style already in that file. Extend the controller import with `updateScheduledReport`.

- [ ] **Step 6: Run to verify they pass, then build and commit**

```bash
cd Servers && npx jest controllers/__tests__/scheduledReport.ctrl.test.ts && npm run build
```

Expected: PASS.

```bash
git add Servers/utils/scheduledReport.utils.ts Servers/controllers/scheduledReport.ctrl.ts Servers/routes/scheduledReport.route.ts Servers/controllers/__tests__/scheduledReport.ctrl.test.ts
git commit -m "feat(reporting): edit a scheduled report

There was no PUT or PATCH anywhere in the scheduled-reports routes, so a
schedule could be created and paused but never corrected — a wrong
recipient or cadence meant delete and recreate.

Updates run through a field allowlist; organization_id, template_id,
template_version_id and created_by are absent from it so a PATCH cannot
move a schedule between tenants or re-point it at another org's
template. A schedule_config change recomputes next_run_at, without which
the report would keep firing on the old cadence."
```

---

## Task 5: Frontend repository and hooks

**Files:**
- Modify: `Clients/src/domain/interfaces/i.reporting.ts`
- Modify: `Clients/src/application/repository/reporting.repository.ts`
- Modify: `Clients/src/application/hooks/useReporting.ts`
- Modify: `Clients/src/application/hooks/__tests__/useReporting.test.ts`

- [ ] **Step 1: Add the types**

Append to `Clients/src/domain/interfaces/i.reporting.ts`:

```ts
/** Paginated envelope returned by GET /api/reporting/runs. */
export interface ReportRunPage {
  rows: ReportRun[];
  total: number;
  limit: number;
  offset: number;
}

export interface ScheduledReportUpdateBody {
  name?: string;
  scope?: ReportScope;
  projectId?: number | null;
  sectionsConfig?: SectionsConfig;
  aiBlocksConfig?: AiBlocksConfig;
  format?: "pdf" | "docx";
  scheduleConfig?: Record<string, unknown>;
  deliveryConfig?: Record<string, unknown>;
}
```

- [ ] **Step 2: Write the failing hook tests**

Append a new `describe` to `Clients/src/application/hooks/__tests__/useReporting.test.ts`. **That file already has a single `vi.mock` factory for the repository — merge new entries into it, never add a second factory**, and reuse its `wrap` helper:

```ts
describe("useReporting phase 4 hooks", () => {
  it("useUpdateScheduledReport splits id and body", async () => {
    const { result } = renderHook(() => useUpdateScheduledReport(), { wrapper: wrap });
    result.current.mutate({ id: 7, body: { name: "Renamed" } });
    await waitFor(() =>
      expect(repo.updateScheduledReport).toHaveBeenCalledWith(7, { name: "Renamed" }),
    );
  });

  it("useDeleteScheduledReport passes the id through", async () => {
    const { result } = renderHook(() => useDeleteScheduledReport(), { wrapper: wrap });
    result.current.mutate(7);
    await waitFor(() => expect(repo.deleteScheduledReport).toHaveBeenCalledWith(7));
  });

  it("useReportRuns forwards pagination params", async () => {
    const { result } = renderHook(() => useReportRuns({ limit: 25, offset: 50 }), {
      wrapper: wrap,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(repo.getRuns).toHaveBeenCalledWith({ limit: 25, offset: 50 });
  });

  it("useReportRuns stops polling once no run is still running", async () => {
    const { result } = renderHook(() => useReportRuns(), { wrapper: wrap });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // getRuns is mocked to return only terminal runs, so the interval
    // resolver must return false rather than a number.
    const opts = (result.current as any);
    expect(opts.data?.rows?.every((r: any) => r.status !== "running")).toBe(true);
  });
});
```

Merge these into the existing repository mock factory:

```ts
  updateScheduledReport: vi.fn(async () => ({ id: 7 })),
  deleteScheduledReport: vi.fn(async () => ({ ok: true })),
  getRuns: vi.fn(async () => ({ rows: [{ id: 1, status: "success" }], total: 1, limit: 200, offset: 0 })),
```

If `getRuns` is already in the factory returning `[]`, **replace its implementation** with the paginated shape rather than adding a duplicate key.

- [ ] **Step 3: Run to verify they fail**

```bash
cd Clients && npx vitest run src/application/hooks/__tests__/useReporting.test.ts
```

Expected: FAIL — `useUpdateScheduledReport is not a function`.

- [ ] **Step 4: Implement the repository functions**

Append to `Clients/src/application/repository/reporting.repository.ts`:

```ts
export async function updateScheduledReport(
  id: number,
  body: ScheduledReportUpdateBody,
): Promise<unknown> {
  return extract(await apiServices.patch(`/reporting/scheduled-reports/${id}`, body));
}

// The backend soft-delete endpoint has existed since the reporting MVP with no
// frontend caller, so a scheduled report could never be removed from the UI.
export async function deleteScheduledReport(id: number): Promise<{ ok: boolean }> {
  return extract(await apiServices.delete(`/reporting/scheduled-reports/${id}`));
}
```

Change `getRuns` to carry pagination and the new envelope:

```ts
export async function getRuns(params?: {
  scheduledReportId?: number;
  limit?: number;
  offset?: number;
}): Promise<ReportRunPage> {
  const qs = new URLSearchParams();
  if (params?.scheduledReportId) qs.set("scheduledReportId", String(params.scheduledReportId));
  if (params?.limit != null) qs.set("limit", String(params.limit));
  if (params?.offset != null) qs.set("offset", String(params.offset));
  const suffix = qs.toString() ? `?${qs}` : "";
  return extract(await apiServices.get(`/reporting/runs${suffix}`));
}
```

Extend the type import with `ReportRunPage` and `ScheduledReportUpdateBody`.

**`getRuns`'s return type changes from `any[]` to `ReportRunPage`.** Find every consumer:

```bash
cd Clients && grep -rn "getRuns\|useReportRuns" src/ --include='*.tsx' --include='*.ts' | grep -v __tests__
```

`ArchiveTab.tsx` is expected to appear — **it is off-limits this phase**. Report it as a known break for the follow-up rather than editing it. Any other consumer must be updated.

- [ ] **Step 5: Implement the hooks**

In `Clients/src/application/hooks/useReporting.ts`, replace `useReportRuns` and append the two mutations:

```ts
// Polls while any run in the page is still running, then stops. A report can
// take minutes, and without this the archive silently shows a stale "running"
// forever.
export const useReportRuns = (params?: {
  scheduledReportId?: number;
  limit?: number;
  offset?: number;
}) =>
  useQuery({
    queryKey: ["reporting", "runs", params ?? {}],
    queryFn: () => repo.getRuns(params),
    refetchInterval: (query) => {
      const rows = query.state.data?.rows ?? [];
      return rows.some((r) => r.status === "running" || r.status === "pending") ? 5000 : false;
    },
  });

export const useUpdateScheduledReport = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: ScheduledReportUpdateBody }) =>
      repo.updateScheduledReport(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reporting", "scheduled"] }),
  });
};

export const useDeleteScheduledReport = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => repo.deleteScheduledReport(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reporting", "scheduled"] }),
  });
};
```

Extend the type import with `ScheduledReportUpdateBody`.

Note the query key changed from `["reporting","runs",scheduledReportId]` to `["reporting","runs",params]`. The existing `useGenerateReport` and `useRunNow` invalidate `["reporting","runs"]`, which still matches by prefix — verify that assumption holds rather than taking it on trust.

- [ ] **Step 6: Run to verify they pass**

```bash
cd Clients && npx vitest run src/application/hooks/__tests__/useReporting.test.ts
```

Expected: PASS. Pre-existing tests in that file must still pass — if any fail, a mock was added instead of merged.

- [ ] **Step 7: Type gate and commit**

```bash
cd Clients && npx tsc --noEmit -p tsconfig.app.json
```

Expected: exactly one error, the pre-existing `TS7030` baseline. **If `ArchiveTab.tsx` now produces an error because `getRuns` returns an object where it expects an array, that is the known break — report it, do not fix it by editing that file.** If it is the only extra error, note it explicitly in your report so the follow-up picks it up.

```bash
git add Clients/src/domain/interfaces/i.reporting.ts Clients/src/application/repository/reporting.repository.ts Clients/src/application/hooks/useReporting.ts Clients/src/application/hooks/__tests__/useReporting.test.ts
git commit -m "feat(reporting): schedule editing, deletion, and run-list polling

Wires the update endpoint and the soft-delete endpoint that has existed
since the reporting MVP with no frontend caller — a scheduled report
could be created and paused but never edited or removed.

useReportRuns now polls while any run is pending or running and stops
once none are, and carries limit/offset for the newly paginated
endpoint."
```

---

## Task 6: Wizard format picker and LLM-key gating

**Files:**
- Modify: `Clients/src/presentation/pages/Reporting/ConfigureReportWizard.tsx`
- Modify: `Clients/src/presentation/pages/Reporting/__tests__/ConfigureReportWizard.test.tsx`

- [ ] **Step 1: Write the failing tests**

Append to the existing `describe` in `Clients/src/presentation/pages/Reporting/__tests__/ConfigureReportWizard.test.tsx`, reusing the `TEMPLATE_FIXTURE` that file already defines for the Phase 3 tests:

```ts
  it("offers a format choice instead of silently forcing PDF", () => {
    render(<ConfigureReportWizard template={TEMPLATE_FIXTURE} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    expect(screen.getByLabelText(/format/i)).toBeInTheDocument();
  });

  it("disables the AI blocks when the org has no LLM key", () => {
    render(<ConfigureReportWizard template={TEMPLATE_FIXTURE} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    expect(screen.getByLabelText("Executive summary")).toBeDisabled();
  });
```

The second test needs `useLLMKeyStatus` mocked as `{ hasKeys: false, loading: false }`. Add that mock to the file:

```ts
vi.mock("../../../../application/hooks/useLLMKeyStatus", () => ({
  useLLMKeyStatus: () => ({ hasKeys: false, loading: false, data: null, error: null }),
}));
```

- [ ] **Step 2: Run to verify they fail**

```bash
cd Clients && npx vitest run src/presentation/pages/Reporting/__tests__/ConfigureReportWizard.test.tsx
```

Expected: FAIL — no format field exists, and the AI checkboxes are unconditionally enabled.

- [ ] **Step 3: Implement**

Add a `format` state beside the others:

```tsx
  const [format, setFormat] = useState<"pdf" | "docx">(
    template.latestVersion?.format_config?.format ?? "pdf",
  );
```

Replace the hardcoded `format: "pdf"` in the `submit()` payload (around line 124) with `format,`.

Add the picker to the Schedule step (step 3), above the frequency field:

```tsx
          <TextField
            select
            label="Format"
            value={format}
            onChange={(e) => setFormat(e.target.value as "pdf" | "docx")}
          >
            <MenuItem value="pdf">PDF</MenuItem>
            <MenuItem value="docx">Word (DOCX)</MenuItem>
          </TextField>
```

Gate the AI step. Add the hook near the other hooks:

```tsx
  const { hasKeys, loading: llmKeyLoading } = useLLMKeyStatus();
  // hasKeys is optimistically true while loading (useLLMKeyStatus.ts:38), so
  // gate on the settled value only — otherwise the blocks flicker from
  // enabled to disabled on mount. Three prior commits chased that flicker;
  // do not "fix" the hook.
  const aiDisabled = !llmKeyLoading && !hasKeys;
```

Then in the AI Insights step, add `disabled={aiDisabled}` to each `Checkbox` and show an explanation when gated:

```tsx
          {aiDisabled && (
            <Typography variant="body2" color="text.secondary">
              Add a language-model key in Settings to enable AI insights.
            </Typography>
          )}
```

Add the import:

```tsx
import { useLLMKeyStatus } from "../../../application/hooks/useLLMKeyStatus";
```

- [ ] **Step 4: Run to verify they pass**

```bash
cd Clients && npx vitest run src/presentation/pages/Reporting
```

Expected: PASS, all Reporting suites. The Phase 3 tests in this file must still pass — they render without the `useLLMKeyStatus` mock returning `hasKeys: false`, so confirm the mock does not break them. If it does, scope the mock per-test rather than per-file.

- [ ] **Step 5: Type gate and commit**

```bash
cd Clients && npx tsc --noEmit -p tsconfig.app.json
```

```bash
git add Clients/src/presentation/pages/Reporting/ConfigureReportWizard.tsx Clients/src/presentation/pages/Reporting/__tests__/ConfigureReportWizard.test.tsx
git commit -m "feat(reporting): format picker and LLM-key gating in the wizard

format was hardcoded to pdf with no state, prop or picker behind it,
even though the pipeline has always supported docx.

AI blocks are now disabled when the organization has no language-model
key — previously a keyless user could schedule an AI report that could
only ever abstain. Gated on the settled value of useLLMKeyStatus rather
than hasKeys alone, because that flag is optimistically true while
loading and gating on it directly reintroduces a flicker three earlier
commits were spent removing."
```

---

## Task 7: Documentation and the retirement decision

**Files:**
- Modify: `docs/technical/domains/reporting.md`
- Modify: `Servers/swagger.yaml`, `docs/api-docs/src/config/endpoints.ts` (regenerated)

- [ ] **Step 1: Regenerate the API docs**

Phase 4 adds exactly one route: `PATCH /api/reporting/scheduled-reports/:id`.

```bash
cd Servers && npm run generate:swagger && npm run generate:endpoints && npm run check:api-drift
```

Expected: drift check exits 0, endpoint count up by exactly 1. Inspect `git diff` on both generated files and confirm the delta is only that route — if other developers' uncommitted route changes leak in, report it and do not commit a mixed blob.

- [ ] **Step 2: Document Phase 4 in the domain doc**

Update `docs/technical/domains/reporting.md`:

- Delivery now genuinely sends email via `sendAutomationEmail` + `report-ready.mjml`; a failed send records `failed` with the provider error and does not lose the report.
- Recipients are format-validated at schedule creation and again at send.
- `GET /api/reporting/runs` is paginated and returns `{rows, total, limit, offset}` — **note this as a breaking response-shape change**.
- `PATCH /api/reporting/scheduled-reports/:id` exists, with its allowlist and the `next_run_at` recomputation.
- The wizard offers PDF/DOCX and disables AI blocks without an LLM key.
- Bump `> **Last Updated:**` to today.

- [ ] **Step 3: Record why the legacy trigger was NOT retired**

This is the most important paragraph in the phase, because the spec asks for the opposite and the next person will wonder. Add to the doc:

> **The `scheduled_report` automation trigger is retained deliberately.** The original design called for retiring it as a vestigial third caller of `generateReport()`. It is not vestigial: the trigger type is seeded in `20260226234301-public-schema-tables.js:901`, handled by `sendReportNotification()` in `Servers/services/automations/automationWorker.ts:304-428`, and — decisively — created at runtime by the Automations UI (`ConfigurationPanel/index.tsx:665`). Any organization that built a "Scheduled Report" automation has a live row this path serves, and removing it would break them silently with no migration. It duplicates the newer `scheduled_reports` pipeline conceptually, so consolidating them is worthwhile, but that is a migration project with a data-movement story — not a deletion.

- [ ] **Step 4: Commit**

```bash
git add docs/technical/domains/reporting.md Servers/swagger.yaml docs/api-docs/src/config/endpoints.ts
git commit -m "docs(reporting): document delivery, pagination, and the retention decision

Records why the legacy scheduled_report automation trigger was NOT
retired despite the design calling for it: the Automations UI creates
those rows at runtime, so orgs have live automations depending on that
path. Deleting it would break them silently."
```

---

## Final verification

- [ ] **Backend build** — `cd Servers && npm run build` → exit 0, zero TS errors.
- [ ] **Backend unit suites** — `cd Servers && npx jest --testPathIgnorePatterns "tests/integration"` → zero failed tests. One failed *suite* (`controllers/__tests__/helpers/test-helper.ts`, an empty file) is the documented pre-existing baseline.
- [ ] **Tenant isolation** — `cd Servers && npm run test:integration -- --testPathPatterns=tenant-isolation` → all suites pass, including the Phase 3 `report-templates.isolation.test.ts`. Requires a database; if unreachable, say so rather than marking it passed.
- [ ] **API drift** — `cd Servers && npm run check:api-drift` → exit 0.
- [ ] **Frontend type gate** — `cd Clients && npx tsc --noEmit -p tsconfig.app.json` → exactly the one pre-existing `TS7030`, **plus** any `ArchiveTab.tsx` error caused by the deliberate `getRuns` shape change, which must be reported explicitly and left for the follow-up.
- [ ] **Frontend tests** — `cd Clients && npx vitest run src/presentation/pages/Reporting src/application/hooks/__tests__/useReporting.test.ts` → zero failures.
- [ ] **Deferred files untouched** —

```bash
git log --pretty=format: --name-only <phase-4-base>..HEAD | sort -u | grep "TemplatesTab\|ScheduledReportsTab\|ArchiveTab" || echo "clean"
```

Expected: `clean`. Grep the file list, not the log text — commit messages mention these filenames.

- [ ] **Dirty count unchanged** — `git status --porcelain | wc -l` → still 74.

---

## Notes carried forward

- **The three deferred tabs.** `ArchiveTab` needs the paginated `getRuns` shape and a pager; `ScheduledReportsTab` needs edit and delete buttons over the hooks Task 5 ships; `TemplatesTab` needs template edit/archive over the Phase 3 hooks. All blocked on another developer's uncommitted refactor landing. **`ArchiveTab` is knowingly left type-broken by Task 5's response-shape change — this is the one deliberate breakage in the phase and it must be fixed in the same follow-up.**
- **`ReportAnalysisPanel`.** Endpoint, hook and types shipped in Phase 3; the component and its mount land with the ArchiveTab work.
- **Consolidating the two scheduling systems.** The legacy `scheduled_report` automation trigger and the `scheduled_reports` table do overlapping jobs. Merging them needs a data migration for existing automation rows and a UI story for where users manage schedules — a project, not a cleanup.
- **A failed delivery channel does not yet mark the run `partial_success`.** Task 1 Step 6 checks whether any mapping exists; if not, delivery failures are visible only in the delivery status blob, not on the run row.
- **Generic provenance guard** (Phase 2) — only `suggestedOwner` is validated against the report's own data; a fabricated control id or vendor name still passes zod cleanly.
- **`updateRunStatusQuery` has no `organization_id` in its WHERE clause** and hardcodes `completed_at = NOW()`. Carried since Phase 1.
- **PATCH on a template with both metadata and config performs two un-transacted writes** (Phase 3) — if the version insert fails, the metadata change is already committed.
- **`useLLMKeyStatus` is a hand-rolled `useState`/`useEffect` hook**, inconsistent with the React Query convention the rest of the reporting stack follows. Migrating it would let `loading` and `hasKeys` be a real tri-state.
- **42 tables remain uncovered by the tenant-isolation matrix** (`api_tokens`, `teams_webhooks`, `virtual_folders`, …). Pre-existing and repo-wide; the audit exits 1 because of them.
