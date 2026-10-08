import { waitFor } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import { SuggestedQuestionsPanel } from "../FieldPalette";
import { getLLMSuggestedQuestions } from "../../../../application/repository/intakeForm.repository";

vi.mock("../../../../application/repository/intakeForm.repository", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../../../../application/repository/intakeForm.repository")
    >();
  return { ...actual, getLLMSuggestedQuestions: vi.fn() };
});

const panel = (llmKeyId: number | null) => (
  <SuggestedQuestionsPanel
    fieldCount={0}
    existingFieldLabels={[]}
    entityType="use_case"
    llmKeyId={llmKeyId}
    onAdd={() => {}}
  />
);

describe("SuggestedQuestionsPanel", () => {
  beforeEach(() => {
    vi.mocked(getLLMSuggestedQuestions).mockReset();
  });

  it("fetches again when the key is removed mid-fetch and then set again", async () => {
    // The first request never settles until it is aborted.
    vi.mocked(getLLMSuggestedQuestions).mockImplementationOnce(
      (_entityType, _context, _llmKeyId, signal) =>
        new Promise((_resolve, reject) => {
          signal?.addEventListener("abort", () => reject(new Error("aborted")));
        }),
    );
    vi.mocked(getLLMSuggestedQuestions).mockResolvedValue({ data: [] } as never);

    const { rerender } = renderWithProviders(panel(3));
    await waitFor(() => expect(getLLMSuggestedQuestions).toHaveBeenCalledTimes(1));
    const firstSignal = vi.mocked(getLLMSuggestedQuestions).mock.calls[0][3];

    // The key goes away while the request is in flight: it is aborted.
    rerender(panel(null));
    await waitFor(() => expect(firstSignal?.aborted).toBe(true));

    // A key is set again: the panel must not be stuck "loading".
    rerender(panel(3));
    await waitFor(() => expect(getLLMSuggestedQuestions).toHaveBeenCalledTimes(2));
  });
});
