import { screen, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import { FindReplacePopover, type FindReplacePopoverProps } from "../FindReplacePopover";

function baseProps(overrides: Partial<FindReplacePopoverProps> = {}): FindReplacePopoverProps {
  return {
    anchorEl: null,
    onClose: vi.fn(),
    searchText: "",
    onSearchTextChange: vi.fn(),
    replaceText: "",
    onReplaceTextChange: vi.fn(),
    searchMatchCount: 0,
    onSearchNext: vi.fn(),
    onSearchPrev: vi.fn(),
    onReplaceCurrent: vi.fn(),
    onReplaceAll: vi.fn(),
    ...overrides,
  };
}

function withAnchor() {
  const anchorEl = document.createElement("button");
  document.body.appendChild(anchorEl);
  return anchorEl;
}

describe("FindReplacePopover", () => {
  it("does not render its fields when anchorEl is null", () => {
    renderWithProviders(<FindReplacePopover {...baseProps()} />);
    expect(screen.queryByPlaceholderText("Find in document...")).not.toBeInTheDocument();
  });

  it("renders search and replace fields when open", () => {
    renderWithProviders(<FindReplacePopover {...baseProps({ anchorEl: withAnchor() })} />);
    expect(screen.getByPlaceholderText("Find in document...")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Replace with...")).toBeInTheDocument();
  });

  it("calls onSearchTextChange when typing in the find field", () => {
    const onSearchTextChange = vi.fn();
    renderWithProviders(
      <FindReplacePopover {...baseProps({ anchorEl: withAnchor(), onSearchTextChange })} />,
    );
    fireEvent.change(screen.getByPlaceholderText("Find in document..."), {
      target: { value: "policy" },
    });
    expect(onSearchTextChange).toHaveBeenCalledWith("policy");
  });

  it("calls onSearchNext when Enter is pressed in the find field", () => {
    const onSearchNext = vi.fn();
    renderWithProviders(
      <FindReplacePopover {...baseProps({ anchorEl: withAnchor(), onSearchNext })} />,
    );
    fireEvent.keyDown(screen.getByPlaceholderText("Find in document..."), { key: "Enter" });
    expect(onSearchNext).toHaveBeenCalled();
  });

  it("calls onReplaceTextChange when typing in the replace field", () => {
    const onReplaceTextChange = vi.fn();
    renderWithProviders(
      <FindReplacePopover {...baseProps({ anchorEl: withAnchor(), onReplaceTextChange })} />,
    );
    fireEvent.change(screen.getByPlaceholderText("Replace with..."), {
      target: { value: "rule" },
    });
    expect(onReplaceTextChange).toHaveBeenCalledWith("rule");
  });

  it("calls onReplaceCurrent when Enter is pressed in the replace field", () => {
    const onReplaceCurrent = vi.fn();
    renderWithProviders(
      <FindReplacePopover
        {...baseProps({ anchorEl: withAnchor(), onReplaceCurrent, searchMatchCount: 1 })}
      />,
    );
    fireEvent.keyDown(screen.getByPlaceholderText("Replace with..."), { key: "Enter" });
    expect(onReplaceCurrent).toHaveBeenCalled();
  });

  it("shows 'No matches found' when searchText is set but there are no matches", () => {
    renderWithProviders(
      <FindReplacePopover
        {...baseProps({ anchorEl: withAnchor(), searchText: "zzz", searchMatchCount: 0 })}
      />,
    );
    expect(screen.getByText("No matches found")).toBeInTheDocument();
  });

  it("shows the singular match count message", () => {
    renderWithProviders(
      <FindReplacePopover
        {...baseProps({ anchorEl: withAnchor(), searchText: "cat", searchMatchCount: 1 })}
      />,
    );
    expect(screen.getByText("1 match found")).toBeInTheDocument();
  });

  it("shows the plural match count message", () => {
    renderWithProviders(
      <FindReplacePopover
        {...baseProps({ anchorEl: withAnchor(), searchText: "cat", searchMatchCount: 3 })}
      />,
    );
    expect(screen.getByText("3 matches found")).toBeInTheDocument();
  });

  it("does not show a match count message when searchText is empty", () => {
    renderWithProviders(
      <FindReplacePopover {...baseProps({ anchorEl: withAnchor(), searchText: "" })} />,
    );
    expect(screen.queryByText(/match/)).not.toBeInTheDocument();
  });

  it("disables prev/next/replace controls when there are no matches", () => {
    renderWithProviders(
      <FindReplacePopover {...baseProps({ anchorEl: withAnchor(), searchMatchCount: 0 })} />,
    );
    expect(screen.getByText("Replace").closest("button")).toBeDisabled();
    expect(screen.getByText("Replace all").closest("button")).toBeDisabled();
  });

  it("calls onSearchNext and onSearchPrev when nav buttons are clicked", () => {
    const onSearchNext = vi.fn();
    const onSearchPrev = vi.fn();
    renderWithProviders(
      <FindReplacePopover
        {...baseProps({
          anchorEl: withAnchor(),
          searchMatchCount: 2,
          onSearchNext,
          onSearchPrev,
        })}
      />,
    );
    fireEvent.click(screen.getByLabelText("Next"));
    fireEvent.click(screen.getByLabelText("Previous"));
    expect(onSearchNext).toHaveBeenCalled();
    expect(onSearchPrev).toHaveBeenCalled();
  });

  it("calls onReplaceCurrent and onReplaceAll when their buttons are clicked", () => {
    const onReplaceCurrent = vi.fn();
    const onReplaceAll = vi.fn();
    renderWithProviders(
      <FindReplacePopover
        {...baseProps({
          anchorEl: withAnchor(),
          searchMatchCount: 2,
          onReplaceCurrent,
          onReplaceAll,
        })}
      />,
    );
    fireEvent.click(screen.getByText("Replace"));
    fireEvent.click(screen.getByText("Replace all"));
    expect(onReplaceCurrent).toHaveBeenCalled();
    expect(onReplaceAll).toHaveBeenCalled();
  });
});
