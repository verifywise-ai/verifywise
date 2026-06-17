export type RiskData = {
  id: number;
  risk_name: string;
};

export function buildRisk(overrides?: Partial<RiskData>): RiskData {
  return {
    id: overrides?.id ?? 1,
    risk_name: "R1",
    ...overrides,
  };
}

export function buildManyRisk(count: number, overrides?: Partial<RiskData>): RiskData[] {
  return Array.from({ length: count }, (_, i) =>
    buildRisk({ ...overrides, id: overrides?.id ?? i + 1 }),
  );
}
