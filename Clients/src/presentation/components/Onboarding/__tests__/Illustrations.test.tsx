import { renderWithProviders } from "../../../../test/renderWithProviders";
import Illustration from "../Illustrations";
import { IllustrationType } from "../../../../domain/enums/onboarding.enum";

describe("Illustration", () => {
  it("renders GradientCircles for GRADIENT_CIRCLES type", () => {
    const { container } = renderWithProviders(
      <Illustration type={IllustrationType.GRADIENT_CIRCLES} />,
    );
    expect(container.firstChild).toBeInTheDocument();
  });

  it("renders GeometricShapes for GEOMETRIC_SHAPES type", () => {
    const { container } = renderWithProviders(
      <Illustration type={IllustrationType.GEOMETRIC_SHAPES} />,
    );
    expect(container.firstChild).toBeInTheDocument();
  });

  it("renders AbstractWaves for ABSTRACT_WAVES type", () => {
    const { container } = renderWithProviders(
      <Illustration type={IllustrationType.ABSTRACT_WAVES} />,
    );
    expect(container.firstChild).toBeInTheDocument();
  });

  it("renders IconGrid for ICON_GRID type", () => {
    const { container } = renderWithProviders(<Illustration type={IllustrationType.ICON_GRID} />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it("renders FlowDiagram for FLOW_DIAGRAM type", () => {
    const { container } = renderWithProviders(
      <Illustration type={IllustrationType.FLOW_DIAGRAM} />,
    );
    expect(container.firstChild).toBeInTheDocument();
  });

  it("renders GradientCircles as default for unknown type", () => {
    const { container } = renderWithProviders(
      <Illustration type={"UNKNOWN" as IllustrationType} />,
    );
    expect(container.firstChild).toBeInTheDocument();
  });
});
