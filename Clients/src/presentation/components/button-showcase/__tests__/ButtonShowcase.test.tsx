import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import { ButtonShowcase } from "../index";

vi.mock("../../button/customizable-button", () => ({
  CustomizableButton: ({ text, isDisabled }: { text: string; isDisabled?: boolean }) => (
    <button disabled={isDisabled} data-testid="customizable-button">
      {text}
    </button>
  ),
}));

vi.mock("../../VerifyWiseMultiSelect", () => ({
  default: ({ placeholder }: { placeholder: string }) => (
    <div data-testid="multi-select">{placeholder}</div>
  ),
}));

vi.mock("../../ViewToggle", () => ({
  default: () => <div data-testid="view-toggle">View Toggle</div>,
}));

describe("ButtonShowcase", () => {
  it("renders the page heading", () => {
    renderWithProviders(<ButtonShowcase />);
    expect(screen.getByText("Button Component Showcase")).toBeInTheDocument();
  });

  it("renders the description text", () => {
    renderWithProviders(<ButtonShowcase />);
    expect(
      screen.getByText("Test all button variants and their states for consistency"),
    ).toBeInTheDocument();
  });

  it("renders section headings", () => {
    renderWithProviders(<ButtonShowcase />);
    expect(screen.getByText("Primary Buttons (Before Standardization)")).toBeInTheDocument();
    expect(screen.getByText("Multi-Select Components")).toBeInTheDocument();
    expect(screen.getByText("Dashboard Action Buttons (30px)")).toBeInTheDocument();
    expect(screen.getByText("View Toggle Component")).toBeInTheDocument();
    expect(screen.getByText("Icon Buttons")).toBeInTheDocument();
    expect(screen.getByText("Secondary & Utility Buttons")).toBeInTheDocument();
    expect(screen.getByText("Action Buttons (Save, Cancel, Delete, etc.)")).toBeInTheDocument();
    expect(screen.getByText("State Comparison (Hover, Active, Disabled)")).toBeInTheDocument();
    expect(screen.getByText("Size Comparison (Current Inconsistencies)")).toBeInTheDocument();
  });

  it("renders CustomizableButton instances", () => {
    renderWithProviders(<ButtonShowcase />);
    const buttons = screen.getAllByTestId("customizable-button");
    expect(buttons.length).toBeGreaterThan(0);
  });

  it("renders CustomizableButton with specific text", () => {
    renderWithProviders(<ButtonShowcase />);
    expect(screen.getByText("Primary Medium (34px)")).toBeInTheDocument();
    expect(screen.getByText("Primary Small")).toBeInTheDocument();
    expect(screen.getByText("Outlined Primary")).toBeInTheDocument();
    expect(screen.getByText("Text Primary")).toBeInTheDocument();
    expect(screen.getByText("Secondary")).toBeInTheDocument();
    expect(screen.getByText("Save")).toBeInTheDocument();
    expect(screen.getByText("Delete")).toBeInTheDocument();
    expect(screen.getByText("Download")).toBeInTheDocument();
    expect(screen.getByText("Upload")).toBeInTheDocument();
  });

  it("renders disabled buttons in disabled state section", () => {
    renderWithProviders(<ButtonShowcase />);
    const allButtons = screen.getAllByTestId("customizable-button");
    const disabledButtons = allButtons.filter((b) => (b as HTMLButtonElement).disabled);
    expect(disabledButtons.length).toBeGreaterThan(0);
  });

  it("renders multi-select components", () => {
    renderWithProviders(<ButtonShowcase />);
    expect(screen.getByText("Show/hide cards")).toBeInTheDocument();
    expect(screen.getByText("Filter options")).toBeInTheDocument();
  });

  it("renders view toggle component", () => {
    renderWithProviders(<ButtonShowcase />);
    expect(screen.getByTestId("view-toggle")).toBeInTheDocument();
  });

  it("renders dashboard action buttons", () => {
    renderWithProviders(<ButtonShowcase />);
    expect(screen.getByText("Integrations")).toBeInTheDocument();
    expect(screen.getByText("Automations")).toBeInTheDocument();
  });

  it("renders icon buttons", () => {
    renderWithProviders(<ButtonShowcase />);
    expect(screen.getByLabelText("Lock")).toBeInTheDocument();
    expect(screen.getByLabelText("Unlock")).toBeInTheDocument();
    expect(screen.getByLabelText("Edit")).toBeInTheDocument();
  });

  it("renders Add New button", () => {
    renderWithProviders(<ButtonShowcase />);
    expect(screen.getByText("Add New (28px)")).toBeInTheDocument();
  });

  it("renders size comparison section", () => {
    renderWithProviders(<ButtonShowcase />);
    expect(screen.getByText("Different Heights (28px, 30px, 32px, 34px):")).toBeInTheDocument();
    expect(screen.getByText("28px")).toBeInTheDocument();
    expect(screen.getByText("30px")).toBeInTheDocument();
    expect(screen.getByText("32px")).toBeInTheDocument();
    expect(screen.getByText("34px")).toBeInTheDocument();
  });

  it("renders normal state section", () => {
    renderWithProviders(<ButtonShowcase />);
    expect(screen.getByText("Normal State:")).toBeInTheDocument();
  });

  it("renders disabled state section", () => {
    renderWithProviders(<ButtonShowcase />);
    expect(screen.getByText("Disabled State:")).toBeInTheDocument();
  });
});
