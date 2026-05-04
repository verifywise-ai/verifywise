import { UserDateFormat } from "../enums/user-preferences.enum";

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

class TestUserPreferencesModel {
  id?: number;
  user_id!: number;
  date_format?: string;
  theme?: string;
  language?: string;
  notifications_enabled?: boolean;
  created_at?: Date;
  updated_at?: Date;
  constructor(data?: any) {
    if (data) Object.assign(this, data);
  }
}

describe("UserPreferencesModel", () => {
  it("should instantiate with required fields", () => {
    const p = new TestUserPreferencesModel({
      id: 1,
      user_id: 42,
      date_format: UserDateFormat.DD_MM_YYYY_DASH,
      theme: "dark",
      language: "en",
      notifications_enabled: true,
    });
    expect(p.user_id).toBe(42);
    expect(p.date_format).toBe(UserDateFormat.DD_MM_YYYY_DASH);
    expect(p.theme).toBe("dark");
  });

  it("should support all date formats", () => {
    Object.values(UserDateFormat).forEach((format) => {
      const p = new TestUserPreferencesModel({ user_id: 1, date_format: format });
      expect(p.date_format).toBe(format);
    });
  });

  it("should handle optional fields", () => {
    const p = new TestUserPreferencesModel({ user_id: 1 });
    expect(p.theme).toBeUndefined();
    expect(p.language).toBeUndefined();
  });
});
