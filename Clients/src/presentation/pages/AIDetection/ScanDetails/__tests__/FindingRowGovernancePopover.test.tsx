import { render, screen, fireEvent } from "@testing-library/react";
import { FindingRowGovernancePopover } from "../FindingRowGovernancePopover";

describe("FindingRowGovernancePopover", () => {
  it("does not render popover content when closed (anchorEl is null)", () => {
    render(
      <FindingRowGovernancePopover
        anchorEl={null}
        localStatus={null}
        onClose={vi.fn()}
        onStatusChange={vi.fn()}
        onCreateSuppressionRule={vi.fn()}
      />,
    );

    expect(screen.queryByText("Reviewed")).not.toBeInTheDocument();
  });

  it("renders every governance status option when open", () => {
    const anchorEl = document.createElement("button");
    document.body.appendChild(anchorEl);

    render(
      <FindingRowGovernancePopover
        anchorEl={anchorEl}
        localStatus={null}
        onClose={vi.fn()}
        onStatusChange={vi.fn()}
        onCreateSuppressionRule={vi.fn()}
      />,
    );

    expect(screen.getByText("Reviewed")).toBeInTheDocument();
    expect(screen.getByText("Approved")).toBeInTheDocument();
    expect(screen.getByText("Flagged")).toBeInTheDocument();
    expect(screen.getByText("Suppressed")).toBeInTheDocument();
    expect(screen.getByText("Accepted risk")).toBeInTheDocument();
    expect(screen.getByText("Create suppression rule…")).toBeInTheDocument();
  });

  it("calls onStatusChange with the clicked status", () => {
    const anchorEl = document.createElement("button");
    document.body.appendChild(anchorEl);
    const onStatusChange = vi.fn();

    render(
      <FindingRowGovernancePopover
        anchorEl={anchorEl}
        localStatus={null}
        onClose={vi.fn()}
        onStatusChange={onStatusChange}
        onCreateSuppressionRule={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText("Approved"));
    expect(onStatusChange).toHaveBeenCalledWith("approved");
  });

  it("shows a 'Clear status' option when a status is already set", () => {
    const anchorEl = document.createElement("button");
    document.body.appendChild(anchorEl);
    const onStatusChange = vi.fn();

    render(
      <FindingRowGovernancePopover
        anchorEl={anchorEl}
        localStatus="approved"
        onClose={vi.fn()}
        onStatusChange={onStatusChange}
        onCreateSuppressionRule={vi.fn()}
      />,
    );

    const clearOption = screen.getByText("Clear status");
    expect(clearOption).toBeInTheDocument();

    fireEvent.click(clearOption);
    expect(onStatusChange).toHaveBeenCalledWith(null);
  });

  it("does not show 'Clear status' when no status is set", () => {
    const anchorEl = document.createElement("button");
    document.body.appendChild(anchorEl);

    render(
      <FindingRowGovernancePopover
        anchorEl={anchorEl}
        localStatus={null}
        onClose={vi.fn()}
        onStatusChange={vi.fn()}
        onCreateSuppressionRule={vi.fn()}
      />,
    );

    expect(screen.queryByText("Clear status")).not.toBeInTheDocument();
  });

  it("calls onCreateSuppressionRule when the suppression rule option is clicked", () => {
    const anchorEl = document.createElement("button");
    document.body.appendChild(anchorEl);
    const onCreateSuppressionRule = vi.fn();

    render(
      <FindingRowGovernancePopover
        anchorEl={anchorEl}
        localStatus={null}
        onClose={vi.fn()}
        onStatusChange={vi.fn()}
        onCreateSuppressionRule={onCreateSuppressionRule}
      />,
    );

    fireEvent.click(screen.getByText("Create suppression rule…"));
    expect(onCreateSuppressionRule).toHaveBeenCalled();
  });
});
