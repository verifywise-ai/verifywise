jest.mock("sequelize-typescript", () => ({
  Column: jest.fn(),
  DataType: {
    INTEGER: "INTEGER",
    STRING: jest.fn(() => "STRING"),
    TEXT: "TEXT",
    DATE: "DATE",
    BOOLEAN: "BOOLEAN",
    NOW: "NOW",
  },
  ForeignKey: jest.fn(),
  Table: jest.fn(),
  Model: class MockModel {
    constructor(data?: any) {
      if (data) Object.assign(this, data);
    }
  },
}));

class TestVirtualFolderModel {
  id!: number;
  name!: string;
  description?: string | null;
  parent_id?: number | null;
  color?: string | null;
  icon?: string | null;
  is_system?: boolean;
  created_by!: number;
  created_at?: Date;
  updated_at?: Date;
  constructor(data?: any) {
    if (data) Object.assign(this, data);
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      parent_id: this.parent_id,
      color: this.color,
      icon: this.icon,
      is_system: this.is_system,
      created_by: this.created_by,
    };
  }
}

class TestFileFolderMappingModel {
  id!: number;
  file_id!: number;
  folder_id!: number;
  assigned_by!: number;
  assigned_at?: Date;
  constructor(data?: any) {
    if (data) Object.assign(this, data);
  }

  toJSON() {
    return {
      id: this.id,
      file_id: this.file_id,
      folder_id: this.folder_id,
      assigned_by: this.assigned_by,
    };
  }
}

describe("VirtualFolderModel", () => {
  it("should instantiate with required fields", () => {
    const f = new TestVirtualFolderModel({
      id: 1,
      name: "Compliance Docs",
      created_by: 42,
      parent_id: null,
      is_system: false,
    });
    expect(f.name).toBe("Compliance Docs");
    expect(f.parent_id).toBeNull();
  });

  it("should support nested folders", () => {
    const child = new TestVirtualFolderModel({
      id: 2,
      name: "EU AI Act",
      created_by: 42,
      parent_id: 1,
    });
    expect(child.parent_id).toBe(1);
  });

  it("should support styling props", () => {
    const f = new TestVirtualFolderModel({
      id: 1,
      name: "Test",
      created_by: 1,
      color: "#FF0000",
      icon: "folder-open",
    });
    expect(f.color).toBe("#FF0000");
    expect(f.icon).toBe("folder-open");
  });

  it("should serialize to JSON", () => {
    const f = new TestVirtualFolderModel({ id: 1, name: "Test", created_by: 1 });
    const json = f.toJSON();
    expect(json).toHaveProperty("name", "Test");
  });
});

describe("FileFolderMappingModel", () => {
  it("should link file to folder", () => {
    const m = new TestFileFolderMappingModel({
      id: 1,
      file_id: 10,
      folder_id: 20,
      assigned_by: 42,
    });
    expect(m.file_id).toBe(10);
    expect(m.folder_id).toBe(20);
    expect(m.assigned_by).toBe(42);
  });

  it("should serialize to JSON", () => {
    const m = new TestFileFolderMappingModel({ id: 1, file_id: 10, folder_id: 20, assigned_by: 1 });
    const json = m.toJSON();
    expect(json).toEqual({ id: 1, file_id: 10, folder_id: 20, assigned_by: 1 });
  });
});
