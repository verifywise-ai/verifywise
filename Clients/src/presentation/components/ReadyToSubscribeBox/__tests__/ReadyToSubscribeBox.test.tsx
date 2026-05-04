import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import ReadyToSubscribeBox from "../ReadyToSubscribeBox";
import { ENV_VARs } from "../../../../../env.vars";

vi.mock("../../../../../env.vars", () => ({
  ENV_VARs: {
    IS_DEMO_APP: true,
  },
}));

describe("ReadyToSubscribeBox Component", () => {
  it("renders subscribe content when IS_DEMO_APP is true", () => {
    renderWithProviders(<ReadyToSubscribeBox />);

    expect(screen.getByText("Ready to subscribe?")).toBeInTheDocument();
    expect(screen.getByText(/Unlock the full potential of VerifyWise/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /view plans/i })).toBeInTheDocument();
  });

  it("opens pricing page in new tab when button is clicked", async () => {
    const windowOpen = vi.spyOn(window, "open").mockImplementation(() => null);
    const user = userEvent.setup();

    renderWithProviders(<ReadyToSubscribeBox />);

    await user.click(screen.getByRole("button", { name: /view plans/i }));

    expect(windowOpen).toHaveBeenCalledWith("https://verifywise.ai/pricing/", "_blank");

    windowOpen.mockRestore();
  });

  it("renders nothing when IS_DEMO_APP is false", () => {
    vi.mocked(ENV_VARs).IS_DEMO_APP = false;

    const { container } = renderWithProviders(<ReadyToSubscribeBox />);

    expect(container.innerHTML).toBe("");

    // Restore for other tests
    vi.mocked(ENV_VARs).IS_DEMO_APP = true;
  });
});
