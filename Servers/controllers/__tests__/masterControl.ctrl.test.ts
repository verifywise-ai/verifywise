/**
 * Integration tests for `masterControl.ctrl.ts`.
 *
 * Approach: we mock the utils/services/history helpers and db transaction to
 * isolate the controller's HTTP-layer behaviour — status codes, input
 * validation, tenant scoping (organizationId is always forwarded from
 * req.organizationId), and the propagation decision tree.
 */

import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { Request, Response } from "express";

// ---------- Mocks ----------

const mockTransaction = {
  commit: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  rollback: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
};

jest.mock("../../database/db", () => ({
  sequelize: {
    transaction: jest.fn(() => Promise.resolve(mockTransaction)),
    query: jest.fn<any>(),
  },
}));

jest.mock("../../utils/logger/logHelper", () => ({
  logProcessing: jest.fn(),
  logSuccess: jest.fn<any>().mockResolvedValue(undefined),
  logFailure: jest.fn<any>().mockResolvedValue(undefined),
}));

jest.mock("../../utils/statusCode.utils", () => ({
  STATUS_CODE: {
    200: (data: any) => ({ message: "OK", data }),
    201: (data: any) => ({ message: "Created", data }),
    400: (data: any) => ({ message: "Bad Request", data }),
    403: (data: any) => ({ message: "Forbidden", data }),
    404: (data: any) => ({ message: "Not Found", data }),
    500: (data: any) => ({ message: "Internal Server Error", data }),
  },
}));

jest.mock("../../utils/masterControl.utils", () => ({
  getAllMasterControlsQuery: jest.fn<any>(),
  getMasterControlByIdQuery: jest.fn<any>(),
  createMasterControlQuery: jest.fn<any>(),
  updateMasterControlQuery: jest.fn<any>(),
  deleteMasterControlQuery: jest.fn<any>(),
  getMappingsForMasterQuery: jest.fn<any>(),
  createMappingQuery: jest.fn<any>(),
  deleteMappingQuery: jest.fn<any>(),
}));

jest.mock("../../services/masterControlPropagation.service", () => ({
  hasPropagatableChanges: jest.fn<any>(),
  previewPropagation: jest.fn<any>(),
  propagateMasterControlUpdate: jest.fn<any>(),
  PropagationError: class PropagationError extends Error {
    constructor(message: string, public readonly context: any) {
      super(message);
      this.name = "PropagationError";
    }
  },
}));

jest.mock("../../utils/changeHistory.base.utils", () => ({
  recordEntityChange: jest.fn<any>().mockResolvedValue(undefined),
  recordEntityCreation: jest.fn<any>().mockResolvedValue(undefined),
  recordEntityDeletion: jest.fn<any>().mockResolvedValue(undefined),
  recordMultipleFieldChanges: jest.fn<any>().mockResolvedValue(undefined),
  trackEntityChanges: jest.fn<any>().mockResolvedValue([]),
}));

// The domain model validates payloads; we stub the factory + instance so the
// controller's transactional flow is exercised without pulling in the full
// model (which is covered by its own unit tests).
jest.mock(
  "../../domain.layer/models/masterControl/masterControl.model",
  () => {
    const validateMasterControlData = jest
      .fn<() => Promise<void>>()
      .mockResolvedValue(undefined);
    const updateMasterControl = jest
      .fn<() => Promise<void>>()
      .mockResolvedValue(undefined);

    class MasterControlModel {
      static createNewMasterControl = jest.fn<any>((title: string) => {
        const instance: any = {
          title,
          validateMasterControlData,
          updateMasterControl,
          canBeModified: () => true,
        };
        return Promise.resolve(instance);
      });
      // Imitate `new MasterControlModel(row)` by copying fields + attaching
      // instance helpers whose behaviour is overridden per-test when needed.
      constructor(row: any) {
        Object.assign(this, row);
        (this as any).canBeModified = () => {
          if (row?.is_demo) {
            const { BusinessLogicException } = require("../../domain.layer/exceptions/custom.exception");
            throw new BusinessLogicException(
              "Demo master controls cannot be modified"
            );
          }
          return true;
        };
        (this as any).updateMasterControl = updateMasterControl;
        (this as any).validateMasterControlData = validateMasterControlData;
      }
    }
    return { MasterControlModel };
  }
);

