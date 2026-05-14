const CCMSteps = [
  {
    target: '[data-joyride-id="ccm-status-cards"]',
    content: "Get a quick overview of your control monitoring health.",
    title: "Monitoring Overview",
    placement: "bottom" as const,
  },
  {
    target: '[data-joyride-id="ccm-tab-bar"]',
    content: "Switch between Dashboard, Connectors, and Tests.",
    title: "Navigation Tabs",
    placement: "bottom" as const,
  },
  {
    target: '[data-joyride-id="ccm-add-connector"]',
    content: "Add a connector to integrate with AWS, GitHub, or Generic APIs.",
    title: "Add Connector",
    placement: "left" as const,
  },
  {
    target: '[data-joyride-id="ccm-add-test"]',
    content: "Create automated tests that run on a schedule against your connectors.",
    title: "Add Control Test",
    placement: "left" as const,
  },
];

export default CCMSteps;
