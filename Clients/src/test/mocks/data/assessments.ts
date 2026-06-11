export interface MockAssessment {
  id: number;
  name: string;
  description: string;
  framework: string;
  projectId: number;
  progress: number;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export function createMockAssessment(overrides: Partial<MockAssessment> = {}): MockAssessment {
  return {
    id: 1,
    name: "ISO 42001 Readiness Assessment",
    description: "Evaluate organizational readiness for ISO 42001 certification",
    framework: "ISO-42001",
    projectId: 1,
    progress: 65,
    status: "in_progress",
    createdAt: "2026-02-01T00:00:00Z",
    updatedAt: "2026-05-10T00:00:00Z",
    ...overrides,
  };
}

export const mockAssessments: MockAssessment[] = [
  createMockAssessment(),
  createMockAssessment({
    id: 2,
    name: "NIST AI RMF Gap Analysis",
    description: "Identify gaps against NIST AI Risk Management Framework",
    framework: "NIST-AI-RMF",
    projectId: 2,
    progress: 40,
    status: "in_progress",
  }),
];
