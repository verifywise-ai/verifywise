import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import EmptyStateTip from "../EmptyStateTip";
import { Info } from "lucide-react";

describe("EmptyStateTip", () => {
  it("renders title and description", () => {
    renderWithProviders(
      <EmptyStateTip icon={Info} title="Tip Title" description="Tip description text" />,
    );
    expect(screen.getByText("Tip Title")).toBeInTheDocument();
    expect(screen.getByText("Tip description text")).toBeInTheDocument();
  });

  it("renders the icon", () => {
    renderWithProviders(<EmptyStateTip icon={Info} title="Icon Tip" description="With an icon" />);
    const details = screen.getByText("Icon Tip").closest("details");
    expect(details).toBeInTheDocument();
  });

  it("toggles open/closed on click", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <EmptyStateTip icon={Info} title="Toggle Tip" description="Toggle content" />,
    );

    const summary = screen.getByText("Toggle Tip");
    const details = summary.closest("details")!;

    expect(details.open).toBe(false);

    await user.click(summary);
    expect(details.open).toBe(true);
  });
});
