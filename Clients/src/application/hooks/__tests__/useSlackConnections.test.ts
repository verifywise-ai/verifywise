import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("../useAuth", () => ({
  useAuth: () => ({ organizationId: 42, userId: 9 }),
}));

vi.mock("../../repository/slack.repository", () => ({
  getSlackConnections: vi.fn(),
  getUnlinkedSlackConnections: vi.fn(),
  connectSlackWorkspace: vi.fn(),
  updateSlackConnection: vi.fn(),
  deleteSlackConnection: vi.fn(),
  deleteUnlinkedSlackConnection: vi.fn(),
}));

import {
  slackQueryKeys,
  useConnectSlackWorkspace,
  useRemoveSlackConnection,
  useRemoveUnlinkedSlackConnection,
  useSlackConnections,
  useUnlinkedSlackConnections,
  useUpdateSlackConnection,
} from "../useSlackConnections";
import * as repo from "../../repository/slack.repository";

const mocked = vi.mocked(repo);

const connection = (id: number) => ({
  id,
  team_name: "Acme",
  channel: `#c${id}`,
  is_active: true,
});

const newClient = () =>
  new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

const wrapperFor =
  (client: QueryClient) =>
  ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);

/** Renders both lists and every mutation against one client. */
const renderSlack = (client = newClient()) => ({
  client,
  ...renderHook(
    () => ({
      linked: useSlackConnections(),
      unlinked: useUnlinkedSlackConnections(),
      connect: useConnectSlackWorkspace(),
      update: useUpdateSlackConnection(),
      remove: useRemoveSlackConnection(),
      removeUnlinked: useRemoveUnlinkedSlackConnection(),
    }),
    { wrapper: wrapperFor(client) },
  ),
});

beforeEach(() => {
  vi.clearAllMocks();
  mocked.getSlackConnections.mockResolvedValue([connection(1)]);
  mocked.getUnlinkedSlackConnections.mockResolvedValue([]);
  mocked.connectSlackWorkspace.mockResolvedValue(undefined);
  mocked.updateSlackConnection.mockResolvedValue(undefined);
  mocked.deleteSlackConnection.mockResolvedValue(undefined);
  mocked.deleteUnlinkedSlackConnection.mockResolvedValue(undefined);
});

describe("query keys", () => {
  it("keeps the organization's connections and the user's unlinked ones apart", () => {
    expect(slackQueryKeys.connections(42)).toEqual(["slack", "connections", 42]);
    expect(slackQueryKeys.unlinked(9)).toEqual(["slack", "unlinked", 9]);
  });
});

describe("useSlackConnections", () => {
  it("is loading until the first list arrives, then returns it", async () => {
    const { result } = renderSlack();

    expect(result.current.linked.loading).toBe(true);
    expect(result.current.linked.connections).toEqual([]);
    await waitFor(() => expect(result.current.linked.loading).toBe(false));
    expect(result.current.linked.connections).toEqual([connection(1)]);
    expect(result.current.linked.error).toBeNull();
  });

  it("is not loading again while a refetch after a write runs", async () => {
    const { result } = renderSlack();
    await waitFor(() => expect(result.current.linked.loading).toBe(false));
    mocked.getSlackConnections.mockReturnValue(new Promise(() => {}));

    act(() => {
      void result.current.update.mutateAsync({ id: 1, changes: { is_active: false } });
    });

    await waitFor(() => expect(mocked.getSlackConnections).toHaveBeenCalledTimes(2));
    expect(result.current.linked.loading).toBe(false);
    expect(result.current.linked.connections).toEqual([connection(1)]);
  });

  it("returns the error when there is no list", async () => {
    mocked.getSlackConnections.mockRejectedValue(new Error("down"));
    const { result } = renderSlack();

    await waitFor(() => expect(result.current.linked.error).toBeInstanceOf(Error));
    expect(result.current.linked.loading).toBe(false);
  });
});

describe("useUnlinkedSlackConnections", () => {
  it("reads a failed load as an empty list", async () => {
    mocked.getUnlinkedSlackConnections.mockRejectedValue(new Error("down"));
    const { result } = renderSlack();

    await waitFor(() => expect(result.current.unlinked.loading).toBe(false));
    expect(result.current.unlinked.unlinked).toEqual([]);
  });
});

describe("mutations refetch only the list they change", () => {
  const settle = async (result: ReturnType<typeof renderSlack>["result"]) => {
    await waitFor(() => {
      expect(result.current.linked.loading).toBe(false);
      expect(result.current.unlinked.loading).toBe(false);
    });
    vi.clearAllMocks();
  };

  it.each([
    ["connect", (r: any) => r.connect.mutateAsync("code-1")],
    ["update", (r: any) => r.update.mutateAsync({ id: 1, changes: { routing_type: [] } })],
    ["remove", (r: any) => r.remove.mutateAsync(1)],
  ])("%s refetches the connections, not the unlinked list", async (_label, run) => {
    const { result } = renderSlack();
    await settle(result);

    await act(() => run(result.current));

    expect(mocked.getSlackConnections).toHaveBeenCalledTimes(1);
    expect(mocked.getUnlinkedSlackConnections).not.toHaveBeenCalled();
  });

  it("removing an unlinked connection refetches only the unlinked list", async () => {
    const { result } = renderSlack();
    await settle(result);

    await act(() => result.current.removeUnlinked.mutateAsync(7));

    expect(mocked.deleteUnlinkedSlackConnection).toHaveBeenCalledWith(7);
    expect(mocked.getUnlinkedSlackConnections).toHaveBeenCalledTimes(1);
    expect(mocked.getSlackConnections).not.toHaveBeenCalled();
  });

  it("sends the update for that connection only", async () => {
    const { result } = renderSlack();
    await settle(result);

    await act(() =>
      result.current.update.mutateAsync({
        id: 3,
        changes: { routing_type: ["Membership and roles"] },
      }),
    );

    expect(mocked.updateSlackConnection).toHaveBeenCalledWith(3, {
      routing_type: ["Membership and roles"],
    });
  });

  it("does not refetch after a failed write", async () => {
    mocked.deleteSlackConnection.mockRejectedValue(new Error("nope"));
    const { result } = renderSlack();
    await settle(result);

    await act(async () => {
      await expect(result.current.remove.mutateAsync(1)).rejects.toThrow("nope");
    });

    expect(mocked.getSlackConnections).not.toHaveBeenCalled();
  });

  it("a connect during the first load replaces that load's older answer", async () => {
    let answerFirstLoad!: (rows: ReturnType<typeof connection>[]) => void;
    mocked.getSlackConnections
      .mockReturnValueOnce(
        new Promise((resolve) => {
          answerFirstLoad = resolve;
        }),
      )
      .mockResolvedValue([connection(1), connection(2)]);
    const { result } = renderSlack();

    await act(() => result.current.connect.mutateAsync("code-1"));
    // The first load, started before the connect, answers last with the old list.
    await act(async () => {
      answerFirstLoad([connection(1)]);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(result.current.linked.connections).toEqual([connection(1), connection(2)]);
  });
});
