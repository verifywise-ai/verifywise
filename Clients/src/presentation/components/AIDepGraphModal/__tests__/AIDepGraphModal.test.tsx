import { vi } from "vitest";

vi.mock("../../AIDepGraph", () => ({
  default: () => <div data-testid="ai-dep-graph" />,
}));

vi.mock("@xyflow/react/dist/style.css", () => ({}));

import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import AIDepGraphModal from "../index";

describe("AIDepGraphModal", () => {
  const defaultProps = {
    open: true,
    onClose: vi.fn(),
    scanId: 123,
    repositoryName: "org/repo",
  };

  it("renders modal when open", () => {
    renderWithProviders(<AIDepGraphModal {...defaultProps} />);
    expect(screen.getByText("org/repo")).toBeInTheDocument();
  });

  it("does not render content when closed", () => {
    renderWithProviders(<AIDepGraphModal {...defaultProps} open={false} />);
    expect(screen.queryByText("org/repo")).not.toBeInTheDocument();
  });

  it("renders with repository URL", () => {
    renderWithProviders(
      <AIDepGraphModal {...defaultProps} repositoryUrl="https://github.com/org/repo" />,
    );
    expect(screen.getByText("org/repo")).toBeInTheDocument();
  });
});
