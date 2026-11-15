import { act, renderHook, waitFor } from "@testing-library/react";
import { vi } from "vitest";

vi.mock("../../repository/task.repository", () => ({
  getAllTasks: vi.fn(),
}));

import { getAllTasks } from "../../repository/task.repository";
import { TaskStatus } from "../../../domain/enums/task.enum";
import { useOpenTasksCount } from "../useOpenTasksCount";

const mockedGetAllTasks = vi.mocked(getAllTasks);

describe("useOpenTasksCount", () => {
  afterEach(() => {
    vi.useRealTimers();
    mockedGetAllTasks.mockReset();
  });

  it("counts the open tasks", async () => {
    mockedGetAllTasks.mockResolvedValue({ data: { tasks: [{}, {}, {}] } } as never);
    const { result } = renderHook(() => useOpenTasksCount());
    expect(result.current).toBe(0);
    await waitFor(() => expect(result.current).toBe(3));
    expect(mockedGetAllTasks).toHaveBeenCalledWith({
      status: [TaskStatus.OPEN],
      suppressGlobalErrorToast: true,
    });
  });

  // The server returns every matching task (it ignores page_size), so the
  // badge is the real count, past the default page of 25 and past 99.
  it("counts past one page of 25", async () => {
    mockedGetAllTasks.mockResolvedValue({
      data: { tasks: Array.from({ length: 30 }, () => ({})) },
    } as never);
    const { result } = renderHook(() => useOpenTasksCount());
    await waitFor(() => expect(result.current).toBe(30));
  });

  it("reaches more than 99, so the sidebar's 99+ can show", async () => {
    mockedGetAllTasks.mockResolvedValue({
      data: { tasks: Array.from({ length: 120 }, () => ({})) },
    } as never);
    const { result } = renderHook(() => useOpenTasksCount());
    await waitFor(() => expect(result.current).toBe(120));
  });

  it("asks without the global error toast on the five-minute refresh too", async () => {
    vi.useFakeTimers();
    mockedGetAllTasks.mockResolvedValue({ data: { tasks: [] } } as never);
    renderHook(() => useOpenTasksCount());
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    expect(mockedGetAllTasks).toHaveBeenCalledTimes(2);
    for (const [params] of mockedGetAllTasks.mock.calls) {
      expect(params).toMatchObject({ suppressGlobalErrorToast: true });
    }
  });

  it("falls back to 0 when a refresh fails", async () => {
    vi.useFakeTimers();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    mockedGetAllTasks
      .mockResolvedValueOnce({ data: { tasks: [{}, {}, {}] } } as never)
      .mockRejectedValueOnce(new Error("offline"));
    const { result } = renderHook(() => useOpenTasksCount());
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(result.current).toBe(3);

    await act(() => vi.advanceTimersByTimeAsync(5 * 60 * 1000));
    expect(result.current).toBe(0);
    expect(error).toHaveBeenCalledWith("Error fetching open tasks count:", expect.any(Error));
    error.mockRestore();
  });

  it("refreshes every five minutes and stops on unmount", async () => {
    vi.useFakeTimers();
    mockedGetAllTasks.mockResolvedValue({ data: { tasks: [] } } as never);
    const { unmount } = renderHook(() => useOpenTasksCount());
    expect(mockedGetAllTasks).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    expect(mockedGetAllTasks).toHaveBeenCalledTimes(2);
    unmount();
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    expect(mockedGetAllTasks).toHaveBeenCalledTimes(2);
  });
});
