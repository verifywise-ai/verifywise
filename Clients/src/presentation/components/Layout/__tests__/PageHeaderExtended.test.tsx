import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import { PageHeaderExtended } from "../PageHeaderExtended";

describe("PageHeaderExtended", () => {
  it("renders the back button above the title when provided", () => {
    renderWithProviders(
      <PageHeaderExtended title="Tools" backButton={<button>Back to servers</button>} />,
    );
    const back = screen.getByRole("button", { name: "Back to servers" });
    const title = screen.getByText("Tools");
    expect(back.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("renders no back button when not provided", () => {
    renderWithProviders(<PageHeaderExtended title="Tools" />);
    expect(screen.queryByRole("button", { name: "Back to servers" })).not.toBeInTheDocument();
  });
});
