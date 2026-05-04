import { renderWithProviders } from "../../../../test/renderWithProviders";
import CustomizableSkeleton from "../index";

describe("CustomizableSkeleton", () => {
  it("renders a skeleton element", () => {
    renderWithProviders(<CustomizableSkeleton />);
    // MUI Skeleton renders a span with the MuiSkeleton class
    const skeleton = document.querySelector(".MuiSkeleton-root");
    expect(skeleton).toBeInTheDocument();
  });

  it("renders with text variant by default", () => {
    renderWithProviders(<CustomizableSkeleton />);
    const skeleton = document.querySelector(".MuiSkeleton-text");
    expect(skeleton).toBeInTheDocument();
  });

  it("renders with circular variant when specified", () => {
    renderWithProviders(<CustomizableSkeleton variant="circular" />);
    const skeleton = document.querySelector(".MuiSkeleton-circular");
    expect(skeleton).toBeInTheDocument();
  });

  it("renders with rectangular variant when specified", () => {
    renderWithProviders(<CustomizableSkeleton variant="rectangular" />);
    const skeleton = document.querySelector(".MuiSkeleton-rectangular");
    expect(skeleton).toBeInTheDocument();
  });
});
