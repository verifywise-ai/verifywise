import { fireEvent, screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import { PreviewMenu } from "../preview/PreviewMenu";
import {
  PUBLIC_PREVIEW_QUERY,
  reviewPreviewPath,
} from "../../../../application/utils/intakeRouting/previewRole";

describe("PreviewMenu", () => {
  it("offers the public form and the review flow as each role", async () => {
    const onPreviewForm = vi.fn();
    const onPreviewReview = vi.fn();
    renderWithProviders(
      <PreviewMenu onPreviewForm={onPreviewForm} onPreviewReview={onPreviewReview} />,
    );

    fireEvent.click(screen.getByTestId("button-intake-preview"));
    fireEvent.click(await screen.findByRole("menuitem", { name: /Form as a submitter/ }));
    expect(onPreviewForm).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId("button-intake-preview"));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Standard reviewer" }));
    expect(onPreviewReview).toHaveBeenCalledWith("standard");
  });

  it("builds the preview links", () => {
    expect(PUBLIC_PREVIEW_QUERY).toBe("vwPreview=1&as=submitter");
    expect(reviewPreviewPath("senior")).toBe("/intake-forms/submissions?simulateRole=senior");
  });
});
