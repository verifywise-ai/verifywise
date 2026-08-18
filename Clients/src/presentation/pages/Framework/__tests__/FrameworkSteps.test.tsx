import FrameworkSteps from "../FrameworkSteps";

describe("FrameworkSteps", () => {
  it("exports a single tour step targeting the framework dashboard", () => {
    expect(FrameworkSteps).toHaveLength(1);
    expect(FrameworkSteps[0].target).toBe('[data-joyride-id="framework-dashboard"]');
    expect(FrameworkSteps[0].placement).toBe("bottom");
  });

  it("includes header and body copy plus an icon", () => {
    const step = FrameworkSteps[0];
    expect(step.content.header).toBe("Framework dashboard");
    expect(step.content.body).toContain("compliance frameworks");
    expect(step.content.icon).toBeTruthy();
  });
});
