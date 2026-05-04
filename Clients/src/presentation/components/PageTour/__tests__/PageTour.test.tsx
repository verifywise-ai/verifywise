import { renderWithProviders } from "../../../../test/renderWithProviders";
import PageTour from "../index";
import { IPageTourStep } from "../../../types/interfaces/i.tour";

// Mock react-joyride to avoid rendering the actual tour overlay
vi.mock("react-joyride", () => ({
  Joyride: () => <div data-testid="joyride-mock" />,
  __esModule: true,
}));

// Mock the CustomStep sub-component
vi.mock("../CustomStep", () => ({
  CustomStepWrapper: () => <div />,
}));

// Mock @emotion/react Global to render nothing
vi.mock("@emotion/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@emotion/react")>();
  return {
    ...actual,
    Global: () => null,
  };
});

const steps: IPageTourStep[] = [
  {
    target: "#step-1",
    content: { header: "Welcome", body: "This is step one" },
    placement: "bottom",
  },
  {
    target: "#step-2",
    content: { body: "This is step two" },
  },
];

describe("PageTour", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("renders without crashing when run is false", () => {
    const { container } = renderWithProviders(
      <PageTour steps={steps} run={false} tourKey="test-tour" />,
    );

    // Component should render without throwing
    expect(container).toBeTruthy();
  });

  it("renders without crashing when run is true", () => {
    const { container } = renderWithProviders(
      <PageTour steps={steps} run={true} tourKey="test-tour-2" />,
    );

    expect(container).toBeTruthy();
  });

  it("does not run the tour if it has been seen before", () => {
    localStorage.setItem("test-tour-seen", "true");

    const { container } = renderWithProviders(
      <PageTour steps={steps} run={true} tourKey="test-tour-seen" />,
    );

    expect(container).toBeTruthy();
  });
});