jest.mock(
  "../../domain.layer/models/masterControl/masterControlMapping.model",
  () => {
    class MasterControlFrameworkMappingModel {
      static createNewMapping = jest.fn<any>(
        (
          master_control_id: number,
          framework: string,
          framework_entity_type: string,
          framework_entity_id: number
        ) =>
          Promise.resolve({
            master_control_id,
            framework,
            framework_entity_type,
            framework_entity_id,
            toKey: () =>
              `${framework}:${framework_entity_type}:${framework_entity_id}`,
          })
      );
    }
    return { MasterControlFrameworkMappingModel };
  }
);

jest.mock("../../services/masterControlExport.service", () => ({
  buildMasterControlsCsv: jest.fn<any>(),
}));

jest.mock("../../services/masterControlSeed.service", () => ({
  importRecommendedMasterControls: jest.fn<any>(),
}));

// ---------- Imports after mocks ----------

import {
  addMasterControlMapping,
  bulkUpdateMasterControls,
  createMasterControl,
  deleteMasterControl,
  deleteMasterControlMapping,
  exportMasterControlsCsv,
  getAllMasterControls,
  getMasterControlById,
  getMasterControlMappings,
  getMasterControlPropagationPreview,
  importRecommendedMappings,
  updateMasterControl,
} from "../masterControl.ctrl";
import {
  createMappingQuery,
  createMasterControlQuery,
  deleteMappingQuery,
  deleteMasterControlQuery,
  getAllMasterControlsQuery,
  getMappingsForMasterQuery,
  getMasterControlByIdQuery,
  updateMasterControlQuery,
} from "../../utils/masterControl.utils";
import {
  hasPropagatableChanges,
  previewPropagation,
  propagateMasterControlUpdate,
} from "../../services/masterControlPropagation.service";
import { buildMasterControlsCsv } from "../../services/masterControlExport.service";
import { importRecommendedMasterControls } from "../../services/masterControlSeed.service";

// Use `any`-typed mock wrappers so callers can supply arbitrary resolved
// values without fighting jest's overly-precise generic inference.
const mUtils = {
  getAll: getAllMasterControlsQuery as any,
  getById: getMasterControlByIdQuery as any,
  create: createMasterControlQuery as any,
  update: updateMasterControlQuery as any,
  del: deleteMasterControlQuery as any,
  getMappings: getMappingsForMasterQuery as any,
  createMapping: createMappingQuery as any,
  deleteMapping: deleteMappingQuery as any,
};
const mSvc = {
  hasChanges: hasPropagatableChanges as any,
  preview: previewPropagation as any,
  propagate: propagateMasterControlUpdate as any,
  buildCsv: buildMasterControlsCsv as any,
  importSeed: importRecommendedMasterControls as any,
};

function mkReq(overrides: Partial<Request> = {}): Request {
  return {
    userId: 7,
    organizationId: 42,
    params: {},
    body: {},
    ...overrides,
  } as unknown as Request;
}
function mkRes(): Response {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  res.setHeader = jest.fn().mockReturnValue(res);
  return res as Response;
}

// ---------- Tests ----------

