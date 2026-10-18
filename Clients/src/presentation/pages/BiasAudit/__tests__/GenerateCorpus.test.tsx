import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../../test/renderWithProviders";

const svc = vi.hoisted(() => ({
  getJobDescriptions: vi.fn(),
  compareCriteria: vi.fn(),
  createCorpus: vi.fn(),
  listCorpora: vi.fn(),
  resumeCorpus: vi.fn(),
  downloadCorpus: vi.fn(),
}));
vi.mock("../../../../infrastructure/api/aedtBiasAuditService", () => ({
  aedtBiasAuditService: svc,
}));

import GenerateCorpus from "../GenerateCorpus";

const JDS = {
  generationAvailable: true,
  count: { default: 5000, min: 700, max: 10000 },
  jobDescriptions: [
    {
      key: "commercial-ae",
      roleTitle: "Account Executive",
      body: "Account Executive, New Business…",
      expectedCriteria: [{ key: "quota_attainment", label: "Quota attainment", description: "…" }],
    },
    {
      key: "operational-hourly",
      roleTitle: "Warehouse Operations Associate",
      body: "Warehouse…",
      expectedCriteria: [
        { key: "measured_rate", label: "Measured rate or throughput", description: "…" },
      ],
    },
  ],
};
const props = { projectId: 7, canEdit: true, mayGenerate: true, blockedReason: null };

function corpus(over: Record<string, unknown>) {
  return {
    project_id: 7,
    profile_version: 1,
    job_description_key: "commercial-ae",
    artifact_kind: "resume",
    requested_count: 700,
    planned_count: 700,
    record_count: null,
    model_pinned: "m1",
    models_observed_json: null,
    cell_sizes_json: null,
    release_findings_json: null,
    failure_code: null,
    corpus_sha256: null,
    manifest_sha256: null,
    generated_by: 1,
    generated_at: "2026-10-18T10:00:00.000Z",
    completed_at: null,
    ...over,
  };
}

beforeEach(() => {
  Object.values(svc).forEach((f) => f.mockReset());
  svc.getJobDescriptions.mockResolvedValue(JDS);
  svc.listCorpora.mockResolvedValue([]);
});

