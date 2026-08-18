import { screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../../test/renderWithProviders";

vi.mock("../../../../../application/repository/fria.repository", () => ({
  friaRepository: {
    getEvidence: vi.fn().mockResolvedValue([]),
    linkEvidence: vi.fn(),
    unlinkEvidence: vi.fn(),
  },
}));
vi.mock("../../../../components/FilePickerModal", () => ({
  FilePickerModal: () => null,
}));
vi.mock("../../../../components/Modals/FileUpload", () => ({
  default: () => null,
}));

import RightsMatrixSection from "./RightsMatrixSection";
import type { FriaRight } from "../../../../../application/hooks/useFria";

const rights: FriaRight[] = [
  {
    id: 1,
    right_key: "dignity",
    right_title: "Human dignity",
    charter_ref: "Article 1",
    flagged: false,
    severity: 0,
    confidence: 0,
    impact_pathway: null,
    mitigation: null,
  },
  {
    id: 2,
    right_key: "privacy",
    right_title: "Privacy",
    charter_ref: "Article 7",
    flagged: true,
    severity: 2,
    confidence: 1,
    impact_pathway: "some pathway",
    mitigation: "some mitigation",
  },
];

describe("RightsMatrixSection", () => {
  it("renders each right's title and charter reference", () => {
    renderWithProviders(
      <RightsMatrixSection friaId={1} rights={rights} onUpdateRights={vi.fn()} isSaving={false} />,
    );

    expect(screen.getByText("Human dignity")).toBeInTheDocument();
    expect(screen.getByText("Article 1")).toBeInTheDocument();
    expect(screen.getByText("Privacy")).toBeInTheDocument();
    expect(screen.getByText("Article 7")).toBeInTheDocument();
  });

  it("shows severity/confidence/impact fields only for flagged rights", () => {
    renderWithProviders(
      <RightsMatrixSection friaId={1} rights={rights} onUpdateRights={vi.fn()} isSaving={false} />,
    );

    expect(screen.getByLabelText("Impact pathway")).toBeInTheDocument();
    expect(screen.getByLabelText("Mitigation measures")).toBeInTheDocument();
  });

  it("shows an empty state when there are no rights", () => {
    renderWithProviders(
      <RightsMatrixSection friaId={1} rights={[]} onUpdateRights={vi.fn()} isSaving={false} />,
    );

    expect(
      screen.getByText(
        "No fundamental rights loaded. Save the FRIA to generate the rights matrix.",
      ),
    ).toBeInTheDocument();
  });

  it("flags a right and calls onUpdateRights with the full local list", () => {
    const onUpdateRights = vi.fn();
    renderWithProviders(
      <RightsMatrixSection
        friaId={1}
        rights={rights}
        onUpdateRights={onUpdateRights}
        isSaving={false}
      />,
    );

    const flagCheckboxes = screen.getAllByLabelText("Flag");
    fireEvent.click(flagCheckboxes[0]); // dignity is the first (unflagged) right

    expect(onUpdateRights).toHaveBeenCalledTimes(1);
    const [updated] = onUpdateRights.mock.calls[0];
    expect(updated[0]).toMatchObject({ right_key: "dignity", flagged: true });
    expect(updated[1]).toMatchObject({ right_key: "privacy", flagged: true });
  });

  it("changes severity for a flagged right and calls onUpdateRights", async () => {
    const onUpdateRights = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <RightsMatrixSection
        friaId={1}
        rights={rights}
        onUpdateRights={onUpdateRights}
        isSaving={false}
      />,
    );

    const comboboxes = screen.getAllByRole("combobox");
    await user.click(comboboxes[0]); // severity for the flagged "privacy" right
    const option = await screen.findByRole("option", { name: "3 — High" });
    await user.click(option);

    expect(onUpdateRights).toHaveBeenCalled();
    const [updated] = onUpdateRights.mock.calls[0];
    const privacyRight = updated.find((r: FriaRight) => r.right_key === "privacy");
    expect(privacyRight.severity).toBe(3);
  });

  it("updates impact pathway text on blur and calls onUpdateRights", async () => {
    const onUpdateRights = vi.fn();
    renderWithProviders(
      <RightsMatrixSection
        friaId={1}
        rights={rights}
        onUpdateRights={onUpdateRights}
        isSaving={false}
      />,
    );

    const impactField = screen.getByLabelText("Impact pathway");
    fireEvent.change(impactField, { target: { value: "Updated pathway" } });
    fireEvent.blur(impactField.closest("div")!.parentElement!);

    await waitFor(() => {
      expect(onUpdateRights).toHaveBeenCalled();
    });
  });

  it("syncs local rights state when the rights prop changes", () => {
    const { rerender } = renderWithProviders(
      <RightsMatrixSection friaId={1} rights={rights} onUpdateRights={vi.fn()} isSaving={false} />,
    );

    const updatedRights = rights.map((r) =>
      r.right_key === "dignity" ? { ...r, right_title: "Renamed dignity" } : r,
    );
    rerender(
      <RightsMatrixSection
        friaId={1}
        rights={updatedRights}
        onUpdateRights={vi.fn()}
        isSaving={false}
      />,
    );

    expect(screen.getByText("Renamed dignity")).toBeInTheDocument();
  });
});
