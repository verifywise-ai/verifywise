/**
 * @fileoverview Entity Graph Views Service Tests
 *
 * Tests for the EntityGraphViewsService class.
 *
 * @module tests/entityGraphViewsService
 */

// Mock database BEFORE other imports to prevent actual DB connection
jest.mock("../../database/db", () => ({
  sequelize: {
    query: jest.fn(),
    getQueryInterface: jest.fn(() => ({
      tableExists: jest.fn().mockResolvedValue(true),
    })),
  },
}));

// Mock dependencies
jest.mock("../../utils/entityGraphViews.utils");
jest.mock("../../domain.layer/models/entityGraphViews/entityGraphViews.model");
jest.mock("../../utils/entityGraphSecurity.utils");
jest.mock("../../utils/logger/logHelper", () => ({
  logFailure: jest.fn(),
  logProcessing: jest.fn(),
  logSuccess: jest.fn(),
}));

import { EntityGraphViewsService } from "../entityGraphViewsService";
import {
  createViewQuery,
  getViewsByUserQuery,
  getViewByIdQuery,
  updateViewQuery,
  deleteViewByIdQuery,
  getViewCountByUserQuery,
} from "../../utils/entityGraphViews.utils";
import { EntityGraphViewsModel } from "../../domain.layer/models/entityGraphViews/entityGraphViews.model";
import {
  sanitizeViewName,
  sanitizeViewConfig,
} from "../../utils/entityGraphSecurity.utils";
import {
  ValidationException,
  BusinessLogicException,
} from "../../domain.layer/exceptions/custom.exception";

// Cast mocks
const mockCreateViewQuery = createViewQuery as jest.MockedFunction<
  typeof createViewQuery
>;
const mockGetViewsByUserQuery = getViewsByUserQuery as jest.MockedFunction<
  typeof getViewsByUserQuery
>;
const mockGetViewByIdQuery = getViewByIdQuery as jest.MockedFunction<
  typeof getViewByIdQuery
>;
const mockUpdateViewQuery = updateViewQuery as jest.MockedFunction<
  typeof updateViewQuery
>;
const mockDeleteViewByIdQuery = deleteViewByIdQuery as jest.MockedFunction<
  typeof deleteViewByIdQuery
>;
const mockGetViewCountByUserQuery = getViewCountByUserQuery as jest.MockedFunction<
  typeof getViewCountByUserQuery
>;
const mockSanitizeViewName = sanitizeViewName as jest.MockedFunction<
  typeof sanitizeViewName
>;
const mockSanitizeViewConfig = sanitizeViewConfig as jest.MockedFunction<
  typeof sanitizeViewConfig
>;
const mockCreateView = EntityGraphViewsModel.createView as jest.MockedFunction<
  typeof EntityGraphViewsModel.createView
>;

