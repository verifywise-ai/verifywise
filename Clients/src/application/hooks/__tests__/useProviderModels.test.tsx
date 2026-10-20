import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { vi } from "vitest";
import { useProviderModels } from "../useProviderModels";
import { getGatewayModelsForProvider } from "../../repository/deepEval.repository";
import { PROVIDERS } from "../../../presentation/utils/providers";

vi.mock("../../repository/deepEval.repository", () => ({
  getGatewayModelsForProvider: vi.fn(),
  hasGatewayCatalog: (provider: string) => provider !== "self-hosted",
}));

const fetchModels = vi.mocked(getGatewayModelsForProvider);

function wrapper(client: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

describe("useProviderModels", () => {
  afterEach(() => vi.clearAllMocks());

  it("uses the catalog and keeps bundled names", async () => {
    const bundled = PROVIDERS.openai.models[0];
    fetchModels.mockResolvedValue([
      { id: bundled.id, name: bundled.id },
      { id: "new-model", name: "new-model" },
    ]);
    const client = new QueryClient();
    const { result } = renderHook(() => useProviderModels("openai"), { wrapper: wrapper(client) });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.models.map((m) => m.name)).toEqual([bundled.name, "new-model"]);
  });

  it("does not cache an empty catalog, so the next mount asks the gateway again", async () => {
    fetchModels.mockResolvedValue([]);
    const client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } });
    const { result } = renderHook(() => useProviderModels("openai"), { wrapper: wrapper(client) });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.models).toEqual(PROVIDERS.openai.models);
    expect(client.getQueryData(["provider-models", "openai"])).toBeUndefined();
    // One retry, then the bundled list stands
    expect(fetchModels).toHaveBeenCalledTimes(2);
  });

  it("does not ask the gateway for a provider it has no catalog for", () => {
    const client = new QueryClient();
    const { result } = renderHook(() => useProviderModels("self-hosted"), {
      wrapper: wrapper(client),
    });

    expect(result.current.isLoading).toBe(false);
    expect(fetchModels).not.toHaveBeenCalled();
  });
});
