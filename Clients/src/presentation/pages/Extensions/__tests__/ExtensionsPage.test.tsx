import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import ExtensionsPage from "..";
import CustomException from "../../../../infrastructure/exceptions/customeException";
import type { Extension } from "../../../../domain/types/extensions";

vi.mock("../../../../application/hooks/useCan", () => ({
  useCan: () => true,
  useCanCheck: () => () => true,
  usePermissionsSettled: () => true,
}));

// The page header loads approval counts; not under test here.
vi.mock("../../../components/Layout/PageHeaderExtended", () => ({
  PageHeaderExtended: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const ctx = vi.hoisted(() => ({
  extensions: [] as Extension[],
  error: null as string | null,
  enable: vi.fn(),
  disable: vi.fn(),
  refetch: vi.fn(),
}));
vi.mock("../../../../application/contexts/Extensions.context", () => ({
  ExtensionsProvider: ({ children }: { children: React.ReactNode }) => children,
  useExtensions: () => ({
    extensions: ctx.extensions,
    loading: false,
    loaded: true,
    error: ctx.error,
    refetch: ctx.refetch,
    enable: ctx.enable,
    disable: ctx.disable,
    updateConfiguration: vi.fn(),
    isEnabled: () => false,
    getByKey: () => undefined,
  }),
}));

function makeExtension(overrides: Partial<Extension> = {}): Extension {
  return {
    id: 1,
    key: "risk-import",
    name: "risk-import",
    displayName: "Risk import",
    description: "Import risks from Excel.",
    longDescription: null,
    version: "1.0.0",
    author: null,
    category: "data_management",
    iconPath: null,
    documentationUrl: null,
    supportUrl: null,
    requiresConfiguration: false,
    features: [],
    tags: [],
    configFields: [],
    enabled: false,
    configuration: {},
    secretsSet: [],
    enablement: null,
    ...overrides,
  };
}

beforeEach(() => {
  ctx.extensions = [];
  ctx.error = null;
  ctx.enable.mockReset();
  ctx.disable.mockReset();
  ctx.refetch.mockReset();
});

describe("Extensions catalog", () => {
  it("asks before disabling and disables on confirm", async () => {
    ctx.extensions = [makeExtension({ enabled: true })];
    ctx.disable.mockResolvedValue(makeExtension({ enabled: false }));
    renderWithProviders(<ExtensionsPage />);

    fireEvent.click(screen.getByRole("button", { name: "Disable" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Disable this extension?")).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        "Import from Excel is hidden in Risk management. Imported risks are kept.",
      ),
    ).toBeInTheDocument();
    expect(ctx.disable).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: "Disable" }));
    // The card shows a failure inline, so the global toast is suppressed.
    await waitFor(() =>
      expect(ctx.disable).toHaveBeenCalledWith("risk-import", { suppressGlobalErrorToast: true }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("shows the server message on the card when disabling fails", async () => {
    ctx.extensions = [makeExtension({ enabled: true })];
    ctx.disable.mockRejectedValue(
      new CustomException("Extension cannot be disabled right now", 400, {}),
    );
    renderWithProviders(<ExtensionsPage />);

    fireEvent.click(screen.getByRole("button", { name: "Disable" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Disable" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Extension cannot be disabled right now",
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("shows the server message when enabling fails and clears it on the next attempt", async () => {
    ctx.extensions = [makeExtension({ enabled: false })];
    ctx.enable
      .mockRejectedValueOnce(new CustomException("Enable failed upstream", 400, {}))
      .mockResolvedValueOnce(makeExtension({ enabled: true }));
    renderWithProviders(<ExtensionsPage />);

    fireEvent.click(screen.getByRole("button", { name: "Enable" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Enable failed upstream");

    fireEvent.click(screen.getByRole("button", { name: "Enable" }));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(ctx.enable).toHaveBeenCalledTimes(2);
    expect(ctx.enable).toHaveBeenCalledWith("risk-import", undefined, {
      suppressGlobalErrorToast: true,
    });
  });

  it("offers Try again when the list fails to load", () => {
    ctx.error = "Failed to load extensions";
    renderWithProviders(<ExtensionsPage />);

    expect(screen.getByText("Failed to load extensions")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(ctx.refetch).toHaveBeenCalledTimes(1);
  });

  it("says where an enabled extension without settings shows up", () => {
    ctx.extensions = [makeExtension({ enabled: true })];
    renderWithProviders(<ExtensionsPage />);

    expect(screen.getByText("Where it shows up")).toBeInTheDocument();
    expect(screen.getByText("AI risks → Add new risk → Import from Excel")).toBeInTheDocument();
  });

  it("labels a disabled extension Disabled and leaves out where it shows up", () => {
    ctx.extensions = [makeExtension({ enabled: false })];
    renderWithProviders(<ExtensionsPage />);

    expect(screen.getByText("Disabled")).toBeInTheDocument();
    expect(screen.queryByText("Where it shows up")).not.toBeInTheDocument();
  });
  // The DOM translator matches whole text nodes, so the catalog text the
  // database sends and the card's own words each sit in their own node.
  it("keeps the category and Configuration required in their own text nodes", () => {
    ctx.extensions = [
      makeExtension({
        key: "mlflow",
        displayName: "MLflow",
        category: "ml_ops",
        requiresConfiguration: true,
        configFields: [
          {
            id: 1,
            fieldKey: "tracking_server_url",
            fieldType: "url",
            label: "Tracking server URL",
            helpText: null,
            placeholder: null,
            isRequired: true,
            isSecret: false,
            defaultValue: null,
            displayOrder: 1,
            options: null,
            validation: null,
          },
        ],
      }),
    ];
    renderWithProviders(<ExtensionsPage />);

    expect(screen.getByText("Configuration required").tagName).toBe("SPAN");
    const meta = screen.getByText("Configuration required").parentElement!;
    const nodes = Array.from(meta.childNodes).map((n) => n.textContent?.trim());
    expect(nodes).toContain("ML Ops");
    expect(meta).toHaveTextContent("ML Ops · v1.0.0 · Configuration required");
    expect(screen.getByRole("button", { name: "Configure to enable" })).toBeInTheDocument();
  });
});
