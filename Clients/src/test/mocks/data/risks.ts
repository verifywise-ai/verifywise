export interface MockRisk {
  id: number;
  title: string;
  description: string;
  severity: "low" | "medium" | "high" | "critical";
  probability: number;
  impact: number;
  status: string;
  projectId: number;
  createdAt: string;
  updatedAt: string;
}

export function createMockRisk(overrides: Partial<MockRisk> = {}): MockRisk {
  return {
    id: 1,
    title: "Model Bias in Hiring Algorithm",
    description: "Potential discriminatory outcomes from biased training data",
    severity: "high",
    probability: 0.7,
    impact: 0.8,
    status: "open",
    projectId: 1,
    createdAt: "2026-03-10T00:00:00Z",
    updatedAt: "2026-04-12T00:00:00Z",
    ...overrides,
  };
}

export const mockRisks: MockRisk[] = [
  createMockRisk(),
  createMockRisk({
    id: 2,
    title: "Data Privacy Breach",
    description: "Unauthorized access to personal identifiable information",
    severity: "critical",
    probability: 0.3,
    impact: 0.95,
    status: "mitigated",
  }),
];
