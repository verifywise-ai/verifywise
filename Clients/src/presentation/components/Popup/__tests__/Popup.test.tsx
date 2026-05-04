import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import Popup from "../index";

describe("Popup", () => {
  const baseProps = {
    popupId: "test-popup",
    popupContent: <div>Popup body content</div>,
    openPopupButtonName: "Open",
    popupTitle: "Test Popup Title",
    handleOpenOrClose: vi.fn(),
  };

  it("renders modal content when anchor is provided (open)", () => {
    const anchor = document.createElement("button");
    renderWithProviders(<Popup {...baseProps} anchor={anchor} />);
    expect(screen.getByText("Test Popup Title")).toBeInTheDocument();
    expect(screen.getByText("Popup body content")).toBeInTheDocument();
  });

  it("does not render modal content when anchor is null (closed)", () => {
    renderWithProviders(<Popup {...baseProps} anchor={null} />);
    expect(screen.queryByText("Test Popup Title")).not.toBeInTheDocument();
    expect(screen.queryByText("Popup body content")).not.toBeInTheDocument();
  });

  it("renders popup subtitle when provided", () => {
    const anchor = document.createElement("button");
    renderWithProviders(<Popup {...baseProps} anchor={anchor} popupSubtitle="Some subtitle" />);
    expect(screen.getByText("Some subtitle")).toBeInTheDocument();
  });

  it("does not render subtitle when not provided", () => {
    const anchor = document.createElement("button");
    renderWithProviders(<Popup {...baseProps} anchor={anchor} />);
    expect(screen.queryByText("Some subtitle")).not.toBeInTheDocument();
  });

  it("renders the open popup button text", () => {
    renderWithProviders(<Popup {...baseProps} anchor={null} />);
    expect(screen.getByText("Open")).toBeInTheDocument();
  });
});