describe("masterControl.ctrl", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTransaction.commit.mockResolvedValue(undefined);
    mockTransaction.rollback.mockResolvedValue(undefined);
  });

  // ----- getAllMasterControls -----
  describe("getAllMasterControls", () => {
    it("returns 200 with rows filtered by the authenticated organization", async () => {
      const rows = [{ id: 1, title: "a" }];
      mUtils.getAll.mockResolvedValue(rows);
      const req = mkReq({ organizationId: 42 } as any);
      const res = mkRes();

      await getAllMasterControls(req, res);

      expect(mUtils.getAll).toHaveBeenCalledWith(42);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ message: "OK", data: rows });
    });

    it("returns 500 on unexpected error", async () => {
      mUtils.getAll.mockRejectedValue(new Error("boom"));
      const res = mkRes();
      await getAllMasterControls(mkReq(), res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  // ----- getMasterControlById -----
  describe("getMasterControlById", () => {
    it("returns 400 for non-numeric id", async () => {
      const res = mkRes();
      await getMasterControlById(mkReq({ params: { id: "abc" } } as any), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("returns 404 when not found", async () => {
      mUtils.getById.mockResolvedValue(null);
      const res = mkRes();
      await getMasterControlById(mkReq({ params: { id: "5" } } as any), res);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(mUtils.getById).toHaveBeenCalledWith(5, 42);
    });

    it("returns 200 with row when found", async () => {
      const row = { id: 5, title: "x" };
      mUtils.getById.mockResolvedValue(row);
      const res = mkRes();
      await getMasterControlById(mkReq({ params: { id: "5" } } as any), res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ message: "OK", data: row });
    });
  });

  // ----- createMasterControl -----
  describe("createMasterControl", () => {
    it("returns 201 with created row and commits transaction", async () => {
      const created = { id: 99, title: "New" };
      mUtils.create.mockResolvedValue(created);
      const res = mkRes();

      await createMasterControl(
        mkReq({ body: { title: "New" } } as any),
        res
      );

      expect(mUtils.create).toHaveBeenCalledWith(
        expect.objectContaining({ title: "New" }),
        42,
        mockTransaction
      );
      expect(mockTransaction.commit).toHaveBeenCalled();
      expect(mockTransaction.rollback).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(201);
    });

    it("rolls back and returns 500 on query error", async () => {
      mUtils.create.mockRejectedValue(new Error("db"));
      const res = mkRes();
      await createMasterControl(
        mkReq({ body: { title: "New" } } as any),
        res
      );
      expect(mockTransaction.rollback).toHaveBeenCalled();
      expect(mockTransaction.commit).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  // ----- updateMasterControl -----
  describe("updateMasterControl", () => {
    it("returns 400 for invalid id", async () => {
      const res = mkRes();
      await updateMasterControl(
        mkReq({ params: { id: "abc" }, body: {} } as any),
        res
      );
      expect(res.status).toHaveBeenCalledWith(400);
      expect(mockTransaction.rollback).toHaveBeenCalled();
    });

    it("returns 404 when master control missing", async () => {
      mUtils.getById.mockResolvedValue(null);
      const res = mkRes();
      await updateMasterControl(
        mkReq({ params: { id: "5" }, body: { title: "x" } } as any),
        res
      );
      expect(res.status).toHaveBeenCalledWith(404);
      expect(mockTransaction.rollback).toHaveBeenCalled();
    });

    it("returns 403 when target row is demo", async () => {
      mUtils.getById.mockResolvedValue({ id: 5, is_demo: true });
      const res = mkRes();
      await updateMasterControl(
        mkReq({ params: { id: "5" }, body: { title: "x" } } as any),
        res
      );
      expect(res.status).toHaveBeenCalledWith(403);
      expect(mockTransaction.rollback).toHaveBeenCalled();
    });

    it("skips propagation when no trackable field changed", async () => {
      mUtils.getById.mockResolvedValue({
        id: 5,
        status: "Waiting",
        owner: 1,
        is_demo: false,
      });
      mUtils.update.mockResolvedValue({ id: 5, status: "Waiting" });
      mSvc.hasChanges.mockReturnValue(false);
      const res = mkRes();

      await updateMasterControl(
        mkReq({ params: { id: "5" }, body: { title: "renamed" } } as any),
        res
      );

      expect(mSvc.propagate).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: "OK",
        data: expect.objectContaining({ propagation: [] }),
      });
    });

    it("propagates when a trackable field changed and commits", async () => {
      mUtils.getById.mockResolvedValue({
        id: 5,
        status: "Waiting",
        owner: 1,
        is_demo: false,
      });
      mUtils.update.mockResolvedValue({ id: 5, status: "Done" });
      mSvc.hasChanges.mockReturnValue(true);
      mSvc.propagate.mockResolvedValue([
        { mappingId: 1, rowsUpdated: 3, skipped: false },
      ]);
      const res = mkRes();

      await updateMasterControl(
        mkReq({ params: { id: "5" }, body: { status: "Done" } } as any),
        res
      );

      // payload built from the DIFF — status changed, owner didn't.
      expect(mSvc.propagate).toHaveBeenCalledWith(
        5,
        42,
        { status: "Done" },
        mockTransaction
      );
      expect(mockTransaction.commit).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("returns 502 and rolls back on PropagationError", async () => {
      const {
        PropagationError,
      } = require("../../services/masterControlPropagation.service");
      mUtils.getById.mockResolvedValue({
        id: 5,
        status: "Waiting",
        is_demo: false,
      });
      mUtils.update.mockResolvedValue({ id: 5, status: "Done" });
      mSvc.hasChanges.mockReturnValue(true);
      mSvc.propagate.mockRejectedValue(
        new PropagationError("failed", { masterControlId: 5 })
      );
      const res = mkRes();

      await updateMasterControl(
        mkReq({ params: { id: "5" }, body: { status: "Done" } } as any),
        res
      );

      expect(mockTransaction.rollback).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(502);
    });
  });

  // ----- deleteMasterControl -----
  describe("deleteMasterControl", () => {
    it("returns 404 when not found", async () => {
      mUtils.getById.mockResolvedValue(null);
      const res = mkRes();
      await deleteMasterControl(mkReq({ params: { id: "5" } } as any), res);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it("returns 403 when demo", async () => {
      mUtils.getById.mockResolvedValue({ id: 5, is_demo: true });
      const res = mkRes();
      await deleteMasterControl(mkReq({ params: { id: "5" } } as any), res);
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it("returns 200 on success", async () => {
      mUtils.getById.mockResolvedValue({ id: 5, is_demo: false });
      mUtils.del.mockResolvedValue(true);
      const res = mkRes();
      await deleteMasterControl(mkReq({ params: { id: "5" } } as any), res);
      expect(mUtils.del).toHaveBeenCalledWith(5, 42, mockTransaction);
      expect(mockTransaction.commit).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  // ----- mappings -----
  describe("getMasterControlMappings", () => {
    it("returns 404 if parent missing", async () => {
      mUtils.getById.mockResolvedValue(null);
      const res = mkRes();
      await getMasterControlMappings(
        mkReq({ params: { id: "5" } } as any),
        res
      );
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it("returns 200 with mappings list", async () => {
      mUtils.getById.mockResolvedValue({ id: 5 });
      mUtils.getMappings.mockResolvedValue([{ id: 1 }]);
      const res = mkRes();
      await getMasterControlMappings(
        mkReq({ params: { id: "5" } } as any),
        res
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: "OK",
        data: [{ id: 1 }],
      });
    });
  });

  describe("addMasterControlMapping", () => {
    it("returns 201 on new mapping", async () => {
      mUtils.getById.mockResolvedValue({ id: 5, is_demo: false });
      const created = { id: 10 };
      mUtils.createMapping.mockResolvedValue(created);
      const res = mkRes();
      await addMasterControlMapping(
        mkReq({
          params: { id: "5" },
          body: {
            framework: "eu_ai_act",
            framework_entity_type: "control_eu",
            framework_entity_id: 1,
          },
        } as any),
        res
      );
      expect(res.status).toHaveBeenCalledWith(201);
      expect(mockTransaction.commit).toHaveBeenCalled();
    });

    it("returns 200 with duplicate=true on ON CONFLICT DO NOTHING", async () => {
      mUtils.getById.mockResolvedValue({ id: 5, is_demo: false });
      mUtils.createMapping.mockResolvedValue(undefined);
      const res = mkRes();
      await addMasterControlMapping(
        mkReq({
          params: { id: "5" },
          body: {
            framework: "eu_ai_act",
            framework_entity_type: "control_eu",
            framework_entity_id: 1,
          },
        } as any),
        res
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: "OK",
        data: { duplicate: true },
      });
    });

    it("returns 403 when parent is demo", async () => {
      mUtils.getById.mockResolvedValue({ id: 5, is_demo: true });
      const res = mkRes();
      await addMasterControlMapping(
        mkReq({
          params: { id: "5" },
          body: {
            framework: "eu_ai_act",
            framework_entity_type: "control_eu",
            framework_entity_id: 1,
          },
        } as any),
        res
      );
      expect(res.status).toHaveBeenCalledWith(403);
      expect(mockTransaction.rollback).toHaveBeenCalled();
    });
  });

  describe("deleteMasterControlMapping", () => {
    it("returns 404 when mapping missing", async () => {
      mUtils.deleteMapping.mockResolvedValue(null);
      const res = mkRes();
      await deleteMasterControlMapping(
        mkReq({ params: { mappingId: "9" } } as any),
        res
      );
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it("returns 200 on success", async () => {
      mUtils.deleteMapping.mockResolvedValue({
        id: 9,
        master_control_id: 5,
        framework: "eu_ai_act",
        framework_entity_type: "control_eu",
        framework_entity_id: 1,
      });
      mUtils.getById.mockResolvedValue({ id: 5, is_demo: false });
      const res = mkRes();
      await deleteMasterControlMapping(
        mkReq({ params: { mappingId: "9" } } as any),
        res
      );
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("returns 403 when parent is demo", async () => {
      mUtils.deleteMapping.mockResolvedValue({
        id: 9,
        master_control_id: 5,
        framework: "eu_ai_act",
        framework_entity_type: "control_eu",
        framework_entity_id: 1,
      });
      mUtils.getById.mockResolvedValue({ id: 5, is_demo: true });
      const res = mkRes();
      await deleteMasterControlMapping(
        mkReq({ params: { mappingId: "9" } } as any),
        res
      );
      expect(res.status).toHaveBeenCalledWith(403);
      expect(mockTransaction.rollback).toHaveBeenCalled();
    });
  });

  describe("getMasterControlPropagationPreview", () => {
    it("returns 404 when parent missing", async () => {
      mUtils.getById.mockResolvedValue(null);
      const res = mkRes();
      await getMasterControlPropagationPreview(
        mkReq({ params: { id: "5" }, body: { status: "Done" } } as any),
        res
      );
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it("returns 200 with preview result", async () => {
      mUtils.getById.mockResolvedValue({ id: 5, is_demo: false });
      mSvc.preview.mockResolvedValue([{ mappingId: 1, rowsUpdated: 2 }]);
      const res = mkRes();
      await getMasterControlPropagationPreview(
        mkReq({ params: { id: "5" }, body: { status: "Done" } } as any),
        res
      );
      expect(mSvc.preview).toHaveBeenCalledWith(5, 42, { status: "Done" });
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  // ----- bulkUpdateMasterControls -----
  describe("bulkUpdateMasterControls", () => {
    it("returns 400 when ids is missing", async () => {
      const res = mkRes();
      await bulkUpdateMasterControls(
        mkReq({ body: { patch: { status: "Done" } } } as any),
        res
      );
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        message: "Bad Request",
        data: "ids must be a non-empty array",
      });
    });

    it("returns 400 when ids is empty", async () => {
      const res = mkRes();
      await bulkUpdateMasterControls(
        mkReq({ body: { ids: [], patch: { status: "Done" } } } as any),
        res
      );
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("returns 400 when any id is non-positive", async () => {
      const res = mkRes();
      await bulkUpdateMasterControls(
        mkReq({
          body: { ids: [1, 0], patch: { status: "Done" } },
        } as any),
        res
      );
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        message: "Bad Request",
        data: "ids must all be positive integers",
      });
    });

    it("returns 400 when patch is empty", async () => {
      const res = mkRes();
      await bulkUpdateMasterControls(
        mkReq({ body: { ids: [1, 2], patch: {} } } as any),
        res
      );
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        message: "Bad Request",
        data: "patch body is required",
      });
    });

    it("returns per-row results with a 'Not found' failure for missing rows", async () => {
      mUtils.getById.mockResolvedValueOnce(null);
      const res = mkRes();

      await bulkUpdateMasterControls(
        mkReq({ body: { ids: [99], patch: { status: "Done" } } } as any),
        res
      );

      expect(res.status).toHaveBeenCalledWith(200);
      const payload = (res.json as any).mock.calls[0][0].data;
      expect(payload.results).toEqual([
        { id: 99, success: false, error: "Not found" },
      ]);
      expect(payload.summary).toEqual({ total: 1, updated: 0, failed: 1 });
      expect(mockTransaction.rollback).toHaveBeenCalled();
    });

    it("records a failure when the row is a demo master control", async () => {
      mUtils.getById.mockResolvedValue({ id: 1, is_demo: true });
      const res = mkRes();

      await bulkUpdateMasterControls(
        mkReq({ body: { ids: [1], patch: { status: "Done" } } } as any),
        res
      );

      expect(res.status).toHaveBeenCalledWith(200);
      const payload = (res.json as any).mock.calls[0][0].data;
      expect(payload.results[0].success).toBe(false);
      expect(payload.results[0].error).toContain("Demo");
      expect(payload.summary).toEqual({ total: 1, updated: 0, failed: 1 });
    });

    it("propagates when a trackable field actually changed and reports success", async () => {
      mUtils.getById.mockResolvedValue({
        id: 5,
        status: "Waiting",
        owner: 1,
        is_demo: false,
      });
      mUtils.update.mockResolvedValue({ id: 5, status: "Done" });
      mSvc.hasChanges.mockReturnValue(true);
      mSvc.propagate.mockResolvedValue([
        { mappingId: 1, rowsUpdated: 2, skipped: false },
      ]);
      const res = mkRes();

      await bulkUpdateMasterControls(
        mkReq({
          body: { ids: [5], patch: { status: "Done" } },
        } as any),
        res
      );

      expect(mSvc.propagate).toHaveBeenCalledWith(
        5,
        42,
        { status: "Done" },
        mockTransaction
      );
      expect(mockTransaction.commit).toHaveBeenCalled();
      const payload = (res.json as any).mock.calls[0][0].data;
      expect(payload.results[0].success).toBe(true);
      expect(payload.results[0].propagation).toHaveLength(1);
      expect(payload.summary).toEqual({ total: 1, updated: 1, failed: 0 });
    });

    it("skips propagation when no trackable field changed", async () => {
      mUtils.getById.mockResolvedValue({
        id: 5,
        status: "Waiting",
        is_demo: false,
      });
      mUtils.update.mockResolvedValue({ id: 5, status: "Waiting" });
      mSvc.hasChanges.mockReturnValue(false);
      const res = mkRes();

      await bulkUpdateMasterControls(
        mkReq({
          body: { ids: [5], patch: { title: "renamed" } },
        } as any),
        res
      );

      expect(mSvc.propagate).not.toHaveBeenCalled();
      const payload = (res.json as any).mock.calls[0][0].data;
      expect(payload.results[0].success).toBe(true);
      expect(payload.results[0].propagation).toEqual([]);
    });

    it("mixes success + failure rows without one poisoning the other", async () => {
      // Row 1 succeeds, row 2 is not-found.
      mUtils.getById
        .mockResolvedValueOnce({ id: 1, status: "Waiting", is_demo: false })
        .mockResolvedValueOnce(null);
      mUtils.update.mockResolvedValueOnce({ id: 1, status: "Done" });
      mSvc.hasChanges.mockReturnValue(true);
      mSvc.propagate.mockResolvedValue([]);
      const res = mkRes();

      await bulkUpdateMasterControls(
        mkReq({
          body: { ids: [1, 2], patch: { status: "Done" } },
        } as any),
        res
      );

      const payload = (res.json as any).mock.calls[0][0].data;
      expect(payload.summary).toEqual({ total: 2, updated: 1, failed: 1 });
      expect(payload.results[0]).toEqual(
        expect.objectContaining({ id: 1, success: true })
      );
      expect(payload.results[1]).toEqual({
        id: 2,
        success: false,
        error: "Not found",
      });
    });

    it("forwards req.organizationId into every update call", async () => {
      mUtils.getById.mockResolvedValue({
        id: 5,
        status: "Waiting",
        is_demo: false,
      });
      mUtils.update.mockResolvedValue({ id: 5, status: "Done" });
      mSvc.hasChanges.mockReturnValue(false);
      const res = mkRes();

      await bulkUpdateMasterControls(
        mkReq({
          organizationId: 99,
          body: { ids: [5], patch: { title: "renamed" } },
        } as any),
        res
      );

      expect(mUtils.getById).toHaveBeenCalledWith(5, 99);
      expect(mUtils.update).toHaveBeenCalledWith(
        5,
        expect.anything(),
        99,
        mockTransaction
      );
    });
  });

  // ----- exportMasterControlsCsv -----
  describe("exportMasterControlsCsv", () => {
    it("returns 200 with CSV body and download headers", async () => {
      const csv = "id,title\r\n1,Hello";
      mSvc.buildCsv.mockResolvedValue(csv);
      const res = mkRes();

      await exportMasterControlsCsv(mkReq(), res);

      expect(mSvc.buildCsv).toHaveBeenCalledWith(42);
      expect(res.setHeader).toHaveBeenCalledWith(
        "Content-Type",
        "text/csv; charset=utf-8"
      );
      expect(res.setHeader).toHaveBeenCalledWith(
        "Content-Disposition",
        expect.stringMatching(
          /^attachment; filename="master-controls-\d{4}-\d{2}-\d{2}\.csv"$/
        )
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.send).toHaveBeenCalledWith(csv);
    });

    it("returns 500 on build failure", async () => {
      mSvc.buildCsv.mockRejectedValue(new Error("boom"));
      const res = mkRes();

      await exportMasterControlsCsv(mkReq(), res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        message: "Internal Server Error",
        data: "boom",
      });
    });

    it("forwards req.organizationId to the export service", async () => {
      mSvc.buildCsv.mockResolvedValue("");
      await exportMasterControlsCsv(
        mkReq({ organizationId: 99 } as any),
        mkRes()
      );
      expect(mSvc.buildCsv).toHaveBeenCalledWith(99);
    });
  });

  // ----- importRecommendedMappings -----
  describe("importRecommendedMappings", () => {
    it("returns 201 with the import summary on success", async () => {
      const summary = {
        mastersCreated: 3,
        mastersSkipped: 0,
        mappingsCreated: 5,
        mappingsSkipped: 2,
        skippedCodes: [
          { code: "EU AI Act Article 9", reason: "unsupported" },
        ],
      };
      mSvc.importSeed.mockResolvedValue(summary);
      const res = mkRes();

      await importRecommendedMappings(mkReq(), res);

      expect(mSvc.importSeed).toHaveBeenCalledWith(42);
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        message: "Created",
        data: summary,
      });
    });

    it("returns 500 when the seed service throws", async () => {
      mSvc.importSeed.mockRejectedValue(new Error("seed failed"));
      const res = mkRes();

      await importRecommendedMappings(mkReq(), res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        message: "Internal Server Error",
        data: "seed failed",
      });
    });

    it("forwards req.organizationId to the seed service", async () => {
      mSvc.importSeed.mockResolvedValue({
        mastersCreated: 0,
        mastersSkipped: 0,
        mappingsCreated: 0,
        mappingsSkipped: 0,
        skippedCodes: [],
      });
      await importRecommendedMappings(
        mkReq({ organizationId: 99 } as any),
        mkRes()
      );
      expect(mSvc.importSeed).toHaveBeenCalledWith(99);
    });
  });

  // ----- Multi-tenant isolation smoke tests -----
  describe("multi-tenant isolation", () => {
    it("forwards req.organizationId to every utils call (getAll)", async () => {
      mUtils.getAll.mockResolvedValue([]);
      await getAllMasterControls(mkReq({ organizationId: 99 } as any), mkRes());
      expect(mUtils.getAll).toHaveBeenCalledWith(99);
    });

    it("forwards req.organizationId to every utils call (getById)", async () => {
      mUtils.getById.mockResolvedValue({ id: 1 });
      await getMasterControlById(
        mkReq({ organizationId: 99, params: { id: "1" } } as any),
        mkRes()
      );
      expect(mUtils.getById).toHaveBeenCalledWith(1, 99);
    });

    it("forwards req.organizationId through create", async () => {
      mUtils.create.mockResolvedValue({ id: 1, title: "x" });
      await createMasterControl(
        mkReq({ organizationId: 99, body: { title: "x" } } as any),
        mkRes()
      );
      expect(mUtils.create).toHaveBeenCalledWith(
        expect.anything(),
        99,
        mockTransaction
      );
    });

    it("forwards req.organizationId through delete", async () => {
      mUtils.getById.mockResolvedValue({ id: 1, is_demo: false });
      mUtils.del.mockResolvedValue(true);
      await deleteMasterControl(
        mkReq({ organizationId: 99, params: { id: "1" } } as any),
        mkRes()
      );
      expect(mUtils.del).toHaveBeenCalledWith(1, 99, mockTransaction);
    });
  });
});
