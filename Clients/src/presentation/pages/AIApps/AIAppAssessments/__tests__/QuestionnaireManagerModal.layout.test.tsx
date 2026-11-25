import { vi } from "vitest";
import { fireEvent } from "@testing-library/react";

vi.mock("../../../../components/Modals/StandardModal", () => ({
  default: ({ children }: any) => <div data-testid="standard-modal">{children}</div>,
}));
vi.mock("../../../../components/Inputs/Field", () => ({
  default: (props: any) => (
    <input data-testid={props.dataTestId} data-sx={JSON.stringify(props.sx ?? null)} />
  ),
}));
vi.mock("../../../../components/Inputs/Select", () => ({
  default: (props: any) => (
    <div data-testid={props.dataTestId} data-sx={JSON.stringify(props.sx ?? null)} />
  ),
}));
vi.mock("../../../../../application/hooks/useCan", () => ({ useCan: () => true }));
vi.mock("../../../../../application/hooks/useAiAppBulk", () => ({
  useAiAppQuestionnaires: () => ({
    data: [
      {
        id: 1,
        name: "AI app risk assessment",
        description: "",
        questions: [{ label: "Data sensitivity", description: "", weight: 1 }],
      },
    ],
  }),
  useSaveAiAppQuestionnaire: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteAiAppQuestionnaire: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import { renderWithProviders } from "../../../../../test/renderWithProviders";
import QuestionnaireManagerModal from "../QuestionnaireManagerModal";
import { SELECT_MIN_WIDTH } from "../../../../components/Inputs/Select/constants";

describe("QuestionnaireManagerModal layout", () => {
  it("gives the weight select a column as wide as its minimum and the house default heights", () => {
    const { getByTestId, getAllByRole } = renderWithProviders(
      <QuestionnaireManagerModal onClose={vi.fn()} />,
    );
    fireEvent.click(getAllByRole("button", { name: /edit/i })[0]);

    // A narrower column let the select overflow the question card.
    expect(JSON.parse(getByTestId("ai-app-question-weight-0").dataset.sx!)).toEqual({
      width: SELECT_MIN_WIDTH,
      flexShrink: 0,
    });
    // No forced height: the Label field and the Weight select both use the default.
    expect(JSON.parse(getByTestId("ai-app-question-label-0").dataset.sx!)).toBeNull();
  });
});
