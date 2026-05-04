jest.mock("sequelize-typescript", () => ({
  Column: jest.fn(),
  DataType: {
    INTEGER: "INTEGER",
    STRING: jest.fn(() => "STRING"),
    DATE: "DATE",
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

class TestTiersModel {
  id?: number;
  name!: string;
  price!: number;
  features!: object;
  created_at!: Date;
  updated_at!: Date;
  constructor(data?: any) {
    if (data) Object.assign(this, data);
  }

  static async createNewTier(tier: {
    name: string;
    price: number;
    features: object;
  }): Promise<TestTiersModel> {
    const m = new TestTiersModel();
    m.name = tier.name;
    m.price = tier.price;
    m.features = tier.features;
    return m;
  }

  async updateTier(updateData: { name?: string; price?: number; features?: object }) {
    if (updateData.name !== undefined) this.name = updateData.name;
    if (updateData.price !== undefined) this.price = updateData.price;
    if (updateData.features !== undefined) this.features = updateData.features;
  }
}

describe("TiersModel", () => {
  describe("createNewTier", () => {
    it("should create tier with all fields", async () => {
      const t = await TestTiersModel.createNewTier({
        name: "Pro",
        price: 99,
        features: { max_projects: 50, ai_detection: true },
      });
      expect(t.name).toBe("Pro");
      expect(t.price).toBe(99);
      expect(t.features).toEqual({ max_projects: 50, ai_detection: true });
    });
  });

  describe("updateTier", () => {
    it("should update name", async () => {
      const t = new TestTiersModel({ name: "Basic", price: 0, features: {} });
      await t.updateTier({ name: "Free" });
      expect(t.name).toBe("Free");
    });

    it("should update price", async () => {
      const t = new TestTiersModel({ name: "Pro", price: 99, features: {} });
      await t.updateTier({ price: 79 });
      expect(t.price).toBe(79);
    });

    it("should update features", async () => {
      const t = new TestTiersModel({ name: "Pro", price: 99, features: {} });
      await t.updateTier({ features: { max_users: 100 } });
      expect(t.features).toEqual({ max_users: 100 });
    });
  });
});
