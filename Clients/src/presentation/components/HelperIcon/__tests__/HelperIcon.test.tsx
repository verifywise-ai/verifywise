import { screen, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import HelperIcon from "../index";

const mockOpen = vi.fn();
vi.mock("../../UserGuide", () => ({
  useUserGuideSidebarContext: () => ({ open: mockOpen }),
}));

describe("HelperIcon", () => {
  beforeEach(() => {
    mockOpen.mockClear();
  });

  it("renders an icon button", () => {
    renderWithProviders(<HelperIcon articlePath="test/article" />);
    expect(screen.getByLabelText("Open help information")).toBeInTheDocument();
  });

  it("calls userGuideSidebar.open with articlePath on click", () => {
    renderWithProviders(<HelperIcon articlePath="test/article" />);
    fireEvent.click(screen.getByLabelText("Open help information"));
    expect(mockOpen).toHaveBeenCalledWith("test/article");
  });

  it("appends sectionId to articlePath with hash", () => {
    renderWithProviders(<HelperIcon articlePath="test/article" sectionId="section1" />);
    fireEvent.click(screen.getByLabelText("Open help information"));
    expect(mockOpen).toHaveBeenCalledWith("test/article#section1");
  });

  it("renders with medium size", () => {
    renderWithProviders(<HelperIcon articlePath="test/article" size="medium" />);
    expect(screen.getByLabelText("Open help information")).toBeInTheDocument();
  });

  it("renders with large size", () => {
    renderWithProviders(<HelperIcon articlePath="test/article" size="large" />);
    expect(screen.getByLabelText("Open help information")).toBeInTheDocument();
  });
});
