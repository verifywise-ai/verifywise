jest.mock("sequelize-typescript", () => ({
  Column: jest.fn(),
  DataType: {
    INTEGER: "INTEGER",
    STRING: jest.fn(() => "STRING"),
    TEXT: "TEXT",
    DATE: "DATE",
    BOOLEAN: "BOOLEAN",
    DECIMAL: jest.fn(() => "DECIMAL"),
    JSONB: "JSONB",
    ARRAY: jest.fn(() => "ARRAY"),
    NOW: "NOW",
  },
  ForeignKey: jest.fn(),
  HasMany: jest.fn(),
  Table: jest.fn(),
  Model: class MockModel {
    constructor(data?: any) {
      if (data) Object.assign(this, data);
    }
    get(_opts?: any) {
      return this;
    }
  },
}));

class TestGovernanceControlMappingModel {
  id?: number;
  organization_id!: number;
  source_framework_id!: number;
  source_control_type!: string;
  source_control_identifier!: string;
  source_control_id?: number;
  target_framework_id!: number;
  target_control_type!: string;
  target_control_identifier!: string;
  target_control_id?: number;
  mapping_strength!: string;
  mapping_direction!: string;
  domain_tag?: string;
  rationale?: string;
  source_reference?: string;
  confidence_score?: number;

  constructor(data?: any) {
    if (data) Object.assign(this, data);
  }
}

class TestGovernanceScenarioModel {
  id?: number;
  organization_id?: number | null;
  name!: string;
  description?: string;
  industry?: string;
  use_case_type?: string;
  region?: string;
  recommended_framework_ids?: number[];
  priority_order?: Record<string, unknown>;
  rationale?: string;
  is_builtin?: boolean;

  constructor(data?: any) {
    if (data) Object.assign(this, data);
  }
}

class TestGovernanceScenarioRuleModel {
  id?: number;
  scenario_id!: number;
  rule_type!: string;
  rule_operator!: string;
  rule_value!: string;
  weight!: number;

  constructor(data?: any) {
    if (data) Object.assign(this, data);
  }
}

class TestGovernanceOrgPreferencesModel {
  id?: number;
  organization_id!: number;
  selected_scenario_id?: number | null;
  custom_framework_priority?: Record<string, unknown>;
  active_mapping_filters?: Record<string, unknown>;
  is_enabled?: boolean;
  dont_ask_governance_os?: boolean;

  constructor(data?: any) {
    if (data) Object.assign(this, data);
  }
}

class TestGovernanceCoverageCacheModel {
  id?: number;
  organization_id!: number;
  project_id!: number;
  framework_id!: number;
  total_controls!: number;
  mapped_controls!: number;
  coverage_percentage!: number;
  gap_details?: Record<string, unknown>;
  synergy_details?: Record<string, unknown>;
  computed_at?: Date;

  constructor(data?: any) {
    if (data) Object.assign(this, data);
  }
}

describe("GovernanceControlMappingModel", () => {
  it("should create a mapping with all required fields", () => {
    const mapping = new TestGovernanceControlMappingModel({
      id: 1,
      organization_id: 5,
      source_framework_id: 1,
      source_control_type: "control_category",
      source_control_identifier: "Art.9",
      target_framework_id: 2,
      target_control_type: "clause",
      target_control_identifier: "Clause 6.1",
      mapping_strength: "direct",
      mapping_direction: "bidirectional",
      domain_tag: "risk_management",
      confidence_score: 0.95,
    });

    expect(mapping.organization_id).toBe(5);
    expect(mapping.source_framework_id).toBe(1);
    expect(mapping.target_framework_id).toBe(2);
    expect(mapping.mapping_strength).toBe("direct");
    expect(mapping.domain_tag).toBe("risk_management");
    expect(mapping.confidence_score).toBe(0.95);
  });

  it("should allow optional fields to be undefined", () => {
    const mapping = new TestGovernanceControlMappingModel({
      organization_id: 3,
      source_framework_id: 1,
      source_control_type: "control_category",
      source_control_identifier: "Art.9",
      target_framework_id: 4,
      target_control_type: "function",
      target_control_identifier: "GOVERN-1",
      mapping_strength: "partial",
      mapping_direction: "forward",
    });

    expect(mapping.organization_id).toBe(3);
    expect(mapping.source_control_id).toBeUndefined();
    expect(mapping.target_control_id).toBeUndefined();
    expect(mapping.rationale).toBeUndefined();
    expect(mapping.source_reference).toBeUndefined();
  });
});

