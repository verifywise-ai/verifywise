import { vi } from "vitest";

vi.mock("../../Inputs/Select", () => ({
  default: ({ id, value, items, onChange, disabled, placeholder }: any) => {
    const needsNumberConversion = id !== "entity-type-select" && id !== "framework-select";
    return (
      <select
        data-testid={id || "select"}
        value={value}
        onChange={(e) => {
          const raw = e.target.value;
          onChange({ target: { value: needsNumberConversion ? Number(raw) : raw } });
        }}
        disabled={disabled}
        aria-label={placeholder || "select"}
      >
        <option value="">{placeholder}</option>
        {items.map((item: any) => (
          <option key={item._id} value={item._id}>
            {item.name}
          </option>
        ))}
      </select>
    );
  },
}));

vi.mock("../../../../application/repository/entity.repository", () => ({
  getAllEntities: vi.fn(),
}));

vi.mock("../../../../application/repository/vendor.repository", () => ({
  getAllVendors: vi.fn(),
}));

vi.mock("../../../../application/repository/policy.repository", () => ({
  getAllPolicies: vi.fn(),
}));

import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import EntityLinkSelector from "../index";
import { buildVendor } from "../../../../test/factories";
import { getAllEntities } from "../../../../application/repository/entity.repository";
import { getAllVendors } from "../../../../application/repository/vendor.repository";
import { getAllPolicies } from "../../../../application/repository/policy.repository";

