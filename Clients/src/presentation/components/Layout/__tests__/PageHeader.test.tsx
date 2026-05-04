import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import { PageHeader } from "../PageHeader";

describe("PageHeader", () => {
  it("renders the title", () => {
    renderWithProviders(<PageHeader title="My Page Title" />);
    expect(screen.getByText("My Page Title")).toBeInTheDocument();
  });

  it("renders the description when provided", () => {
    renderWithProviders(<PageHeader title="Title" description="This is a description" />);
    expect(screen.getByText("This is a description")).toBeInTheDocument();
  });

  it("does not render a description when not provided", () => {
    renderWithProviders(<PageHeader title="Title" />);
    expect(screen.queryByText("This is a description")).not.toBeInTheDocument();
  });

  it("renders rightContent when provided", () => {
    renderWithProviders(<PageHeader title="Title" rightContent={<button>Action</button>} />);
    expect(screen.getByText("Action")).toBeInTheDocument();
  });

  it("does not render rightContent when not provided", () => {
    renderWithProviders(<PageHeader title="Title" />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("renders with the correct heading variant", () => {
    renderWithProviders(<PageHeader title="Heading Test" />);
    const heading = screen.getByText("Heading Test");
    // h5 variant renders as an h5 element
    expect(heading.tagName).toBe("H5");
  });
});
