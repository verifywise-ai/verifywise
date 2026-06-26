import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("../../utils/aiTrustCentre.utils", () => ({
  getCompanyLogoQuery: jest.fn(),
  getAITrustCentrePublicPageQuery: jest.fn(),
  getAITrustCentrePublicResourceByIdQuery: jest.fn(),
  getAITrustCentreOverviewQuery: jest.fn(),
  getAITrustCentreResourcesQuery: jest.fn(),
  getAITrustCentreSubprocessorsQuery: jest.fn(),
  createAITrustCentreResourceQuery: jest.fn(),
  createAITrustCentreSubprocessorQuery: jest.fn(),
  uploadCompanyLogoQuery: jest.fn(),
  updateAITrustCentreOverviewQuery: jest.fn(),
  updateAITrustCentreResourceQuery: jest.fn(),
  updateAITrustCentreSubprocessorQuery: jest.fn(),
  deleteAITrustCentreResourceQuery: jest.fn(),
  deleteAITrustCentreSubprocessorQuery: jest.fn(),
  deleteCompanyLogoQuery: jest.fn(),
}));
jest.mock("../../utils/fileUpload.utils", () => ({
  uploadFile: jest.fn(),
}));
jest.mock("../../utils/organization.utils", () => ({
  getOrganizationByTenantHashQuery: jest.fn(),
}));
jest.mock("../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { debug: jest.fn(), error: jest.fn(), info: jest.fn() },
  logStructured: jest.fn(),
}));
jest.mock("../../utils/logger/dbLogger", () => ({
  logEvent: jest.fn(),
}));
jest.mock("../../utils/i18n.utils", () => ({
  translateError: jest.fn((_req: any, error: any) => (error as Error).message),
}));
jest.mock("../../utils/statusCode.utils", () => ({
  STATUS_CODE: {
    200: (d: any) => ({ message: "OK", data: d }),
    201: (d: any) => ({ message: "Created", data: d }),
    400: (d: any) => ({ message: "Bad Request", data: d }),
    404: (d: any) => ({ message: "Not Found", data: d }),
    500: (d: any) => ({ message: "Internal Server Error", data: d }),
    503: (d: any) => ({ message: "Service Unavailable", data: d }),
  },
}));
jest.mock("../../database/db", () => ({
  sequelize: {
    transaction: jest.fn<any>().mockResolvedValue({ commit: jest.fn(), rollback: jest.fn() }),
  },
}));

import { sequelize } from "../../database/db";
import {
  createAITrustCentreResourceQuery,
  createAITrustCentreSubprocessorQuery,
  deleteAITrustCentreResourceQuery,
  deleteAITrustCentreSubprocessorQuery,
  deleteCompanyLogoQuery,
  getAITrustCentreOverviewQuery,
  getAITrustCentrePublicPageQuery,
  getAITrustCentrePublicResourceByIdQuery,
  getAITrustCentreResourcesQuery,
  getAITrustCentreSubprocessorsQuery,
  getCompanyLogoQuery,
  updateAITrustCentreOverviewQuery,
  updateAITrustCentreResourceQuery,
  updateAITrustCentreSubprocessorQuery,
  uploadCompanyLogoQuery,
} from "../../utils/aiTrustCentre.utils";
import { uploadFile } from "../../utils/fileUpload.utils";
import { logEvent } from "../../utils/logger/dbLogger";
import { getOrganizationByTenantHashQuery } from "../../utils/organization.utils";
import {
  createAITrustResource,
  createAITrustSubprocessor,
  deleteAITrustResource,
  deleteAITrustSubprocessor,
  deleteCompanyLogo,
  getAITrustCentreOverview,
  getAITrustCentrePublicPage,
  getAITrustCentrePublicResource,
  getAITrustCentreResources,
  getAITrustCentreSubprocessors,
  getCompanyLogo,
  updateAITrustOverview,
  updateAITrustResource,
  updateAITrustSubprocessor,
  uploadCompanyLogo,
} from "../aiTrustCentre.ctrl";

