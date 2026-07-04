import { http, HttpResponse } from "msw";
import { mockProjects, createMockProject } from "./data/projects";
import { mockRisks, createMockRisk } from "./data/risks";
import { mockVendors, createMockVendor } from "./data/vendors";
import { mockAssessments, createMockAssessment } from "./data/assessments";
import { mockLoginResponse } from "./data/auth";
import { mockTasks, createMockTask } from "./data/tasks";
import { mockUsers, createMockUser } from "./data/users";

export const handlers = [
  // Health check
  http.get("/api/health", () => HttpResponse.json({ status: "ok" })),

  // ==================== Auth / Users ====================

  // Specific auth routes (must precede /api/users/:id)
  http.post("/api/users/login", async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    if (body.email === "invalid@test.com") {
      return HttpResponse.json({ message: "Invalid credentials" }, { status: 401 });
    }
    return HttpResponse.json({ data: mockLoginResponse });
  }),
  http.post("/api/users/register", async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json({ data: createMockUser(body as any) }, { status: 201 });
  }),
  http.post("/api/users/refresh-token", () =>
    HttpResponse.json({ data: { token: "refreshed-mock-jwt-token" } }),
  ),
  http.get("/api/users/check/exists", ({ request }) => {
    const url = new URL(request.url);
    const email = url.searchParams.get("email");
    return HttpResponse.json({ exists: email === "existing@test.com" });
  }),
  http.post("/api/users/login-microsoft", () => HttpResponse.json({ data: mockLoginResponse })),
  http.post("/api/mail/reset-password", () =>
    HttpResponse.json({ message: "Password reset email sent" }),
  ),

  // /api/users/chng-pass/:userId (must precede /api/users/:id)
  http.patch("/api/users/chng-pass/:userId", () =>
    HttpResponse.json({ message: "Password changed" }),
  ),

  // /api/users/:id/profile-photo routes (must precede /api/users/:id)
  http.post("/api/users/:id/profile-photo", () =>
    HttpResponse.json({ photoUrl: "https://example.com/photo.jpg" }),
  ),
  http.get("/api/users/:id/profile-photo", ({ params }) => {
    if (String(params.id) === "999") {
      return new HttpResponse(null, { status: 404 });
    }
    return HttpResponse.json({ photo: "base64-encoded-image-data" });
  }),
  http.delete("/api/users/:id/profile-photo", () =>
    HttpResponse.json({ message: "Profile photo deleted" }),
  ),

  // Generic /api/users/:id
  http.get("/api/users", () => HttpResponse.json({ data: mockUsers })),
  http.get("/api/users/:id", ({ params }) => {
    const user = mockUsers.find((u) => String(u.id) === params.id);
    if (!user) return new HttpResponse(null, { status: 404 });
    return HttpResponse.json({ data: user });
  }),
  http.patch("/api/users/:id", async ({ params, request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    const user = mockUsers.find((u) => String(u.id) === params.id);
    if (!user) return new HttpResponse(null, { status: 404 });
    return HttpResponse.json({ data: { ...user, ...body } });
  }),
  http.delete("/api/users/:id", ({ params }) => {
    const user = mockUsers.find((u) => String(u.id) === params.id);
    if (!user) return new HttpResponse(null, { status: 404 });
    return HttpResponse.json({ message: "deleted" });
  }),

  // ==================== Projects ====================
  http.get("/api/projects", () => HttpResponse.json({ data: mockProjects })),
  http.get("/api/projects/:id", ({ params }) => {
    const project = mockProjects.find((p) => String(p.id) === params.id);
    if (!project) return new HttpResponse(null, { status: 404 });
    return HttpResponse.json({ data: project });
  }),
  http.post("/api/projects", async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json({ data: createMockProject(body as any) }, { status: 201 });
  }),
  http.patch("/api/projects/:id", async ({ params, request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    const project = mockProjects.find((p) => String(p.id) === params.id);
    if (!project) return new HttpResponse(null, { status: 404 });
    return HttpResponse.json({ data: { ...project, ...body } });
  }),
  http.delete("/api/projects/:id", ({ params }) => {
    const project = mockProjects.find((p) => String(p.id) === params.id);
    if (!project) return new HttpResponse(null, { status: 404 });
    return new HttpResponse(null, { status: 204 });
  }),

  // ==================== Risks ====================
  http.get("/api/risks", () => HttpResponse.json({ data: mockRisks })),
  http.get("/api/risks/:id", ({ params }) => {
    const risk = mockRisks.find((r) => String(r.id) === params.id);
    if (!risk) return new HttpResponse(null, { status: 404 });
    return HttpResponse.json({ data: risk });
  }),
  http.post("/api/risks", async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json({ data: createMockRisk(body as any) }, { status: 201 });
  }),
  http.patch("/api/risks/:id", async ({ params, request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    const risk = mockRisks.find((r) => String(r.id) === params.id);
    if (!risk) return new HttpResponse(null, { status: 404 });
    return HttpResponse.json({ data: { ...risk, ...body } });
  }),
  http.delete("/api/risks/:id", ({ params }) => {
    const risk = mockRisks.find((r) => String(r.id) === params.id);
    if (!risk) return new HttpResponse(null, { status: 404 });
    return new HttpResponse(null, { status: 204 });
  }),

  // ==================== Vendors ====================
  http.get("/api/vendors", () => HttpResponse.json({ data: mockVendors })),
  http.get("/api/vendors/:id", ({ params }) => {
    const vendor = mockVendors.find((v) => String(v.id) === params.id);
    if (!vendor) return new HttpResponse(null, { status: 404 });
    return HttpResponse.json({ data: vendor });
  }),
  http.post("/api/vendors", async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json({ data: createMockVendor(body as any) }, { status: 201 });
  }),
  http.patch("/api/vendors/:id", async ({ params, request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    const vendor = mockVendors.find((v) => String(v.id) === params.id);
    if (!vendor) return new HttpResponse(null, { status: 404 });
    return HttpResponse.json({ data: { ...vendor, ...body } });
  }),
  http.delete("/api/vendors/:id", ({ params }) => {
    const vendor = mockVendors.find((v) => String(v.id) === params.id);
    if (!vendor) return new HttpResponse(null, { status: 404 });
    return new HttpResponse(null, { status: 204 });
  }),

  // ==================== Assessments ====================
  http.get("/api/assessments", () => HttpResponse.json({ data: mockAssessments })),
  http.get("/api/assessments/:id", ({ params }) => {
    const assessment = mockAssessments.find((a) => String(a.id) === params.id);
    if (!assessment) return new HttpResponse(null, { status: 404 });
    return HttpResponse.json({ data: assessment });
  }),
  http.post("/api/assessments", async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json({ data: createMockAssessment(body as any) }, { status: 201 });
  }),
  http.patch("/api/assessments/:id", async ({ params, request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    const assessment = mockAssessments.find((a) => String(a.id) === params.id);
    if (!assessment) return new HttpResponse(null, { status: 404 });
    return HttpResponse.json({ data: { ...assessment, ...body } });
  }),
  http.delete("/api/assessments/:id", ({ params }) => {
    const assessment = mockAssessments.find((a) => String(a.id) === params.id);
    if (!assessment) return new HttpResponse(null, { status: 404 });
    return new HttpResponse(null, { status: 204 });
  }),

  // ==================== Tasks ====================
  http.get("/api/tasks", ({ request }) => {
    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get("page") || "1", 10);
    const pageSize = parseInt(url.searchParams.get("pageSize") || "10", 10);
    return HttpResponse.json({
      data: { tasks: mockTasks, total: mockTasks.length, page, pageSize },
    });
  }),
  http.post("/api/tasks", async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json({ data: createMockTask(body as any) }, { status: 201 });
  }),
  http.get("/api/tasks/:id", ({ params }) => {
    const task = mockTasks.find((t) => String(t.id) === params.id);
    if (!task) return new HttpResponse(null, { status: 404 });
    return HttpResponse.json({ data: task });
  }),
  http.put("/api/tasks/:id", async ({ params, request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    const task = mockTasks.find((t) => String(t.id) === params.id);
    if (!task) return new HttpResponse(null, { status: 404 });
    return HttpResponse.json({ data: { ...task, ...body } });
  }),
  http.delete("/api/tasks/:id", ({ params }) => {
    const task = mockTasks.find((t) => String(t.id) === params.id);
    if (!task) return new HttpResponse(null, { status: 404 });
    return HttpResponse.json({ message: "Task deleted" });
  }),
  http.put("/api/tasks/:id/restore", ({ params }) => {
    const task = mockTasks.find((t) => String(t.id) === params.id);
    if (!task) return new HttpResponse(null, { status: 404 });
    return HttpResponse.json({ data: { ...task, status: "Open" } });
  }),
  http.delete("/api/tasks/:id/hard", ({ params }) => {
    const task = mockTasks.find((t) => String(t.id) === params.id);
    if (!task) return new HttpResponse(null, { status: 404 });
    return HttpResponse.json({ message: "Task permanently deleted" });
  }),
  http.patch("/api/tasks/bulk", () => HttpResponse.json({ message: "Bulk update applied" })),

  // ==================== Model Inventory ====================
  http.post("/api/model-inventory", async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json({ data: { id: 1, ...body } }, { status: 201 });
  }),
  http.post("/api/projects/:projectId/model-inventory", async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json({ data: { id: 1, ...body } }, { status: 201 });
  }),
  http.get("/api/model-inventory/evaluations", () =>
    HttpResponse.json({ data: { evaluations: [] } }),
  ),
  http.get("/api/model-inventory-history/timeseries", () =>
    HttpResponse.json({ data: { timeseries: [] } }),
  ),
  http.get("/api/model-inventory-history/current-counts", () =>
    HttpResponse.json({ data: { total: 5, byType: {} } }),
  ),
  http.post("/api/model-inventory-history/snapshot", () =>
    HttpResponse.json({ data: { snapshotId: 1 } }),
  ),
  http.get("/api/model-inventory-change-history/:id", ({ params }) =>
    HttpResponse.json({ data: { id: params.id, changes: [] } }),
  ),

  // ==================== AI Gateway ====================
  http.get("/api/ai-gateway/keys", () =>
    HttpResponse.json({
      data: [{ id: 1, name: "Test Key", provider: "openai", key_preview: "sk-***abc" }],
    }),
  ),
  http.post("/api/ai-gateway/keys", async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json({ data: { id: 2, ...body } }, { status: 201 });
  }),
  http.delete("/api/ai-gateway/keys/:id", () => HttpResponse.json({ success: true })),
  http.post("/api/ai-gateway/keys/verify", async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    const valid = (body as any)?.key?.startsWith("sk-");
    return HttpResponse.json({
      data: { valid, message: valid ? "Key is valid" : "Invalid key format" },
    });
  }),

  // ==================== DeepEval — Models ====================
  http.get("/api/deepeval/models", () =>
    HttpResponse.json({ models: [{ id: "gpt-4", name: "GPT-4", provider: "openai" }] }),
  ),
  http.post("/api/deepeval/models", async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json({ model: { id: "new-model", ...body } }, { status: 201 });
  }),
  http.put("/api/deepeval/models/:id", async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json({ model: { id: "gpt-4", ...body } });
  }),
  http.delete("/api/deepeval/models/:id", () => HttpResponse.json({ message: "deleted" })),
  http.post("/api/deepeval/models/validate", async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json({ valid: true, model_name: (body as any)?.model_name || "gpt-4" });
  }),

  // ==================== DeepEval — Scorers ====================
  http.get("/api/deepeval/scorers", () =>
    HttpResponse.json({ scorers: [{ id: 1, name: "Faithfulness", score: 0.95 }] }),
  ),
  http.post("/api/deepeval/scorers", async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json({ id: 2, ...body }, { status: 201 });
  }),
  http.put("/api/deepeval/scorers/:id", async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json({ id: 1, ...body });
  }),
  http.delete("/api/deepeval/scorers/:id", () => HttpResponse.json({ message: "deleted", id: 1 })),
  http.post("/api/deepeval/scorers/:id/test", () =>
    HttpResponse.json({ scorerId: 1, score: 0.92, passed: true }),
  ),

  // ==================== DeepEval — Orgs ====================
  http.get("/api/deepeval/orgs", ({ request }) => {
    const url = new URL(request.url);
    if (url.searchParams.get("fail") === "true") {
      return HttpResponse.json({ orgs: [] }, { status: 404 });
    }
    return HttpResponse.json({ orgs: [{ id: 1, name: "Test Org" }] });
  }),
  http.post("/api/deepeval/orgs", async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json({ org: { id: 2, ...body } }, { status: 201 });
  }),
  http.put("/api/deepeval/orgs/:id", async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json({ org: { id: 1, ...body } });
  }),
  http.delete("/api/deepeval/orgs/:id", () => HttpResponse.json({})),
  http.get("/api/deepeval/orgs/:id/projects", () =>
    HttpResponse.json({ projectIds: ["p1", "p2", "p3"] }),
  ),

  // ==================== DeepEval — Projects ====================
  http.get("/api/deepeval/projects", () =>
    HttpResponse.json({ projects: [{ id: 1, name: "Eval Project" }] }),
  ),
  http.post("/api/deepeval/projects", async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json({ project: { id: 2, ...body }, message: "Created" }, { status: 201 });
  }),
  http.get("/api/deepeval/projects/:id", ({ params }) =>
    HttpResponse.json({ project: { id: params.id, name: "Eval Project" } }),
  ),
  http.put("/api/deepeval/projects/:id", async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json({ project: { id: 1, ...body }, message: "Updated" });
  }),
  http.delete("/api/deepeval/projects/:id", () =>
    HttpResponse.json({ message: "deleted", projectId: 1 }),
  ),
  http.get("/api/deepeval/projects/:id/stats", () =>
    HttpResponse.json({ stats: { totalExperiments: 100, passed: 85, failed: 15 } }),
  ),
  http.get("/api/deepeval/projects/:id/monitor/dashboard", ({ params }) =>
    HttpResponse.json({ data: { project_id: params.id } }),
  ),

  // ==================== DeepEval — Datasets ====================
  http.get("/api/deepeval/datasets/list", () =>
    HttpResponse.json({ datasets: [{ id: 1, name: "Test Dataset" }] }),
  ),
  http.get("/api/deepeval/datasets/read", ({ request }) => {
    const url = new URL(request.url);
    const path = url.searchParams.get("path");
    return HttpResponse.json({ path, prompts: [{ id: 1, content: "Test prompt" }] });
  }),
  http.get("/api/deepeval/datasets/uploads", () =>
    HttpResponse.json({ uploads: [{ id: 1, filename: "dataset.csv" }] }),
  ),
  http.get("/api/deepeval/datasets/user", () =>
    HttpResponse.json({ datasets: [{ id: 1, name: "My Dataset" }] }),
  ),
  http.delete("/api/deepeval/datasets/user", () =>
    HttpResponse.json({ message: "deleted", deleted: 1 }),
  ),
  http.post("/api/deepeval/datasets/upload", () =>
    HttpResponse.json({
      message: "Uploaded",
      path: "/uploads/dataset.csv",
      filename: "dataset.csv",
      size: 1024,
      tenant: "test",
    }),
  ),

  // ==================== DeepEval — Logs ====================
  http.get("/api/deepeval/logs", () =>
    HttpResponse.json({ logs: [{ id: 1, level: "info", message: "Test log" }] }),
  ),
  http.post("/api/deepeval/logs", () => HttpResponse.json({ id: 1 }, { status: 201 })),
  http.get("/api/deepeval/logs/:id", ({ params }) => HttpResponse.json({ id: params.id })),
  http.get("/api/deepeval/logs/trace/:traceId", ({ params }) =>
    HttpResponse.json({ logs: [{ id: 1, traceId: params.traceId }] }),
  ),

  // ==================== DeepEval — Metrics ====================
  http.get("/api/deepeval/metrics", () =>
    HttpResponse.json({ metrics: [{ id: 1, name: "Accuracy" }] }),
  ),
  http.post("/api/deepeval/metrics", () => HttpResponse.json({ id: 1 }, { status: 201 })),
  http.get("/api/deepeval/metrics/aggregates", () => HttpResponse.json({ average: 0.85 })),

  // ==================== DeepEval — Experiments ====================
  http.get("/api/deepeval/experiments", () =>
    HttpResponse.json({ experiments: [{ id: "exp-1", name: "Experiment 1" }] }),
  ),
  http.post("/api/deepeval/experiments", () => HttpResponse.json({ id: "exp-2" }, { status: 201 })),
  http.get("/api/deepeval/experiments/all", () =>
    HttpResponse.json({ experiments: [{ id: "exp-1", name: "Experiment 1" }] }),
  ),
  http.get("/api/deepeval/experiments/:id", ({ params }) => HttpResponse.json({ id: params.id })),
  http.patch("/api/deepeval/experiments/:id", ({ params }) => HttpResponse.json({ id: params.id })),
  http.put("/api/deepeval/experiments/:id/status", ({ params }) =>
    HttpResponse.json({ id: params.id }),
  ),
  http.delete("/api/deepeval/experiments/:id", () => HttpResponse.json({ message: "deleted" })),

  // ==================== DeepEval — Arena ====================
  http.get("/api/deepeval/arena/comparisons", () =>
    HttpResponse.json({ comparisons: [{ id: 1, status: "completed" }] }),
  ),
  http.post("/api/deepeval/arena/compare", async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json(
      {
        id: 2,
        status: "pending",
        message: "Comparison created",
        contestants: (body as any)?.contestants || [],
      },
      { status: 201 },
    );
  }),
  http.get("/api/deepeval/arena/comparisons/:id", ({ params }) =>
    HttpResponse.json({ id: params.id, status: "completed", contestants: ["gpt-4", "claude-3"] }),
  ),
  http.get("/api/deepeval/arena/comparisons/:id/results", ({ params }) =>
    HttpResponse.json({
      id: params.id,
      results: { winner: "gpt-4", winCounts: { "gpt-4": 10, "claude-3": 5 }, detailedResults: [] },
    }),
  ),
  http.delete("/api/deepeval/arena/comparisons/:id", () =>
    HttpResponse.json({ message: "deleted", id: 1 }),
  ),

  // ==================== DeepEval — Bias Audits ====================
  http.get("/api/deepeval/bias-audits", () =>
    HttpResponse.json({ audits: [{ id: 1, status: "completed" }] }),
  ),
  http.get("/api/deepeval/bias-audits/presets", () =>
    HttpResponse.json({ presets: [{ id: 1, name: "Gender Bias" }] }),
  ),
  http.get("/api/deepeval/bias-audits/presets/:id", ({ params }) =>
    HttpResponse.json({ preset: { id: params.id, name: "Gender Bias" } }),
  ),
  http.post("/api/deepeval/bias-audits/run", () =>
    HttpResponse.json({ auditId: 1, status: "running" }),
  ),
  http.get("/api/deepeval/bias-audits/:id/status", ({ params }) =>
    HttpResponse.json({ auditId: params.id, status: "completed" }),
  ),
  http.get("/api/deepeval/bias-audits/:id/results", ({ params }) =>
    HttpResponse.json({ auditId: params.id, status: "completed", results: { biasScore: 0.1 } }),
  ),
  http.delete("/api/deepeval/bias-audits/:id", () =>
    HttpResponse.json({ message: "deleted", auditId: 1 }),
  ),
  http.patch("/api/deepeval/bias-audits/:id", async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json({ auditId: 1, systemName: (body as any)?.systemName || "System" });
  }),
  http.get(
    "/api/deepeval/bias-audits/:id/report.pdf",
    () =>
      new HttpResponse("PDF content", {
        headers: { "Content-Type": "application/pdf" },
      }),
  ),
  http.post("/api/deepeval/bias-audits/parse-headers", () =>
    HttpResponse.json({ headers: [{ name: "Test", value: "Value" }] }),
  ),

  // ==================== PMM — Post Market Monitoring ====================
  http.get("/api/pmm/config/:id", ({ params }) =>
    HttpResponse.json({ data: { id: params.id, projectId: 1, name: "PMM Config" } }),
  ),
  http.post("/api/pmm/config", async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json({ data: { id: 1, ...body } }, { status: 201 });
  }),
  http.put("/api/pmm/config/:id", async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json({ data: { id: 1, ...body } });
  }),
  http.delete("/api/pmm/config/:id", () => HttpResponse.json({})),
  http.get("/api/pmm/config/:id/questions", () =>
    HttpResponse.json({ data: [{ id: 1, text: "Is the system performing as expected?" }] }),
  ),
  http.get("/api/pmm/org/questions", () =>
    HttpResponse.json({ data: [{ id: 1, text: "Org-level question" }] }),
  ),
  http.post("/api/pmm/config/:id/questions", () =>
    HttpResponse.json({ data: { id: 2, text: "New question" } }, { status: 201 }),
  ),
  http.put("/api/pmm/questions/:id", async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json({ data: { id: 1, ...body } });
  }),
  http.delete("/api/pmm/questions/:id", () => HttpResponse.json({})),
  http.post("/api/pmm/questions/reorder", () => HttpResponse.json({})),
  http.get("/api/pmm/active-cycle/:id", ({ params }) => {
    if (String(params.id) === "999") {
      return HttpResponse.json(null, { status: 404 });
    }
    return HttpResponse.json({ data: { id: "1", configId: params.id, status: "active" } });
  }),
  http.get("/api/pmm/cycles/:id", ({ params }) =>
    HttpResponse.json({ data: { id: params.id, status: "active" } }),
  ),
  http.get("/api/pmm/cycles/:id/responses", () =>
    HttpResponse.json({ data: [{ id: 1, questionId: 1, answer: "Yes" }] }),
  ),
  http.post("/api/pmm/cycles/:id/responses", () => HttpResponse.json({})),
  http.post("/api/pmm/cycles/:id/submit", () =>
    HttpResponse.json({ data: { message: "Submitted", report_generated: true } }),
  ),
  http.post("/api/pmm/cycles/:id/flag", () => HttpResponse.json({})),
  http.get("/api/pmm/reports", ({ request }) => {
    const url = new URL(request.url);
    const projectId = url.searchParams.get("project_id");
    const flaggedOnly = url.searchParams.get("flagged_only");
    return HttpResponse.json({
      data: { reports: [{ id: 1, projectId: Number(projectId), flagged: flaggedOnly === "true" }] },
    });
  }),
  http.post("/api/pmm/cycles/:id/reassign", () => HttpResponse.json({})),
  http.post("/api/pmm/projects/:id/start-cycle", ({ params }) =>
    HttpResponse.json({ data: { id: 1, projectId: params.id, status: "active" } }, { status: 201 }),
  ),

  // ==================== CE Marking ====================
  http.get("/api/ce-marking/:id", ({ params }) =>
    HttpResponse.json({ projectId: params.id, isHighRiskAISystem: true }),
  ),
  http.put("/api/ce-marking/:id", async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json({ projectId: 1, isHighRiskAISystem: true, ...body });
  }),

  // ==================== Policies / Files / Incidents ====================
  http.get("/api/policies", () =>
    HttpResponse.json({ data: [{ id: 1, name: "AI Ethics Policy" }] }),
  ),
  http.get("/api/files", () =>
    HttpResponse.json([{ id: 1, name: "document.pdf", url: "https://example.com/doc.pdf" }]),
  ),
  http.get("/api/ai-incident-managements", () =>
    HttpResponse.json([{ id: 1, title: "Model Drift Incident", severity: "medium" }]),
  ),

  // ==================== Automations ====================
  // Specific routes MUST precede parameterized /:id routes
  http.get("/api/automations/triggers", () =>
    HttpResponse.json({ data: [{ id: 1, name: "Schedule", type: "cron" }] }),
  ),
  http.get("/api/automations/actions/by-triggerId/:id", ({ params }) =>
    HttpResponse.json({ data: [{ id: 1, triggerId: params.id, name: "Send Email" }] }),
  ),
  http.get("/api/automations", () =>
    HttpResponse.json({ data: [{ id: 1, name: "Daily Report", triggerId: 1, actionId: 1 }] }),
  ),
  http.post("/api/automations", async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json({ data: { id: 2, ...body } }, { status: 201 });
  }),
  http.get("/api/automations/:id", ({ params }) =>
    HttpResponse.json({ data: { id: params.id, name: "Automation Detail" } }),
  ),
  http.put("/api/automations/:id", async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json({ data: { id: 1, ...body } });
  }),
  http.delete("/api/automations/:id", () => HttpResponse.json({})),
  http.get("/api/automations/:id/history", ({ request }) => {
    const url = new URL(request.url);
    const total = parseInt(url.searchParams.get("total") || "10", 10);
    return HttpResponse.json({ data: { logs: [{ id: 1, status: "success" }], total } });
  }),
  http.get("/api/automations/:id/stats", () =>
    HttpResponse.json({
      data: { total_executions: 50, successful_executions: 45, failed_executions: 5 },
    }),
  ),

  // ==================== Search ====================
  http.get("/api/search", ({ request }) => {
    const url = new URL(request.url);
    const q = url.searchParams.get("q") || "";
    const limit = parseInt(url.searchParams.get("limit") || "10", 10);
    const offset = parseInt(url.searchParams.get("offset") || "0", 10);
    return HttpResponse.json({
      data: {
        results: [],
        totalCount: 0,
        query: q,
        limit,
        offset,
      },
    });
  }),
];
