import { screen, fireEvent } from "@testing-library/react";
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

import SummarySection from "./SummarySection";
import type { FriaAssessment, FriaRight } from "../../../../../application/hooks/useFria";

const baseAssessment = {
  id: 1,
  completion_pct: 65,
  risk_score: 42,
  risk_level: "Moderate",
  rights_flagged: 1,
  status: "draft",
  deployment_decision: null,
  decision_conditions: "",
} as unknown as FriaAssessment;

const rights: FriaRight[] = [
  {
    id: 1,
    right_key: "dignity",
    right_title: "Human dignity",
    charter_ref: "Article 1",
    flagged: true,
    severity: 2,
    confidence: 1,
    impact_pathway: null,
    mitigation: null,
  },
  {
    id: 2,
    right_key: "privacy",
    right_title: "Privacy",
    charter_ref: "Article 7",
    flagged: false,
    severity: 0,
    confidence: 0,
    impact_pathway: null,
    mitigation: null,
  },
];

describe("SummarySection", () => {
  it("renders the summary statistics", () => {
    renderWithProviders(
      <SummarySection
        assessment={baseAssessment}
        rights={rights}
        onUpdate={vi.fn()}
        isSaving={false}
      />,
    );

    expect(screen.getByText("65%")).toBeInTheDocument();
    expect(screen.getByText("42/100")).toBeInTheDocument();
    expect(screen.getByText("1 of 2")).toBeInTheDocument();
    expect(screen.getByText("Moderate")).toBeInTheDocument();
    expect(screen.getByText("draft")).toBeInTheDocument();
  });

  it("lists flagged rights as chips when present", () => {
    renderWithProviders(
      <SummarySection
        assessment={baseAssessment}
        rights={rights}
        onUpdate={vi.fn()}
        isSaving={false}
      />,
    );

    expect(screen.getByText("Flagged rights")).toBeInTheDocument();
    expect(screen.getByText("Human dignity")).toBeInTheDocument();
  });

  it("does not show a flagged rights section when nothing is flagged", () => {
    const unflaggedRights = rights.map((r) => ({ ...r, flagged: false }));
    renderWithProviders(
      <SummarySection
        assessment={baseAssessment}
        rights={unflaggedRights}
        onUpdate={vi.fn()}
        isSaving={false}
      />,
    );

    expect(screen.queryByText("Flagged rights")).not.toBeInTheDocument();
  });

  it("calls onUpdate when the deployment decision changes", async () => {
    const onUpdate = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <SummarySection
        assessment={baseAssessment}
        rights={rights}
        onUpdate={onUpdate}
        isSaving={false}
      />,
    );

    await user.click(screen.getByRole("combobox"));
    const option = await screen.findByRole("option", { name: "Proceed with conditions" });
    await user.click(option);

    expect(onUpdate).toHaveBeenCalledWith({ deployment_decision: "Proceed with conditions" });
  });

  it("calls onUpdate with decision conditions on blur when changed", () => {
    const onUpdate = vi.fn();
    renderWithProviders(
      <SummarySection
        assessment={baseAssessment}
        rights={rights}
        onUpdate={onUpdate}
        isSaving={false}
      />,
    );

    const field = screen.getByLabelText("Decision conditions / rationale");
    fireEvent.change(field, { target: { value: "Requires legal sign-off" } });
    fireEvent.blur(field);

    expect(onUpdate).toHaveBeenCalledWith({ decision_conditions: "Requires legal sign-off" });
  });

  it("does not call onUpdate on blur when decision conditions are unchanged", () => {
    const onUpdate = vi.fn();
    renderWithProviders(
      <SummarySection
        assessment={baseAssessment}
        rights={rights}
        onUpdate={onUpdate}
        isSaving={false}
      />,
    );

    fireEvent.blur(screen.getByLabelText("Decision conditions / rationale"));
    expect(onUpdate).not.toHaveBeenCalled();
  });
});