describe("EntityLinkSelector", () => {
  const defaultOnChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (getAllVendors as any).mockResolvedValue({ data: [] });
    (getAllEntities as any).mockResolvedValue({ data: [] });
    (getAllPolicies as any).mockResolvedValue({ data: [] });
  });

  it("renders without crashing", () => {
    renderWithProviders(<EntityLinkSelector value={[]} onChange={defaultOnChange} />);
    expect(screen.getByText("Linked Items")).toBeInTheDocument();
  });

  it("renders entity type selector with options", () => {
    renderWithProviders(<EntityLinkSelector value={[]} onChange={defaultOnChange} />);
    const typeSelect = screen.getByTestId("entity-type-select");
    expect(typeSelect).toBeInTheDocument();
    expect(screen.getByText("Vendor")).toBeInTheDocument();
    expect(screen.getByText("Model")).toBeInTheDocument();
    expect(screen.getByText("Policy")).toBeInTheDocument();
    expect(screen.getByText("Use-case")).toBeInTheDocument();
  });

  it("renders vendor select when Vendor type is selected", async () => {
    (getAllVendors as any).mockResolvedValue({
      data: [buildVendor({ vendor_name: "TestVendor" })],
    });
    renderWithProviders(<EntityLinkSelector value={[]} onChange={defaultOnChange} />);
    await vi.waitFor(() => {
      expect(getAllVendors).toHaveBeenCalled();
    });

    const typeSelect = screen.getByTestId("entity-type-select");
    await userEvent.selectOptions(typeSelect, "vendor");
    expect(screen.getByTestId("direct-entity-select")).toBeInTheDocument();
  });

  it("renders model select when Model type is selected", async () => {
    (getAllEntities as any).mockResolvedValue({
      data: [{ id: 1, provider: "OpenAI", model: "GPT-4" }],
    });
    renderWithProviders(<EntityLinkSelector value={[]} onChange={defaultOnChange} />);
    await vi.waitFor(() => {
      expect(getAllEntities).toHaveBeenCalled();
    });

    const typeSelect = screen.getByTestId("entity-type-select");
    await userEvent.selectOptions(typeSelect, "model");
    expect(screen.getByTestId("direct-entity-select")).toBeInTheDocument();
  });

  it("renders policy select when Policy type is selected", async () => {
    (getAllPolicies as any).mockResolvedValue([{ id: 1, title: "Test Policy" }]);
    renderWithProviders(<EntityLinkSelector value={[]} onChange={defaultOnChange} />);
    await vi.waitFor(() => {
      expect(getAllPolicies).toHaveBeenCalled();
    });

    const typeSelect = screen.getByTestId("entity-type-select");
    await userEvent.selectOptions(typeSelect, "policy");
    expect(screen.getByTestId("direct-entity-select")).toBeInTheDocument();
  });

  it("renders project/use-case select when Use-case type is selected", async () => {
    (getAllEntities as any).mockResolvedValue({
      data: [
        { id: 1, project_title: "Project A", is_organizational: false },
        { id: 2, project_title: "Org Framework", is_organizational: true },
      ],
    });
    renderWithProviders(<EntityLinkSelector value={[]} onChange={defaultOnChange} />);
    await vi.waitFor(() => {
      expect(getAllEntities).toHaveBeenCalled();
    });

    const typeSelect = screen.getByTestId("entity-type-select");
    await userEvent.selectOptions(typeSelect, "use_case");
    expect(screen.getByTestId("project-select")).toBeInTheDocument();
    expect(screen.getByText("Project A")).toBeInTheDocument();
    expect(screen.queryByText("Org Framework")).not.toBeInTheDocument();
  });

  it("renders framework select when Framework type is selected", async () => {
    (getAllEntities as any).mockResolvedValue({
      data: [
        { id: 1, project_title: "Project A", is_organizational: false },
        { id: 2, project_title: "Org Framework", is_organizational: true },
      ],
    });
    renderWithProviders(<EntityLinkSelector value={[]} onChange={defaultOnChange} />);
    await vi.waitFor(() => {
      expect(getAllEntities).toHaveBeenCalled();
    });

    const typeSelect = screen.getByTestId("entity-type-select");
    await userEvent.selectOptions(typeSelect, "framework");
    expect(screen.getByTestId("framework-select")).toBeInTheDocument();
  });

  it("shows no use-cases message when no projects", async () => {
    renderWithProviders(<EntityLinkSelector value={[]} onChange={defaultOnChange} />);
    const typeSelect = screen.getByTestId("entity-type-select");
    await userEvent.selectOptions(typeSelect, "use_case");
    screen.getAllByRole("combobox");
    expect(screen.getByText("No use-cases available")).toBeInTheDocument();
  });

  it("shows no frameworks message when no organizational frameworks", async () => {
    (getAllEntities as any).mockResolvedValue({
      data: [{ id: 1, project_title: "Project A", is_organizational: false }],
    });
    renderWithProviders(<EntityLinkSelector value={[]} onChange={defaultOnChange} />);
    await vi.waitFor(() => {
      expect(getAllEntities).toHaveBeenCalled();
    });

    const typeSelect = screen.getByTestId("entity-type-select");
    await userEvent.selectOptions(typeSelect, "framework");
    // Since getProjectDetails returns no org projects, frameworks list is empty
    await vi.waitFor(() => {
      expect(screen.getByText("No organizational frameworks available")).toBeInTheDocument();
    });
  });

  it("displays existing linked items", () => {
    renderWithProviders(
      <EntityLinkSelector
        value={[{ entity_id: 1, entity_type: "vendor", entity_name: "Acme Corp" }]}
        onChange={defaultOnChange}
      />,
    );
    expect(screen.getByText("Vendor:")).toBeInTheDocument();
    expect(screen.getByText("Acme Corp")).toBeInTheDocument();
  });

  it("displays entity name fallback when entity_name is missing", () => {
    renderWithProviders(
      <EntityLinkSelector
        value={[{ entity_id: 5, entity_type: "model" }]}
        onChange={defaultOnChange}
      />,
    );
    expect(screen.getByText("#5")).toBeInTheDocument();
  });

  it("adds a vendor link when vendor selected and plus clicked", async () => {
    const onChange = vi.fn();
    (getAllVendors as any).mockResolvedValue({
      data: [buildVendor()],
    });
    renderWithProviders(<EntityLinkSelector value={[]} onChange={onChange} />);
    await vi.waitFor(() => {
      expect(getAllVendors).toHaveBeenCalled();
    });

    const typeSelect = screen.getByTestId("entity-type-select");
    await userEvent.selectOptions(typeSelect, "vendor");
    const vendorSelect = screen.getByTestId("direct-entity-select");
    await userEvent.selectOptions(vendorSelect, "1");

    const buttons = screen.getAllByRole("button");
    const addBtn = buttons[buttons.length - 1];
    await userEvent.click(addBtn);
    expect(onChange).toHaveBeenCalledWith([
      { entity_id: 1, entity_type: "vendor", entity_name: "Acme Corp" },
    ]);
  });

  it("removes a link when X is clicked", async () => {
    const onChange = vi.fn();
    renderWithProviders(
      <EntityLinkSelector
        value={[{ entity_id: 1, entity_type: "vendor", entity_name: "Acme Corp" }]}
        onChange={onChange}
      />,
    );
    const removeBtn = screen.getAllByRole("button")[0];
    await userEvent.click(removeBtn);
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("does not add duplicate links", async () => {
    const onChange = vi.fn();
    (getAllVendors as any).mockResolvedValue({
      data: [buildVendor()],
    });
    renderWithProviders(
      <EntityLinkSelector
        value={[{ entity_id: 1, entity_type: "vendor", entity_name: "Acme Corp" }]}
        onChange={onChange}
      />,
    );
    await vi.waitFor(() => {
      expect(getAllVendors).toHaveBeenCalled();
    });

    const typeSelect = screen.getByTestId("entity-type-select");
    await userEvent.selectOptions(typeSelect, "vendor");
    const vendorSelect = screen.getByTestId("direct-entity-select");
    await userEvent.selectOptions(vendorSelect, "1");

    const buttons = screen.getAllByRole("button");
    const addBtn = buttons[buttons.length - 1];
    await userEvent.click(addBtn);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("renders in disabled state", () => {
    renderWithProviders(<EntityLinkSelector value={[]} onChange={defaultOnChange} disabled />);
    const typeSelect = screen.getByTestId("entity-type-select");
    expect(typeSelect).toBeDisabled();
  });

  it("disables entity select when disabled prop is true", async () => {
    (getAllVendors as any).mockResolvedValue({
      data: [buildVendor()],
    });
    renderWithProviders(<EntityLinkSelector value={[]} onChange={defaultOnChange} disabled />);
    await vi.waitFor(() => {
      expect(getAllVendors).toHaveBeenCalled();
    });

    const typeSelect = screen.getByTestId("entity-type-select");
    expect(typeSelect).toBeDisabled();
  });

  it("shows entity type display names correctly", () => {
    renderWithProviders(
      <EntityLinkSelector
        value={[
          { entity_id: 1, entity_type: "vendor", entity_name: "V" },
          { entity_id: 2, entity_type: "model", entity_name: "M" },
          { entity_id: 3, entity_type: "policy", entity_name: "P" },
          { entity_id: 4, entity_type: "eu_control", entity_name: "E" },
          { entity_id: 5, entity_type: "nist_subcategory", entity_name: "N" },
          { entity_id: 6, entity_type: "iso42001_subclause", entity_name: "I" },
        ]}
        onChange={defaultOnChange}
      />,
    );
    expect(screen.getByText("Vendor:")).toBeInTheDocument();
    expect(screen.getByText("Model:")).toBeInTheDocument();
    expect(screen.getByText("Policy:")).toBeInTheDocument();
    expect(screen.getByText("EU AI Act Requirement:")).toBeInTheDocument();
    expect(screen.getByText("NIST AI RMF:")).toBeInTheDocument();
    expect(screen.getByText("ISO 42001 Clause:")).toBeInTheDocument();
  });
});
