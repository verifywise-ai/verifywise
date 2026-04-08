import { renderHook } from "@testing-library/react";
import useNavigateSearch from "../useNavigateSearch";

const mockNavigate = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    createSearchParams: actual.createSearchParams,
  };
});

describe("useNavigateSearch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("navigation", () => {
    it("should navigate with search params", () => {
      const { result } = renderHook(() => useNavigateSearch());

      result.current("/projects", { id: "123" });

      expect(mockNavigate).toHaveBeenCalledWith({
        pathname: "/projects",
        search: "?id=123",
      });
    });

    it("should navigate with multiple search params", () => {
      const { result } = renderHook(() => useNavigateSearch());

      result.current("/projects", { id: "123", filter: "active" });

      expect(mockNavigate).toHaveBeenCalledWith({
        pathname: "/projects",
        search: "?id=123&filter=active",
      });
    });

    it("should navigate with empty params", () => {
      const { result } = renderHook(() => useNavigateSearch());

      result.current("/projects", {});

      expect(mockNavigate).toHaveBeenCalledWith({
        pathname: "/projects",
        search: "?",
      });
    });

    it("should navigate to pathname without params", () => {
      const { result } = renderHook(() => useNavigateSearch());

      result.current("/dashboard");

      expect(mockNavigate).toHaveBeenCalledWith({
        pathname: "/dashboard",
        search: "?",
      });
    });

    it("should handle array params", () => {
      const { result } = renderHook(() => useNavigateSearch());

      result.current("/projects", { tags: ["react", "typescript"] });

      expect(mockNavigate).toHaveBeenCalledWith({
        pathname: "/projects",
        search: "?tags=react&tags=typescript",
      });
    });

    it("should handle special characters in params", () => {
      const { result } = renderHook(() => useNavigateSearch());

      result.current("/search", { query: "hello world" });

      expect(mockNavigate).toHaveBeenCalledWith({
        pathname: "/search",
        search: "?query=hello+world",
      });
    });
  });

  describe("validation", () => {
    it("should log error when pathname is empty", () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const { result } = renderHook(() => useNavigateSearch());

      result.current("");

      expect(mockNavigate).not.toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith("Pathname is required for navigation");

      consoleSpy.mockRestore();
    });

    it("should log error when pathname is undefined", () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const { result } = renderHook(() => useNavigateSearch());

      result.current(undefined as unknown as string);

      expect(mockNavigate).not.toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith("Pathname is required for navigation");

      consoleSpy.mockRestore();
    });

    it("should still navigate when params is undefined", () => {
      const { result } = renderHook(() => useNavigateSearch());

      result.current("/projects", undefined as unknown as Record<string, string>);

      expect(mockNavigate).toHaveBeenCalledWith({
        pathname: "/projects",
        search: "?",
      });
    });
  });
});
