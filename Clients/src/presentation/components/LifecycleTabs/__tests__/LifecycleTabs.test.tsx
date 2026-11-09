import { screen, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import LifecycleTabs from "..";
import { lifecycleTabCount } from "../../../../application/utils/useCaseLifecycle";
import { LifecycleStage } from "../../../../domain/enums/lifecycleStage.enum";

describe("LifecycleTabs", () => {
  it("renders the four stages in pipeline order with their counts", () => {
    renderWithProviders(
      <LifecycleTabs
        value={LifecycleStage.PLANNED}
        onChange={() => {}}
        counts={{ in_review: 2, planned: 5, live: 3, retired: 1 }}
      />,
    );
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual([
      expect.stringContaining("In review"),
      expect.stringContaining("Planned"),
      expect.stringContaining("Live"),
      expect.stringContaining("Retired"),
    ]);
    expect(tabs[0].textContent).toContain("2");
    expect(tabs[1].textContent).toContain("5");
    expect(tabs[2].textContent).toContain("3");
    expect(tabs[3].textContent).toContain("1");
  });

  it("adds extra counts to a stage (pending intake submissions in In review)", () => {
    renderWithProviders(
      <LifecycleTabs
        value={LifecycleStage.IN_REVIEW}
        onChange={() => {}}
        counts={{ in_review: 2 }}
        extraCounts={{ in_review: 4 }}
      />,
    );
    expect(screen.getAllByRole("tab")[0].textContent).toContain("6");
  });

  it("reports the clicked stage", () => {
    const onChange = vi.fn();
    renderWithProviders(
      <LifecycleTabs value={LifecycleStage.PLANNED} onChange={onChange} counts={{}} />,
    );
    fireEvent.click(screen.getAllByRole("tab")[2]);
    expect(onChange).toHaveBeenCalledWith(LifecycleStage.LIVE);
  });

  it("treats missing counts as zero", () => {
    expect(lifecycleTabCount(LifecycleStage.LIVE)).toBe(0);
    expect(lifecycleTabCount(LifecycleStage.LIVE, { live: 2 }, { live: 1 })).toBe(3);
  });
});