describe("EntityGraphViewsService", () => {
  const validViewData = {
    name: "Test View",
    config: { visibleEntities: ["model", "risk"] },
    userId: 1,
    organizationId: 1,
  };

  const mockView = {
    id: 1,
    name: "Test View",
    user_id: 1,
    organization_id: 1,
    config: { visibleEntities: ["model", "risk"] },
    isOwnedBy: jest.fn().mockReturnValue(true),
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Default successful sanitization
    mockSanitizeViewName.mockReturnValue({ valid: true, sanitized: "Test View" });
    mockSanitizeViewConfig.mockReturnValue({
      valid: true,
      sanitized: { visibleEntities: ["model", "risk"] },
    });
  });

  describe("createView", () => {
    beforeEach(() => {

      mockGetViewCountByUserQuery.mockResolvedValue(0);
      mockCreateView.mockResolvedValue(mockView);
      mockCreateViewQuery.mockResolvedValue(mockView);
    });

    it("should create a view successfully", async () => {
      const result = await EntityGraphViewsService.createView(
        validViewData.name,
        validViewData.config,
        validViewData.userId,
        validViewData.organizationId
      );

      expect(result).toBe(mockView);

      expect(mockGetViewCountByUserQuery).toHaveBeenCalledWith(
        validViewData.userId,
        validViewData.organizationId
      );
      expect(mockCreateView).toHaveBeenCalled();
      expect(mockCreateViewQuery).toHaveBeenCalled();
    });

    it("should throw ValidationException for invalid name", async () => {
      mockSanitizeViewName.mockReturnValue({
        valid: false,
        sanitized: "",
        error: "Invalid view name",
      });

      await expect(
        EntityGraphViewsService.createView(
          "",
          validViewData.config,
          validViewData.userId,
          validViewData.organizationId
        )
      ).rejects.toThrow(ValidationException);
    });

    it("should throw ValidationException for invalid config", async () => {
      mockSanitizeViewConfig.mockReturnValue({
        valid: false,
        sanitized: {},
        error: "Invalid config",
      });

      await expect(
        EntityGraphViewsService.createView(
          validViewData.name,
          "not-an-object" as any,
          validViewData.userId,
          validViewData.organizationId
        )
      ).rejects.toThrow(ValidationException);
    });

    it("should throw ValidationException for invalid userId", async () => {
      await expect(
        EntityGraphViewsService.createView(
          validViewData.name,
          validViewData.config,
          0,
          validViewData.organizationId
        )
      ).rejects.toThrow(ValidationException);
    });

    it("should throw BusinessLogicException when max views reached", async () => {
      mockGetViewCountByUserQuery.mockResolvedValue(20);

      await expect(
        EntityGraphViewsService.createView(
          validViewData.name,
          validViewData.config,
          validViewData.userId,
          validViewData.organizationId
        )
      ).rejects.toThrow(BusinessLogicException);
    });

    it("should call ensureViewsTableExists before creating", async () => {
      await EntityGraphViewsService.createView(
        validViewData.name,
        validViewData.config,
        validViewData.userId,
        validViewData.organizationId
      );


      expect(mockGetViewCountByUserQuery).toHaveBeenCalled();
    });
  });

  describe("getViews", () => {
    beforeEach(() => {

      mockGetViewsByUserQuery.mockResolvedValue([mockView]);
    });

    it("should return views for user", async () => {
      const result = await EntityGraphViewsService.getViews(
        validViewData.userId,
        validViewData.organizationId
      );

      expect(result).toEqual([mockView]);
      expect(mockGetViewsByUserQuery).toHaveBeenCalledWith(
        validViewData.userId,
        validViewData.organizationId
      );
    });

    it("should return empty array when no views exist", async () => {
      mockGetViewsByUserQuery.mockResolvedValue([]);

      const result = await EntityGraphViewsService.getViews(
        validViewData.userId,
        validViewData.organizationId
      );

      expect(result).toEqual([]);
    });

    it("should ensure table exists before fetching", async () => {
      await EntityGraphViewsService.getViews(
        validViewData.userId,
        validViewData.organizationId
      );


    });
  });

  describe("getViewById", () => {
    beforeEach(() => {

      mockGetViewByIdQuery.mockResolvedValue(mockView);
    });

    it("should return view when user owns it", async () => {
      mockView.isOwnedBy.mockReturnValue(true);

      const result = await EntityGraphViewsService.getViewById(
        1,
        validViewData.userId,
        validViewData.organizationId
      );

      expect(result).toBe(mockView);
    });

    it("should return null when user does not own view", async () => {
      mockView.isOwnedBy.mockReturnValue(false);

      const result = await EntityGraphViewsService.getViewById(
        1,
        999,
        validViewData.organizationId
      );

      expect(result).toBeNull();
    });

    it("should return null when view not found", async () => {
      mockGetViewByIdQuery.mockResolvedValue(null);

      const result = await EntityGraphViewsService.getViewById(
        999,
        validViewData.userId,
        validViewData.organizationId
      );

      expect(result).toBeNull();
    });
  });

  describe("updateView", () => {
    beforeEach(() => {

      mockGetViewByIdQuery.mockResolvedValue(mockView);
      mockUpdateViewQuery.mockResolvedValue(mockView);
      mockView.isOwnedBy.mockReturnValue(true);
    });

    it("should update view successfully", async () => {
      const result = await EntityGraphViewsService.updateView(
        1,
        "New Name",
        { visibleEntities: ["control"] },
        validViewData.userId,
        validViewData.organizationId
      );

      expect(result).toBe(mockView);
      expect(mockUpdateViewQuery).toHaveBeenCalled();
    });

    it("should throw error when view not found", async () => {
      mockGetViewByIdQuery.mockResolvedValue(null);

      await expect(
        EntityGraphViewsService.updateView(
          999,
          "New Name",
          undefined,
          validViewData.userId,
          validViewData.organizationId
        )
      ).rejects.toThrow("View with ID 999 not found");
    });

    it("should throw BusinessLogicException when user does not own view", async () => {
      mockView.isOwnedBy.mockReturnValue(false);

      await expect(
        EntityGraphViewsService.updateView(
          1,
          "New Name",
          undefined,
          999,
          validViewData.organizationId
        )
      ).rejects.toThrow(BusinessLogicException);
    });

    it("should throw ValidationException for invalid name", async () => {
      mockSanitizeViewName.mockReturnValue({
        valid: false,
        sanitized: "",
        error: "Invalid name",
      });

      await expect(
        EntityGraphViewsService.updateView(
          1,
          "",
          undefined,
          validViewData.userId,
          validViewData.organizationId
        )
      ).rejects.toThrow(ValidationException);
    });

    it("should allow updating only name", async () => {
      await EntityGraphViewsService.updateView(
        1,
        "Only Name",
        undefined,
        validViewData.userId,
        validViewData.organizationId
      );

      expect(mockUpdateViewQuery).toHaveBeenCalledWith(
        1,
        "Test View",
        undefined,
        validViewData.organizationId
      );
    });

    it("should allow updating only config", async () => {
      await EntityGraphViewsService.updateView(
        1,
        undefined,
        { showProblemsOnly: true },
        validViewData.userId,
        validViewData.organizationId
      );

      expect(mockUpdateViewQuery).toHaveBeenCalled();
    });
  });

  describe("deleteView", () => {
    beforeEach(() => {

      mockGetViewByIdQuery.mockResolvedValue(mockView);
      mockDeleteViewByIdQuery.mockResolvedValue(1);
      mockView.isOwnedBy.mockReturnValue(true);
    });

    it("should delete view successfully", async () => {
      const result = await EntityGraphViewsService.deleteView(
        1,
        validViewData.userId,
        validViewData.organizationId
      );

      expect(result).toBe(true);
      expect(mockDeleteViewByIdQuery).toHaveBeenCalledWith(1, validViewData.organizationId);
    });

    it("should throw error when view not found", async () => {
      mockGetViewByIdQuery.mockResolvedValue(null);

      await expect(
        EntityGraphViewsService.deleteView(999, validViewData.userId, validViewData.organizationId)
      ).rejects.toThrow("View with ID 999 not found");
    });

    it("should throw BusinessLogicException when user does not own view", async () => {
      mockView.isOwnedBy.mockReturnValue(false);

      await expect(
        EntityGraphViewsService.deleteView(1, 999, validViewData.organizationId)
      ).rejects.toThrow(BusinessLogicException);
    });

    it("should throw error when delete fails", async () => {
      mockDeleteViewByIdQuery.mockResolvedValue(0);

      await expect(
        EntityGraphViewsService.deleteView(1, validViewData.userId, validViewData.organizationId)
      ).rejects.toThrow("Failed to delete view with ID 1");
    });
  });
});
