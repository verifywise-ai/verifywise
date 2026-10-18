/**
 * Save and attest through the real hooks and a real QueryClient, with only
 * the repository mocked, so React Query's own order applies: the hook's
 * onSettled refetch of the profile runs, and is awaited, before the page's
 * per-call onSuccess.
 */
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AxiosError, AxiosHeaders } from "axios";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import type {
  AedtProfileView,
  AedtQuestion,
  AedtReadiness,
} from "../../../../infrastructure/api/aedtBiasAuditService";

const repo = vi.hoisted(() => ({
  getAedtProfile: vi.fn(),
  getAedtQuestions: vi.fn(),
  listAedtRuns: vi.fn(),
  saveAedtAnswers: vi.fn(),
  attestAedtProfile: vi.fn(),
}));

vi.mock("../../../../application/repository/aedtBiasAudit.repository", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  ...repo,
}));

vi.mock("../../../../application/hooks/useAuth", () => ({
  useAuth: () => ({ userRoleName: "Admin", userId: 1, organizationId: 1 }),
}));

vi.mock("../../../../application/hooks/useUsers", () => ({
  default: () => ({ users: [{ id: 1, name: "Ada", surname: "Byron" }], loading: false }),
}));

vi.mock("../../../../application/hooks/useProjects", () => ({
  useProjects: () => ({
    isLoading: false,
    approvedProjects: [
      { id: 7, project_title: "Screening tool", framework: [{ framework_id: 12 }] },
    ],
  }),
}));

import BiasAuditPage from "..";

const ROLE: AedtQuestion = {
  key: "role.party",
  scope: "profile",
  weight: "veto",
  prompt: "Do you hire with it?",
  notesRequired: false,
  allowDontKnow: false,
  options: [{ value: "vendor", label: "We supply it", consequence: "Vendor." }],
};

const READINESS: AedtReadiness = {
  score: 100,
  blockedReason: null,
  missingVetoes: [],
  openItems: [],
  scope: "in_scope",
  earned: 1,
  possible: 1,
};

const view = (version: number, status: string, answered: boolean): AedtProfileView => ({
  project: { id: 7, title: "Screening tool" },
  profile: { id: version, version, status },
  attested: null,
  answers: answered
    ? [
        {
          questionKey: "role.party",
          value: "vendor",
          notes: null,
          dontKnow: false,
          notApplicable: false,
          answeredByUserId: 1,
          answeredAt: "2026-10-17T10:00:00.000Z",
        },
      ]
    : [],
  readiness: READINESS,
  attestedDecision: null,
  scopeDeterminations: [],
});

function serverDown() {
  return new AxiosError("Request failed", "ERR_BAD_RESPONSE", undefined, undefined, {
    status: 503,
    statusText: "Service Unavailable",
    data: {},
    headers: {},
    config: { headers: new AxiosHeaders() },
  });
}

const vendorRadio = () => screen.getByRole("radio", { name: /We supply it/ });
const saveButton = () => screen.getByRole("button", { name: /save answers/i });

async function renderPage() {
  renderWithProviders(<BiasAuditPage />, { route: "/bias-audit" });
  await screen.findByTestId("question-role.party");
}

describe("BiasAuditPage save and attest", () => {
  beforeEach(() => {
    Object.values(repo).forEach((f) => f.mockReset());
    repo.getAedtQuestions.mockResolvedValue([ROLE]);
    repo.listAedtRuns.mockResolvedValue([]);
  });

  it("locks the inputs while a save is pending", async () => {
    repo.getAedtProfile.mockResolvedValue(view(1, "draft", false));
    repo.saveAedtAnswers.mockReturnValue(new Promise(() => {}));
    await renderPage();
    fireEvent.click(vendorRadio());
    fireEvent.click(saveButton());
    await waitFor(() => expect(vendorRadio()).toBeDisabled());
    expect(saveButton()).toBeDisabled();
    expect(screen.getByRole("button", { name: /attest profile/i })).toBeDisabled();
  });

  it("restarts the wizard from the server's answers after a normal save, losing nothing", async () => {
    // Version 1 is attested, so the save files version 2: a new row.
    repo.getAedtProfile
      .mockResolvedValueOnce(view(1, "attested", false))
      .mockResolvedValue(view(2, "draft", true));
    repo.saveAedtAnswers.mockResolvedValue({ profileId: 2, version: 2 });
    await renderPage();
    fireEvent.click(vendorRadio());
    fireEvent.click(saveButton());
    await waitFor(() => expect(screen.getByText("2")).toBeInTheDocument());
    expect(vendorRadio()).toBeChecked();
    expect(vendorRadio()).toBeEnabled();
    expect(saveButton()).toBeDisabled();
    expect(screen.queryByTestId("aedt-reload-required")).not.toBeInTheDocument();
  });

  it("asks for a page reload when the save worked but the reload after it failed", async () => {
    repo.getAedtProfile
      .mockResolvedValueOnce(view(1, "draft", false))
      .mockRejectedValue(serverDown());
    repo.saveAedtAnswers.mockResolvedValue({ profileId: 1, version: 1 });
    await renderPage();
    fireEvent.click(vendorRadio());
    fireEvent.click(saveButton());
    expect(await screen.findByTestId("aedt-reload-required")).toHaveTextContent(
      "Your answers were saved. Reload the page to continue.",
    );
    expect(screen.queryByTestId("question-role.party")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reload the page/i })).toBeInTheDocument();
  });

  it("asks for a page reload when the attest worked but the reload after it failed", async () => {
    repo.getAedtProfile
      .mockResolvedValueOnce(view(1, "draft", true))
      .mockRejectedValue(serverDown());
    repo.attestAedtProfile.mockResolvedValue({ profileId: 1, version: 1 });
    await renderPage();
    fireEvent.click(screen.getByRole("button", { name: /attest profile/i }));
    expect(await screen.findByTestId("aedt-reload-required")).toHaveTextContent(
      "The profile was attested. Reload the page to continue.",
    );
    expect(screen.queryByTestId("question-role.party")).not.toBeInTheDocument();
  });
});
