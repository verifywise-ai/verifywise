export interface RiskFactoryData {
  id: number;
  risk_name: string;
  risk_owner: number;
  severity: string;
  ale_estimate: number | null;
  mitigation_status: string;
  risk_level_autocalculated: string;
  deadline: string;
  is_deleted: boolean;
  controls_mapping: string;
  likelihood: string;
}

export function buildRisk(overrides?: Partial<RiskFactoryData>): RiskFactoryData {
  return {
    id: overrides?.id ?? 1,
    risk_name: "Data Breach Risk",
    risk_owner: 1,
    severity: "High",
    ale_estimate: 500000,
    mitigation_status: "In Progress",
    risk_level_autocalculated: "High risk",
    deadline: "2025-12-31T00:00:00Z",
    is_deleted: false,
    controls_mapping: "Test controls",
    likelihood: "Medium",
    ...overrides,
  };
}

export function buildManyRisk(
  count: number,
  overrides?: Partial<RiskFactoryData>,
): RiskFactoryData[] {
  return Array.from({ length: count }, (_, i) =>
    buildRisk({ ...overrides, id: overrides?.id ?? i + 1 }),
  );
}
