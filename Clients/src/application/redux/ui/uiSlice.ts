import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { ComponentVisible } from "../../interfaces/ComponentVisible";

export type AppModule =
  "main" | "evals" | "ai-detection" | "shadow-ai" | "ai-gateway" | "ai-trust-index" | "super-admin";

interface UiState {
  sidebar: { collapsed: boolean };
  appModule: { active: AppModule };
  modelInventory: { statusFilter: string };
  /**
   * modalOpen is true from the moment the first-login setup modal opens until
   * it calls back, including after it has saved "completed" itself (the demo
   * loader does that before "Explore the demo"). Absent until first set; the
   * ui slice is not persisted.
   */
  setup?: { modalOpen: boolean };
  /**
   * Tour-trigger visibility flags, migrated from the legacy VerifyWiseContext.
   * Set by page/component mounts; read by Home/ComplianceTracker to fire the
   * product tour once the relevant sections have rendered.
   */
  componentsVisible: ComponentVisible;
}

const initialState: UiState = {
  sidebar: {
    collapsed: false,
  },
  appModule: {
    active: "main",
  },
  modelInventory: {
    statusFilter: "all",
  },
  componentsVisible: {
    home: false,
    sidebar: false,
    projectFrameworks: false,
    compliance: false,
  },
};

const uiSlice = createSlice({
  name: "ui",
  initialState,
  reducers: {
    setRowsPerPage: (state: any, action) => {
      const { table, value } = action.payload;
      if (state[table]) {
        state[table].rowsPerPage = value;
      }
    },
    toggleSidebar: (state) => {
      state.sidebar.collapsed = !state.sidebar.collapsed;
    },
    setSidebarCollapsed: (state, action: PayloadAction<boolean>) => {
      state.sidebar.collapsed = action.payload;
    },
    setModelInventoryStatusFilter: (state, action) => {
      state.modelInventory.statusFilter = action.payload;
    },
    setSetupModalOpen: (state, action: PayloadAction<boolean>) => {
      state.setup = { modalOpen: action.payload };
    },
    setActiveModule: (state, action: PayloadAction<AppModule>) => {
      if (!state.appModule) {
        state.appModule = { active: action.payload };
      } else {
        state.appModule.active = action.payload;
      }
    },
    setComponentVisibility: (
      state,
      action: PayloadAction<{ component: keyof ComponentVisible; value: boolean }>,
    ) => {
      state.componentsVisible[action.payload.component] = action.payload.value;
    },
  },
});

export default uiSlice.reducer;
export const {
  setRowsPerPage,
  toggleSidebar,
  setSidebarCollapsed,
  setModelInventoryStatusFilter,
  setActiveModule,
  setSetupModalOpen,
  setComponentVisibility,
} = uiSlice.actions;

/** True while the first-login setup modal is on screen. */
export const selectSetupModalOpen = (state: { ui?: UiState }): boolean =>
  state.ui?.setup?.modalOpen === true;

/** Tour-trigger visibility flags (migrated from VerifyWiseContext). */
export const selectComponentsVisible = (state: { ui?: UiState }): ComponentVisible =>
  state.ui?.componentsVisible ?? {
    home: false,
    sidebar: false,
    projectFrameworks: false,
    compliance: false,
  };
