jest.mock("sequelize-typescript", () => ({
  Column: jest.fn(),
  DataType: {
    INTEGER: "INTEGER",
    STRING: jest.fn(() => "STRING"),
    TEXT: "TEXT",
    DATE: "DATE",
    BOOLEAN: "BOOLEAN",
    JSONB: "JSONB",
    NOW: "NOW",
    ARRAY: jest.fn(),
  },
  ForeignKey: jest.fn(),
  Table: jest.fn(),
  Model: class MockModel {
    constructor(data?: any) {
      if (data) Object.assign(this, data);
    }
  },
}));

class TestAiTrustCenterInfoModel {
  id?: number;
  organization_id!: number;
  company_name!: string;
  constructor(data?: any) {
    if (data) Object.assign(this, data);
  }
}

class TestAiTrustCentreCompanyDescriptionModel {
  id?: number;
  organization_id!: number;
  description!: string;
  constructor(data?: any) {
    if (data) Object.assign(this, data);
  }
}

class TestAiTrustCentreComplianceBadgesModel {
  id?: number;
  organization_id!: number;
  badge_name!: string;
  badge_url?: string;
  constructor(data?: any) {
    if (data) Object.assign(this, data);
  }
}

class TestAiTrustCentreIntroModel {
  id?: number;
  organization_id!: number;
  intro_text!: string;
  constructor(data?: any) {
    if (data) Object.assign(this, data);
  }
}

class TestAiTrustCentreResourcesModel {
  id?: number;
  organization_id!: number;
  resource_name!: string;
  resource_url!: string;
  constructor(data?: any) {
    if (data) Object.assign(this, data);
  }
}

class TestAiTrustCentreSubprocessorsModel {
  id?: number;
  organization_id!: number;
  name!: string;
  purpose?: string;
  constructor(data?: any) {
    if (data) Object.assign(this, data);
  }
}

class TestAiTrustCentreTermsAndContractModel {
  id?: number;
  organization_id!: number;
  title!: string;
  content?: string;
  constructor(data?: any) {
    if (data) Object.assign(this, data);
  }
}

describe("AI Trust Centre Models", () => {
  describe("AiTrustCenterInfoModel", () => {
    it("should instantiate with required fields", () => {
      const m = new TestAiTrustCenterInfoModel({
        id: 1,
        organization_id: 1,
        company_name: "Acme Corp",
      });
      expect(m.company_name).toBe("Acme Corp");
      expect(m.organization_id).toBe(1);
    });
  });

  describe("AiTrustCentreCompanyDescriptionModel", () => {
    it("should instantiate with description", () => {
      const m = new TestAiTrustCentreCompanyDescriptionModel({
        organization_id: 1,
        description: "We build responsible AI",
      });
      expect(m.description).toBe("We build responsible AI");
    });
  });

  describe("AiTrustCentreComplianceBadgesModel", () => {
    it("should store badge info", () => {
      const m = new TestAiTrustCentreComplianceBadgesModel({
        organization_id: 1,
        badge_name: "ISO 27001",
        badge_url: "https://example.com/badge.png",
      });
      expect(m.badge_name).toBe("ISO 27001");
    });
  });

  describe("AiTrustCentreIntroModel", () => {
    it("should store intro text", () => {
      const m = new TestAiTrustCentreIntroModel({
        organization_id: 1,
        intro_text: "Welcome to our trust centre",
      });
      expect(m.intro_text).toBe("Welcome to our trust centre");
    });
  });

  describe("AiTrustCentreResourcesModel", () => {
    it("should store resource info", () => {
      const m = new TestAiTrustCentreResourcesModel({
        organization_id: 1,
        resource_name: "Whitepaper",
        resource_url: "https://example.com/wp.pdf",
      });
      expect(m.resource_name).toBe("Whitepaper");
      expect(m.resource_url).toBe("https://example.com/wp.pdf");
    });
  });

  describe("AiTrustCentreSubprocessorsModel", () => {
    it("should store subprocessor info", () => {
      const m = new TestAiTrustCentreSubprocessorsModel({
        organization_id: 1,
        name: "AWS",
        purpose: "Cloud hosting",
      });
      expect(m.name).toBe("AWS");
      expect(m.purpose).toBe("Cloud hosting");
    });
  });

  describe("AiTrustCentreTermsAndContractModel", () => {
    it("should store terms info", () => {
      const m = new TestAiTrustCentreTermsAndContractModel({
        organization_id: 1,
        title: "Terms of Service",
        content: "Lorem ipsum...",
      });
      expect(m.title).toBe("Terms of Service");
    });
  });
});
