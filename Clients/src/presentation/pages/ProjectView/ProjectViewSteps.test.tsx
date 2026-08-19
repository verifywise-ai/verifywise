import ProjectViewSteps from "./ProjectViewSteps";

describe("ProjectViewSteps", () => {
  it("defines a tour step for each key project-view region", () => {
    expect(ProjectViewSteps).toHaveLength(4);

    const targets = ProjectViewSteps.map((step) => step.target);
    expect(targets).toEqual([
      '[data-joyride-id="project-tabs"]',
      '[data-joyride-id="framework-progress"]',
      '[data-joyride-id="risk-summary"]',
      '[data-joyride-id="project-assessments"]',
    ]);
  });

  it("gives every step a header, body, icon, and placement", () => {
    ProjectViewSteps.forEach((step) => {
      expect(step.content.header).toEqual(expect.any(String));
      expect(step.content.body).toEqual(expect.any(String));
      expect(step.content.icon).toBeTruthy();
      expect(step.placement).toBe("bottom");
    });
  });
});
