/**
 * Save and attest through the real hooks and a real QueryClient, with only
 * the repository mocked, so React Query's own order applies: the hook's
 * onSettled refetch of the profile runs, and is awaited, before the page's
 * per-call onSuccess.
 */
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AxiosError, AxiosHeaders } from "axios";
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
  getAedtRun: vi.fn(),
  getAedtRunTrend: vi.fn(),
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

import { openSection, renderBiasAuditPage } from "./biasAuditPageHarness";

const ROLE: AedtQuestion = {
  key: "role.party",
  scope: "profile",
  weight: "veto",
  prompt: "Do you hire with it?",
  notesRequired: false,
  allowDontKnow: false,
  options: [
    { value: "vendor", label: "We supply it", consequence: "Vendor." },
    { value: "employer", label: "We hire our own staff", consequence: "Employer." },
  ],
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

/** The profile view; `answer` is the saved role.party value, if any. */
const view = (version: number, status: string, answer: string | null): AedtProfileView => ({
  project: { id: 7, title: "Screening tool" },
  profile: { id: version, version, status },
  attested: null,
  answers: answer
    ? [
        {
          questionKey: "role.party",
          value: answer,
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

function httpError(status: number, message = "Refused.") {
  return new AxiosError("Request failed", "ERR_BAD_RESPONSE", undefined, undefined, {
    status,
    statusText: String(status),
    data: { data: message },
    headers: {},
    config: { headers: new AxiosHeaders() },
  });
}

const vendorRadio = () => screen.getByRole("radio", { name: /We supply it/ });
const employerRadio = () => screen.getByRole("radio", { name: /We hire our own staff/ });
const saveButton = () => screen.getByRole("button", { name: /save answers/i });

async function renderPage() {
  renderBiasAuditPage();
  await screen.findByTestId("question-role.party");
}

describe("BiasAuditPage save and attest", () => {
  beforeEach(() => {
    Object.values(repo).forEach((f) => f.mockReset());
    repo.getAedtQuestions.mockResolvedValue([ROLE]);
    repo.listAedtRuns.mockResolvedValue([]);
  });

  it("locks the inputs while a save is pending", async () => {
    repo.getAedtProfile.mockResolvedValue(view(1, "draft", null));
    repo.saveAedtAnswers.mockReturnValue(new Promise(() => {}));
    await renderPage();
    fireEvent.click(vendorRadio());
    fireEvent.click(saveButton());
    await waitFor(() => expect(vendorRadio()).toBeDisabled());
    expect(saveButton()).toBeDisabled();
    expect(screen.getByRole("button", { name: /attest profile/i })).toBeDisabled();
  });

  it("shows the server's answers after a save that files a new version, losing nothing", async () => {
    // Version 1 is attested, so the save files version 2.
    repo.getAedtProfile
      .mockResolvedValueOnce(view(1, "attested", null))
      .mockResolvedValue(view(2, "draft", "vendor"));
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

  // Someone else saved version 2 first; the refetch loads it, and the user's
  // unsaved edit must survive to be saved again.
  it("keeps the user's edits when a save is refused (409)", async () => {
    repo.getAedtProfile
      .mockResolvedValueOnce(view(1, "attested", null))
      .mockResolvedValue(view(2, "draft", null));
    repo.saveAedtAnswers.mockRejectedValue(
      httpError(409, "Another save created this profile version first. Reload and retry."),
    );
    await renderPage();
    fireEvent.click(vendorRadio());
    fireEvent.click(saveButton());
    expect(
      await screen.findByText(/Another save created this profile version first/),
    ).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("2")).toBeInTheDocument());
    expect(vendorRadio()).toBeChecked();
    expect(saveButton()).toBeEnabled();
  });

  it("shows a colleague's newer answer after my save and does not overwrite it", async () => {
    repo.getAedtProfile
      .mockResolvedValueOnce(view(1, "draft", null))
      .mockResolvedValue(view(1, "draft", "employer"));
    repo.saveAedtAnswers.mockResolvedValue({ profileId: 1, version: 1 });
    await renderPage();
    fireEvent.click(vendorRadio());
    fireEvent.click(saveButton());
    await waitFor(() => expect(employerRadio()).toBeChecked());
    expect(vendorRadio()).not.toBeChecked();
    expect(saveButton()).toBeDisabled();
    expect(repo.saveAedtAnswers).toHaveBeenCalledTimes(1);
  });

  it("says the save worked but the reload failed, and Try again brings the wizard back", async () => {
    repo.getAedtProfile
      .mockResolvedValueOnce(view(1, "draft", null))
      .mockRejectedValueOnce(httpError(503))
      .mockResolvedValue(view(1, "draft", "vendor"));
    repo.saveAedtAnswers.mockResolvedValue({ profileId: 1, version: 1 });
    await renderPage();
    fireEvent.click(vendorRadio());
    fireEvent.click(saveButton());
    expect(await screen.findByTestId("aedt-reload-required")).toHaveTextContent(
      "Your answers were saved, but the profile could not be reloaded.",
    );
    expect(screen.queryByTestId("question-role.party")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    await screen.findByTestId("question-role.party");
    expect(screen.queryByTestId("aedt-reload-required")).not.toBeInTheDocument();
    expect(vendorRadio()).toBeChecked();
  });

  it("says the attest worked but the reload failed, above the tabs", async () => {
    repo.getAedtProfile
      .mockResolvedValueOnce(view(1, "draft", "vendor"))
      .mockRejectedValue(httpError(503));
    repo.attestAedtProfile.mockResolvedValue({ profileId: 1, version: 1 });
    await renderPage();
    fireEvent.click(screen.getByRole("button", { name: /attest profile/i }));
    expect(await screen.findByTestId("aedt-reload-required")).toHaveTextContent(
      "The profile was attested, but it could not be reloaded.",
    );
    expect(screen.queryByTestId("question-role.party")).not.toBeInTheDocument();
    // Page level: still there on another tab.
    openSection("runs");
    expect(screen.getByTestId("aedt-reload-required")).toBeInTheDocument();
  });
});

describe("BiasAuditPage run detail", () => {
  beforeEach(() => {
    Object.values(repo).forEach((f) => f.mockReset());
    repo.getAedtQuestions.mockResolvedValue([ROLE]);
    repo.getAedtProfile.mockResolvedValue(view(1, "attested", "employer"));
    repo.listAedtRuns.mockResolvedValue([
      {
        id: 11,
        profile_id: 1,
        profile_version: 1,
        question_set_version: 1,
        job_description_key: null,
        metric: "selection_rate",
        readiness_score: 100,
        readiness_blocked_reason: null,
        expiry_date: "2027-10-17",
        row_count: 120,
        dataset_sha256: "abc",
        has_result: true,
        created_by: 1,
        created_at: "2026-10-17T10:00:00.000Z",
      },
      {
        id: 12,
        profile_id: 1,
        profile_version: 1,
        question_set_version: 1,
        job_description_key: null,
        metric: "selection_rate",
        readiness_score: 100,
        readiness_blocked_reason: null,
        expiry_date: "2027-11-17",
        row_count: 120,
        dataset_sha256: "def",
        has_result: true,
        created_by: 1,
        created_at: "2026-11-17T10:00:00.000Z",
      },
    ]);
    repo.getAedtRun.mockResolvedValue({
      run: {
        id: 11,
        project_id: 7,
        profile_id: 1,
        profile_version: 1,
        question_set_version: 1,
        metric: "selection_rate",
        result_json: null,
        gate_findings_json: [],
        created_by: 1,
        created_at: "2026-10-17T10:00:00.000Z",
      },
      stances: [],
      mayExportPdf: true,
    });
    repo.getAedtRunTrend.mockResolvedValue({
      segments: [
        {
          profileVersion: 1,
          questionSetVersion: 1,
          jobDescriptionKey: null,
          metric: "selection_rate",
          points: [
            {
              runId: 10,
              date: "2026-07-10",
              category: "sex",
              lowestRatio: 0.93,
              flagged: false,
              caveat: false,
            },
            {
              runId: 11,
              date: "2026-10-17",
              category: "sex",
              lowestRatio: 0.86,
              flagged: false,
              caveat: false,
            },
          ],
        },
      ],
      breaks: [],
    });
  });

  it("shows the ratio trend for the use case beneath the runs list", async () => {
    await renderPage();
    openSection("runs");

    const trend = await screen.findByTestId("aedt-ratio-trend");
    expect(repo.getAedtRunTrend).toHaveBeenCalledWith(7);
    expect(trend).toHaveTextContent("0.860");
    const table = await screen.findByTestId("run-row-11");
    expect(table.compareDocumentPosition(trend) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("leaves the trend off a run's detail", async () => {
    await renderPage();
    openSection("runs");
    fireEvent.click(await screen.findByTestId("aedt-open-run-11"));
    await screen.findByTestId("education-stance");
    expect(screen.queryByTestId("aedt-ratio-trend")).not.toBeInTheDocument();
  });
});
