import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiServices } from "../../../infrastructure/api/networkServices";
import {
  getAllTasks,
  getTaskById,
  createTask,
  updateTask,
  deleteTask,
  updateTaskStatus,
  updateTaskPriority,
  restoreTask,
  hardDeleteTask,
} from "../task.repository";
import { ITask } from "../../../domain/interfaces/i.task";
import { TaskPriority, TaskStatus } from "../../../domain/enums/task.enum";

vi.mock("../../../infrastructure/api/networkServices", () => {
  return {
    apiServices: {
      get: vi.fn(),
      post: vi.fn(),
      patch: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
    },
  };
});

describe("task.repository", () => {
  beforeEach(vi.clearAllMocks);
  afterEach(vi.clearAllMocks);

  describe("getAllTasks", () => {
    it("should make GET request to /tasks without params", async () => {
      const mockResponse = {
        data: {
          tasks: [{ id: 1, title: "Test Task" }] as ITask[],
          total: 1,
          page: 1,
          pageSize: 25,
        },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const result = await getAllTasks({});

      expect(apiServices.get).toHaveBeenCalledTimes(1);
      expect(apiServices.get).toHaveBeenCalledWith(
        "/tasks?sort_by=created_at&sort_order=DESC&page=1&page_size=25",
        { signal: undefined },
      );
      expect(result).toEqual(mockResponse.data);
    });

    it("should make GET request with filters and pagination", async () => {
      const mockResponse = {
        data: {
          tasks: [{ id: 1, title: "Filtered Task" }] as ITask[],
          total: 1,
          page: 2,
          pageSize: 10,
        },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const result = await getAllTasks({
        status: [TaskStatus.IN_PROGRESS],
        priority: [TaskPriority.HIGH],
        page: "2",
        page_size: "10",
      });

      expect(apiServices.get).toHaveBeenCalledWith(
        "/tasks?status=In+Progress&priority=High&sort_by=created_at&sort_order=DESC&page=2&page_size=10",
        { signal: undefined },
      );
      expect(result).toEqual(mockResponse.data);
    });

    it("should make GET request with search param", async () => {
      const mockResponse = {
        data: {
          tasks: [{ id: 1, title: "Search Task" }] as ITask[],
          total: 1,
          page: 1,
          pageSize: 25,
        },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const result = await getAllTasks({ search: "test" });

      expect(apiServices.get).toHaveBeenCalledWith(
        "/tasks?search=test&sort_by=created_at&sort_order=DESC&page=1&page_size=25",
        { signal: undefined },
      );
      expect(result).toEqual(mockResponse.data);
    });

    it("should make GET request with empty filter arrays", async () => {
      const mockResponse = {
        data: {
          tasks: [{ id: 1, title: "Task" }] as ITask[],
          total: 1,
          page: 1,
          pageSize: 25,
        },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const result = await getAllTasks({
        status: [],
        priority: [],
        category: [],
        assignee: [],
        include_archived: false,
      });

      expect(apiServices.get).toHaveBeenCalledTimes(1);
      expect(result).toEqual(mockResponse.data);
    });

    it("should make GET request with include_archived param", async () => {
      const mockResponse = {
        data: {
          tasks: [{ id: 1, title: "Archived Task" }] as ITask[],
          total: 1,
          page: 1,
          pageSize: 25,
        },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const result = await getAllTasks({ include_archived: true });

      expect(apiServices.get).toHaveBeenCalledWith(
        "/tasks?include_archived=true&sort_by=created_at&sort_order=DESC&page=1&page_size=25",
        { signal: undefined },
      );
      expect(result).toEqual(mockResponse.data);
    });

    it("should make GET request with all filter arrays", async () => {
      const mockResponse = {
        data: {
          tasks: [{ id: 1, title: "Filtered Task" }] as ITask[],
          total: 1,
          page: 1,
          pageSize: 25,
        },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const result = await getAllTasks({
        status: [TaskStatus.IN_PROGRESS],
        priority: [TaskPriority.HIGH],
        category: ["engineering"],
        assignee: [1, 2],
        due_date_start: "2024-01-01",
        due_date_end: "2024-12-31",
      });

      expect(apiServices.get).toHaveBeenCalledTimes(1);
      expect(result).toEqual(mockResponse.data);
    });

    it("should throw error with status and data if API call fails", async () => {
      const mockError = {
        response: {
          status: 500,
          data: { message: "Internal Server Error" },
        },
      };

      vi.mocked(apiServices.get).mockRejectedValue(mockError);

      await expect(getAllTasks({})).rejects.toThrow();
    });

    it("should throw error without response property for network errors", async () => {
      const networkError = new Error("Network timeout");

      vi.mocked(apiServices.get).mockRejectedValue(networkError);

      await expect(getAllTasks({})).rejects.toThrow("Network timeout");
    });
  });

  describe("getTaskById", () => {
    it("should make GET request to /tasks/:id", async () => {
      const mockResponse = {
        data: { id: 1, title: "Test Task" } as ITask,
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const result = await getTaskById({ id: 1 });

      expect(apiServices.get).toHaveBeenCalledTimes(1);
      expect(apiServices.get).toHaveBeenCalledWith("/tasks/1", {
        signal: undefined,
      });
      expect(result).toEqual(mockResponse.data);
    });

    it("should throw error with status and data if API call fails", async () => {
      const mockError = {
        response: {
          status: 404,
          data: { message: "Task not found" },
        },
      };

      vi.mocked(apiServices.get).mockRejectedValue(mockError);

      await expect(getTaskById({ id: 999 })).rejects.toThrow();
    });

    it("should throw error without response property for network errors", async () => {
      const networkError = new Error("Connection refused");

      vi.mocked(apiServices.get).mockRejectedValue(networkError);

      await expect(getTaskById({ id: 1 })).rejects.toThrow("Connection refused");
    });
  });

  describe("createTask", () => {
    it("should make POST request to /tasks with body", async () => {
      const mockResponse = {
        data: { id: 1, title: "New Task" } as ITask,
        status: 201,
        statusText: "Created",
      };

      const body: Partial<ITask> = {
        title: "New Task",
        description: "Test description",
      };

      vi.mocked(apiServices.post).mockResolvedValue(mockResponse);

      const result = await createTask({ body });

      expect(apiServices.post).toHaveBeenCalledTimes(1);
      expect(apiServices.post).toHaveBeenCalledWith("/tasks", body);
      expect(result).toEqual(mockResponse.data);
    });

    it("should throw error with status and data if API call fails", async () => {
      const mockError = {
        response: {
          status: 400,
          data: { message: "Invalid task data" },
        },
      };

      vi.mocked(apiServices.post).mockRejectedValue(mockError);

      await expect(createTask({ body: { title: "" } })).rejects.toThrow();
    });

    it("should throw error without response property for network errors", async () => {
      const networkError = new Error("Network timeout");

      vi.mocked(apiServices.post).mockRejectedValue(networkError);

      await expect(createTask({ body: { title: "Test" } })).rejects.toThrow(
        "Network timeout",
      );
    });
  });

  describe("updateTask", () => {
    it("should make PUT request to /tasks/:id with body", async () => {
      const mockResponse = {
        data: { id: 1, title: "Updated Task" } as ITask,
        status: 200,
        statusText: "OK",
      };

      const body: Partial<ITask> = {
        title: "Updated Task",
      };

      vi.mocked(apiServices.put).mockResolvedValue(mockResponse);

      const result = await updateTask({ id: 1, body });

      expect(apiServices.put).toHaveBeenCalledTimes(1);
      expect(apiServices.put).toHaveBeenCalledWith("/tasks/1", body);
      expect(result).toEqual(mockResponse.data);
    });

    it("should throw error with status and data if API call fails", async () => {
      const mockError = {
        response: {
          status: 404,
          data: { message: "Task not found" },
        },
      };

      vi.mocked(apiServices.put).mockRejectedValue(mockError);

      await expect(updateTask({ id: 999, body: { title: "Test" } })).rejects.toThrow();
    });

    it("should throw error without response property for network errors", async () => {
      const networkError = new Error("Connection refused");

      vi.mocked(apiServices.put).mockRejectedValue(networkError);

      await expect(updateTask({ id: 1, body: { title: "Test" } })).rejects.toThrow(
        "Connection refused",
      );
    });
  });

  describe("deleteTask", () => {
    it("should make DELETE request to /tasks/:id", async () => {
      const mockResponse = {
        data: { message: "Task deleted successfully" },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.delete).mockResolvedValue(mockResponse);

      const result = await deleteTask({ id: 1 });

      expect(apiServices.delete).toHaveBeenCalledTimes(1);
      expect(apiServices.delete).toHaveBeenCalledWith("/tasks/1");
      expect(result).toEqual(mockResponse.data);
    });

    it("should throw error with status and data if API call fails", async () => {
      const mockError = {
        response: {
          status: 404,
          data: { message: "Task not found" },
        },
      };

      vi.mocked(apiServices.delete).mockRejectedValue(mockError);

      await expect(deleteTask({ id: 999 })).rejects.toThrow();
    });

    it("should throw error without response property for network errors", async () => {
      const networkError = new Error("Network timeout");

      vi.mocked(apiServices.delete).mockRejectedValue(networkError);

      await expect(deleteTask({ id: 1 })).rejects.toThrow("Network timeout");
    });
  });

  describe("updateTaskStatus", () => {
    it("should make PUT request to /tasks/:id with status body", async () => {
      const mockResponse = {
        data: { id: 1, status: TaskStatus.COMPLETED } as unknown as ITask,
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.put).mockResolvedValue(mockResponse);

      const result = await updateTaskStatus({
        id: 1,
        status: "completed" as TaskStatus,
      });

      expect(apiServices.put).toHaveBeenCalledTimes(1);
      expect(apiServices.put).toHaveBeenCalledWith("/tasks/1", {
        status: "completed",
      });
      expect(result).toEqual(mockResponse.data);
    });

    it("should throw error with status and data if API call fails", async () => {
      const mockError = {
        response: {
          status: 400,
          data: { message: "Invalid status" },
        },
      };

      vi.mocked(apiServices.put).mockRejectedValue(mockError);

      await expect(
        updateTaskStatus({ id: 1, status: "invalid" as TaskStatus }),
      ).rejects.toThrow();
    });

    it("should throw error without response property for network errors", async () => {
      const networkError = new Error("Connection refused");

      vi.mocked(apiServices.put).mockRejectedValue(networkError);

      await expect(
        updateTaskStatus({ id: 1, status: "in_progress" as TaskStatus }),
      ).rejects.toThrow("Connection refused");
    });
  });

  describe("updateTaskPriority", () => {
    it("should make PUT request to /tasks/:id with priority body", async () => {
      const mockResponse = {
        data: { id: 1, priority: TaskPriority.HIGH } as unknown as ITask,
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.put).mockResolvedValue(mockResponse);

      const result = await updateTaskPriority({
        id: 1,
        priority: "high" as TaskPriority,
      });

      expect(apiServices.put).toHaveBeenCalledTimes(1);
      expect(apiServices.put).toHaveBeenCalledWith("/tasks/1", {
        priority: "high",
      });
      expect(result).toEqual(mockResponse.data);
    });

    it("should throw error with status and data if API call fails", async () => {
      const mockError = {
        response: {
          status: 400,
          data: { message: "Invalid priority" },
        },
      };

      vi.mocked(apiServices.put).mockRejectedValue(mockError);

      await expect(
        updateTaskPriority({ id: 1, priority: "invalid" as TaskPriority }),
      ).rejects.toThrow();
    });

    it("should throw error without response property for network errors", async () => {
      const networkError = new Error("Network timeout");

      vi.mocked(apiServices.put).mockRejectedValue(networkError);

      await expect(
        updateTaskPriority({ id: 1, priority: "low" as TaskPriority }),
      ).rejects.toThrow("Network timeout");
    });
  });

  describe("restoreTask", () => {
    it("should make PUT request to /tasks/:id/restore with empty body", async () => {
      const mockResponse = {
        data: { id: 1, status: TaskStatus.IN_PROGRESS } as unknown as ITask,
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.put).mockResolvedValue(mockResponse);

      const result = await restoreTask({ id: 1 });

      expect(apiServices.put).toHaveBeenCalledTimes(1);
      expect(apiServices.put).toHaveBeenCalledWith("/tasks/1/restore", {});
      expect(result).toEqual(mockResponse.data);
    });

    it("should throw error with status and data if API call fails", async () => {
      const mockError = {
        response: {
          status: 404,
          data: { message: "Task not found" },
        },
      };

      vi.mocked(apiServices.put).mockRejectedValue(mockError);

      await expect(restoreTask({ id: 999 })).rejects.toThrow();
    });

    it("should throw error without response property for network errors", async () => {
      const networkError = new Error("Connection refused");

      vi.mocked(apiServices.put).mockRejectedValue(networkError);

      await expect(restoreTask({ id: 1 })).rejects.toThrow("Connection refused");
    });
  });

  describe("hardDeleteTask", () => {
    it("should make DELETE request to /tasks/:id/hard", async () => {
      const mockResponse = {
        data: { message: "Task permanently deleted" },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.delete).mockResolvedValue(mockResponse);

      const result = await hardDeleteTask({ id: 1 });

      expect(apiServices.delete).toHaveBeenCalledTimes(1);
      expect(apiServices.delete).toHaveBeenCalledWith("/tasks/1/hard");
      expect(result).toEqual(mockResponse.data);
    });

    it("should throw error with status and data if API call fails", async () => {
      const mockError = {
        response: {
          status: 404,
          data: { message: "Task not found" },
        },
      };

      vi.mocked(apiServices.delete).mockRejectedValue(mockError);

      await expect(hardDeleteTask({ id: 999 })).rejects.toThrow();
    });

    it("should throw error without response property for network errors", async () => {
      const networkError = new Error("Network timeout");

      vi.mocked(apiServices.delete).mockRejectedValue(networkError);

      await expect(hardDeleteTask({ id: 1 })).rejects.toThrow("Network timeout");
    });
  });
});
