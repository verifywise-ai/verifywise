import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";

vi.mock("../../../../../env.vars", () => ({
  ENV_VARs: {
    IS_DEMO_APP: true,
    URL: "http://localhost:3000/",
    IS_MULTI_TENANT: false,
    CLIENT_ID: "test",
    SLACK_URL: "https://slack.com",
    IS_SLACK_VISIBLE: "true",
  },
}));

describe("DemoBanner Component - visible", () => {
  it("renders the demo banner when IS_DEMO_APP is true", async () => {
    const { default: DemoAppBanner } = await import("../DemoAppBanner");

    renderWithProviders(<DemoAppBanner />);

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText(/you're viewing a public demo/i)).toBeInTheDocument();
  });
});

describe("DemoBanner Component - hidden", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("renders null when IS_DEMO_APP is false", async () => {
    vi.doMock("../../../../../env.vars", () => ({
      ENV_VARs: {
        IS_DEMO_APP: false,
        URL: "http://localhost:3000/",
        IS_MULTI_TENANT: false,
        CLIENT_ID: "test",
        SLACK_URL: "https://slack.com",
        IS_SLACK_VISIBLE: "true",
      },
    }));

    const { default: DemoAppBanner } = await import("../DemoAppBanner");

    const { container } = renderWithProviders(<DemoAppBanner />);

    expect(container.firstChild).toBeNull();
  });
});
