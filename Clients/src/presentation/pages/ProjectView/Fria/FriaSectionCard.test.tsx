import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import FriaSectionCard from "./FriaSectionCard";

describe("FriaSectionCard", () => {
  it("renders title, subtitle, EU AI Act content and children", () => {
    renderWithProviders(
      <FriaSectionCard
        title="Section title"
        subtitle="Section subtitle"
        euActContent={<span>Article reference text</span>}
      >
        <div>Child content</div>
      </FriaSectionCard>,
    );

    expect(screen.getByText("Section title")).toBeInTheDocument();
    expect(screen.getByText("Section subtitle")).toBeInTheDocument();
    expect(screen.getByText("Article reference text")).toBeInTheDocument();
    expect(screen.getByText("Child content")).toBeInTheDocument();
  });
});
