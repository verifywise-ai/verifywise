import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AxiosError, AxiosHeaders } from "axios";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import type {
  AedtProfileView,
  AedtReadiness,
} from "../../../../infrastructure/api/aedtBiasAuditService";

const state = vi.hoisted(() => ({
  role: "Admin",
  profile: null as unknown,
  profileError: null as unknown,
  questions: [] as unknown[],
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
  useAedtQuestions: () => ({ data: state.questions, isLoading: false, error: null }),
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

const OUT_OF_SCOPE: AedtReadiness = {
  score: null,
  blockedReason: null,
  missingVetoes: [],
  openItems: [],
  scope: "out_of_scope",
  earned: 0,
  possible: 0,
};

const IN_SCOPE: AedtReadiness = {
  score: 60,
  blockedReason: null,
  missingVetoes: [],
  openItems: [],
  scope: "in_scope",
  earned: 3,
  possible: 5,
};

const PROFILE: AedtProfileView = {
  project: { id: 7, title: "Screening tool" },
  profile: { id: 3, version: 2, status: "attested" },
  attested: { id: 3, version: 2, attestedByUserId: 1, attestedAt: "2026-10-01T10:00:00.000Z" },
  answers: [],
  readiness: OUT_OF_SCOPE,
  attestedDecision: { readiness: OUT_OF_SCOPE, metric: null },
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

function notFound(message: string, status = 404) {
  return new AxiosError("Request failed", "ERR_BAD_REQUEST", undefined, undefined, {
    status,
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
    state.questions = [];
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

  describe("a draft ahead of the attested version", () => {
    const draftAhead = (draft: AedtReadiness, attested: AedtProfileView["attestedDecision"]) => ({
      ...PROFILE,
      profile: { id: 4, version: 3, status: "draft" },
      readiness: draft,
      attestedDecision: attested,
    });

    it("lets a run go ahead on an in-scope attested profile while the draft is out of scope", () => {
      state.profile = draftAhead(OUT_OF_SCOPE, { readiness: IN_SCOPE, metric: "scoring_rate" });
      renderWithProviders(<BiasAuditPage />, { route: "/bias-audit" });
      expect(screen.getByTestId("aedt-draft-differs")).toHaveTextContent(
        /draft answers place the tool out of scope\. Runs and scope determinations follow the attested version/,
      );
      // The summary shows the attested score, which runs act on.
      expect(screen.getByText("60%")).toBeInTheDocument();

      fireEvent.click(screen.getByRole("tab", { name: /runs/i }));
      expect(screen.queryByText(/does not run its measures/)).not.toBeInTheDocument();
      expect(
        screen.getByText(/attested cutoff answer means this run computes scoring rates/),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /choose csv file/i })).not.toBeDisabled();
    });

    it("refuses a scope determination while only the draft is out of scope", () => {
      state.profile = draftAhead(OUT_OF_SCOPE, { readiness: IN_SCOPE, metric: "selection_rate" });
      renderWithProviders(<BiasAuditPage />, { route: "/bias-audit" });
      fireEvent.click(screen.getByRole("tab", { name: /scope determination/i }));
      expect(
        screen.getByText(/only when the attested answers place the tool out of scope/),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /generate scope determination/i })).toBeDisabled();
    });

    it("offers a scope determination on an out-of-scope attested profile while the draft is in scope", () => {
      state.profile = draftAhead(IN_SCOPE, { readiness: OUT_OF_SCOPE, metric: null });
      renderWithProviders(<BiasAuditPage />, { route: "/bias-audit" });
      expect(screen.getByTestId("aedt-draft-differs")).toHaveTextContent(
        /draft answers place the tool in scope/,
      );
      fireEvent.click(screen.getByRole("tab", { name: /scope determination/i }));
      expect(
        screen.getByRole("button", { name: /generate scope determination/i }),
      ).not.toBeDisabled();
      fireEvent.click(screen.getByRole("tab", { name: /runs/i }));
      expect(screen.getByText(/attested profile places the tool out of scope/)).toBeInTheDocument();
    });

    it("names the draft's score when only the score differs", () => {
      state.profile = draftAhead(
        { ...IN_SCOPE, score: 80 },
        { readiness: IN_SCOPE, metric: "selection_rate" },
      );
      renderWithProviders(<BiasAuditPage />, { route: "/bias-audit" });
      expect(screen.getByTestId("aedt-draft-differs")).toHaveTextContent(
        "Draft readiness 80%. Runs and scope determinations follow the attested version",
      );
      // The shared sentence is said once, not again beside the version.
      expect(screen.queryByText(/runs use the attested version until you attest/i)).toBeNull();
      expect(screen.getAllByTestId("aedt-draft-differs")).toHaveLength(1);
    });
  });

  // An undetermined draft over an in-scope attestation still names the
  // deciding question that leaves it open.
  it("names the deciding questions an undetermined draft leaves open", () => {
    state.profile = {
      ...PROFILE,
      profile: { id: 4, version: 3, status: "draft" },
      answers: [
        {
          questionKey: "data.held",
          value: null,
          notes: null,
          dontKnow: true,
          notApplicable: false,
          answeredByUserId: 1,
          answeredAt: "2026-10-03T10:00:00.000Z",
        },
      ],
      readiness: {
        score: null,
        blockedReason: "Scope is not established: answer data.held before a score can be shown.",
        missingVetoes: ["data.held"],
        openItems: [],
        scope: "undetermined",
        earned: 0,
        possible: 0,
      },
      attestedDecision: { readiness: IN_SCOPE, metric: "selection_rate" },
    };
    renderWithProviders(<BiasAuditPage />, { route: "/bias-audit" });
    const note = screen.getByTestId("aedt-draft-differs");
    expect(note).toHaveTextContent("Your draft answers leave scope undetermined.");
    // The server's blocked reason quotes raw keys; only the titled list shows.
    expect(note).not.toHaveTextContent(/data\.held/);
    expect(note).toHaveTextContent('Demographic data you hold (answered "I don\'t know")');
    expect(screen.getByTestId("aedt-profile-summary")).not.toHaveTextContent(/[a-z]\.[a-z]/);
  });

  // Before any attestation the readiness block reads the saved answers; an
  // open deciding question is named by title, never by the server's raw key.
  it("names open deciding questions by title in the readiness block", () => {
    state.profile = {
      ...PROFILE,
      attested: null,
      attestedDecision: null,
      profile: { id: 4, version: 1, status: "draft" },
      scopeDeterminations: [],
      answers: [],
      readiness: {
        score: null,
        blockedReason:
          "Scope is not established: answer independence.auditor, data.held before a score can be shown.",
        missingVetoes: ["independence.auditor", "data.held"],
        openItems: [],
        scope: "undetermined",
        earned: 0,
        possible: 0,
      },
    };
    renderWithProviders(<BiasAuditPage />, { route: "/bias-audit" });
    const summary = screen.getByTestId("aedt-profile-summary");
    expect(summary).toHaveTextContent("Who is performing this test");
    expect(summary).toHaveTextContent("Demographic data you hold");
    expect(summary).not.toHaveTextContent(/[a-z]\.[a-z]/);
  });

  // A failed background refetch keeps the data it had. Swapping the page for
  // the load error would unmount the wizard and lose an unsaved draft.
  it.each([503, 429, 408])(
    "keeps the page and the wizard when a refetch fails with %i",
    (status) => {
      state.profileError = notFound("Server error", status);
      renderWithProviders(<BiasAuditPage />, { route: "/bias-audit" });
      expect(screen.queryByTestId("aedt-load-error")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: /save answers/i })).toBeInTheDocument();
      expect(screen.getByTestId("aedt-refetch-error")).toHaveTextContent(/could not be refreshed/i);
    },
  );

  // A 404 or 403 on refetch means the use case is gone or no longer the
  // caller's; keeping a stale, editable page would hide that.
  it.each([404, 403, 401])("replaces the page when a refetch answers %i", (status) => {
    state.profileError = notFound("Project not found", status);
    renderWithProviders(<BiasAuditPage />, { route: "/bias-audit" });
    expect(screen.getByTestId("aedt-load-error")).toHaveTextContent("Project not found");
    expect(screen.queryByRole("button", { name: /save answers/i })).not.toBeInTheDocument();
    // The not-a-member explanation belongs to the 404 the member rule sends.
    expect(screen.queryAllByText(/not a member of is reported as not found/)).toHaveLength(
      status === 404 ? 1 : 0,
    );
  });

  it("asks for an attestation when the saved answers are not attested", () => {
    state.profile = {
      ...PROFILE,
      attested: null,
      profile: { id: 4, version: 1, status: "draft" },
      attestedDecision: null,
      scopeDeterminations: [],
    };
    renderWithProviders(<BiasAuditPage />, { route: "/bias-audit" });
    expect(screen.getByText(/nothing is attested yet/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: /scope determination/i }));
    expect(screen.getByRole("button", { name: /generate scope determination/i })).toBeDisabled();
  });
});
