import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import NoProject from "../NoProject";

describe("NoProject", () => {
  it("renders the provided message", () => {
    renderWithProviders(<NoProject message="No projects found" />);
    expect(screen.getByText("No projects found")).toBeInTheDocument();
  });

  it("renders with a different message", () => {
    renderWithProviders(<NoProject message="Create your first project to get started" />);
    expect(screen.getByText("Create your first project to get started")).toBeInTheDocument();
  });
});
