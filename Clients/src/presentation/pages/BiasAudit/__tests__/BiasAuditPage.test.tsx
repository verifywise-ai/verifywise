import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AxiosError, AxiosHeaders } from "axios";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import type { AedtProfileView } from "../../../../infrastructure/api/aedtBiasAuditService";

const state = vi.hoisted(() => ({
  role: "Admin",
  profile: null as unknown,
  profileError: null as unknown,
}));

const { mutation } = vi.hoisted(() => ({
  mutation: () => ({ mutate: () => {}, reset: () => {}, isPending: false, error: null }),
}));

vi.mock("../../../../application/hooks/useAuth", () => ({
  useAuth: () => ({ userRoleName: state.role, userId: 1, organizationId: 1 }),
}));

vi.mock("../../../../application/hooks/useUsers", () => ({
  default: () => ({ users: [{ id: 1, name: "Ada", surname: "Byron" }], loading: false }),
}));

vi.mock("../../../../application/hooks/useProjects", () => ({
  useProjects: () => ({
    isLoading: false,
    approvedProjects: [
      { id: 7, project_title: "Screening tool", framework: [{ framework_id: 12 }] },
      { id: 8, project_title: "Other use case", framework: [{ framework_id: 1 }] },
    ],
  }),
}));

vi.mock("../../../../application/hooks/useAedtBiasAudit", () => ({
  useAedtProfile: () => ({
    data: state.profile,
    isLoading: false,
    error: state.profileError,
  }),
  useAedtQuestions: () => ({ data: [], isLoading: false, error: null }),
  useAedtRuns: () => ({ data: [], isLoading: false, error: null }),
  useAedtRun: () => ({ data: undefined, isLoading: true, error: null }),
  useSaveAedtAnswers: mutation,
  useAttestAedtProfile: mutation,
  useGenerateAedtScopeDetermination: mutation,
  useCreateAedtRun: mutation,
  useConfirmAedtDerivedBasis: mutation,
  useGenerateAedtRunStance: mutation,
}));

import BiasAuditPage from "..";

const PROFILE: AedtProfileView = {
  project: { id: 7, title: "Screening tool" },
  profile: { id: 3, version: 2, status: "attested" },
  attested: { id: 3, version: 2, attestedByUserId: 1, attestedAt: "2026-10-01T10:00:00.000Z" },
  answers: [],
  readiness: {
    score: null,
    blockedReason: null,
    missingVetoes: [],
    openItems: [],
    scope: "out_of_scope",
    earned: 0,
    possible: 0,
  },
  scopeDeterminations: [
    {
      id: 21,
      version: 2,
      pdf_sha256: "abc",
      pdf_file_id: 4,
      score_at_generation: null,
      scope_at_generation: "out_of_scope",
      profile_version: 2,
      question_set_version: 1,
      generated_by: 1,
      generated_at: "2026-10-02T10:00:00.000Z",
      isCurrent: true,
    },
    {
      id: 20,
      version: 1,
      pdf_sha256: "def",
      pdf_file_id: 3,
      score_at_generation: null,
      scope_at_generation: "out_of_scope",
      profile_version: 1,
      question_set_version: 1,
      generated_by: 1,
      generated_at: "2026-09-02T10:00:00.000Z",
      isCurrent: false,
    },
  ],
};

function notFound(message: string) {
  return new AxiosError("Request failed", "ERR_BAD_REQUEST", undefined, undefined, {
    status: 404,
    statusText: "Not Found",
    data: { message: "Not Found", data: message },
    headers: {},
    config: { headers: new AxiosHeaders() },
  });
}

describe("BiasAuditPage", () => {
  beforeEach(() => {
    state.role = "Admin";
    state.profile = PROFILE;
    state.profileError = null;
  });

  it("offers only use cases with the LL 144 framework, and shows the education panel", () => {
    renderWithProviders(<BiasAuditPage />, { route: "/bias-audit" });
    expect(screen.getByText("LL 144 bias audit")).toBeInTheDocument();
    expect(screen.getByText("Screening tool")).toBeInTheDocument();
    expect(screen.queryByText("Other use case")).not.toBeInTheDocument();
    expect(screen.getByText(/VerifyWise's own measure/)).toBeInTheDocument();
  });

  it("labels a scope determination superseded by a later attestation", () => {
    renderWithProviders(<BiasAuditPage />, { route: "/bias-audit" });
    fireEvent.click(screen.getByRole("tab", { name: /scope determination/i }));
    expect(screen.getByTestId("stance-row-21")).not.toHaveTextContent(/superseded/i);
    expect(screen.getByTestId("stance-row-20")).toHaveTextContent(
      "Superseded by a later attestation",
    );
    expect(screen.getByTestId("education-stance")).toBeInTheDocument();
  });

  it("shows the server's 404 message and explains that non-members get not found", () => {
    state.profile = undefined;
    state.profileError = notFound("Project not found");
    renderWithProviders(<BiasAuditPage />, { route: "/bias-audit" });
    expect(screen.getByText("Project not found")).toBeInTheDocument();
    expect(screen.getByText(/not a member of is reported as not found/)).toBeInTheDocument();
  });

  it("explains why the runs tab cannot record a run for an out-of-scope profile", () => {
    renderWithProviders(<BiasAuditPage />, { route: "/bias-audit" });
    fireEvent.click(screen.getByRole("tab", { name: /runs/i }));
    expect(screen.getByText(/does not run its measures/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /run measures/i })).toBeDisabled();
    expect(screen.getByTestId("education-run.upload")).toBeInTheDocument();
  });
});
