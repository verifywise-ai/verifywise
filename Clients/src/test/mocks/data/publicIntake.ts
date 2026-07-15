export interface MockIntakeForm {
  id: number;
  title: string;
  status: "draft" | "published" | "archived";
  fields: Array<{
    id: string;
    label: string;
    type: string;
    required: boolean;
  }>;
  createdAt: string;
  updatedAt: string;
}

export interface MockIntakeSubmission {
  id: number;
  form_id: number;
  entity_type: string;
  entity_name: string;
  responses: Record<string, unknown>;
  status: "pending" | "processed" | "rejected";
  createdAt: string;
}

export function createMockIntakeForm(overrides: Partial<MockIntakeForm> = {}): MockIntakeForm {
  return {
    id: 1,
    title: "New AI System Intake",
    status: "published",
    fields: [
      { id: "name", label: "System name", type: "text", required: true },
      { id: "description", label: "Description", type: "textarea", required: true },
    ],
    createdAt: "2025-11-01T00:00:00Z",
    updatedAt: "2026-02-15T00:00:00Z",
    ...overrides,
  };
}

export function createMockIntakeSubmission(
  overrides: Partial<MockIntakeSubmission> = {},
): MockIntakeSubmission {
  return {
    id: 1,
    form_id: 1,
    entity_type: "project",
    entity_name: "Submitted AI System",
    responses: { name: "Submitted AI System", description: "From public intake" },
    status: "pending",
    createdAt: "2025-11-01T00:00:00Z",
    ...overrides,
  };
}

export const mockIntakeForms: MockIntakeForm[] = [createMockIntakeForm()];
export const mockIntakeSubmissions: MockIntakeSubmission[] = [createMockIntakeSubmission()];
