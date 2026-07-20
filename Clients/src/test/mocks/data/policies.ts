export interface MockPolicy {
  id: number;
  name: string;
  description: string;
  status: "draft" | "published" | "archived";
  content: string;
  version: string;
  owner: number;
  createdAt: string;
  updatedAt: string;
}

export function createMockPolicy(overrides: Partial<MockPolicy> = {}): MockPolicy {
  return {
    id: 1,
    name: "AI Ethics Policy",
    description: "Guidelines for responsible AI development and deployment",
    status: "published",
    content: "<h1>AI Ethics Policy</h1><p>We are committed to responsible AI.</p>",
    version: "1.0",
    owner: 1,
    createdAt: "2025-11-01T00:00:00Z",
    updatedAt: "2026-02-15T00:00:00Z",
    ...overrides,
  };
}

export const mockPolicies: MockPolicy[] = [
  createMockPolicy(),
  createMockPolicy({
    id: 2,
    name: "Data Privacy Policy",
    description: "Rules for handling personal and sensitive data",
    status: "draft",
    version: "0.9",
  }),
];
