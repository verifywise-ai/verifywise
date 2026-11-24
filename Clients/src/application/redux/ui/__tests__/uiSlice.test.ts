import uiReducer, {
  toggleSidebar,
  setModelInventoryStatusFilter,
  setActiveModule,
  setRowsPerPage,
  setSetupModalOpen,
  setComponentVisibility,
  setInputValues,
  bumpPhotoRefresh,
  selectSetupModalOpen,
  selectComponentsVisible,
  selectInputValues,
  selectPhotoRefreshCounter,
} from "../uiSlice";
import type { AppModule } from "../uiSlice";

describe("uiSlice", () => {
  const initialState = {
    sidebar: { collapsed: false },
    appModule: { active: "main" as AppModule },
    modelInventory: { statusFilter: "all" },
    componentsVisible: {
      home: false,
      sidebar: false,
      projectFrameworks: false,
      compliance: false,
    },
    inputValues: {},
    photoRefreshCounter: 0,
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
      },
    );
  });

  describe("setModelInventoryStatusFilter", () => {
    it("should update the status filter", () => {
      const state = uiReducer(initialState, setModelInventoryStatusFilter("active"));
      expect(state.modelInventory.statusFilter).toBe("active");
    });
  });

  describe("setRowsPerPage", () => {
    it("should set rows per page for a known table key", () => {
      const stateWithTable = { ...initialState, vendors: { rowsPerPage: 10 } } as any;
      const state = uiReducer(stateWithTable, setRowsPerPage({ table: "vendors", value: 25 }));
      expect((state as any).vendors.rowsPerPage).toBe(25);
    });

    it("should be a no-op for an unknown table key", () => {
      const state = uiReducer(initialState, setRowsPerPage({ table: "nonexistent", value: 50 }));
      expect(state).toEqual(initialState);
    });
  });

  describe("setSetupModalOpen", () => {
    it("is closed until set, then follows the flag", () => {
      expect(selectSetupModalOpen({ ui: initialState })).toBe(false);
      const open = uiReducer(initialState, setSetupModalOpen(true));
      expect(selectSetupModalOpen({ ui: open })).toBe(true);
      const closed = uiReducer(open, setSetupModalOpen(false));
      expect(selectSetupModalOpen({ ui: closed })).toBe(false);
    });
  });

  describe("setComponentVisibility", () => {
    it("flips only the targeted flag", () => {
      const state = uiReducer(
        initialState,
        setComponentVisibility({ component: "home", value: true }),
      );
      expect(state.componentsVisible).toEqual({
        home: true,
        sidebar: false,
        projectFrameworks: false,
        compliance: false,
      });
      expect(selectComponentsVisible({ ui: state }).home).toBe(true);
    });

    it("accumulates flags across dispatches", () => {
      let state = uiReducer(
        initialState,
        setComponentVisibility({ component: "sidebar", value: true }),
      );
      state = uiReducer(state, setComponentVisibility({ component: "compliance", value: true }));
      expect(selectComponentsVisible({ ui: state })).toEqual({
        home: false,
        sidebar: true,
        projectFrameworks: false,
        compliance: true,
      });
    });
  });

  describe("setInputValues", () => {
    it("replaces the edit-target shuttle", () => {
      const state = uiReducer(initialState, setInputValues({ id: 7, risk_name: "Risk A" }));
      expect(selectInputValues({ ui: state })).toEqual({ id: 7, risk_name: "Risk A" });
    });
  });

  describe("bumpPhotoRefresh", () => {
    it("increments the counter monotonically", () => {
      const once = uiReducer(initialState, bumpPhotoRefresh());
      const twice = uiReducer(once, bumpPhotoRefresh());
      expect(selectPhotoRefreshCounter({ ui: once })).toBe(1);
      expect(selectPhotoRefreshCounter({ ui: twice })).toBe(2);
    });
  });
});
