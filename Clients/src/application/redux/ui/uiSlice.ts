import { createSlice, PayloadAction } from "@reduxjs/toolkit";

export type AppModule = "main" | "evals" | "ai-detection" | "shadow-ai" | "ai-gateway" | "super-admin";

const initialState = {
  sidebar: {
    collapsed: false,
  },
  appModule: {
    active: "main" as AppModule,
  },
  modelInventory: {
    statusFilter: "all",
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
    setModelInventoryStatusFilter: (state, action) => {
      state.modelInventory.statusFilter = action.payload;
    },
    setActiveModule: (state, action: PayloadAction<AppModule>) => {
      if (!state.appModule) {
        state.appModule = { active: action.payload };
      } else {
        state.appModule.active = action.payload;
      }
    },
  },
});

export default uiSlice.reducer;
export const {
  setRowsPerPage,
  toggleSidebar,
  setModelInventoryStatusFilter,
  setActiveModule,
} = uiSlice.actions;
