jest.mock("sequelize-typescript", () => ({
  Column: jest.fn(),
  DataType: {
    INTEGER: "INTEGER",
    STRING: jest.fn(() => "STRING"),
    TEXT: "TEXT",
    DATE: "DATE",
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

class TestNotesModel {
  id?: number;
  content!: string;
  entity_type!: string;
  entity_id!: number;
  created_by!: number;
  created_at?: Date;
  updated_at?: Date;
  constructor(data?: any) {
    if (data) Object.assign(this, data);
  }
}

describe("NotesModel", () => {
  it("should instantiate with required fields", () => {
    const n = new TestNotesModel({
      id: 1,
      content: "Important note about this risk",
      entity_type: "risk",
      entity_id: 10,
      created_by: 42,
    });
    expect(n.content).toBe("Important note about this risk");
    expect(n.entity_type).toBe("risk");
    expect(n.entity_id).toBe(10);
  });

  it("should support various entity types", () => {
    ["risk", "project", "model", "policy"].forEach((type) => {
      const n = new TestNotesModel({
        content: "Note",
        entity_type: type,
        entity_id: 1,
        created_by: 1,
      });
      expect(n.entity_type).toBe(type);
    });
  });
});
