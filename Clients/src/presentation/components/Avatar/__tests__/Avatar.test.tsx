import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import Avatar from "../index";

describe("Avatar", () => {
  it("renders without crashing", () => {
    renderWithProviders(<Avatar />);
    const avatar = screen.getByText(/MK/);
    expect(avatar).toBeInTheDocument();
  });

  it("shows initials from hardcoded user name", () => {
    renderWithProviders(<Avatar />);
    expect(screen.getByText("M", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("K", { exact: false })).toBeInTheDocument();
  });

  it("renders with small size", () => {
    renderWithProviders(<Avatar small />);
    const avatar = screen.getByText(/MK/);
    expect(avatar).toBeInTheDocument();
  });

  it("renders with custom src prop", () => {
    renderWithProviders(<Avatar src="https://example.com/photo.jpg" />);
    const img = screen.getByRole("img", { name: /Mohammad Khalilzadeh/i });
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute("src", "https://example.com/photo.jpg");
  });
});
