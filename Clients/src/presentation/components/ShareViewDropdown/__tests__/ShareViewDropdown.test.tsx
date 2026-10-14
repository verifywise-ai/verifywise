import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import ShareViewDropdown from "../index";

describe("ShareViewDropdown", () => {
  const defaultProps = {
    anchorEl: null as HTMLElement | null,
    onClose: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not render popover content when anchorEl is null", () => {
    renderWithProviders(<ShareViewDropdown {...defaultProps} />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders the popover when anchorEl is provided", () => {
    const anchor = document.createElement("button");
    document.body.appendChild(anchor);

    renderWithProviders(<ShareViewDropdown {...defaultProps} anchorEl={anchor} />);

    expect(screen.getByRole("dialog", { name: "Share view settings" })).toBeInTheDocument();
    expect(screen.getByText("Share view")).toBeInTheDocument();

    document.body.removeChild(anchor);
  });

  it("shows the toggle for enabling share view", () => {
    const anchor = document.createElement("button");
    document.body.appendChild(anchor);

    renderWithProviders(<ShareViewDropdown {...defaultProps} anchorEl={anchor} />);

    expect(screen.getByRole("switch")).toBeInTheDocument();

    document.body.removeChild(anchor);
  });

  it("shows shareable link section when enabled", () => {
    const anchor = document.createElement("button");
    document.body.appendChild(anchor);

    renderWithProviders(
      <ShareViewDropdown
        {...defaultProps}
        anchorEl={anchor}
        enabled={true}
        shareableLink="https://example.com/share/abc123"
      />,
    );

    expect(screen.getByText("Shareable link")).toBeInTheDocument();

    document.body.removeChild(anchor);
  });

  it("displays description text", () => {
    const anchor = document.createElement("button");
    document.body.appendChild(anchor);

    renderWithProviders(<ShareViewDropdown {...defaultProps} anchorEl={anchor} />);

    expect(
      screen.getByText(/Send a view only link to anyone or embed this report/),
    ).toBeInTheDocument();

    document.body.removeChild(anchor);
  });

  it("leaves creating the new link to the parent when it confirms the refresh", () => {
    const anchor = document.createElement("button");
    document.body.appendChild(anchor);
    const onRefreshLink = vi.fn();
    const onGenerateLink = vi.fn().mockResolvedValue("https://example.com/share/new");

    renderWithProviders(
      <ShareViewDropdown
        {...defaultProps}
        anchorEl={anchor}
        enabled={true}
        shareableLink="https://example.com/share/abc123"
        onRefreshLink={onRefreshLink}
        onGenerateLink={onGenerateLink}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Refresh link" }));

    expect(onRefreshLink).toHaveBeenCalledTimes(1);
    expect(onGenerateLink).not.toHaveBeenCalled();

    document.body.removeChild(anchor);
  });

  it("generates a new link on refresh when the parent does not confirm", async () => {
    const anchor = document.createElement("button");
    document.body.appendChild(anchor);
    const onGenerateLink = vi.fn().mockResolvedValue("https://example.com/share/new");

    renderWithProviders(
      <ShareViewDropdown
        {...defaultProps}
        anchorEl={anchor}
        enabled={true}
        shareableLink="https://example.com/share/abc123"
        onGenerateLink={onGenerateLink}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Refresh link" }));

    await waitFor(() => expect(onGenerateLink).toHaveBeenCalledTimes(1));

    document.body.removeChild(anchor);
  });
});