const mockGetCompanyLogoQuery = getCompanyLogoQuery as jest.MockedFunction<any>;
const mockGetPublicPageQuery = getAITrustCentrePublicPageQuery as jest.MockedFunction<any>;
const mockGetPublicResourceQuery =
  getAITrustCentrePublicResourceByIdQuery as jest.MockedFunction<any>;
const mockGetOverviewQuery = getAITrustCentreOverviewQuery as jest.MockedFunction<any>;
const mockGetResourcesQuery = getAITrustCentreResourcesQuery as jest.MockedFunction<any>;
const mockGetSubprocessorsQuery = getAITrustCentreSubprocessorsQuery as jest.MockedFunction<any>;
const mockCreateResourceQuery = createAITrustCentreResourceQuery as jest.MockedFunction<any>;
const mockCreateSubprocessorQuery =
  createAITrustCentreSubprocessorQuery as jest.MockedFunction<any>;
const mockUploadLogoQuery = uploadCompanyLogoQuery as jest.MockedFunction<any>;
const mockUpdateOverviewQuery = updateAITrustCentreOverviewQuery as jest.MockedFunction<any>;
const mockUpdateResourceQuery = updateAITrustCentreResourceQuery as jest.MockedFunction<any>;
const mockUpdateSubprocessorQuery =
  updateAITrustCentreSubprocessorQuery as jest.MockedFunction<any>;
const mockDeleteResourceQuery = deleteAITrustCentreResourceQuery as jest.MockedFunction<any>;
const mockDeleteSubprocessorQuery =
  deleteAITrustCentreSubprocessorQuery as jest.MockedFunction<any>;
const mockDeleteLogoQuery = deleteCompanyLogoQuery as jest.MockedFunction<any>;
const mockUploadFile = uploadFile as jest.MockedFunction<any>;
const mockGetOrgByHash = getOrganizationByTenantHashQuery as jest.MockedFunction<any>;
const mockLogEvent = logEvent as jest.MockedFunction<any>;
const mockTransaction = sequelize.transaction as jest.MockedFunction<any>;

function createReq(overrides?: Record<string, any>): any {
  return {
    userId: 1,
    organizationId: 1,
    role: "Admin",
    t: (k: string) => k,
    body: {},
    params: {},
    query: {},
    file: undefined,
    headers: {},
    ...overrides,
  };
}
function createRes(): any {
  const res: any = {};
  res.status = jest.fn<any>().mockReturnValue(res);
  res.json = jest.fn<any>().mockReturnValue(res);
  res.send = jest.fn<any>().mockReturnValue(res);
  res.setHeader = jest.fn<any>().mockReturnValue(res);
  res.end = jest.fn<any>().mockReturnValue(res);
  return res;
}

function makeUploadedFile(overrides?: any) {
  return {
    fieldname: "file",
    originalname: "test.pdf",
    mimetype: "application/pdf",
    buffer: Buffer.from("dummy"),
    size: 1024,
    ...overrides,
  };
}

