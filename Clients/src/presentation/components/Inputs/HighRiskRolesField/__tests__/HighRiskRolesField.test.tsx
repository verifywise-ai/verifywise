import { describe, it, expect, vi } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import { useState } from "react";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import { HighRiskRole } from "../../../../../domain/enums/highRiskRole.enum";
import HighRiskRolesField from "..";

function Harness({
  initial = [],
  onChange = vi.fn(),
}: {
  initial?: HighRiskRole[];
  onChange?: (roles: HighRiskRole[]) => void;
}) {
  const [roles, setRoles] = useState<HighRiskRole[]>(initial);
  return (
    <HighRiskRolesField
      id="roles"
      value={roles}
      onChange={(next) => {
        setRoles(next);
        onChange(next);
      }}
    />
  );
}

const openOptions = () => fireEvent.keyDown(screen.getByRole("combobox"), { key: "ArrowDown" });

describe("HighRiskRolesField", () => {
  it("labels the field and shows the selected roles", () => {
    renderWithProviders(<Harness initial={[HighRiskRole.PROVIDER]} />);
    expect(screen.getByText("High-risk roles")).toBeInTheDocument();
    expect(screen.getByText("Provider")).toBeInTheDocument();
  });

  it("adds a second role and reports both, Provider first", () => {
    const onChange = vi.fn();
    renderWithProviders(<Harness initial={[HighRiskRole.DEPLOYER]} onChange={onChange} />);
    openOptions();
    fireEvent.click(within(screen.getByRole("listbox")).getByText("Provider"));
    expect(onChange).toHaveBeenLastCalledWith([HighRiskRole.PROVIDER, HighRiskRole.DEPLOYER]);
  });

  it("offers only the roles not selected yet", () => {
    renderWithProviders(<Harness initial={[HighRiskRole.PROVIDER]} />);
    openOptions();
    const listbox = screen.getByRole("listbox");
    expect(within(listbox).queryByText("Provider")).toBeNull();
    expect(within(listbox).getByText("Deployer")).toBeInTheDocument();
  });

  it("shows the error", () => {
    renderWithProviders(
      <HighRiskRolesField
        id="roles"
        value={[]}
        onChange={vi.fn()}
        error="Select at least one high-risk role when EU AI Act is selected."
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Select at least one high-risk role when EU AI Act is selected.",
    );
  });
});
