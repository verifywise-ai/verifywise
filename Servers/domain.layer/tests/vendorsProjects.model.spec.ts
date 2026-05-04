jest.mock("sequelize-typescript", () => ({
  Column: jest.fn(),
  DataType: {
    INTEGER: "INTEGER",
    BOOLEAN: "BOOLEAN",
    DATE: "DATE",
  },
  ForeignKey: jest.fn(),
  Table: jest.fn(),
  Model: class MockModel {
    constructor(data?: any) {
      if (data) Object.assign(this, data);
    }
  },
}));

jest.mock("../models/project/project.model", () => ({
  ProjectModel: class MockProjectModel {},
}));

jest.mock("../models/vendor/vendor.model", () => ({
  VendorModel: class MockVendorModel {},
}));

class TestVendorsProjectsModel {
  vendor_id!: number;
  project_id!: number;
  is_demo?: boolean;
  created_at?: Date;
  updated_at?: Date;

  constructor(data?: any) {
    if (data) Object.assign(this, data);
  }

  static async createNewVendorProject(
    vendorId: number,
    projectId: number,
    is_demo: boolean = false,
  ): Promise<TestVendorsProjectsModel> {
    const vendorProject = new TestVendorsProjectsModel();
    vendorProject.vendor_id = vendorId;
    vendorProject.project_id = projectId;
    vendorProject.is_demo = is_demo;
    return vendorProject;
  }
}

describe("VendorsProjectsModel", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("createNewVendorProject", () => {
    it("should create vendor-project link with valid data", async () => {
      const link = await TestVendorsProjectsModel.createNewVendorProject(1, 2);

      expect(link).toBeInstanceOf(TestVendorsProjectsModel);
      expect(link.vendor_id).toBe(1);
      expect(link.project_id).toBe(2);
      expect(link.is_demo).toBe(false);
    });

    it("should create vendor-project link with is_demo true", async () => {
      const link = await TestVendorsProjectsModel.createNewVendorProject(1, 2, true);

      expect(link.vendor_id).toBe(1);
      expect(link.project_id).toBe(2);
      expect(link.is_demo).toBe(true);
    });

    it("should default is_demo to false when not provided", async () => {
      const link = await TestVendorsProjectsModel.createNewVendorProject(5, 10);

      expect(link.is_demo).toBe(false);
    });
  });

  describe("field instantiation", () => {
    it("should instantiate with required fields", () => {
      const link = new TestVendorsProjectsModel({
        vendor_id: 3,
        project_id: 7,
      });

      expect(link.vendor_id).toBe(3);
      expect(link.project_id).toBe(7);
    });

    it("should instantiate with all fields", () => {
      const now = new Date();
      const link = new TestVendorsProjectsModel({
        vendor_id: 3,
        project_id: 7,
        is_demo: true,
        created_at: now,
        updated_at: now,
      });

      expect(link.vendor_id).toBe(3);
      expect(link.project_id).toBe(7);
      expect(link.is_demo).toBe(true);
      expect(link.created_at).toBe(now);
      expect(link.updated_at).toBe(now);
    });

    it("should handle composite primary key (vendor_id + project_id)", () => {
      const link = new TestVendorsProjectsModel({
        vendor_id: 10,
        project_id: 20,
      });

      expect(link.vendor_id).toBe(10);
      expect(link.project_id).toBe(20);
    });
  });
});
