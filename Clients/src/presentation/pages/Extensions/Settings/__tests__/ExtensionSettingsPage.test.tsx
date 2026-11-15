import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { Route, Routes } from "react-router";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import ExtensionSettingsPage from "..";
import type { Extension, ExtensionConfigField } from "../../../../../domain/types/extensions";

vi.mock("../../../../../application/hooks/useCan", () => ({
  useCan: () => true,
  useCanCheck: () => () => true,
  usePermissionsSettled: () => true,
}));

const mockGetExtensionByKey = vi.fn();
const mockTestConnection = vi.fn();
vi.mock("../../../../../application/repository/extension.repository", () => ({
  getExtensionByKey: (...args: unknown[]) => mockGetExtensionByKey(...args),
  testExtensionConnection: (...args: unknown[]) => mockTestConnection(...args),
}));

const mockEnable = vi.fn();
const mockDisable = vi.fn();
const mockUpdateConfiguration = vi.fn();
vi.mock("../../../../../application/contexts/Extensions.context", () => ({
  ExtensionsProvider: ({ children }: { children: React.ReactNode }) => children,
  useExtensions: () => ({
    enable: mockEnable,
    disable: mockDisable,
    updateConfiguration: mockUpdateConfiguration,
    getByKey: () => undefined,
    isEnabled: () => false,
    extensions: [],
    loading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

// The page header loads approval counts; not under test here.
vi.mock("../../../../components/Layout/PageHeaderExtended", () => ({
  PageHeaderExtended: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// The post-enable panels load their own data; they are not under test here.
vi.mock("../../slack/SlackConfiguration", () => ({ default: () => <div>Slack panel</div> }));
vi.mock("../../model-lifecycle/ModelLifecycleConfig", () => ({
  default: () => <div>Lifecycle panel</div>,
}));
vi.mock("../../jira-assets/JiraAssetsConfiguration", () => ({
  JiraAssetsConfiguration: () => <div>Jira Assets panel</div>,
}));
vi.mock("../../jira-incidents/JiraIncidentsConfiguration", () => ({
  JiraIncidentsConfiguration: () => <div>Jira incidents panel</div>,
}));

function field(overrides: Partial<ExtensionConfigField>): ExtensionConfigField {
  return {
    id: 1,
    fieldKey: "key",
    fieldType: "text",
    label: "Label",
    helpText: null,
    placeholder: null,
    isRequired: false,
    isSecret: false,
    defaultValue: null,
    displayOrder: 0,
    options: null,
    validation: null,
    ...overrides,
  };
}

const MLFLOW_FIELDS: ExtensionConfigField[] = [
  field({
    id: 1,
    fieldKey: "tracking_server_url",
    fieldType: "url",
    label: "Tracking server URL",
    isRequired: true,
    displayOrder: 1,
  }),
  field({ id: 2, fieldKey: "experiment", label: "Experiment", displayOrder: 2 }),
  field({
    id: 3,
    fieldKey: "api_token",
    fieldType: "password",
    label: "API token",
    isSecret: true,
    displayOrder: 3,
  }),
];

function makeExtension(overrides: Partial<Extension> = {}): Extension {
  return {
    id: 1,
    key: "mlflow",
    name: "mlflow",
    displayName: "MLflow",
    description: "Sync models from MLflow.",
    longDescription: null,
    version: "1.0.0",
    author: null,
    category: "ml_ops",
    iconPath: null,
    documentationUrl: null,
    supportUrl: null,
    requiresConfiguration: true,
    features: [],
    tags: [],
    configFields: MLFLOW_FIELDS,
    enabled: false,
    configuration: {},
    secretsSet: [],
    enablement: null,
    ...overrides,
  };
}

function renderPage(key = "mlflow") {
  return renderWithProviders(
    <Routes>
      <Route path="/extensions/:key/settings" element={<ExtensionSettingsPage />} />
    </Routes>,
    { route: `/extensions/${key}/settings` },
  );
}

function input(fieldKey: string): HTMLInputElement {
  const el = document.getElementById(`ext-field-${fieldKey}`);
  if (!el) throw new Error(`No input for ${fieldKey}`);
  return el as HTMLInputElement;
}

beforeEach(() => {
  mockGetExtensionByKey.mockReset();
  mockTestConnection.mockReset();
  mockEnable.mockReset();
  mockDisable.mockReset();
  mockUpdateConfiguration.mockReset();
});

describe("ExtensionSettingsPage", () => {
  it("sends the stored values on Enable when nothing was edited", async () => {
    const stored = makeExtension({
      configuration: { tracking_server_url: "https://mlflow.example.com", experiment: "prod" },
      secretsSet: ["api_token"],
      enablement: {
        id: 1,
        organizationId: 1,
        extensionId: 1,
        enabled: false,
        enabledAt: null,
        enabledBy: null,
        createdAt: "2026-01-01",
        updatedAt: "2026-01-01",
      },
    });
    mockGetExtensionByKey.mockResolvedValue(stored);
    mockEnable.mockResolvedValue({ ...stored, enabled: true });
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Enable" }));

    await waitFor(() => expect(mockEnable).toHaveBeenCalledTimes(1));
    // The stored secret is left out, so the server keeps it.
    expect(mockEnable).toHaveBeenCalledWith("mlflow", {
      tracking_server_url: "https://mlflow.example.com",
      experiment: "prod",
    });
  });

  it("sends null for an emptied field and for a secret cleared with Clear", async () => {
    const stored = makeExtension({
      enabled: true,
      configuration: { tracking_server_url: "https://mlflow.example.com", experiment: "prod" },
      secretsSet: ["api_token"],
    });
    mockGetExtensionByKey.mockResolvedValue(stored);
    mockUpdateConfiguration.mockResolvedValue({ ...stored, secretsSet: [] });
    renderPage();

    await screen.findByText("Configuration");
    expect(input("api_token").placeholder).toBe("Stored. Leave blank to keep it.");

    fireEvent.change(input("experiment"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(screen.getByText("Will be removed when you save.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Save configuration" }));

    await waitFor(() => expect(mockUpdateConfiguration).toHaveBeenCalledTimes(1));
    expect(mockUpdateConfiguration).toHaveBeenCalledWith("mlflow", {
      tracking_server_url: "https://mlflow.example.com",
      experiment: null,
      api_token: null,
    });
  });

  it("Undo keeps the stored secret", async () => {
    const stored = makeExtension({
      enabled: true,
      configuration: { tracking_server_url: "https://mlflow.example.com" },
      secretsSet: ["api_token"],
    });
    mockGetExtensionByKey.mockResolvedValue(stored);
    mockUpdateConfiguration.mockResolvedValue(stored);
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Clear" }));
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(screen.queryByText("Will be removed when you save.")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Save configuration" }));
    await waitFor(() => expect(mockUpdateConfiguration).toHaveBeenCalledTimes(1));
    expect(mockUpdateConfiguration.mock.calls[0][1]).not.toHaveProperty("api_token");
  });

  it("has no keep wording or Clear for a secret with nothing stored", async () => {
    mockGetExtensionByKey.mockResolvedValue(makeExtension());
    renderPage();

    await screen.findByText("Configuration");
    expect(input("api_token").placeholder).toBe("");
    expect(screen.queryByRole("button", { name: "Clear" })).not.toBeInTheDocument();
    expect(screen.queryByText(/keep/i)).not.toBeInTheDocument();
  });

  it("offers Test connection before Enable and shows the result by the actions", async () => {
    mockGetExtensionByKey.mockResolvedValue(makeExtension());
    mockTestConnection.mockResolvedValue({ success: false, message: "Could not reach MLflow." });
    renderPage();

    fireEvent.change(await screen.findByLabelText(/Tracking server URL/), {
      target: { value: "https://mlflow.example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Test connection" }));

    const result = await screen.findByText("Could not reach MLflow.");
    expect(mockTestConnection).toHaveBeenCalledWith({
      key: "mlflow",
      configuration: {
        tracking_server_url: "https://mlflow.example.com",
        experiment: null,
      },
    });
    expect(
      within(screen.getByTestId("extension-actions")).getByText("Could not reach MLflow."),
    ).toBe(result);
  });

  it("offers Test connection after Enable too", async () => {
    mockGetExtensionByKey.mockResolvedValue(makeExtension({ enabled: true }));
    renderPage();

    expect(await screen.findByRole("button", { name: "Test connection" })).toBeInTheDocument();
  });

  it.each(["jira-assets", "jira-incidents", "slack", "model-lifecycle"])(
    "has no page-level Test connection for %s",
    async (key) => {
      mockGetExtensionByKey.mockResolvedValue(
        makeExtension({ key, displayName: key, configFields: [], enabled: true }),
      );
      renderPage(key);

      expect(await screen.findByRole("button", { name: "Disable" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Test connection" })).not.toBeInTheDocument();
    },
  );

  it("labels a disabled extension Disabled and an enabled one Enabled", async () => {
    mockGetExtensionByKey.mockResolvedValueOnce(makeExtension());
    const { unmount } = renderPage();
    expect(await screen.findByText("Disabled")).toBeInTheDocument();
    unmount();

    mockGetExtensionByKey.mockResolvedValueOnce(makeExtension({ enabled: true }));
    renderPage();
    expect(await screen.findByText("Enabled")).toBeInTheDocument();
    expect(screen.queryByText("Disabled")).not.toBeInTheDocument();
  });

  it("asks before disabling, and Cancel does nothing", async () => {
    mockGetExtensionByKey.mockResolvedValue(makeExtension({ enabled: true }));
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Disable" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Disable this extension?")).toBeInTheDocument();
    expect(within(dialog).getByText("MLflow")).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        "The MLflow tab and sync are hidden in Model inventory. Synced models and settings are kept.",
      ),
    ).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(mockDisable).not.toHaveBeenCalled();
  });

  it("keeps unsaved edits when the extension is disabled", async () => {
    const stored = makeExtension({
      enabled: true,
      configuration: { tracking_server_url: "https://mlflow.example.com", experiment: "prod" },
    });
    mockGetExtensionByKey.mockResolvedValue(stored);
    mockDisable.mockResolvedValue({
      ...stored,
      enabled: false,
      enablement: {
        id: 1,
        organizationId: 1,
        extensionId: 1,
        enabled: false,
        enabledAt: null,
        enabledBy: null,
        createdAt: "2026-01-01",
        updatedAt: "2026-01-02",
      },
    });
    mockEnable.mockImplementation(async () => ({ ...stored, enabled: true }));
    renderPage();

    await screen.findByText("Configuration");
    fireEvent.change(input("experiment"), { target: { value: "staging" } });

    fireEvent.click(screen.getByRole("button", { name: "Disable" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Disable" }));

    expect(await screen.findByRole("button", { name: "Enable" })).toBeInTheDocument();
    expect(mockDisable).toHaveBeenCalledWith("mlflow");
    expect(input("experiment").value).toBe("staging");

    fireEvent.click(screen.getByRole("button", { name: "Enable" }));
    await waitFor(() => expect(mockEnable).toHaveBeenCalledTimes(1));
    expect(mockEnable.mock.calls[0][1]).toMatchObject({ experiment: "staging" });
  });
});
