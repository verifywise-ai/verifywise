import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import { DescriptionCard } from "../index";

describe("DescriptionCard", () => {
  it("renders title and body", () => {
    renderWithProviders(<DescriptionCard title="My Title" body="Some description" />);
    expect(screen.getByText("My Title")).toBeInTheDocument();
    expect(screen.getByText("Some description")).toBeInTheDocument();
  });

  it("renders icon when provided", () => {
    renderWithProviders(
      <DescriptionCard
        title="With Icon"
        body="Has an icon"
        icon={<span data-testid="test-icon">*</span>}
      />,
    );
    expect(screen.getByTestId("test-icon")).toBeInTheDocument();
  });

  it("renders without icon when not provided", () => {
    const { container } = renderWithProviders(
      <DescriptionCard title="No Icon" body="No icon here" />,
    );
    expect(container.querySelector("[data-testid]")).not.toBeInTheDocument();
  });
});
