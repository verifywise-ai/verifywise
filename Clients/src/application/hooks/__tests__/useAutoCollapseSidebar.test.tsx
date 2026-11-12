import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import type { ReactNode } from "react";
import uiReducer, { toggleSidebar } from "../../redux/ui/uiSlice";
import { useAutoCollapseSidebar } from "../useAutoCollapseSidebar";

let narrow = false;
vi.mock("@mui/material", async () => {
  const actual = await vi.importActual<typeof import("@mui/material")>("@mui/material");
  return { ...actual, useMediaQuery: () => narrow };
});

const makeStore = (collapsed: boolean) =>
  configureStore({
    reducer: { ui: uiReducer },
    preloadedState: {
      ui: {
        sidebar: { collapsed },
        appModule: { active: "evals" as const },
        modelInventory: { statusFilter: "all" },
      },
    },
  });

const setup = (collapsed: boolean) => {
  const store = makeStore(collapsed);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  );
  const hook = renderHook(() => useAutoCollapseSidebar(1024), { wrapper });
  return { store, ...hook };
};

const isCollapsed = (store: ReturnType<typeof makeStore>) => store.getState().ui.sidebar.collapsed;

describe("useAutoCollapseSidebar", () => {
  beforeEach(() => {
    narrow = false;
  });

  it("leaves the sidebar alone on a wide viewport", () => {
    const { store } = setup(false);
    expect(isCollapsed(store)).toBe(false);
  });

  it("collapses on a narrow viewport and expands again when it widens", () => {
    narrow = true;
    const { store, rerender } = setup(false);
    expect(isCollapsed(store)).toBe(true);

    narrow = false;
    rerender();
    expect(isCollapsed(store)).toBe(false);
  });

  it("restores the sidebar it collapsed when the page unmounts", () => {
    narrow = true;
    const { store, unmount } = setup(false);
    expect(isCollapsed(store)).toBe(true);
    unmount();
    expect(isCollapsed(store)).toBe(false);
  });

  it("keeps a sidebar the user collapsed by hand", () => {
    narrow = true;
    const { store, rerender, unmount } = setup(true);
    narrow = false;
    rerender();
    expect(isCollapsed(store)).toBe(true);
    unmount();
    expect(isCollapsed(store)).toBe(true);
  });

  it("does not collapse again after the user expands it by hand while narrow", () => {
    narrow = true;
    const { store, rerender } = setup(false);
    act(() => {
      store.dispatch(toggleSidebar());
    });
    rerender();
    expect(isCollapsed(store)).toBe(false);
  });
});
