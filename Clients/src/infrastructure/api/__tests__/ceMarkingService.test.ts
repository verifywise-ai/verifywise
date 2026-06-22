import { describe, it, expect } from "vitest";
import { server } from "../../../test/mocks/server";
import { http, HttpResponse } from "msw";

import { ceMarkingService } from "../ceMarkingService";

describe("ceMarkingService", () => {
  it("getCEMarking fetches by project ID", async () => {
    server.use(
      http.get("/api/ce-marking/:id", ({ params }) =>
        HttpResponse.json({ projectId: params.id, isHighRiskAISystem: true }),
      ),
    );
    const result = await ceMarkingService.getCEMarking("1");
    expect(result).toEqual({ projectId: "1", isHighRiskAISystem: true });
  });

  it("updateCEMarking puts data for project", async () => {
    server.use(
      http.put("/api/ce-marking/:id", async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ projectId: "1", ...body });
      }),
    );
    const updateData = { isHighRiskAISystem: false };
    const result = await ceMarkingService.updateCEMarking("1", updateData);
    expect(result).toEqual({ projectId: "1", ...updateData });
  });

  it("updateConformityStep delegates to updateCEMarking", async () => {
    server.use(http.put("/api/ce-marking/:id", () => HttpResponse.json({})));
    await ceMarkingService.updateConformityStep("proj-1", 2, { status: "done" });
  });

  it("updateClassificationAndScope delegates to updateCEMarking", async () => {
    server.use(http.put("/api/ce-marking/:id", () => HttpResponse.json({})));
    await ceMarkingService.updateClassificationAndScope("p1", { isHighRiskAISystem: true });
  });

  it("updateDeclaration delegates to updateCEMarking", async () => {
    server.use(http.put("/api/ce-marking/:id", () => HttpResponse.json({})));
    await ceMarkingService.updateDeclaration("p1", { declarationStatus: "signed" });
  });

  it("updateRegistration delegates to updateCEMarking", async () => {
    server.use(http.put("/api/ce-marking/:id", () => HttpResponse.json({})));
    await ceMarkingService.updateRegistration("p1", { registrationStatus: "complete" });
  });

  it("getAllPolicies extracts data.data", async () => {
    server.use(
      http.get("/api/policies", () => HttpResponse.json({ message: "OK", data: [{ id: 1 }] })),
    );
    const result = await ceMarkingService.getAllPolicies();
    expect(result).toEqual([{ id: 1 }]);
  });

  it("getAllPolicies falls back to array response", async () => {
    server.use(http.get("/api/policies", () => HttpResponse.json([{ id: 2 }])));
    const result = await ceMarkingService.getAllPolicies();
    expect(result).toEqual([{ id: 2 }]);
  });

  it("getAllEvidences returns array directly", async () => {
    const result = await ceMarkingService.getAllEvidences();
    expect(result).toEqual([{ id: 1, name: "document.pdf", url: "https://example.com/doc.pdf" }]);
  });

  it("updateLinkedPolicies sends policy IDs", async () => {
    server.use(http.put("/api/ce-marking/:id", () => HttpResponse.json({})));
    await ceMarkingService.updateLinkedPolicies("p1", [1, 2, 3]);
  });

  it("updateLinkedEvidences sends evidence IDs", async () => {
    server.use(http.put("/api/ce-marking/:id", () => HttpResponse.json({})));
    await ceMarkingService.updateLinkedEvidences("p1", [5, 6]);
  });

  it("getAllIncidents extracts data.data", async () => {
    server.use(
      http.get("/api/ai-incident-managements", () =>
        HttpResponse.json({ message: "OK", data: [{ id: 10 }] }),
      ),
    );
    const result = await ceMarkingService.getAllIncidents();
    expect(result).toEqual([{ id: 10 }]);
  });

  it("updateLinkedIncidents sends incident IDs", async () => {
    server.use(http.put("/api/ce-marking/:id", () => HttpResponse.json({})));
    await ceMarkingService.updateLinkedIncidents("p1", [7, 8]);
  });
});