describe("GenerateCorpus", () => {
  it("offers exactly the two fixed job descriptions, with no free-text alternative", async () => {
    renderWithProviders(<GenerateCorpus {...props} />);
    expect(await screen.findByText("Account Executive")).toBeInTheDocument();
    expect(screen.getByText("Warehouse Operations Associate")).toBeInTheDocument();
    expect(screen.queryByLabelText(/paste.*job description|own job description/i)).toBeNull();
  });

  it("states that the result describes the role tested, not all hiring", async () => {
    renderWithProviders(<GenerateCorpus {...props} />);
    expect(await screen.findByTestId("aedt-generate-role-statement")).toHaveTextContent(
      /that role/i,
    );
  });

  it("shows the chosen job description in full, to run through the customer's platform", async () => {
    renderWithProviders(<GenerateCorpus {...props} />);
    await userEvent.click(await screen.findByText("Warehouse Operations Associate"));
    expect(screen.getByTestId("aedt-job-description-body")).toHaveTextContent("Warehouse…");
    expect(screen.getByTestId("aedt-job-description-operational-hourly")).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("disables generation and names the reason when the gate blocks", async () => {
    renderWithProviders(
      <GenerateCorpus
        {...props}
        mayGenerate={false}
        blockedReason="pipeline.input_form is audio, which this module cannot generate"
      />,
    );
    expect(await screen.findByTestId("aedt-generate-corpus")).toBeDisabled();
    expect(screen.getByText(/pipeline\.input_form/)).toBeInTheDocument();
  });

  it("disables generation for a viewer who cannot edit", async () => {
    renderWithProviders(<GenerateCorpus {...props} canEdit={false} />);
    await userEvent.click(await screen.findByText("Account Executive"));
    expect(screen.getByTestId("aedt-generate-corpus")).toBeDisabled();
    expect(screen.getByText(/only an admin or editor/i)).toBeInTheDocument();
  });

  it("disables generation when the deployment has no gateway configured", async () => {
    svc.getJobDescriptions.mockResolvedValue({ ...JDS, generationAvailable: false });
    renderWithProviders(<GenerateCorpus {...props} />);
    expect(await screen.findByText(/not available on this deployment/i)).toBeInTheDocument();
    expect(screen.getByTestId("aedt-generate-corpus")).toBeDisabled();
  });

  it("runs the criteria comparison and shows a divergent verdict", async () => {
    svc.compareCriteria.mockResolvedValue({
      verdict: "divergent",
      unmatchedExpected: ["cycle_length", "deal_size"],
      unmatchedSupplied: [],
      matched: [],
      supplied: ["Communication"],
    });
    renderWithProviders(<GenerateCorpus {...props} />);
    await userEvent.click(await screen.findByText("Account Executive"));
    await userEvent.type(screen.getByLabelText(/criteria your platform/i), "Communication");
    await userEvent.click(screen.getByTestId("aedt-compare-criteria"));
    await waitFor(() =>
      expect(screen.getByText(/may not exercise your configuration/i)).toBeInTheDocument(),
    );
    expect(screen.getByText(/cycle_length/)).toBeInTheDocument();
    expect(svc.compareCriteria).toHaveBeenCalledWith({
      jobDescriptionKey: "commercial-ae",
      criteriaSupplied: "Communication",
    });
  });

  it("names unmatched expected criteria by label when it knows them", async () => {
    svc.compareCriteria.mockResolvedValue({
      verdict: "divergent",
      unmatchedExpected: ["quota_attainment"],
      unmatchedSupplied: ["Security clearance"],
      matched: [],
      supplied: ["Security clearance"],
    });
    renderWithProviders(<GenerateCorpus {...props} />);
    await userEvent.click(await screen.findByText("Account Executive"));
    await userEvent.type(screen.getByLabelText(/criteria your platform/i), "Security clearance");
    await userEvent.click(screen.getByTestId("aedt-compare-criteria"));
    const verdict = await screen.findByTestId("aedt-criteria-verdict");
    expect(verdict).toHaveTextContent("Expected criteria not found: Quota attainment");
    expect(verdict).toHaveTextContent(
      "Your criteria the corpus does not cover: Security clearance",
    );
  });

  it("generates without a comparison, at the default count", async () => {
    svc.createCorpus.mockResolvedValue({ corpusId: 3 });
    renderWithProviders(<GenerateCorpus {...props} />);
    await userEvent.click(await screen.findByText("Account Executive"));
    await userEvent.click(screen.getByTestId("aedt-generate-corpus"));
    await waitFor(() => expect(svc.createCorpus).toHaveBeenCalled());
    expect(svc.createCorpus.mock.calls[0][0]).toEqual({
      projectId: 7,
      frameworkId: 12,
      jobDescriptionKey: "commercial-ae",
      criteriaSupplied: null,
      count: 5000,
    });
  });

  it("sends the pasted criteria and the chosen count with the corpus", async () => {
    svc.createCorpus.mockResolvedValue({ corpusId: 4 });
    renderWithProviders(<GenerateCorpus {...props} />);
    await userEvent.click(await screen.findByText("Account Executive"));
    await userEvent.type(screen.getByLabelText(/criteria your platform/i), "  Quota attainment ");
    const count = screen.getByLabelText(/number of records/i);
    await userEvent.clear(count);
    await userEvent.type(count, "700");
    await userEvent.click(screen.getByTestId("aedt-generate-corpus"));
    await waitFor(() => expect(svc.createCorpus).toHaveBeenCalled());
    expect(svc.createCorpus.mock.calls[0][0]).toMatchObject({
      criteriaSupplied: "Quota attainment",
      count: 700,
    });
  });

  it("refuses a count below 700 without calling the server", async () => {
    renderWithProviders(<GenerateCorpus {...props} />);
    await userEvent.click(await screen.findByText("Account Executive"));
    const count = screen.getByLabelText(/number of records/i);
    await userEvent.clear(count);
    await userEvent.type(count, "300");
    expect(screen.getByText(/at least 700/i)).toBeInTheDocument();
    expect(screen.getByTestId("aedt-generate-corpus")).toBeDisabled();
  });

  it.each(["10001", "700.5", "abc"])("refuses a count of %s", async (value) => {
    renderWithProviders(<GenerateCorpus {...props} />);
    await userEvent.click(await screen.findByText("Account Executive"));
    const count = screen.getByLabelText(/number of records/i);
    await userEvent.clear(count);
    await userEvent.type(count, value);
    expect(screen.getByTestId("aedt-generate-corpus")).toBeDisabled();
  });

  it("lists corpora with the action each status allows", async () => {
    svc.listCorpora.mockResolvedValue([
      corpus({
        id: 1,
        status: "complete",
        record_count: 700,
        models_observed_json: { m1: 700 },
        release_findings_json: [],
      }),
      corpus({ id: 2, status: "failed", failure_code: "lease_lost" }),
      corpus({
        id: 3,
        status: "blocked",
        record_count: 699,
        models_observed_json: { m1: 699 },
        release_findings_json: [
          { code: "cell_too_small", severity: "stop", message: "Cell Male|Asian holds 49 records" },
        ],
      }),
    ]);
    renderWithProviders(<GenerateCorpus {...props} />);
    expect(await screen.findByTestId("aedt-download-corpus-1")).toBeEnabled();
    expect(screen.getByTestId("aedt-resume-corpus-2")).toBeEnabled();
    expect(screen.queryByTestId("aedt-download-corpus-3")).toBeNull();
    expect(screen.queryByTestId("aedt-resume-corpus-3")).toBeNull();
    expect(screen.getByText(/Male\|Asian holds 49/)).toBeInTheDocument();
    expect(screen.getByTestId("corpus-row-1")).toHaveTextContent("m1 (700)");
  });

  it("resumes a failed corpus", async () => {
    svc.listCorpora.mockResolvedValue([corpus({ id: 2, status: "failed" })]);
    svc.resumeCorpus.mockResolvedValue({ corpusId: 2, status: "running" });
    renderWithProviders(<GenerateCorpus {...props} />);
    await userEvent.click(await screen.findByTestId("aedt-resume-corpus-2"));
    await waitFor(() => expect(svc.resumeCorpus).toHaveBeenCalledWith(2));
  });

  it("never uses forbidden vocabulary", async () => {
    // Clients cannot import Servers/services/biasAudit/stance/vocabulary.ts;
    // same list, same whole-word rule. Built from fragments so the words
    // themselves never sit in source.
    svc.getJobDescriptions.mockResolvedValue({ ...JDS, generationAvailable: false });
    renderWithProviders(<GenerateCorpus {...props} />);
    await screen.findByText("Account Executive");
    await screen.findByText(/not available on this deployment/i);
    const text = document.body.textContent!.toLowerCase();
    const words = [
      ["compl", "iant"],
      ["certi", "fied"],
      ["pas", "sed"],
      ["bias", "-free"],
      ["audi", "ted"],
    ].map((p) => p.join(""));
    for (const w of words) {
      expect(text).not.toMatch(new RegExp(`(?<![a-z0-9])${w}(?![a-z0-9])`));
    }
  });
});
