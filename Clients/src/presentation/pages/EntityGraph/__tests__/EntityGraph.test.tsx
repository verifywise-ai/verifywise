import { renderWithProviders } from "../../../../test/renderWithProviders";

// Mock the entity graph repository
vi.mock("../../../../application/repository/entityGraph.repository", () => ({
  fetchEntityGraphData: vi.fn().mockResolvedValue({
    useCases: [],
    models: [],
    vendors: [],
    risks: [],
  }),
}));

// Mock custom hooks
vi.mock("../hooks", () => ({
  useDebouncedSearch: () => ({
    searchQuery: "",
    setSearchQuery: vi.fn(),
    debouncedSearchQuery: "",
  }),
  useToastNotification: () => ({
    showToast: false,
    toastMessage: { title: "", body: "" },
    showToastWithMessage: vi.fn(),
    hideToast: vi.fn(),
  }),
  useFocusEntity: vi.fn(),
}));

// Mock utility functions
vi.mock("../utils", () => ({
  generateNodesAndEdges: () => ({
    nodes: [],
    edges: [],
    entityLookup: new Map(),
  }),
  getConnectedEntities: () => [],
}));

// Mock constants
vi.mock("../constants", () => ({
  entityColors: {},
  VIEWPORT: {
    FIT_VIEW_PADDING: 0.2,
    MIN_ZOOM: 0.1,
    MAX_ZOOM: 2,
  },
  ENTITY_TYPE_CONFIG: [],
  DEFAULT_VISIBLE_ENTITIES: [],
}));

// Mock styles
vi.mock("../styles", () => ({
  graphContainerStyle: {},
  loadingContainerSx: {},
  loadingTextSx: {},
  loadingProgressSx: {},
  loadingPercentSx: {},
  errorContainerSx: {},
  emptyStateContainerSx: {},
  emptyStateTitleSx: {},
  emptyStateDescriptionSx: {},
  preparingContainerSx: {},
  preparingTextSx: {},
  controlPanelSx: {},
  problemsToggleRowSx: {},
  problemsToggleLabelContainerSx: {},
  problemsToggleLabelSx: {},
  entityTypesLabelSx: {},
  toggleButtonGroupSx: {},
  colorDotSx: () => ({}),
  statsContainerSx: {},
  statsTextSx: {},
}));

// Mock child components
vi.mock("../EntityNode", () => ({
  default: () => <div data-testid="entity-node" />,
}));
vi.mock("../DetailSidebar", () => ({
  default: () => <div data-testid="detail-sidebar" />,
}));
vi.mock("../../../components/Inputs/Toggle", () => ({
  default: () => <div data-testid="toggle" />,
}));
vi.mock("../../../components/Alert", () => ({
  default: () => <div data-testid="alert" />,
}));
vi.mock("../../../components/Search/SearchBox", () => ({
  default: () => <div data-testid="search-box" />,
}));

// Mock @xyflow/react
vi.mock("@xyflow/react", () => ({
  ReactFlow: ({ children }: any) => <div data-testid="react-flow">{children}</div>,
  ReactFlowProvider: ({ children }: any) => <div>{children}</div>,
  MiniMap: () => null,
  Controls: () => null,
  Background: () => null,
  Panel: ({ children }: any) => <div>{children}</div>,
  useNodesState: () => [[], vi.fn(), vi.fn()],
  useEdgesState: () => [[], vi.fn(), vi.fn()],
  BackgroundVariant: { Dots: "dots" },
}));

// Mock themes - use importOriginal to avoid breaking theme imports used by providers
vi.mock("../../../themes/palette", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../themes/palette")>();
  return {
    ...actual,
  };
});

import EntityGraph from "../index";

describe("EntityGraph", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders without crashing", () => {
    const { container } = renderWithProviders(<EntityGraph />);
    expect(container).toBeTruthy();
  });
});
