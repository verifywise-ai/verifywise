import PolicySteps from "../PolicySteps";

describe("PolicySteps", () => {
  it("defines a step for every joyride target used on the policy dashboard", () => {
    const targets = PolicySteps.map((step) => step.target);
    expect(targets).toContain('[data-joyride-id="add-policy-button"]');
    expect(targets).toContain('[data-joyride-id="policy-status-cards"]');
    expect(targets).toContain('[data-joyride-id="policy-status-filter"]');
    expect(targets).toContain('[data-joyride-id="policy-search"]');
  });

  it("gives every step a header, body and icon", () => {
    expect(PolicySteps.length).toBeGreaterThan(0);
    PolicySteps.forEach((step) => {
      expect(step.content.header).toBeTruthy();
      expect(step.content.body).toBeTruthy();
      expect(step.content.icon).toBeTruthy();
      expect(step.placement).toBeTruthy();
    });
  });
});
