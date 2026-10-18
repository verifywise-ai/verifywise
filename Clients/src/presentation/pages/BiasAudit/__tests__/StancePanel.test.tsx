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

function gone() {
  return new AxiosError("Request failed", "ERR_BAD_REQUEST", undefined, undefined, {
    status: 410,
    statusText: "Gone",
    data: { message: "Gone", data: "The stance file is no longer stored." },
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
    expect(screen.getByText("The stance file is no longer stored.")).toBeInTheDocument();
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
  });
});
