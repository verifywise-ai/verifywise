export interface MockVendor {
  id: number;
  name: string;
  description: string;
  type: string;
  riskLevel: "low" | "medium" | "high";
  contractStatus: string;
  createdAt: string;
  updatedAt: string;
}

export function createMockVendor(overrides: Partial<MockVendor> = {}): MockVendor {
  return {
    id: 1,
    name: "Acme AI Solutions",
    description: "Provider of machine learning infrastructure and APIs",
    type: "technology",
    riskLevel: "medium",
    contractStatus: "active",
    createdAt: "2025-11-01T00:00:00Z",
    updatedAt: "2026-02-15T00:00:00Z",
    ...overrides,
  };
}

export const mockVendors: MockVendor[] = [
  createMockVendor(),
  createMockVendor({
    id: 2,
    name: "Global Data Partners",
    description: "Third-party data enrichment and analytics services",
    type: "data",
    riskLevel: "high",
    contractStatus: "under_review",
  }),
];
