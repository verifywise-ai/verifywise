/**
 * Integration-style "instant feedback" demo: with a slow server, a task
 * update and a file-tag add are visible in the query cache (i.e. what the
 * table/banner renders) before the server responds, and the cache settles to
 * the authoritative server entity once the requests resolve.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useUpdateTask } from "../../useTaskMutations";
import { useAddFileTags } from "../../useFileTagMutations";
import { taskQueryKeys } from "../../useTasks";
import { fileQueryKeys } from "../../useFiles";
import { TaskStatus, TaskPriority } from "../../../../domain/enums/task.enum";
import type { ITask } from "../../../../domain/interfaces/i.task";
import { FileModel } from "../../../../domain/models/Common/file/file.model";

vi.mock("../../../repository/task.repository", () => ({
  updateTask: vi.fn(),
}));

vi.mock("../../../repository/file.repository", () => ({
  updateFileMetadata: vi.fn(),
}));

vi.mock("../../../tools/alertUtils", () => ({
  showAlert: vi.fn(),
}));

import { updateTask } from "../../../repository/task.repository";
import { updateFileMetadata } from "../../../repository/file.repository";

const mockUpdateTask = vi.mocked(updateTask);
const mockUpdateFileMetadata = vi.mocked(updateFileMetadata);

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  let reject: (error: unknown) => void = () => {};
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("optimistic mutations — instant feedback flow", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows a task update and a tag add immediately, then settles to the server entities", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: queryClient }, children);

    const taskKey = taskQueryKeys.list({});
    const fileKey = fileQueryKeys.list({});
    queryClient.setQueryData<ITask[]>(taskKey, [
      {
        id: 1,
        title: "Review model",
        creator_id: 1,
        status: TaskStatus.OPEN,
        priority: TaskPriority.LOW,
      },
    ]);
    queryClient.setQueryData<FileModel[]>(fileKey, [
      FileModel.createNewFile({
        id: "7",
        fileName: "evidence.pdf",
        uploadDate: new Date("2026-01-01"),
        uploader: "1",
        tags: [],
      }),
    ]);

    // Slow server: neither request resolves until we say so.
    const taskRequest = deferred<unknown>();
    const tagRequest = deferred<unknown>();
    mockUpdateTask.mockImplementation(() => taskRequest.promise as Promise<any>);
    mockUpdateFileMetadata.mockImplementation(() => tagRequest.promise as Promise<any>);

    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(
      () => ({ updateTask: useUpdateTask(), addFileTags: useAddFileTags() }),
      { wrapper },
    );

    act(() => {
      result.current.updateTask.mutate({ id: 1, body: { status: TaskStatus.IN_PROGRESS } });
      result.current.addFileTags.mutate({ id: "7", currentTags: [], tags: ["evidence"] });
    });

    // Instant feedback: both caches update while the server is still pending.
    await waitFor(() => {
      expect(queryClient.getQueryData<ITask[]>(taskKey)?.[0].status).toBe(TaskStatus.IN_PROGRESS);
      expect(queryClient.getQueryData<FileModel[]>(fileKey)?.[0].tags).toEqual(["evidence"]);
    });
    expect(result.current.updateTask.isPending).toBe(true);
    expect(result.current.addFileTags.isPending).toBe(true);

    // Server responds with the authoritative entities.
    act(() => {
      taskRequest.resolve({
        message: "Updated",
        data: {
          id: 1,
          title: "Review model",
          creator_id: 1,
          status: TaskStatus.IN_PROGRESS,
          priority: TaskPriority.HIGH, // server-side recomputation wins
        },
      });
      tagRequest.resolve({ id: "7", tags: ["evidence", "reviewed"] });
    });

    await waitFor(() => {
      expect(result.current.updateTask.isSuccess).toBe(true);
      expect(result.current.addFileTags.isSuccess).toBe(true);
    });

    // Cache settles to exactly what the server returned.
    expect(queryClient.getQueryData<ITask[]>(taskKey)?.[0].priority).toBe(TaskPriority.HIGH);
    expect(queryClient.getQueryData<FileModel[]>(fileKey)?.[0].tags).toEqual([
      "evidence",
      "reviewed",
    ]);

    // No list refetches: only the derived dashboard/deadline queries refresh.
    const keys = invalidateSpy.mock.calls.map(
      (call) => (call[0] as { queryKey: unknown[] }).queryKey,
    );
    expect(keys.every((key) => key[0] !== "tasks" && key[0] !== "files")).toBe(true);
  });
});
