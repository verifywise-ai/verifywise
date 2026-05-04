import { vi } from "vitest";

vi.mock("@xyflow/react", () => ({
  ReactFlow: ({ children }: any) => <div data-testid="react-flow">{children}</div>,
  MiniMap: () => <div data-testid="minimap" />,
  Controls: () => <div data-testid="controls" />,
  Background: () => <div data-testid="background" />,
  Panel: ({ children }: any) => <div>{children}</div>,
  ReactFlowProvider: ({ children }: any) => <div>{children}</div>,
  useNodesState: (initial: any) => [initial || [], vi.fn(), vi.fn()],
  useEdgesState: (initial: any) => [initial || [], vi.fn(), vi.fn()],
  useReactFlow: () => ({ fitView: vi.fn(), getNodes: () => [], setNodes: vi.fn() }),
  BackgroundVariant: { Dots: "dots" },
  Position: { Top: "top", Bottom: "bottom", Left: "left", Right: "right" },
  MarkerType: { ArrowClosed: "arrowclosed" },
}));

vi.mock("@xyflow/react/dist/style.css", () => ({}));

vi.mock("../../../../application/repository/aiDetection.repository", () => ({
  getDependencyGraph: vi.fn().mockResolvedValue({ nodes: [], edges: [] }),
}));

import { renderWithProviders } from "../../../../test/renderWithProviders";
import AIDepGraph from "../index";

describe("AIDepGraph", () => {
  it("renders without crashing", () => {
    renderWithProviders(<AIDepGraph scanId={1} />);
    expect(document.body).toBeTruthy();
  });
});
