/**
 * Invitation fixtures.
 *
 * Note the envelope: the backend returns a bare `{ invitations }` on success
 * (invitation.ctrl.ts) rather than the usual `STATUS_CODE[200]({ ... })`
 * wrapper, and useInvitations reads `response.invitations` directly. The
 * handler mirrors that — see the comment in handlers.ts.
 */

export interface MockInvitation {
  id: number;
  email: string;
  name: string;
  surname: string;
  role_id: number;
  status: string;
  invited_by: number;
  created_at: string;
  expires_at: string;
  updated_at: string;
  role_name?: string;
}

export function createMockInvitation(overrides: Partial<MockInvitation> = {}): MockInvitation {
  return {
    id: 1,
    email: "new.reviewer@example.com",
    name: "Ada",
    surname: "Lovelace",
    role_id: 2,
    status: "pending",
    invited_by: 1,
    created_at: "2026-02-01T00:00:00Z",
    expires_at: "2026-02-08T00:00:00Z",
    updated_at: "2026-02-01T00:00:00Z",
    role_name: "Reviewer",
    ...overrides,
  };
}

export const mockInvitations: MockInvitation[] = [
  createMockInvitation(),
  createMockInvitation({
    id: 2,
    email: "grace.hopper@example.com",
    name: "Grace",
    surname: "Hopper",
    role_id: 3,
    role_name: "Editor",
    status: "expired",
  }),
];
