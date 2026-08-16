import {
  getTemplates,
  getTemplate,
  getScheduledReports,
  createScheduledReport,
  runScheduledReportNow,
  setScheduledReportActive,
  updateScheduledReport,
  deleteScheduledReport,
  getRuns,
  archiveRun,
  restoreRun,
  deleteRun,
  downloadReportRun,
  generateReportV2,
  getReportRun,
  getSectionCatalog,
  createTemplate,
  updateTemplate,
  archiveTemplate,
  runTemplateNow,
  getRunAnalyses,
} from "../reporting.repository";
import { apiServices } from "../../../infrastructure/api/networkServices";

vi.mock("../../../infrastructure/api/networkServices", () => ({
  apiServices: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("reporting.repository", () => {
  describe("getTemplates", () => {
    it("makes a get request and extracts nested data", async () => {
      vi.mocked(apiServices.get).mockResolvedValue({ data: { data: [{ id: 1 }] } });

      const result = await getTemplates();

      expect(apiServices.get).toHaveBeenCalledWith("/reporting/templates");
      expect(result).toEqual([{ id: 1 }]);
    });

    it("falls back to response.data when data.data is absent", async () => {
      vi.mocked(apiServices.get).mockResolvedValue({ data: [{ id: 2 }] });

      const result = await getTemplates();

      expect(result).toEqual([{ id: 2 }]);
    });
  });

  describe("getTemplate", () => {
    it("makes a get request scoped to the template id", async () => {
      vi.mocked(apiServices.get).mockResolvedValue({ data: { data: { id: 1 } } });

      const result = await getTemplate(1);

      expect(apiServices.get).toHaveBeenCalledWith("/reporting/templates/1");
      expect(result).toEqual({ id: 1 });
    });
  });

  describe("getScheduledReports", () => {
    it("makes a get request for scheduled reports", async () => {
      vi.mocked(apiServices.get).mockResolvedValue({ data: { data: [] } });

      await getScheduledReports();

      expect(apiServices.get).toHaveBeenCalledWith("/reporting/scheduled-reports");
    });
  });

  describe("createScheduledReport", () => {
    it("makes a post request with the body", async () => {
      const body = { name: "Weekly" };
      vi.mocked(apiServices.post).mockResolvedValue({ data: { data: { id: 1, ...body } } });

      const result = await createScheduledReport(body);

      expect(apiServices.post).toHaveBeenCalledWith("/reporting/scheduled-reports", body);
      expect(result).toEqual({ id: 1, ...body });
    });
  });

  describe("runScheduledReportNow", () => {
    it("makes a post request scoped to the report id", async () => {
      vi.mocked(apiServices.post).mockResolvedValue({ data: { data: { runId: 1 } } });

      await runScheduledReportNow(5);

      expect(apiServices.post).toHaveBeenCalledWith("/reporting/scheduled-reports/5/run-now", {});
    });
  });

  describe("setScheduledReportActive", () => {
    it("calls the resume endpoint when active is true", async () => {
      vi.mocked(apiServices.post).mockResolvedValue({ data: { data: { active: true } } });

      await setScheduledReportActive(5, true);

      expect(apiServices.post).toHaveBeenCalledWith("/reporting/scheduled-reports/5/resume", {});
    });

    it("calls the pause endpoint when active is false", async () => {
      vi.mocked(apiServices.post).mockResolvedValue({ data: { data: { active: false } } });

      await setScheduledReportActive(5, false);

      expect(apiServices.post).toHaveBeenCalledWith("/reporting/scheduled-reports/5/pause", {});
    });
  });

  describe("updateScheduledReport", () => {
    it("makes a patch request with the body", async () => {
      const body = { name: "Updated" } as any;
      vi.mocked(apiServices.patch).mockResolvedValue({ data: { data: { id: 5, ...body } } });

      await updateScheduledReport(5, body);

      expect(apiServices.patch).toHaveBeenCalledWith("/reporting/scheduled-reports/5", body);
    });
  });

  describe("deleteScheduledReport", () => {
    it("makes a delete request scoped to the report id", async () => {
      vi.mocked(apiServices.delete).mockResolvedValue({ data: { data: { ok: true } } });

      const result = await deleteScheduledReport(5);

      expect(apiServices.delete).toHaveBeenCalledWith("/reporting/scheduled-reports/5");
      expect(result).toEqual({ ok: true });
    });
  });

  describe("getRuns", () => {
    it("builds a query string from the provided params, including archived=false", async () => {
      vi.mocked(apiServices.get).mockResolvedValue({ data: { data: { runs: [], total: 0 } } });

      await getRuns({ scheduledReportId: 3, archived: false, limit: 10, offset: 0 });

      expect(apiServices.get).toHaveBeenCalledWith(
        "/reporting/runs?scheduledReportId=3&archived=false&limit=10&offset=0",
      );
    });

    it("makes a get request without a query string when no params are given", async () => {
      vi.mocked(apiServices.get).mockResolvedValue({ data: { data: { runs: [], total: 0 } } });

      await getRuns();

      expect(apiServices.get).toHaveBeenCalledWith("/reporting/runs");
    });
  });

  describe("archiveRun", () => {
    it("makes a patch request scoped to the run id", async () => {
      vi.mocked(apiServices.patch).mockResolvedValue({ data: { data: { archived: true } } });

      await archiveRun(9);

      expect(apiServices.patch).toHaveBeenCalledWith("/reporting/runs/9/archive", {});
    });
  });

  describe("restoreRun", () => {
    it("makes a patch request scoped to the run id", async () => {
      vi.mocked(apiServices.patch).mockResolvedValue({ data: { data: { archived: false } } });

      await restoreRun(9);

      expect(apiServices.patch).toHaveBeenCalledWith("/reporting/runs/9/restore", {});
    });
  });

  describe("deleteRun", () => {
    it("makes a delete request scoped to the run id", async () => {
      vi.mocked(apiServices.delete).mockResolvedValue({ data: { data: { ok: true } } });

      await deleteRun(9);

      expect(apiServices.delete).toHaveBeenCalledWith("/reporting/runs/9");
    });
  });

  describe("downloadReportRun", () => {
    it("makes a get request with responseType blob and returns the blob", async () => {
      const blob = new Blob(["pdf-content"]);
      vi.mocked(apiServices.get).mockResolvedValue({ data: blob });

      const result = await downloadReportRun(9);

      expect(apiServices.get).toHaveBeenCalledWith("/reporting/runs/9/download", {
        responseType: "blob",
      });
      expect(result).toBe(blob);
    });
  });

  describe("generateReportV2", () => {
    it("makes a post request with the generation body", async () => {
      const body = { template_id: 1 } as any;
      vi.mocked(apiServices.post).mockResolvedValue({ data: { data: { runId: 1 } } });

      await generateReportV2(body);

      expect(apiServices.post).toHaveBeenCalledWith("/reporting/v2/generate-report", body);
    });
  });

  describe("getReportRun", () => {
    it("makes a get request scoped to the run id", async () => {
      vi.mocked(apiServices.get).mockResolvedValue({ data: { data: { id: 9, status: "done" } } });

      const result = await getReportRun(9);

      expect(apiServices.get).toHaveBeenCalledWith("/reporting/runs/9");
      expect(result).toEqual({ id: 9, status: "done" });
    });
  });

  describe("getSectionCatalog", () => {
    it("makes a get request for the section catalog", async () => {
      vi.mocked(apiServices.get).mockResolvedValue({ data: { data: [] } });

      await getSectionCatalog();

      expect(apiServices.get).toHaveBeenCalledWith("/reporting/sections");
    });
  });

  describe("createTemplate", () => {
    it("makes a post request with the template body", async () => {
      const body = { name: "Template" } as any;
      vi.mocked(apiServices.post).mockResolvedValue({ data: { data: { id: 1, ...body } } });

      await createTemplate(body);

      expect(apiServices.post).toHaveBeenCalledWith("/reporting/templates", body);
    });
  });

  describe("updateTemplate", () => {
    it("makes a patch request scoped to the template id", async () => {
      const body = { name: "Updated" } as any;
      vi.mocked(apiServices.patch).mockResolvedValue({ data: { data: { id: 1, ...body } } });

      await updateTemplate(1, body);

      expect(apiServices.patch).toHaveBeenCalledWith("/reporting/templates/1", body);
    });
  });

  describe("archiveTemplate", () => {
    it("makes a delete request scoped to the template id", async () => {
      vi.mocked(apiServices.delete).mockResolvedValue({ data: { data: { ok: true } } });

      const result = await archiveTemplate(1);

      expect(apiServices.delete).toHaveBeenCalledWith("/reporting/templates/1");
      expect(result).toEqual({ ok: true });
    });
  });

  describe("runTemplateNow", () => {
    it("makes a post request with the run body", async () => {
      const body = { project_id: 1 };
      vi.mocked(apiServices.post).mockResolvedValue({ data: { data: { runId: 1 } } });

      await runTemplateNow(1, body);

      expect(apiServices.post).toHaveBeenCalledWith("/reporting/templates/1/run", body);
    });
  });

  describe("getRunAnalyses", () => {
    it("makes a get request scoped to the run id", async () => {
      vi.mocked(apiServices.get).mockResolvedValue({ data: { data: [] } });

      await getRunAnalyses(9);

      expect(apiServices.get).toHaveBeenCalledWith("/reporting/runs/9/analyses");
    });
  });
});
