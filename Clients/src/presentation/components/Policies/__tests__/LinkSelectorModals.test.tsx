import { screen, fireEvent, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import { renderWithProviders } from "../../../../test/renderWithProviders";

vi.mock("../../Modals/StandardModal", () => ({
  default: ({ isOpen, onSubmit, children }: any) =>
    isOpen ? (
      <div>
        {children}
        <button onClick={() => onSubmit?.()}>submit-link</button>
      </div>
    ) : null,
}));
vi.mock("../../../../application/repository/projectRisk.repository", () => ({
  getAllProjectRisks: vi.fn().mockResolvedValue({ data: [{ id: 1, risk_name: "Risk one" }] }),
}));
vi.mock("../../../../application/repository/file.repository", () => ({
  getUserFilesMetaData: vi.fn().mockResolvedValue([{ id: 1, filename: "a.pdf" }]),
}));

import LinkRiskSelectorModal from "../LinkRiskSelectorModal";
import LinkEvidenceSelectorModal from "../LinkEvidenceSelectorModal";

describe.each([
  [
    "LinkRiskSelectorModal",
    (onSubmit: any, onClose: any) => (
      <LinkRiskSelectorModal
        isOpen={true}
        onClose={onClose}
        onSubmit={onSubmit}
        linkedRiskIds={[]}
        policyId={1}
      />
    ),
  ],
  [
    "LinkEvidenceSelectorModal",
    (onSubmit: any, onClose: any) => (
      <LinkEvidenceSelectorModal
        isOpen={true}
        onClose={onClose}
        onSubmit={onSubmit}
        linkedEvidenceIds={[]}
      />
    ),
  ],
])("%s submit", (_name, render) => {
  // The submit button only acts once a row is selected.
  const selectFirstRow = async () => {
    const row = (await screen.findByText(/Risk one|a\.pdf/)).closest("tr") as HTMLElement;
    fireEvent.click(row);
  };

  it("closes after a successful submit", async () => {
    const onClose = vi.fn();
    renderWithProviders(render(vi.fn().mockResolvedValue(undefined), onClose));
    await selectFirstRow();
    fireEvent.click(await screen.findByText("submit-link"));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("stays open and shows no success message when the submit fails", async () => {
    const onClose = vi.fn();
    const onSubmit = vi.fn().mockRejectedValue(new Error("boom"));
    renderWithProviders(render(onSubmit, onClose));
    await selectFirstRow();
    fireEvent.click(await screen.findByText("submit-link"));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByText(/^(Risk|Evidence) linked$/)).not.toBeInTheDocument();
  });
});

describe("selector modals when loading fails", () => {
  it("shows an inline error in the risk selector", async () => {
    const { getAllProjectRisks } =
      await import("../../../../application/repository/projectRisk.repository");
    vi.mocked(getAllProjectRisks).mockRejectedValueOnce(new Error("boom"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    renderWithProviders(
      <LinkRiskSelectorModal
        isOpen={true}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
        linkedRiskIds={[]}
        policyId={1}
      />,
    );
    expect(
      await screen.findByText("Couldn't load risks. Close this window and try again."),
    ).toBeInTheDocument();
  });

  it("shows an inline error in the evidence selector", async () => {
    const { getUserFilesMetaData } =
      await import("../../../../application/repository/file.repository");
    vi.mocked(getUserFilesMetaData).mockRejectedValueOnce(new Error("boom"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    renderWithProviders(
      <LinkEvidenceSelectorModal
        isOpen={true}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
        linkedEvidenceIds={[]}
      />,
    );
    expect(
      await screen.findByText("Couldn't load evidence. Close this window and try again."),
    ).toBeInTheDocument();
  });

  it("clears the rows of an earlier load when a reload fails", async () => {
    const { getAllProjectRisks } =
      await import("../../../../application/repository/projectRisk.repository");
    const { getUserFilesMetaData } =
      await import("../../../../application/repository/file.repository");
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const props = { onClose: vi.fn(), onSubmit: vi.fn() };
    const risk = (isOpen: boolean) => (
      <LinkRiskSelectorModal isOpen={isOpen} linkedRiskIds={[]} policyId={1} {...props} />
    );
    const risks = renderWithProviders(risk(true));
    expect(await screen.findByText("Risk one")).toBeInTheDocument();
    risks.rerender(risk(false));
    vi.mocked(getAllProjectRisks).mockRejectedValueOnce(new Error("boom"));
    risks.rerender(risk(true));
    expect(await screen.findByText(/Couldn't load risks/)).toBeInTheDocument();
    expect(screen.queryByText("Risk one")).not.toBeInTheDocument();
    risks.unmount();

    const evidence = (isOpen: boolean) => (
      <LinkEvidenceSelectorModal isOpen={isOpen} linkedEvidenceIds={[]} {...props} />
    );
    const files = renderWithProviders(evidence(true));
    expect(await screen.findByText("a.pdf")).toBeInTheDocument();
    files.rerender(evidence(false));
    vi.mocked(getUserFilesMetaData).mockRejectedValueOnce(new Error("boom"));
    files.rerender(evidence(true));
    expect(await screen.findByText(/Couldn't load evidence/)).toBeInTheDocument();
    expect(screen.queryByText("a.pdf")).not.toBeInTheDocument();
  });
});
