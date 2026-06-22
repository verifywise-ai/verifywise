import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import TagInput from "../index";

describe("TagInput Component", () => {
  it("renders label", () => {
    renderWithProviders(<TagInput label="Tags" value={[]} onChange={vi.fn()} />);

    expect(screen.getByText("Tags")).toBeInTheDocument();
  });

  it("shows required asterisk", () => {
    renderWithProviders(<TagInput label="Tags" value={[]} onChange={vi.fn()} isRequired />);

    expect(screen.getByText("*")).toBeInTheDocument();
  });

  it("renders tags as chips", () => {
    renderWithProviders(<TagInput label="Tags" value={["alpha", "beta"]} onChange={vi.fn()} />);

    expect(screen.getByText("alpha")).toBeInTheDocument();
    expect(screen.getByText("beta")).toBeInTheDocument();
  });

  it("adds a tag on Enter", async () => {
    const handleChange = vi.fn();
    const user = userEvent.setup();

    renderWithProviders(<TagInput label="Tags" value={[]} onChange={handleChange} />);

    const input = screen.getByRole("textbox");
    await user.click(input);
    await user.keyboard("newtag{Enter}");

    expect(handleChange).toHaveBeenCalledWith(["newtag"]);
  });

  it("adds a tag on comma", async () => {
    const handleChange = vi.fn();
    const user = userEvent.setup();

    renderWithProviders(<TagInput label="Tags" value={[]} onChange={handleChange} />);

    const input = screen.getByRole("textbox");
    await user.click(input);
    await user.keyboard("commatag,");

    expect(handleChange).toHaveBeenCalledWith(["commatag"]);
  });

  it("rejects tag exceeding maxLength", async () => {
    const handleChange = vi.fn();
    const user = userEvent.setup();

    renderWithProviders(<TagInput label="Tags" value={[]} onChange={handleChange} maxLength={5} />);

    const input = screen.getByRole("textbox");
    await user.click(input);
    await user.keyboard("toolong{Enter}");

    expect(handleChange).not.toHaveBeenCalled();
    expect(screen.getByText("Tag must be 5 characters or less")).toBeInTheDocument();
  });

  it("rejects tag with invalid characters", async () => {
    const handleChange = vi.fn();
    const user = userEvent.setup();

    renderWithProviders(<TagInput label="Tags" value={[]} onChange={handleChange} />);

    const input = screen.getByRole("textbox");
    await user.click(input);
    await user.keyboard("bad@tag!{Enter}");

    expect(handleChange).not.toHaveBeenCalled();
    expect(
      screen.getByText("Tags can only contain letters, numbers, spaces, hyphens, and underscores"),
    ).toBeInTheDocument();
  });

  it("rejects duplicate tag", async () => {
    const handleChange = vi.fn();
    const user = userEvent.setup();

    renderWithProviders(<TagInput label="Tags" value={["existing"]} onChange={handleChange} />);

    const input = screen.getByRole("textbox");
    await user.click(input);
    await user.keyboard("existing{Enter}");

    expect(handleChange).not.toHaveBeenCalled();
    expect(screen.getByText("Tag already exists")).toBeInTheDocument();
  });

  it("rejects tag exceeding maxTags", async () => {
    const handleChange = vi.fn();
    const user = userEvent.setup();

    renderWithProviders(
      <TagInput label="Tags" value={["a"]} onChange={handleChange} maxTags={1} />,
    );

    const input = screen.getByRole("textbox");
    await user.click(input);
    await user.keyboard("b{Enter}");

    expect(handleChange).not.toHaveBeenCalled();
    expect(screen.getByText("Maximum 1 tags allowed")).toBeInTheDocument();
  });

  it("removes tag on delete icon click", async () => {
    const handleChange = vi.fn();
    const user = userEvent.setup();

    renderWithProviders(
      <TagInput label="Tags" value={["alpha", "beta"]} onChange={handleChange} />,
    );

    const alphaChip = screen.getByText("alpha").closest(".MuiChip-root");
    const deleteBtn = alphaChip?.querySelector("svg");
    if (deleteBtn) await user.click(deleteBtn);

    expect(handleChange).toHaveBeenCalledWith(["beta"]);
  });

  it("removes last tag on backspace when input is empty", async () => {
    const handleChange = vi.fn();
    const user = userEvent.setup();

    renderWithProviders(
      <TagInput label="Tags" value={["alpha", "beta"]} onChange={handleChange} />,
    );

    const input = screen.getByRole("textbox");
    await user.click(input);
    await user.keyboard("{Backspace}");

    expect(handleChange).toHaveBeenCalledWith(["alpha"]);
  });

  it("shows filtered suggestions", async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <TagInput
        label="Tags"
        value={[]}
        onChange={vi.fn()}
        suggestions={["apple", "banana", "cherry"]}
      />,
    );

    const input = screen.getByRole("textbox");
    await user.click(input);
    await user.keyboard("a");

    expect(screen.getByText("apple")).toBeInTheDocument();
    expect(screen.getByText("banana")).toBeInTheDocument();
  });

  it("does not show already selected tags in suggestions", async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <TagInput
        label="Tags"
        value={["apple"]}
        onChange={vi.fn()}
        suggestions={["apple", "banana"]}
      />,
    );

    const input = screen.getByRole("textbox");
    await user.click(input);
    await user.keyboard("a");

    const chips = screen.getAllByRole("button");
    const suggestionLabels = chips
      .filter((c) => !c.querySelector(".MuiChip-deleteIcon"))
      .map((c) => c.textContent);
    expect(suggestionLabels).not.toContain("apple");
    expect(suggestionLabels).toContain("banana");
  });

  it("adds tag on suggestion click", async () => {
    const handleChange = vi.fn();
    const user = userEvent.setup();

    renderWithProviders(
      <TagInput label="Tags" value={[]} onChange={handleChange} suggestions={["suggestion"]} />,
    );

    const input = screen.getByRole("textbox");
    await user.click(input);
    await user.keyboard("sug");

    await user.click(screen.getByText("suggestion"));

    expect(handleChange).toHaveBeenCalledWith(["suggestion"]);
  });

  it("renders external error message", () => {
    renderWithProviders(
      <TagInput label="Tags" value={[]} onChange={vi.fn()} error="External error" />,
    );

    expect(screen.getByText("External error")).toBeInTheDocument();
  });
});
