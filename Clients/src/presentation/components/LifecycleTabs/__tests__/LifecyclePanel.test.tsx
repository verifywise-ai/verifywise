import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("../../../../application/hooks/useFormattedDate", () => ({
  default: () => ({ formatDate: (d: string) => d }),
}));

const mutation = { mutateAsync: vi.fn(), isPending: false };

async function renderPanel(style?: "classic") {
  vi.resetModules();
  if (style) window.localStorage.setItem("vw-ui-style", style);
  else window.localStorage.removeItem("vw-ui-style");
  const { default: LifecyclePanel } = await import("../LifecyclePanel");
  const { LifecycleStage } = await import("../../../../domain/enums/lifecycleStage.enum");
  render(
    <LifecyclePanel
      testId="panel"
      stage={LifecycleStage.LIVE}
      canManage={false}
      isStale={false}
      copy={{ staleMessage: "", goLiveDescription: "", retireTitle: "", retireDescription: "" }}
      goLive={mutation}
      retire={mutation}
      confirm={mutation}
    />,
  );
}

describe("LifecyclePanel stage display", () => {
  afterEach(() => window.localStorage.removeItem("vw-ui-style"));

  it("phase 1 shows the stage as steps", async () => {
    await renderPanel();
    expect(screen.getByTestId("stage-steps")).toHaveAttribute("title", "Step 3 of 4");
  });

  it("classic keeps the chip", async () => {
    await renderPanel("classic");
    expect(screen.queryByTestId("stage-steps")).toBeNull();
    expect(screen.getByText("Live")).toBeInTheDocument();
  });
});
