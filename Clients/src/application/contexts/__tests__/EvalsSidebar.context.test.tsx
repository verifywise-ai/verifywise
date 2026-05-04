import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import React from "react";
import {
  EvalsSidebarProvider,
  useEvalsSidebarContext,
  useEvalsSidebarContextSafe,
} from "../EvalsSidebar.context";

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(EvalsSidebarProvider, null, children);
}

describe("EvalsSidebarContext", () => {
  describe("useEvalsSidebarContext", () => {
    it("should throw when used outside provider", () => {
      expect(() => {
        renderHook(() => useEvalsSidebarContext());
      }).toThrow("useEvalsSidebarContext must be used within EvalsSidebarProvider");
    });

    it("should provide default values", () => {
      const { result } = renderHook(() => useEvalsSidebarContext(), { wrapper });
      expect(result.current.activeTab).toBe("overview");
      expect(result.current.experimentsCount).toBe(0);
      expect(result.current.datasetsCount).toBe(0);
      expect(result.current.scorersCount).toBe(0);
      expect(result.current.modelsCount).toBe(0);
      expect(result.current.arenaCount).toBe(0);
      expect(result.current.disabled).toBe(false);
      expect(result.current.recentExperiments).toEqual([]);
      expect(result.current.recentProjects).toEqual([]);
      expect(result.current.currentProject).toBeNull();
      expect(result.current.allProjects).toEqual([]);
    });

    it("should update activeTab", () => {
      const { result } = renderHook(() => useEvalsSidebarContext(), { wrapper });
      act(() => {
        result.current.setActiveTab("experiments");
      });
      expect(result.current.activeTab).toBe("experiments");
    });

    it("should update counts", () => {
      const { result } = renderHook(() => useEvalsSidebarContext(), { wrapper });
      act(() => {
        result.current.setExperimentsCount(5);
        result.current.setDatasetsCount(3);
        result.current.setScorersCount(2);
        result.current.setModelsCount(4);
        result.current.setArenaCount(1);
      });
      expect(result.current.experimentsCount).toBe(5);
      expect(result.current.datasetsCount).toBe(3);
      expect(result.current.scorersCount).toBe(2);
      expect(result.current.modelsCount).toBe(4);
      expect(result.current.arenaCount).toBe(1);
    });

    it("should update disabled state", () => {
      const { result } = renderHook(() => useEvalsSidebarContext(), { wrapper });
      act(() => {
        result.current.setDisabled(true);
      });
      expect(result.current.disabled).toBe(true);
    });

    it("should update recent experiments", () => {
      const { result } = renderHook(() => useEvalsSidebarContext(), { wrapper });
      const experiments = [
        { id: "1", name: "Exp 1", projectId: "p1" },
        { id: "2", name: "Exp 2", projectId: "p2" },
      ];
      act(() => {
        result.current.setRecentExperiments(experiments);
      });
      expect(result.current.recentExperiments).toEqual(experiments);
    });

    it("should update current project", () => {
      const { result } = renderHook(() => useEvalsSidebarContext(), { wrapper });
      const project = { id: "p1", name: "Project 1", description: "Test" };
      act(() => {
        result.current.setCurrentProject(project);
      });
      expect(result.current.currentProject).toEqual(project);
    });

    it("should update all projects", () => {
      const { result } = renderHook(() => useEvalsSidebarContext(), { wrapper });
      const projects = [
        { id: "p1", name: "Project 1" },
        { id: "p2", name: "Project 2" },
      ];
      act(() => {
        result.current.setAllProjects(projects);
      });
      expect(result.current.allProjects).toEqual(projects);
    });
  });

  describe("useEvalsSidebarContextSafe", () => {
    it("should return null when used outside provider", () => {
      const { result } = renderHook(() => useEvalsSidebarContextSafe());
      expect(result.current).toBeNull();
    });

    it("should return context when used within provider", () => {
      const { result } = renderHook(() => useEvalsSidebarContextSafe(), { wrapper });
      expect(result.current).not.toBeNull();
      expect(result.current?.activeTab).toBe("overview");
    });
  });
});
