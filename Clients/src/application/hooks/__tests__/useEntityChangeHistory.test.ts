import { describe, it, expect, vi, beforeEach } from "vitest";

// 1) Mock do react-query para capturar as options passadas pro useInfiniteQuery
const useInfiniteQueryMock = vi.fn();

vi.mock("@tanstack/react-query", () => {
  return {
    useInfiniteQuery: (args: any) => useInfiniteQueryMock(args),
  };
});

// 2) Mock do repository
const getEntityChangeHistoryMock = vi.fn();

vi.mock("../../repository/changeHistory.repository", () => {
  return {
    getEntityChangeHistory: (...args: any[]) => getEntityChangeHistoryMock(...args),
  };
});

// Importa o hook depois dos mocks
import { useEntityChangeHistory } from "../useEntityChangeHistory";

describe("useEntityChangeHistory", () => {
  beforeEach(() => {
    useInfiniteQueryMock.mockReset();
    getEntityChangeHistoryMock.mockReset();
  });

  it("should call useInfiniteQuery with correct base configuration when entityType/entityId are provided", () => {
    const entityType = "vendor" as any;
    const entityId = 123;

    useInfiniteQueryMock.mockReturnValue({ ok: true });

    const result = useEntityChangeHistory(entityType, entityId);

    expect(result).toEqual({ ok: true });

    expect(useInfiniteQueryMock).toHaveBeenCalledTimes(1);

    const options = useInfiniteQueryMock.mock.calls[0][0];

    expect(options.queryKey).toEqual(["changeHistory", entityType, entityId]);
    expect(options.enabled).toBe(true);
    expect(options.staleTime).toBe(30000);
    expect(options.initialPageParam).toBe(0);

    // sanity checks: funções existem
    expect(typeof options.queryFn).toBe("function");
    expect(typeof options.getNextPageParam).toBe("function");
  });

  it("queryFn should return fallback (empty) and NOT call repository when entityType/entityId are missing", async () => {
    // entityType undefined
    useEntityChangeHistory(undefined, 123);
    let options = useInfiniteQueryMock.mock.calls[0][0];

    const res1 = await options.queryFn({ pageParam: 0 });
    expect(res1).toEqual({ data: [], hasMore: false, total: 0 });
    expect(getEntityChangeHistoryMock).not.toHaveBeenCalled();

    useInfiniteQueryMock.mockReset();

    // entityId undefined
    useEntityChangeHistory("vendor" as any, undefined);
    options = useInfiniteQueryMock.mock.calls[0][0];

    const res2 = await options.queryFn({ pageParam: 50 });
    expect(res2).toEqual({ data: [], hasMore: false, total: 0 });
    expect(getEntityChangeHistoryMock).not.toHaveBeenCalled();
  });

  it("queryFn should call getEntityChangeHistory with limit=100 and offset=pageParam when params are valid", async () => {
    const entityType = "model_inventory" as any;
    const entityId = 77;

    const repoResponse = {
      data: [{ id: 1 }],
      hasMore: true,
      total: 200,
    };

    getEntityChangeHistoryMock.mockResolvedValue(repoResponse);

    useEntityChangeHistory(entityType, entityId);

    const options = useInfiniteQueryMock.mock.calls[0][0];

    const res = await options.queryFn({ pageParam: 0 });

    expect(getEntityChangeHistoryMock).toHaveBeenCalledTimes(1);
    expect(getEntityChangeHistoryMock).toHaveBeenCalledWith(entityType, entityId, 100, 0);

    expect(res).toBe(repoResponse);
  });

  it("enabled should be false when entityType or entityId is falsy", () => {
    useEntityChangeHistory(undefined, 1);
    let options = useInfiniteQueryMock.mock.calls[0][0];
    expect(options.enabled).toBe(false);

    useInfiniteQueryMock.mockReset();

    useEntityChangeHistory("vendor" as any, undefined);
    options = useInfiniteQueryMock.mock.calls[0][0];
    expect(options.enabled).toBe(false);
  });

  it("getNextPageParam should return totalFetched as next offset when lastPage.hasMore is true", () => {
    useEntityChangeHistory("vendor" as any, 1);
    const options = useInfiniteQueryMock.mock.calls[0][0];

    const lastPage = { data: [{ id: 3 }, { id: 4 }], hasMore: true, total: 999 };
    const allPages = [
      { data: [{ id: 1 }], hasMore: true, total: 999 },
      { data: [{ id: 2 }, { id: 3 }], hasMore: true, total: 999 },
    ];

    // totalFetched = 1 + 2 = 3
    const next = options.getNextPageParam(lastPage, allPages);
    expect(next).toBe(3);
  });

  it("getNextPageParam should return undefined when lastPage.hasMore is false", () => {
    useEntityChangeHistory("vendor" as any, 1);
    const options = useInfiniteQueryMock.mock.calls[0][0];

    const lastPage = { data: [{ id: 1 }], hasMore: false, total: 1 };
    const allPages = [{ data: [{ id: 1 }], hasMore: false, total: 1 }];

    const next = options.getNextPageParam(lastPage, allPages);
    expect(next).toBeUndefined();
  });
});