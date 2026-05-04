import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import Field from "../index";

describe("Field Component", () => {
  it("renders a text input with label", () => {
    renderWithProviders(<Field label="Username" placeholder="Enter username" />);

    expect(screen.getByText("Username")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Enter username")).toBeInTheDocument();
  });

  it("shows required asterisk when isRequired is true", () => {
    renderWithProviders(<Field label="Email" isRequired />);

    expect(screen.getByText("Email")).toBeInTheDocument();
    expect(screen.getByText("*")).toBeInTheDocument();
  });

  it("shows (optional) label when isOptional is true", () => {
    renderWithProviders(<Field label="Notes" isOptional />);

    expect(screen.getByText("(optional)")).toBeInTheDocument();
  });

  it("shows custom optional label", () => {
    renderWithProviders(<Field label="Bio" isOptional optionalLabel="not required" />);

    expect(screen.getByText("not required")).toBeInTheDocument();
  });

  it("calls onChange when user types", async () => {
    const handleChange = vi.fn();
    const user = userEvent.setup();

    renderWithProviders(
      <Field label="Name" value="" onChange={handleChange} placeholder="Type here" />,
    );

    await user.type(screen.getByPlaceholderText("Type here"), "a");
    expect(handleChange).toHaveBeenCalled();
  });

  it("renders password field with visibility toggle", () => {
    renderWithProviders(<Field type="password" label="Password" placeholder="Enter password" />);

    const input = screen.getByPlaceholderText("Enter password");
    expect(input).toHaveAttribute("type", "password");
    expect(screen.getByRole("button", { name: /toggle password visibility/i })).toBeInTheDocument();
  });

  it("toggles password visibility on icon click", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Field type="password" label="Password" placeholder="Enter password" />);

    const input = screen.getByPlaceholderText("Enter password");
    expect(input).toHaveAttribute("type", "password");

    await user.click(screen.getByRole("button", { name: /toggle password visibility/i }));
    expect(input).toHaveAttribute("type", "text");

    await user.click(screen.getByRole("button", { name: /toggle password visibility/i }));
    expect(input).toHaveAttribute("type", "password");
  });

  it("renders URL field with http:// prefix", () => {
    renderWithProviders(<Field type="url" label="Website" placeholder="example.com" />);

    expect(screen.getByText("http://")).toBeInTheDocument();
  });

  it("renders URL field with https:// prefix when https is true", () => {
    renderWithProviders(<Field type="url" label="Website" placeholder="example.com" https />);

    expect(screen.getByText("https://")).toBeInTheDocument();
  });

  it("displays error message when error prop is provided", () => {
    renderWithProviders(<Field label="Email" error="Invalid email format" />);

    expect(screen.getByText("Invalid email format")).toBeInTheDocument();
  });

  it("does not display error when error prop is empty", () => {
    renderWithProviders(<Field label="Email" />);

    expect(screen.queryByText(/error/i)).not.toBeTruthy();
  });

  it("renders disabled input", () => {
    renderWithProviders(<Field label="Name" disabled placeholder="Disabled" />);

    expect(screen.getByPlaceholderText("Disabled")).toBeDisabled();
  });

  it("renders description type as multiline textarea", () => {
    renderWithProviders(<Field type="description" label="Description" placeholder="Describe..." />);

    const textarea = screen.getByPlaceholderText("Describe...");
    expect(textarea.tagName.toLowerCase()).toBe("textarea");
  });

  it("renders without label when label is not provided", () => {
    renderWithProviders(<Field placeholder="No label" />);

    expect(screen.getByPlaceholderText("No label")).toBeInTheDocument();
    // No label element should exist
    expect(screen.queryByText("*")).not.toBeInTheDocument();
  });
});
