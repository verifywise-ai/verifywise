/**
 * Compliance framework fixtures.
 *
 * The frontend calls only two framework endpoints (GET /frameworks and
 * POST /frameworks/toProject); the other seven registered on the backend have
 * no consumer. useFrameworks reads `response.data`, so the handler wraps these
 * in the STATUS_CODE envelope the controller actually returns.
 */

export interface MockFramework {
  id: number;
  name: string;
  description: string;
  is_organizational: boolean;
}

export function createMockFramework(overrides: Partial<MockFramework> = {}): MockFramework {
  return {
    id: 1,
    name: "EU AI Act",
    description: "European Union Artificial Intelligence Act",
    is_organizational: false,
    ...overrides,
  };
}

export const mockFrameworks: MockFramework[] = [
  createMockFramework(),
  createMockFramework({
    id: 2,
    name: "ISO 42001",
    description: "AI management system standard",
    is_organizational: true,
  }),
  createMockFramework({
    id: 3,
    name: "ISO 27001",
    description: "Information security management",
    is_organizational: true,
  }),
];
