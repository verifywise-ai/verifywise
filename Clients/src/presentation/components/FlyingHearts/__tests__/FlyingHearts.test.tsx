import { renderWithProviders } from "../../../../test/renderWithProviders";
import { act } from "@testing-library/react";
import { FlyingHearts } from "../index";

describe("FlyingHearts Component", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders without crashing", () => {
    const { container } = renderWithProviders(<FlyingHearts />);

    expect(container).toBeTruthy();
  });

  it("renders heart SVG elements", () => {
    const { container } = renderWithProviders(<FlyingHearts />);

    const svgs = container.querySelectorAll("svg");
    expect(svgs.length).toBe(30);
  });

  it("calls onComplete after animation finishes", () => {
    const onComplete = vi.fn();
    renderWithProviders(<FlyingHearts onComplete={onComplete} />);

    expect(onComplete).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(7000);
    });

    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});
