import type { Project } from "../../domain/types/Project";

export function buildProject(overrides?: Partial<Project>): Project {
  return {
    id: overrides?.id ?? 1,
    uc_id: "UC-001",
    project_title: "AI Governance Platform",
    owner: 1,
    members: [],
    start_date: new Date("2024-01-01"),
    ai_risk_classification: "high risk",
    type_of_high_risk_role: "deployer",
    goal: "Test goal",
    last_updated: new Date("2025-01-15"),
    last_updated_by: 1,
    framework: [
      { project_framework_id: 10, framework_id: 1, name: "EU AI Act" },
      { project_framework_id: 20, framework_id: 2, name: "ISO 42001" },
    ],
    monitored_regulations_and_standards: [],
    ...overrides,
  };
}

export function buildManyProject(count: number, overrides?: Partial<Project>): Project[] {
  return Array.from({ length: count }, (_, i) =>
    buildProject({ ...overrides, id: overrides?.id ?? i + 1 }),
  );
}
