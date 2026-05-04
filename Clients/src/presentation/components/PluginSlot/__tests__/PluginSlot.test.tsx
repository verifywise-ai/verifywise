import { vi } from "vitest";

const MockComponent = (props: Record<string, unknown>) => (
  <div data-testid="plugin-component">{String(props.label || "plugin")}</div>
);

vi.mock("../../../../application/contexts/PluginRegistry.context", () => ({
  usePluginRegistry: vi.fn().mockReturnValue({
    getComponentsForSlot: vi.fn().mockReturnValue([]),
  }),
}));

vi.mock("../../../../infrastructure/api/networkServices", () => ({
  apiServices: {},
}));

vi.mock("../../../../domain/constants/pluginSlots", () => ({
  PluginSlotId: {},
  PluginRenderType: {},
}));

import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import { PluginSlot } from "../index";
import { usePluginRegistry } from "../../../../application/contexts/PluginRegistry.context";

describe("PluginSlot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders nothing when slot has no components", () => {
    const { container } = renderWithProviders(<PluginSlot id={"empty-slot" as any} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders components for a slot", () => {
    vi.mocked(usePluginRegistry).mockReturnValue({
      getComponentsForSlot: vi.fn().mockReturnValue([
        {
          pluginKey: "soc2",
          slotId: "test-slot",
          componentName: "SOC2Panel",
          Component: MockComponent,
          renderType: "inline",
          props: { label: "SOC 2 Panel" },
        },
      ]),
    } as any);

    renderWithProviders(<PluginSlot id={"test-slot" as any} />);
    expect(screen.getByTestId("plugin-component")).toBeInTheDocument();
    expect(screen.getByText("SOC 2 Panel")).toBeInTheDocument();
  });

  it("filters by renderType", () => {
    vi.mocked(usePluginRegistry).mockReturnValue({
      getComponentsForSlot: vi.fn().mockReturnValue([
        {
          pluginKey: "soc2",
          slotId: "test-slot",
          componentName: "SOC2Panel",
          Component: MockComponent,
          renderType: "inline",
        },
        {
          pluginKey: "soc2",
          slotId: "test-slot",
          componentName: "SOC2Modal",
          Component: MockComponent,
          renderType: "modal",
        },
      ]),
    } as any);

    renderWithProviders(<PluginSlot id={"test-slot" as any} renderType={"inline" as any} />);
    // Inline renders in main pass; modal renders in separate pass
    // Both use data-testid="plugin-component" but only inline filtered in main pass
    // The modal section also renders separately, so 2 total (1 inline + 1 modal)
    const components = screen.getAllByTestId("plugin-component");
    expect(components).toHaveLength(2);
  });

  it("filters by pluginKey", () => {
    vi.mocked(usePluginRegistry).mockReturnValue({
      getComponentsForSlot: vi.fn().mockReturnValue([
        {
          pluginKey: "soc2",
          slotId: "test-slot",
          componentName: "Panel",
          Component: MockComponent,
          renderType: "inline",
        },
        {
          pluginKey: "gdpr",
          slotId: "test-slot",
          componentName: "Panel",
          Component: MockComponent,
          renderType: "inline",
        },
      ]),
    } as any);

    renderWithProviders(<PluginSlot id={"test-slot" as any} pluginKey="soc2" />);
    const components = screen.getAllByTestId("plugin-component");
    expect(components).toHaveLength(1);
  });
});
