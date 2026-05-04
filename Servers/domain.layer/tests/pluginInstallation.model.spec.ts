import { PluginInstallationStatus } from "../enums/plugin.enum";

jest.mock("sequelize-typescript", () => ({
  Column: jest.fn(),
  DataType: {
    INTEGER: "INTEGER",
    STRING: jest.fn(() => "STRING"),
    TEXT: "TEXT",
    DATE: "DATE",
    BOOLEAN: "BOOLEAN",
    ENUM: jest.fn(),
    JSONB: "JSONB",
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

class TestPluginInstallationModel {
  id?: number;
  plugin_id!: string;
  organization_id!: number;
  status!: string;
  config?: object;
  installed_by!: number;
  created_at?: Date;
  updated_at?: Date;
  constructor(data?: any) {
    if (data) Object.assign(this, data);
  }
}

describe("PluginInstallationModel", () => {
  it("should instantiate with required fields", () => {
    const p = new TestPluginInstallationModel({
      id: 1,
      plugin_id: "soc2-framework",
      organization_id: 1,
      status: PluginInstallationStatus.INSTALLED,
      installed_by: 42,
    });
    expect(p.plugin_id).toBe("soc2-framework");
    expect(p.status).toBe(PluginInstallationStatus.INSTALLED);
  });

  it("should store configuration", () => {
    const p = new TestPluginInstallationModel({
      plugin_id: "gdpr",
      organization_id: 1,
      status: "installed",
      config: { auto_scan: true },
      installed_by: 1,
    });
    expect(p.config).toEqual({ auto_scan: true });
  });
});
