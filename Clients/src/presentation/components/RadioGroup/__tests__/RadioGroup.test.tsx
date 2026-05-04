import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import RadioComponent from "../index";

describe("RadioGroup", () => {
  const values = ["Option A", "Option B", "Option C"];

  it("renders all radio options", () => {
    renderWithProviders(<RadioComponent values={values} defaultValue="Option A" />);
    for (const value of values) {
      expect(screen.getByLabelText(value)).toBeInTheDocument();
    }
  });

  it("has the default value selected", () => {
    renderWithProviders(<RadioComponent values={values} defaultValue="Option B" />);
    const radioB = screen.getByLabelText("Option B") as HTMLInputElement;
    expect(radioB).toBeChecked();
  });

  it("other options are not selected by default", () => {
    renderWithProviders(<RadioComponent values={values} defaultValue="Option A" />);
    const radioB = screen.getByLabelText("Option B") as HTMLInputElement;
    const radioC = screen.getByLabelText("Option C") as HTMLInputElement;
    expect(radioB).not.toBeChecked();
    expect(radioC).not.toBeChecked();
  });

  it("calls onChange when a different option is selected", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithProviders(
      <RadioComponent values={values} defaultValue="Option A" onChange={onChange} />,
    );
    await user.click(screen.getByLabelText("Option C"));
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("renders without onChange prop", () => {
    renderWithProviders(<RadioComponent values={values} defaultValue="Option A" />);
    expect(screen.getByLabelText("Option A")).toBeInTheDocument();
  });
});
