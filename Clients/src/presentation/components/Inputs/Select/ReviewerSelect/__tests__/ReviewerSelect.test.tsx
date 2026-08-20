import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../../../test/renderWithProviders";
import ReviewerMultiSelect from "../index";

const mockUsers = [
  { id: 1, name: "Alice", surname: "Smith", email: "alice@example.com" },
  { id: 2, name: "Bob", surname: "", email: "bob@example.com" },
];

vi.mock("../../../../../../application/hooks/useUsers", () => ({
  default: () => ({ users: mockUsers }),
}));

describe("ReviewerMultiSelect", () => {
  it("renders the default label", () => {
    renderWithProviders(<ReviewerMultiSelect selected={[]} setSelected={vi.fn()} />);

    expect(screen.getByText("Assigned reviewers")).toBeInTheDocument();
  });

  it("renders a custom label", () => {
    renderWithProviders(
      <ReviewerMultiSelect selected={[]} setSelected={vi.fn()} label="Reviewers for this task" />,
    );

    expect(screen.getByText("Reviewers for this task")).toBeInTheDocument();
  });

  it("shows the required asterisk", () => {
    renderWithProviders(<ReviewerMultiSelect selected={[]} setSelected={vi.fn()} required />);

    expect(screen.getByText("*")).toBeInTheDocument();
  });

  it("renders the selected reviewers' names joined together", () => {
    renderWithProviders(<ReviewerMultiSelect selected={["1", "2"]} setSelected={vi.fn()} />);

    expect(screen.getByText("Alice Smith, Bob")).toBeInTheDocument();
  });

  it("lists every user as an option with a checkbox and email", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ReviewerMultiSelect selected={[]} setSelected={vi.fn()} />);

    await user.click(screen.getByRole("combobox"));

    expect(screen.getByText("alice@example.com")).toBeInTheDocument();
    expect(screen.getByText("bob@example.com")).toBeInTheDocument();
    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes).toHaveLength(2);
  });

  it("checks the checkbox for already-selected users", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ReviewerMultiSelect selected={["1"]} setSelected={vi.fn()} />);

    await user.click(screen.getByRole("combobox"));

    const checkboxes = screen.getAllByRole("checkbox") as HTMLInputElement[];
    expect(checkboxes[0]).toBeChecked();
    expect(checkboxes[1]).not.toBeChecked();
  });

  it("calls setSelected with the updated id list when a user is toggled", async () => {
    const setSelected = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<ReviewerMultiSelect selected={["1"]} setSelected={setSelected} />);

    await user.click(screen.getByRole("combobox"));
    await user.click(screen.getByText("bob@example.com"));

    expect(setSelected).toHaveBeenCalledWith(["1", "2"]);
  });

  it("renders the error message", () => {
    renderWithProviders(
      <ReviewerMultiSelect
        selected={[]}
        setSelected={vi.fn()}
        error="Select at least one reviewer"
      />,
    );

    expect(screen.getByText("Select at least one reviewer")).toBeInTheDocument();
  });
});