describe("aiTrustCentre.ctrl", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("getCompanyLogo", () => {
    it("should return 404 when organization not found", async () => {
      mockGetOrgByHash.mockResolvedValue(null);
      const req = createReq({ params: { hash: "invalid" } });
      const res = createRes();
      await getCompanyLogo(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it("should return 404 when logo not found", async () => {
      mockGetOrgByHash.mockResolvedValue({ id: 1 });
      mockGetCompanyLogoQuery.mockResolvedValue(null);
      const req = createReq({ params: { hash: "test-hash" } });
      const res = createRes();
      await getCompanyLogo(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it("should return 200 with logo", async () => {
      mockGetOrgByHash.mockResolvedValue({ id: 1 });
      mockGetCompanyLogoQuery.mockResolvedValue({
        content: Buffer.from("logo"),
        type: "image/png",
      });
      const req = createReq({ params: { hash: "test-hash" } });
      const res = createRes();
      await getCompanyLogo(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("should return 500 on error", async () => {
      mockGetOrgByHash.mockRejectedValue(new Error("DB error"));
      const req = createReq({ params: { hash: "test-hash" } });
      const res = createRes();
      await getCompanyLogo(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("getAITrustCentrePublicPage", () => {
    it("should return 404 when organization not found", async () => {
      mockGetOrgByHash.mockResolvedValue(null);
      const req = createReq({ params: { hash: "invalid" } });
      const res = createRes();
      await getAITrustCentrePublicPage(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it("should return 200 with public page data", async () => {
      mockGetOrgByHash.mockResolvedValue({ id: 1 });
      mockGetPublicPageQuery.mockResolvedValue({ intro: {}, badges: {} });
      const req = createReq({ params: { hash: "test-hash" } });
      const res = createRes();
      await getAITrustCentrePublicPage(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("should return 500 on error", async () => {
      mockGetOrgByHash.mockRejectedValue(new Error("DB error"));
      const req = createReq({ params: { hash: "test-hash" } });
      const res = createRes();
      await getAITrustCentrePublicPage(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("getAITrustCentrePublicResource", () => {
    it("should return 404 when organization not found", async () => {
      mockGetOrgByHash.mockResolvedValue(null);
      const req = createReq({ params: { hash: "invalid", id: "1" } });
      const res = createRes();
      await getAITrustCentrePublicResource(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it("should return 404 when resource not found", async () => {
      mockGetOrgByHash.mockResolvedValue({ id: 1 });
      mockGetPublicResourceQuery.mockResolvedValue(null);
      const req = createReq({ params: { hash: "test-hash", id: "1" } });
      const res = createRes();
      await getAITrustCentrePublicResource(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it("should return 200 with resource content and headers", async () => {
      mockGetOrgByHash.mockResolvedValue({ id: 1 });
      mockGetPublicResourceQuery.mockResolvedValue({
        type: "application/pdf",
        filename: "doc.pdf",
        content: Buffer.from("data"),
      });
      const req = createReq({ params: { hash: "test-hash", id: "1" } });
      const res = createRes();
      await getAITrustCentrePublicResource(req, res);
      expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "application/pdf");
      expect(res.setHeader).toHaveBeenCalledWith(
        "Content-Disposition",
        'attachment; filename="doc.pdf"',
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.end).toHaveBeenCalledWith(Buffer.from("data"));
    });

    it("should return 500 on error", async () => {
      mockGetOrgByHash.mockRejectedValue(new Error("DB error"));
      const req = createReq({ params: { hash: "test-hash", id: "1" } });
      const res = createRes();
      await getAITrustCentrePublicResource(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("getAITrustCentreOverview", () => {
    it("should return 200 with overview", async () => {
      mockGetOverviewQuery.mockResolvedValue({ info: {}, intro: {} });
      const req = createReq();
      const res = createRes();
      await getAITrustCentreOverview(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("should return 500 on error", async () => {
      mockGetOverviewQuery.mockRejectedValue(new Error("DB error"));
      const req = createReq();
      const res = createRes();
      await getAITrustCentreOverview(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("getAITrustCentreResources", () => {
    it("should return 200 with resources", async () => {
      mockGetResourcesQuery.mockResolvedValue([{ id: 1, name: "Resource 1" }]);
      const req = createReq();
      const res = createRes();
      await getAITrustCentreResources(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("should return 200 with empty array when no resources", async () => {
      mockGetResourcesQuery.mockResolvedValue([]);
      const req = createReq();
      const res = createRes();
      await getAITrustCentreResources(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("should return 500 on error", async () => {
      mockGetResourcesQuery.mockRejectedValue(new Error("DB error"));
      const req = createReq();
      const res = createRes();
      await getAITrustCentreResources(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("getAITrustCentreSubprocessors", () => {
    it("should return 200 with subprocessors", async () => {
      mockGetSubprocessorsQuery.mockResolvedValue([{ id: 1, name: "Sub 1" }]);
      const req = createReq();
      const res = createRes();
      await getAITrustCentreSubprocessors(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("should return 500 on error", async () => {
      mockGetSubprocessorsQuery.mockRejectedValue(new Error("DB error"));
      const req = createReq();
      const res = createRes();
      await getAITrustCentreSubprocessors(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("createAITrustResource", () => {
    it("should return 400 when file upload fails", async () => {
      mockUploadFile.mockResolvedValue(null);
      const req = createReq({
        file: makeUploadedFile(),
        body: { name: "Test Resource", description: "desc", visible: "true" },
      });
      const res = createRes();
      await createAITrustResource(req, res);
      expect(mockUploadFile).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should return 201 on successful creation", async () => {
      mockUploadFile.mockResolvedValue({ id: 1 });
      mockCreateResourceQuery.mockResolvedValue({ id: 1, name: "Test Resource" });
      const req = createReq({
        file: makeUploadedFile(),
        body: { name: "Test Resource", description: "desc", visible: "true" },
      });
      const res = createRes();
      await createAITrustResource(req, res);
      expect(mockCreateResourceQuery).toHaveBeenCalled();
      expect(mockLogEvent).toHaveBeenCalledWith("Create", expect.any(String), 1, 1);
      expect(res.status).toHaveBeenCalledWith(201);
    });

    it("should return 503 when resource creation fails", async () => {
      mockUploadFile.mockResolvedValue({ id: 1 });
      mockCreateResourceQuery.mockResolvedValue(null);
      const req = createReq({
        file: makeUploadedFile(),
        body: { name: "Test Resource", description: "desc", visible: "true" },
      });
      const res = createRes();
      await createAITrustResource(req, res);
      expect(res.status).toHaveBeenCalledWith(503);
    });

    it("should return 500 on error", async () => {
      mockUploadFile.mockRejectedValue(new Error("Upload error"));
      const req = createReq({
        file: makeUploadedFile(),
        body: { name: "Test Resource" },
      });
      const res = createRes();
      await createAITrustResource(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("createAITrustSubprocessor", () => {
    it("should return 201 on successful creation", async () => {
      mockCreateSubprocessorQuery.mockResolvedValue({ id: 1, name: "Subprocessor" });
      const req = createReq({
        body: {
          name: "Subprocessor",
          purpose: "Processing",
          location: "EU",
          url: "https://example.com",
        },
      });
      const res = createRes();
      await createAITrustSubprocessor(req, res);
      expect(mockCreateSubprocessorQuery).toHaveBeenCalled();
      expect(mockLogEvent).toHaveBeenCalledWith("Create", expect.any(String), 1, 1);
      expect(res.status).toHaveBeenCalledWith(201);
    });

    it("should return 503 when creation fails", async () => {
      mockCreateSubprocessorQuery.mockResolvedValue(null);
      const req = createReq({
        body: {
          name: "Subprocessor",
          purpose: "Processing",
          location: "EU",
          url: "https://example.com",
        },
      });
      const res = createRes();
      await createAITrustSubprocessor(req, res);
      expect(res.status).toHaveBeenCalledWith(503);
    });

    it("should return 500 on error", async () => {
      mockCreateSubprocessorQuery.mockRejectedValue(new Error("DB error"));
      const req = createReq({
        body: { name: "Subprocessor" },
      });
      const res = createRes();
      await createAITrustSubprocessor(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("uploadCompanyLogo", () => {
    it("should return 400 when file upload fails", async () => {
      mockUploadFile.mockResolvedValue(null);
      const req = createReq({ file: makeUploadedFile() });
      const res = createRes();
      await uploadCompanyLogo(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should return 200 on successful upload", async () => {
      mockUploadFile.mockResolvedValue({ id: 1 });
      mockUploadLogoQuery.mockResolvedValue({ id: 1, logo: 1 });
      const req = createReq({ file: makeUploadedFile() });
      const res = createRes();
      await uploadCompanyLogo(req, res);
      expect(mockUploadLogoQuery).toHaveBeenCalled();
      expect(mockLogEvent).toHaveBeenCalledWith("Create", expect.any(String), 1, 1);
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("should return 503 when logo upload query fails", async () => {
      mockUploadFile.mockResolvedValue({ id: 1 });
      mockUploadLogoQuery.mockResolvedValue(null);
      const req = createReq({ file: makeUploadedFile() });
      const res = createRes();
      await uploadCompanyLogo(req, res);
      expect(res.status).toHaveBeenCalledWith(503);
    });

    it("should return 500 on error", async () => {
      mockUploadFile.mockRejectedValue(new Error("Upload error"));
      const req = createReq({ file: makeUploadedFile() });
      const res = createRes();
      await uploadCompanyLogo(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("updateAITrustOverview", () => {
    it("should return 200 on successful update", async () => {
      mockUpdateOverviewQuery.mockResolvedValue({ info: {} });
      const req = createReq({ body: { info: { title: "Updated" } } });
      const res = createRes();
      await updateAITrustOverview(req, res);
      expect(mockUpdateOverviewQuery).toHaveBeenCalled();
      expect(mockLogEvent).toHaveBeenCalledWith("Update", expect.any(String), 1, 1);
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("should return 503 when update fails", async () => {
      mockUpdateOverviewQuery.mockResolvedValue(null);
      const req = createReq({ body: {} });
      const res = createRes();
      await updateAITrustOverview(req, res);
      expect(res.status).toHaveBeenCalledWith(503);
    });

    it("should return 500 on error", async () => {
      mockUpdateOverviewQuery.mockRejectedValue(new Error("DB error"));
      const req = createReq({ body: {} });
      const res = createRes();
      await updateAITrustOverview(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("updateAITrustResource", () => {
    it("should return 400 when file is missing but delete is set", async () => {
      const req = createReq({
        params: { id: "1" },
        body: { name: "Updated", delete: "1" },
        file: undefined,
      });
      const res = createRes();
      await updateAITrustResource(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should return 400 when file is provided but delete is not set", async () => {
      const req = createReq({
        params: { id: "1" },
        body: { name: "Updated" },
        file: makeUploadedFile(),
      });
      const res = createRes();
      await updateAITrustResource(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should return 200 on successful metadata update without file change", async () => {
      mockUpdateResourceQuery.mockResolvedValue({ id: 1, name: "Updated" });
      const req = createReq({
        params: { id: "1" },
        body: { name: "Updated", description: "New desc", visible: "true" },
      });
      const res = createRes();
      await updateAITrustResource(req, res);
      expect(mockUpdateResourceQuery).toHaveBeenCalled();
      expect(mockLogEvent).toHaveBeenCalledWith("Update", expect.any(String), 1, 1);
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("should return 200 on successful update with file replacement", async () => {
      mockUploadFile.mockResolvedValue({ id: 2 });
      mockUpdateResourceQuery.mockResolvedValue({ id: 1, name: "Updated" });
      const req = createReq({
        params: { id: "1" },
        body: { name: "Updated", delete: "1" },
        file: makeUploadedFile(),
      });
      const res = createRes();
      await updateAITrustResource(req, res);
      expect(mockUploadFile).toHaveBeenCalled();
      expect(mockUpdateResourceQuery).toHaveBeenCalledWith(
        1,
        expect.any(Object),
        1,
        1,
        expect.any(Object),
      );
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("should return 503 when update fails", async () => {
      mockUpdateResourceQuery.mockResolvedValue(null);
      const req = createReq({
        params: { id: "1" },
        body: { name: "Updated" },
      });
      const res = createRes();
      await updateAITrustResource(req, res);
      expect(res.status).toHaveBeenCalledWith(503);
    });

    it("should return 500 on error", async () => {
      mockUpdateResourceQuery.mockRejectedValue(new Error("DB error"));
      const req = createReq({
        params: { id: "1" },
        body: { name: "Updated", delete: "1" },
        file: makeUploadedFile(),
      });
      const res = createRes();
      await updateAITrustResource(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("updateAITrustSubprocessor", () => {
    it("should return 200 on successful update", async () => {
      mockUpdateSubprocessorQuery.mockResolvedValue({ id: 1, name: "Updated" });
      const req = createReq({
        params: { id: "1" },
        body: {
          name: "Updated",
          purpose: "New purpose",
          location: "US",
          url: "https://example.com",
        },
      });
      const res = createRes();
      await updateAITrustSubprocessor(req, res);
      expect(mockUpdateSubprocessorQuery).toHaveBeenCalled();
      expect(mockLogEvent).toHaveBeenCalledWith("Update", expect.any(String), 1, 1);
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("should return 503 when update fails", async () => {
      mockUpdateSubprocessorQuery.mockResolvedValue(null);
      const req = createReq({
        params: { id: "1" },
        body: { name: "Updated" },
      });
      const res = createRes();
      await updateAITrustSubprocessor(req, res);
      expect(res.status).toHaveBeenCalledWith(503);
    });

    it("should return 500 on error", async () => {
      mockUpdateSubprocessorQuery.mockRejectedValue(new Error("DB error"));
      const req = createReq({
        params: { id: "1" },
        body: { name: "Updated" },
      });
      const res = createRes();
      await updateAITrustSubprocessor(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("deleteAITrustResource", () => {
    it("should return 200 on successful deletion", async () => {
      mockDeleteResourceQuery.mockResolvedValue(true);
      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await deleteAITrustResource(req, res);
      expect(mockDeleteResourceQuery).toHaveBeenCalledWith(1, 1);
      expect(mockLogEvent).toHaveBeenCalledWith("Delete", expect.any(String), 1, 1);
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("should return 503 when deletion fails", async () => {
      mockDeleteResourceQuery.mockResolvedValue(false);
      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await deleteAITrustResource(req, res);
      expect(res.status).toHaveBeenCalledWith(503);
    });

    it("should return 500 on error", async () => {
      mockDeleteResourceQuery.mockRejectedValue(new Error("DB error"));
      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await deleteAITrustResource(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("deleteAITrustSubprocessor", () => {
    it("should return 200 on successful deletion", async () => {
      mockDeleteSubprocessorQuery.mockResolvedValue(true);
      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await deleteAITrustSubprocessor(req, res);
      expect(mockDeleteSubprocessorQuery).toHaveBeenCalledWith(1, 1);
      expect(mockLogEvent).toHaveBeenCalledWith("Delete", expect.any(String), 1, 1);
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("should return 503 when deletion fails", async () => {
      mockDeleteSubprocessorQuery.mockResolvedValue(false);
      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await deleteAITrustSubprocessor(req, res);
      expect(res.status).toHaveBeenCalledWith(503);
    });

    it("should return 500 on error", async () => {
      mockDeleteSubprocessorQuery.mockRejectedValue(new Error("DB error"));
      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      await deleteAITrustSubprocessor(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("deleteCompanyLogo", () => {
    it("should return 200 on successful deletion", async () => {
      mockDeleteLogoQuery.mockResolvedValue(true);
      const req = createReq();
      const res = createRes();
      await deleteCompanyLogo(req, res);
      expect(mockDeleteLogoQuery).toHaveBeenCalledWith(1, expect.any(Object));
      expect(mockLogEvent).toHaveBeenCalledWith("Delete", expect.any(String), 1, 1);
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("should return 503 when deletion fails", async () => {
      mockDeleteLogoQuery.mockResolvedValue(false);
      const req = createReq();
      const res = createRes();
      await deleteCompanyLogo(req, res);
      expect(res.status).toHaveBeenCalledWith(503);
    });

    it("should return 500 on error", async () => {
      mockDeleteLogoQuery.mockRejectedValue(new Error("DB error"));
      const req = createReq();
      const res = createRes();
      await deleteCompanyLogo(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });
});
