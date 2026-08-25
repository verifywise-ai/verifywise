import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import React from "react";
import { VerifyWiseContext } from "../../contexts/VerifyWise.context";
import { Project } from "../../../domain/types/Project";
import useDoraActive from "../useDoraActive";

// Minimal helper to build a context value with only the fields useDoraActive cares about.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createWrapper(projects: Project[]) {
  const contextValue: any = {
    projects,
  };
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(VerifyWiseContext.Provider, { value: contextValue }, children);
}

const organizationalProjectWithDora: Project = {
  id: 1,
  project_title: "Organizational framework",
  owner: 1,
  members: [],
  start_date: new Date(),
  ai_risk_classification: null,
  type_of_high_risk_role: null,
  goal: "",
  last_updated: new Date(),
  last_updated_by: 1,
  framework: [{ project_framework_id: 100, framework_id: 9, name: "DORA" }],
  monitored_regulations_and_standards: [],
  is_organizational: true,
};

const organizationalProjectWithoutDora: Project = {
  ...organizationalProjectWithDora,
  framework: [{ project_framework_id: 101, framework_id: 3, name: "ISO 42001" }],
};

describe("useDoraActive", () => {
  it("doraActive is true when the DORA framework is installed for the org", () => {
    const { result } = renderHook(() => useDoraActive(), {
      wrapper: createWrapper([organizationalProjectWithDora]),
    });

    expect(result.current.doraActive).toBe(true);
    expect(result.current.loading).toBe(false);
  });

  it("doraActive is false when DORA is not installed (empty projects)", () => {
    const { result } = renderHook(() => useDoraActive(), {
      wrapper: createWrapper([]),
    });

    expect(result.current.doraActive).toBe(false);
  });

  it("doraActive is false when only non-DORA frameworks are installed", () => {
    const { result } = renderHook(() => useDoraActive(), {
      wrapper: createWrapper([organizationalProjectWithoutDora]),
    });

    expect(result.current.doraActive).toBe(false);
  });

  it("doraActive is false when there is no organizational project at all", () => {
    const nonOrgProject: Project = {
      ...organizationalProjectWithDora,
      is_organizational: false,
    };

    const { result } = renderHook(() => useDoraActive(), {
      wrapper: createWrapper([nonOrgProject]),
    });

    expect(result.current.doraActive).toBe(false);
  });
});
