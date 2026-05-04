import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import VendorLogo from "../index";

describe("VendorLogo", () => {
  it("renders vendor name when showName is true (default)", () => {
    renderWithProviders(<VendorLogo website="https://example.com" vendorName="Acme Corp" />);
    expect(screen.getByText("Acme Corp")).toBeInTheDocument();
  });

  it("does not render vendor name when showName is false", () => {
    renderWithProviders(
      <VendorLogo website="https://example.com" vendorName="Acme Corp" showName={false} />,
    );
    expect(screen.queryByText("Acme Corp")).not.toBeInTheDocument();
  });

  it("shows fallback avatar with first letter when website is empty", () => {
    renderWithProviders(<VendorLogo website="" vendorName="Bravo Inc" />);
    expect(screen.getByText("B")).toBeInTheDocument();
  });

  it("shows fallback avatar with first letter when website is whitespace", () => {
    renderWithProviders(<VendorLogo website="   " vendorName="Delta Ltd" />);
    expect(screen.getByText("D")).toBeInTheDocument();
  });

  it("shows '?' when vendorName is empty", () => {
    renderWithProviders(<VendorLogo website="" vendorName="" />);
    expect(screen.getByText("?")).toBeInTheDocument();
  });

  it("renders img element with correct alt text when website is provided", () => {
    renderWithProviders(<VendorLogo website="https://apple.com" vendorName="Apple" />);
    const img = screen.getByAltText("Apple logo");
    expect(img).toBeInTheDocument();
  });

  it("applies custom size prop", () => {
    renderWithProviders(<VendorLogo website="" vendorName="Test" size={48} />);
    const avatar = screen.getByText("T");
    expect(avatar).toBeInTheDocument();
  });
});
