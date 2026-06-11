import { http, HttpResponse } from "msw";
import { mockProjects, createMockProject } from "./data/projects";
import { mockRisks, createMockRisk } from "./data/risks";
import { mockVendors, createMockVendor } from "./data/vendors";
import { mockAssessments, createMockAssessment } from "./data/assessments";

/**
 * MSW request handlers for REST APIs.
 *
 * These handlers intercept HTTP requests during tests and return
 * realistic mock responses, enabling true integration testing of
 * hooks → repositories → network layer without mocking repositories.
 */
export const handlers = [
  // Health check
  http.get("/api/health", () => HttpResponse.json({ status: "ok" })),

  // Projects
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

  // Risks
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

  // Vendors
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

  // Assessments
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
];
