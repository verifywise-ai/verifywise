import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import { ButtonToggle } from "../index";

const defaultOptions = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "archived", label: "Archived" },
];

describe("ButtonToggle", () => {
  it("renders all option labels", () => {
    renderWithProviders(<ButtonToggle options={defaultOptions} value="all" onChange={vi.fn()} />);

    expect(screen.getByText("All")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("Archived")).toBeInTheDocument();
  });

  it("renders tabs with correct ARIA roles", () => {
    renderWithProviders(<ButtonToggle options={defaultOptions} value="all" onChange={vi.fn()} />);

    const tablist = screen.getByRole("tablist");
    expect(tablist).toBeInTheDocument();

    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(3);
  });

  it("marks the active option as aria-selected", () => {
    renderWithProviders(
      <ButtonToggle options={defaultOptions} value="active" onChange={vi.fn()} />,
    );

    const tabs = screen.getAllByRole("tab");
    expect(tabs[0]).toHaveAttribute("aria-selected", "false");
    expect(tabs[1]).toHaveAttribute("aria-selected", "true");
    expect(tabs[2]).toHaveAttribute("aria-selected", "false");
  });

  it("calls onChange with the correct value when a tab is clicked", async () => {
    const handleChange = vi.fn();
    const user = userEvent.setup();

    renderWithProviders(
      <ButtonToggle options={defaultOptions} value="all" onChange={handleChange} />,
    );

    await user.click(screen.getByText("Active"));
    expect(handleChange).toHaveBeenCalledWith("active");
  });

  it("calls onChange when pressing Enter on a tab", async () => {
    const handleChange = vi.fn();
    const user = userEvent.setup();

    renderWithProviders(
      <ButtonToggle options={defaultOptions} value="all" onChange={handleChange} />,
    );

    const archivedTab = screen.getByText("Archived");
    archivedTab.focus();
    await user.keyboard("{Enter}");
    expect(handleChange).toHaveBeenCalledWith("archived");
  });

  it("renders option counts when provided", () => {
    const optionsWithCounts = [
      { value: "all", label: "All", count: 10 },
      { value: "active", label: "Active", count: 7 },
      { value: "archived", label: "Archived", count: 3 },
    ];

    renderWithProviders(
      <ButtonToggle options={optionsWithCounts} value="all" onChange={vi.fn()} />,
    );

    expect(screen.getByText("10")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });
});
