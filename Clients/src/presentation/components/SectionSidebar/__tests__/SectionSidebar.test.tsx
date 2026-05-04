import { screen, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import SectionSidebar, { SectionItem } from "../index";
import { Shield, Settings, Users } from "lucide-react";

describe("SectionSidebar", () => {
  const sections: SectionItem[] = [
    { id: "overview", label: "Overview", Icon: Shield },
    { id: "settings", label: "Settings", Icon: Settings },
    { id: "users", label: "Users", Icon: Users },
  ];

  const defaultProps = {
    sections,
    activeSection: "overview",
    onSelect: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders all section labels", () => {
    renderWithProviders(<SectionSidebar {...defaultProps} />);

    expect(screen.getByText("Overview")).toBeInTheDocument();
    expect(screen.getByText("Settings")).toBeInTheDocument();
    expect(screen.getByText("Users")).toBeInTheDocument();
  });

  it("highlights the active section with selected-path class", () => {
    renderWithProviders(<SectionSidebar {...defaultProps} activeSection="settings" />);

    const settingsButton =
      screen.getByText("Settings").closest("div[role='button']") ||
      screen.getByText("Settings").closest(".MuiListItemButton-root");
    expect(settingsButton).toHaveClass("selected-path");
  });

  it("calls onSelect with the section id when clicked", () => {
    renderWithProviders(<SectionSidebar {...defaultProps} />);

    fireEvent.click(screen.getByText("Users"));
    expect(defaultProps.onSelect).toHaveBeenCalledWith("users");
  });

  it("applies non-active class to inactive sections", () => {
    renderWithProviders(<SectionSidebar {...defaultProps} activeSection="overview" />);

    const settingsButton =
      screen.getByText("Settings").closest("div[role='button']") ||
      screen.getByText("Settings").closest(".MuiListItemButton-root");
    expect(settingsButton).toHaveClass("unselected");
  });
});