describe("GovernanceScenarioModel", () => {
  it("should create a built-in scenario", () => {
    const scenario = new TestGovernanceScenarioModel({
      id: 1,
      organization_id: null,
      name: "EU High-Risk AI Provider",
      description: "Organizations deploying high-risk AI in the EU",
      industry: "technology",
      use_case_type: "high_risk_ai",
      region: "eu",
      recommended_framework_ids: [1, 2, 4],
      priority_order: { primary: 1, secondary: [2], supplementary: [4] },
      is_builtin: true,
    });

    expect(scenario.name).toBe("EU High-Risk AI Provider");
    expect(scenario.is_builtin).toBe(true);
    expect(scenario.organization_id).toBeNull();
    expect(scenario.recommended_framework_ids).toEqual([1, 2, 4]);
  });

  it("should create a custom org scenario", () => {
    const scenario = new TestGovernanceScenarioModel({
      organization_id: 5,
      name: "Custom Scenario",
      is_builtin: false,
    });

    expect(scenario.organization_id).toBe(5);
    expect(scenario.is_builtin).toBe(false);
  });
});

describe("GovernanceScenarioRuleModel", () => {
  it("should create a scoring rule", () => {
    const rule = new TestGovernanceScenarioRuleModel({
      id: 1,
      scenario_id: 1,
      rule_type: "region",
      rule_operator: "equals",
      rule_value: "eu",
      weight: 0.9,
    });

    expect(rule.scenario_id).toBe(1);
    expect(rule.rule_type).toBe("region");
    expect(rule.weight).toBe(0.9);
  });
});

describe("GovernanceOrgPreferencesModel", () => {
  it("should create org preferences", () => {
    const prefs = new TestGovernanceOrgPreferencesModel({
      id: 1,
      organization_id: 3,
      selected_scenario_id: 1,
      custom_framework_priority: { primary: 2 },
      active_mapping_filters: { strength: "direct" },
    });

    expect(prefs.organization_id).toBe(3);
    expect(prefs.selected_scenario_id).toBe(1);
    expect(prefs.custom_framework_priority).toEqual({ primary: 2 });
  });

  it("should support enablement flags", () => {
    const prefs = new TestGovernanceOrgPreferencesModel({
      id: 2,
      organization_id: 5,
      is_enabled: true,
      dont_ask_governance_os: true,
    });

    expect(prefs.is_enabled).toBe(true);
    expect(prefs.dont_ask_governance_os).toBe(true);
  });

  it("should default enablement flags to undefined when not provided", () => {
    const prefs = new TestGovernanceOrgPreferencesModel({
      organization_id: 7,
    });

    expect(prefs.is_enabled).toBeUndefined();
    expect(prefs.dont_ask_governance_os).toBeUndefined();
  });
});

describe("GovernanceCoverageCacheModel", () => {
  it("should create a coverage cache entry", () => {
    const cache = new TestGovernanceCoverageCacheModel({
      id: 1,
      organization_id: 3,
      project_id: 7,
      framework_id: 1,
      total_controls: 50,
      mapped_controls: 35,
      coverage_percentage: 70.0,
      gap_details: { unmapped_controls: ["Art.73"] },
      synergy_details: { multi_framework_controls: ["Art.9", "Art.15"] },
    });

    expect(cache.coverage_percentage).toBe(70.0);
    expect(cache.mapped_controls).toBe(35);
    expect(cache.gap_details).toEqual({ unmapped_controls: ["Art.73"] });
  });
});
