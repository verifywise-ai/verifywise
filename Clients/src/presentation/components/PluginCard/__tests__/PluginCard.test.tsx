import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import PluginCard from "../index";
import { Plugin, PluginCategory, PluginInstallationStatus } from "../../../../domain/types/plugins";

// Mock the theme imports used by PluginCard
vi.mock("../../../themes/components", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../themes/components")>();
  return {
    ...actual,
    cardStyles: {
      ...actual.cardStyles,
      base: () => ({}),
    },
  };
});

const basePlugin: Plugin = {
  key: "test-plugin",
  name: "test-plugin",
  displayName: "Test Plugin",
  description: "A test plugin for unit testing",
  version: "1.0.0",
  category: PluginCategory.COMPLIANCE,
  isOfficial: true,
  isPublished: true,
  requiresConfiguration: true,
  installationType: "standard",
};

describe("PluginCard", () => {
  it("renders the plugin display name", () => {
    renderWithProviders(<PluginCard plugin={basePlugin} />);
    expect(screen.getByText("Test Plugin")).toBeInTheDocument();
  });

  it("renders the plugin description", () => {
    renderWithProviders(<PluginCard plugin={basePlugin} />);
    expect(screen.getByText("A test plugin for unit testing")).toBeInTheDocument();
  });

  it("renders a status chip when installationStatus is set", () => {
    const installedPlugin: Plugin = {
      ...basePlugin,
      installationStatus: PluginInstallationStatus.INSTALLED,
    };

    renderWithProviders(<PluginCard plugin={installedPlugin} />);
    expect(screen.getByText("installed")).toBeInTheDocument();
  });

  it("does not render a status chip when installationStatus is not set", () => {
    renderWithProviders(<PluginCard plugin={basePlugin} />);
    expect(screen.queryByText("installed")).not.toBeInTheDocument();
    expect(screen.queryByText("installing")).not.toBeInTheDocument();
    expect(screen.queryByText("failed")).not.toBeInTheDocument();
  });

  it("renders the framework type badge when frameworkType is set", () => {
    const orgPlugin: Plugin = {
      ...basePlugin,
      frameworkType: "organizational",
    };

    renderWithProviders(<PluginCard plugin={orgPlugin} />);
    expect(screen.getByText("Organizational")).toBeInTheDocument();
  });

  it("renders feature chips when features are provided", () => {
    const pluginWithFeatures: Plugin = {
      ...basePlugin,
      features: [
        { name: "Feature A", description: "desc", displayOrder: 1 },
        { name: "Feature B", description: "desc", displayOrder: 2 },
      ],
    };

    renderWithProviders(<PluginCard plugin={pluginWithFeatures} />);
    expect(screen.getByText("Feature A")).toBeInTheDocument();
    expect(screen.getByText("Feature B")).toBeInTheDocument();
  });

  it("shows View Details text as the action", () => {
    renderWithProviders(<PluginCard plugin={basePlugin} />);
    expect(screen.getByText("View Details")).toBeInTheDocument();
  });

  it("shows a loading spinner when loading is true", () => {
    renderWithProviders(<PluginCard plugin={basePlugin} loading />);
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });
});
