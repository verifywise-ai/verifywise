import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AxiosError, AxiosHeaders } from "axios";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import type { AedtScopeDetermination } from "../../../../infrastructure/api/aedtBiasAuditService";

const { download, trigger } = vi.hoisted(() => ({ download: vi.fn(), trigger: vi.fn() }));

vi.mock("../../../../application/repository/aedtBiasAudit.repository", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  downloadAedtStance: download,
}));

vi.mock("../../../utils/browserDownload.utils", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  triggerBrowserDownload: trigger,
}));

vi.mock("../../../../application/hooks/useUsers", () => ({
  default: () => ({ users: [{ id: 1, name: "Ada", surname: "Byron" }], loading: false }),
}));

import StancePanel from "../StancePanel";

const row = (id: number, isCurrent: boolean): AedtScopeDetermination => ({
  id,
  version: id,
  pdf_sha256: "abc",
  pdf_file_id: id,
  score_at_generation: null,
  scope_at_generation: "out_of_scope",
  profile_version: id,
  question_set_version: 1,
  generated_by: 1,
  generated_at: "2026-10-02T10:00:00.000Z",
  isCurrent,
});

/** The server's 410 text (stanceService.downloadStance). */
const SERVER_GONE =
  "The PDF for stance 2 is no longer stored. Generate the stance again to obtain a new version.";

function gone() {
  return new AxiosError("Request failed", "ERR_BAD_REQUEST", undefined, undefined, {
    status: 410,
    statusText: "Gone",
    data: { message: "Gone", data: SERVER_GONE },
    headers: {},
    config: { headers: new AxiosHeaders() },
  });
}

function panel(kind: "run" | "scope", stances: AedtScopeDetermination[], onGenerate = vi.fn()) {
  return (
    <StancePanel
      kind={kind}
      stances={stances}
      generateBlockedReason={null}
      onGenerate={onGenerate}
      isGenerating={false}
      generateError={null}
    />
  );
}

function renderPanel(kind: "run" | "scope", stances: AedtScopeDetermination[]) {
  const onGenerate = vi.fn();
  const view = renderWithProviders(panel(kind, stances, onGenerate));
  return { onGenerate, rerender: view.rerender };
}

describe("StancePanel downloads", () => {
  beforeEach(() => {
    download.mockReset();
    trigger.mockReset();
  });

  it("saves the file through the shared browser download helper", async () => {
    const blob = new Blob(["%PDF"]);
    download.mockResolvedValue({ blob, filename: "stance-v1.pdf" });
    renderPanel("run", [row(1, true)]);
    fireEvent.click(screen.getByRole("button", { name: /download/i }));
    await waitFor(() => expect(trigger).toHaveBeenCalledWith(blob, "stance-v1.pdf"));
  });

  it("offers to generate a run's stance again when its file is gone", async () => {
    download.mockRejectedValue(gone());
    const { onGenerate } = renderPanel("run", [row(1, true)]);
    fireEvent.click(screen.getByRole("button", { name: /download/i }));
    fireEvent.click(await screen.findByRole("button", { name: /generate it again/i }));
    expect(onGenerate).toHaveBeenCalledTimes(1);
    // Where regeneration is offered, the server's own message stays.
    expect(screen.getByText(SERVER_GONE)).toBeInTheDocument();
  });

  it("offers to generate the current scope determination again when its file is gone", async () => {
    download.mockRejectedValue(gone());
    renderPanel("scope", [row(2, true)]);
    fireEvent.click(screen.getByRole("button", { name: /download/i }));
    expect(await screen.findByRole("button", { name: /generate it again/i })).toBeInTheDocument();
  });

  // Generating again would cite the current attested profile, not the one the
  // superseded determination recorded.
  it("does not offer to regenerate a superseded scope determination", async () => {
    download.mockRejectedValue(gone());
    renderPanel("scope", [row(2, true), row(1, false)]);
    fireEvent.click(screen.getAllByRole("button", { name: /download/i })[1]);
    expect(await screen.findByTestId("stance-not-regenerable")).toHaveTextContent(
      /no longer stored/,
    );
    // The server's text says to generate again, which is not offered here, so
    // the panel's own message replaces it and "no longer stored" is said once.
    expect(screen.queryByText(SERVER_GONE)).not.toBeInTheDocument();
    expect(screen.getAllByText(/no longer stored/)).toHaveLength(1);
    expect(screen.queryByRole("button", { name: /generate it again/i })).not.toBeInTheDocument();
  });

  // A re-attestation after the failed download supersedes the determination,
  // so the offer must follow the current isCurrent, not the one at failure.
  it("withdraws the regenerate offer once a later attestation supersedes the determination", async () => {
    download.mockRejectedValue(gone());
    const { rerender } = renderPanel("scope", [row(2, true)]);
    fireEvent.click(screen.getByRole("button", { name: /download/i }));
    expect(await screen.findByRole("button", { name: /generate it again/i })).toBeInTheDocument();
    rerender(panel("scope", [row(2, false)]));
    expect(screen.queryByRole("button", { name: /generate it again/i })).not.toBeInTheDocument();
    expect(screen.getByTestId("stance-not-regenerable")).toBeInTheDocument();
  });

  // A stance no longer listed tells us nothing about which attestation it
  // cited, so the note claims nothing and offers no regeneration.
  it("says only that the file is gone when the failed stance is no longer listed", async () => {
    download.mockRejectedValue(gone());
    const { rerender } = renderPanel("scope", [row(2, true)]);
    fireEvent.click(screen.getByRole("button", { name: /download/i }));
    await screen.findByRole("button", { name: /generate it again/i });
    rerender(panel("scope", [row(3, true)]));
    expect(screen.queryByRole("button", { name: /generate it again/i })).not.toBeInTheDocument();
    expect(screen.queryByTestId("stance-not-regenerable")).not.toBeInTheDocument();
    expect(screen.getByTestId("stance-file-gone")).toHaveTextContent(
      "The file is no longer stored.",
    );
    expect(screen.getByTestId("stance-file-gone")).not.toHaveTextContent(/attestation/);
    expect(screen.queryByText(SERVER_GONE)).not.toBeInTheDocument();
    expect(screen.getAllByText(/no longer stored/)).toHaveLength(1);
  });

  // Regeneration would apply, but this viewer cannot generate (a Reviewer,
  // say). The server's "generate again" text would point at a missing button.
  it("explains why it cannot be generated again when the viewer may not generate", async () => {
    download.mockRejectedValue(gone());
    const reason = "Only an Admin or Editor can generate a scope determination.";
    renderWithProviders(
      <StancePanel
        kind="scope"
        stances={[row(2, true)]}
        generateBlockedReason={reason}
        onGenerate={vi.fn()}
        isGenerating={false}
        generateError={null}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /download/i }));
    const note = await screen.findByTestId("stance-file-gone");
    expect(note).toHaveTextContent("The file is no longer stored.");
    // The reason shows once, under the disabled generate button, not again here.
    expect(note).not.toHaveTextContent(reason);
    expect(screen.getAllByText(reason)).toHaveLength(1);
    expect(screen.queryByText(SERVER_GONE)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /generate it again/i })).not.toBeInTheDocument();
  });
});
