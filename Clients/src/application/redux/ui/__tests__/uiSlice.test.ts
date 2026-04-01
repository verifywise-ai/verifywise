import uiReducer, {
  toggleSidebar,
  setModelInventoryStatusFilter,
  setActiveModule,
  setRowsPerPage,
} from "../uiSlice";
import type { AppModule } from "../uiSlice";

describe("uiSlice", () => {
  const initialState = {
    sidebar: { collapsed: false },
    appModule: { active: "main" as AppModule },
    modelInventory: { statusFilter: "all" },
  };

  it("should return initial state on unknown action", () => {
    const state = uiReducer(undefined, { type: "unknown" });
    expect(state).toEqual(initialState);
  });

  describe("toggleSidebar", () => {
    it("should collapse sidebar when expanded", () => {
      const state = uiReducer(initialState, toggleSidebar());
      expect(state.sidebar.collapsed).toBe(true);
    });

    it("should expand sidebar when collapsed", () => {
      const collapsed = { ...initialState, sidebar: { collapsed: true } };
      const state = uiReducer(collapsed, toggleSidebar());
      expect(state.sidebar.collapsed).toBe(false);
    });

    it("should toggle back and forth", () => {
      let state = uiReducer(initialState, toggleSidebar());
      expect(state.sidebar.collapsed).toBe(true);
      state = uiReducer(state, toggleSidebar());
      expect(state.sidebar.collapsed).toBe(false);
    });
  });

  describe("setActiveModule", () => {
    it.each<AppModule>(["main", "evals", "ai-detection", "shadow-ai"])(
      "should set active module to %s",
      (module) => {
        const state = uiReducer(initialState, setActiveModule(module));
        expect(state.appModule.active).toBe(module);
      }
    );
  });

  describe("setModelInventoryStatusFilter", () => {
    it("should update the status filter", () => {
      const state = uiReducer(
        initialState,
        setModelInventoryStatusFilter("active")
      );
      expect(state.modelInventory.statusFilter).toBe("active");
    });
  });

  describe("setRowsPerPage", () => {
    it("should set rows per page for a known table key", () => {
      const stateWithTable = { ...initialState, vendors: { rowsPerPage: 10 } } as any;
      const state = uiReducer(
        stateWithTable,
        setRowsPerPage({ table: "vendors", value: 25 })
      );
      expect((state as any).vendors.rowsPerPage).toBe(25);
    });

    it("should be a no-op for an unknown table key", () => {
      const state = uiReducer(
        initialState,
        setRowsPerPage({ table: "nonexistent", value: 50 })
      );
      expect(state).toEqual(initialState);
    });
  });
});
