export interface MockVendorRisk {
  id: number;
  vendor_id: number;
  risk_description: string;
  impact_description: string;
  impact: "Negligible" | "Minor" | "Moderate" | "Major" | "Critical";
  likelihood: "Rare" | "Unlikely" | "Possible" | "Likely" | "Almost certain";
  risk_severity: "Negligible" | "Minor" | "Moderate" | "Major" | "Catastrophic";
  action_plan: string;
  action_owner: number;
  risk_level: string;
  createdAt: string;
  updatedAt: string;
}

export function createMockVendorRisk(overrides: Partial<MockVendorRisk> = {}): MockVendorRisk {
  return {
    id: 1,
    vendor_id: 1,
    risk_description: "Data breach risk due to third-party access",
    impact_description: "Loss of sensitive customer data",
    impact: "Major",
    likelihood: "Possible",
    risk_severity: "Major",
    action_plan: "Implement additional security reviews",
    action_owner: 1,
    risk_level: "High",
    createdAt: "2025-11-01T00:00:00Z",
    updatedAt: "2026-02-15T00:00:00Z",
    ...overrides,
  };
}

export const mockVendorRisks: MockVendorRisk[] = [createMockVendorRisk()];
