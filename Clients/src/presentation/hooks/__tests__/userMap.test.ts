import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

// Mock the entity repository before importing the hook
vi.mock("../../../application/repository/entity.repository", () => ({
  getAllEntities: vi.fn(),
}));

import { useUserMap } from "../userMap";
import { getAllEntities } from "../../../application/repository/entity.repository";

const mockGetAllEntities = vi.mocked(getAllEntities);

describe("useUserMap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls getAllEntities with /users on mount", () => {
    mockGetAllEntities.mockResolvedValue({ data: [] });
    renderHook(() => useUserMap());
    expect(mockGetAllEntities).toHaveBeenCalledWith({ routeUrl: "/users" });
  });

  it("maps user id to 'name surname'", async () => {
    mockGetAllEntities.mockResolvedValue({
      data: [
        { id: 1, name: "Alice", surname: "Smith" },
        { id: 2, name: "Bob", surname: "Jones" },
      ],
    });

    const { result } = renderHook(() => useUserMap());

    await waitFor(() => {
      expect(result.current.users.length).toBe(2);
    });

    expect(result.current.userMap.get("1")).toBe("Alice Smith");
    expect(result.current.userMap.get("2")).toBe("Bob Jones");
  });

  it("handles API error gracefully (users stays empty)", async () => {
    mockGetAllEntities.mockRejectedValue(new Error("Network error"));

    const { result } = renderHook(() => useUserMap());

    // Wait for the effect to run and error to be caught
    await waitFor(() => {
      expect(mockGetAllEntities).toHaveBeenCalled();
    });

    expect(result.current.users).toEqual([]);
    expect(result.current.userMap.size).toBe(0);
  });

  it("handles null/undefined response data", async () => {
    mockGetAllEntities.mockResolvedValue({ data: null });

    const { result } = renderHook(() => useUserMap());

    await waitFor(() => {
      expect(mockGetAllEntities).toHaveBeenCalled();
    });

    expect(result.current.users).toEqual([]);
  });

  it("converts numeric id to string key in map", async () => {
    mockGetAllEntities.mockResolvedValue({
      data: [{ id: 42, name: "Test", surname: "User" }],
    });

    const { result } = renderHook(() => useUserMap());

    await waitFor(() => {
      expect(result.current.users.length).toBe(1);
    });

    expect(result.current.userMap.has("42")).toBe(true);
    expect(result.current.userMap.get("42")).toBe("Test User");
  });
});
