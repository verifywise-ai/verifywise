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
    expect(screen.queryByText(/linked successfully/)).not.toBeInTheDocument();
  });
});
