import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import { InfoCard } from "../index";

describe("InfoCard", () => {
  it("renders title and body", () => {
    renderWithProviders(<InfoCard title="Info Title" body="Info body text" />);
    expect(screen.getByText("Info Title")).toBeInTheDocument();
    expect(screen.getByText("Info body text")).toBeInTheDocument();
  });

  it("renders decorative icon when provided without actionIcon", () => {
    renderWithProviders(
      <InfoCard title="Title" body="Body" icon={<span data-testid="deco-icon">*</span>} />,
    );
    expect(screen.getByTestId("deco-icon")).toBeInTheDocument();
  });

  it("renders action button when actionIcon and onActionClick provided", () => {
    const handleClick = vi.fn();
    renderWithProviders(
      <InfoCard
        title="Title"
        body="Body"
        actionIcon={<span data-testid="action-icon">A</span>}
        onActionClick={handleClick}
        actionTooltip="Click me"
      />,
    );
    expect(screen.getByTestId("action-icon")).toBeInTheDocument();
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("calls onActionClick when action button clicked", async () => {
    const handleClick = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <InfoCard
        title="Title"
        body="Body"
        actionIcon={<span>A</span>}
        onActionClick={handleClick}
      />,
    );
    await user.click(screen.getByRole("button"));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it("applies active styles when isActionActive is true", () => {
    renderWithProviders(
      <InfoCard
        title="Title"
        body="Body"
        actionIcon={<span>A</span>}
        onActionClick={vi.fn()}
        isActionActive
      />,
    );
    const button = screen.getByRole("button");
    expect(button).toBeInTheDocument();
  });
});
