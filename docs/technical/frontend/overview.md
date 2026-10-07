# Frontend Overview

## Overview

VerifyWise uses React 19 with TypeScript, Vite for bundling, and follows Clean Architecture principles. State management is handled by Redux Toolkit (client state) and React Query (server state). The UI is built with Material-UI (MUI) v7 with Emotion styling.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          FRONTEND ARCHITECTURE                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                    PRESENTATION LAYER                                 │  │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐     │  │
│  │  │   Pages    │  │ Components │  │  Themes    │  │   Assets   │     │  │
│  │  │   (20+)    │  │   (105+)   │  │  (Light)   │  │ (Images)   │     │  │
│  │  └────────────┘  └────────────┘  └────────────┘  └────────────┘     │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                    │                                        │
│                                    ▼                                        │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                    APPLICATION LAYER                                  │  │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐     │  │
│  │  │   Hooks    │  │   Redux    │  │   React    │  │ Repository │     │  │
│  │  │   (50+)    │  │   Store    │  │   Query    │  │   (57+)    │     │  │
│  │  └────────────┘  └────────────┘  └────────────┘  └────────────┘     │  │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐                     │  │
│  │  │  Contexts  │  │  Mappers   │  │   Utils    │                     │  │
│  │  └────────────┘  └────────────┘  └────────────┘                     │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                    │                                        │
│                                    ▼                                        │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                      DOMAIN LAYER                                     │  │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐                     │  │
│  │  │   Types    │  │   Enums    │  │  Interfaces│                     │  │
│  │  │   (20+)    │  │   (15+)    │  │            │                     │  │
│  │  └────────────┘  └────────────┘  └────────────┘                     │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                    │                                        │
│                                    ▼                                        │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                   INFRASTRUCTURE LAYER                                │  │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐                     │  │
│  │  │   Axios    │  │  Network   │  │ Exceptions │                     │  │
│  │  │   Client   │  │  Services  │  │            │                     │  │
│  │  └────────────┘  └────────────┘  └────────────┘                     │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Directory Structure

```
Clients/src/
├── main.tsx                    # Entry point (Redux, Router, Query)
├── App.tsx                     # Root component (Theme, Contexts)
├── index.css                   # Global styles
│
├── application/                # Business logic layer
│   ├── config/                 # Routes, Query client
│   │   ├── routes.tsx          # Route definitions
│   │   └── queryClient.ts      # React Query config
│   ├── hooks/                  # Custom React hooks (50+)
│   ├── redux/                  # Redux store & slices
│   │   ├── store.ts            # Store configuration
│   │   ├── auth/authSlice.ts   # Auth state
│   │   ├── ui/uiSlice.ts       # UI state
│   │   └── file/fileSlice.ts   # File state
│   ├── repository/             # API services (57 files)
│   ├── contexts/               # React contexts
│   ├── constants/              # App constants
│   ├── mappers/                # Data transformations
│   ├── tools/                  # Utility functions
│   └── validations/            # Form validations
│
├── presentation/               # UI layer
│   ├── pages/                  # Page components (20+)
│   ├── components/             # Reusable components (105+)
│   ├── containers/             # Smart components
│   ├── themes/                 # MUI theme config
│   └── assets/                 # Images, icons
│
├── domain/                     # Domain models
│   ├── types/                  # TypeScript types (20+)
│   ├── enums/                  # Enumerations (15+)
│   └── utils/                  # Domain utilities
│
└── infrastructure/             # Technical implementation
    ├── api/                    # Axios, network services
    │   ├── customAxios.ts      # Axios instance
    │   └── networkServices.ts  # HTTP methods
    └── exceptions/             # Error handling
```

## Entry Points

### main.tsx

```typescript
// File: Clients/src/main.tsx

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { PersistGate } from "redux-persist/integration/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";

import App from "./App";
import { store, persistor } from "./application/redux/store";
import { queryClient } from "./application/config/queryClient";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Provider store={store}>
      <PersistGate loading={null} persistor={persistor}>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </QueryClientProvider>
      </PersistGate>
    </Provider>
  </StrictMode>
);
```

### App.tsx

```typescript
// File: Clients/src/App.tsx

import { ThemeProvider } from "@mui/material";
import { theme } from "./presentation/themes/light";
import { VerifyWiseContext } from "./application/contexts/VerifyWise.context";
import { Routes, Route } from "react-router-dom";
import { routes } from "./application/config/routes";

function App() {
  // State management
  const [dashboardValues, setDashboardValues] = useState(initialDashboard);
  const [currentProject, setCurrentProject] = useState(null);
  // ... more state

  return (
    <ThemeProvider theme={theme}>
      <VerifyWiseContext.Provider value={{
        dashboardValues,
        setDashboardValues,
        currentProject,
        setCurrentProject,
        // ... more context values
      }}>
        <Routes>
          {routes.map(route => (
            <Route key={route.path} path={route.path} element={route.element} />
          ))}
        </Routes>
      </VerifyWiseContext.Provider>
    </ThemeProvider>
  );
}
```

## Routing

### Route Configuration

```typescript
// File: Clients/src/application/config/routes.tsx

import { ProtectedRoute } from "../components/ProtectedRoute";
import Dashboard from "../pages/Dashboard";
import Login from "../pages/Login";
// ... more imports

export const routes = [
  // Public routes
  { path: "/login", element: <Login /> },
  { path: "/register", element: <Register /> },
  { path: "/forgot-password", element: <ForgotPassword /> },
  { path: "/reset-password", element: <ResetPassword /> },
  { path: "/aiTrustCentre/:hash", element: <AITrustCentre /> },

  // Protected routes (wrapped with ProtectedRoute)
  {
    path: "/",
    element: (
      <ProtectedRoute>
        <Dashboard />
      </ProtectedRoute>
    ),
  },
  {
    path: "/vendors",
    element: (
      <ProtectedRoute>
        <VendorsPage />
      </ProtectedRoute>
    ),
  },
  // ... more protected routes
];
```

### Main Routes

| Path | Component | Description |
|------|-----------|-------------|
| `/` | Dashboard | Main dashboard |
| `/vendors` | VendorsPage | Vendor management |
| `/model-inventory` | ModelInventory | AI model registry |
| `/risk-management` | RiskManagement | Risk dashboard |
| `/policies` | Policies | Policy manager |
| `/tasks` | Tasks | Task management |
| `/automations` | Automations | Workflow automations |
| `/framework` | Framework | Compliance frameworks |
| `/settings` | Settings | User/org settings |
| `/integrations` | Integrations | Third-party integrations |

## State Management

### Redux Store

```typescript
// File: Clients/src/application/redux/store.ts

import { configureStore } from "@reduxjs/toolkit";
import { persistStore, persistReducer } from "redux-persist";
import storage from "redux-persist/lib/storage";

import authReducer from "./auth/authSlice";
import uiReducer from "./ui/uiSlice";
import fileReducer from "./file/fileSlice";

const persistConfig = {
  key: "root",
  storage,
  whitelist: ["auth", "ui"],  // Persist auth and UI state
  version: APP_VERSION,
};

const rootReducer = combineReducers({
  auth: authReducer,
  ui: uiReducer,
  file: fileReducer,
});

const persistedReducer = persistReducer(persistConfig, rootReducer);

export const store = configureStore({
  reducer: persistedReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: [FLUSH, REHYDRATE, PAUSE, PERSIST, PURGE, REGISTER],
      },
    }),
});

export const persistor = persistStore(store);
```

### Auth Slice

```typescript
// File: Clients/src/application/redux/auth/authSlice.ts

interface AuthState {
  authToken: string;
  userExists: boolean;
  user: string;
  expirationDate: Date | null;
  onboardingStatus: string;
  isOrgCreator: boolean;
}

const authSlice = createSlice({
  name: "auth",
  initialState: {
    authToken: "",
    userExists: true,
    user: "",
    expirationDate: null,
    onboardingStatus: "completed",
    isOrgCreator: false,
  },
  reducers: {
    setAuthState: (state, action) => {
      state.authToken = action.payload.authToken;
      state.user = action.payload.user;
      state.expirationDate = action.payload.expirationDate;
      state.onboardingStatus = action.payload.onboardingStatus;
      state.isOrgCreator = action.payload.isOrgCreator;
    },
    clearAuthState: (state) => {
      state.authToken = "";
      state.userExists = true;
      state.user = "";
      state.expirationDate = null;
      state.onboardingStatus = "completed";
      state.isOrgCreator = false;
    },
    setAuthToken: (state, action) => {
      state.authToken = action.payload;
    },
  },
});
```

### React Query Configuration

```typescript
// File: Clients/src/application/config/queryClient.ts

import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 2000,                    // Data fresh for 2 seconds
      gcTime: 10 * 60 * 1000,             // Garbage collect after 10 minutes
      retry: 3,                           // Retry failed requests 3 times
      refetchOnWindowFocus: false,
      refetchOnMount: true,
      refetchOnReconnect: true,
    },
  },
});
```

### Context API

```typescript
// File: Clients/src/application/contexts/VerifyWise.context.ts

interface VerifyWiseContextType {
  // Dashboard
  dashboardValues: DashboardValues;
  setDashboardValues: Dispatch<SetStateAction<DashboardValues>>;

  // Projects
  currentProject: Project | null;
  setCurrentProject: Dispatch<SetStateAction<Project | null>>;
  projects: Project[];
  setProjects: Dispatch<SetStateAction<Project[]>>;

  // Users
  token: string;
  userId: number;
  users: User[];

  // UI
  componentVisible: ComponentVisible;
  setComponentVisible: Dispatch<SetStateAction<ComponentVisible>>;
}

export const VerifyWiseContext = createContext<VerifyWiseContextType>(
  {} as VerifyWiseContextType
);
```

## API Layer

### Axios Configuration

```typescript
// File: Clients/src/infrastructure/api/customAxios.ts

import axios from "axios";
import { store } from "../../application/redux/store";
import { clearAuthState, setAuthToken } from "../../application/redux/auth/authSlice";

const api = axios.create({
  baseURL: `${ENV_VARs.URL}/api`,
  timeout: 120000,  // 2 minutes
});

// Request interceptor - add auth token
api.interceptors.request.use((config) => {
  const token = store.getState().auth.authToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor - handle token refresh
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Token expired (406)
    if (error.response?.status === 406 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        // Refresh token
        const response = await api.post("/users/refresh-token");
        const newToken = response.data.accessToken;

        // Update store
        store.dispatch(setAuthToken(newToken));

        // Retry original request
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        // Logout on failed refresh
        store.dispatch(clearAuthState());
        window.location.href = "/login";
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

export default api;
```

### Network Services

```typescript
// File: Clients/src/infrastructure/api/networkServices.ts

import api from "./customAxios";

export const networkService = {
  get: async <T>(url: string, config?: AxiosRequestConfig): Promise<T> => {
    const response = await api.get<T>(url, config);
    return response.data;
  },

  post: async <T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> => {
    const response = await api.post<T>(url, data, config);
    return response.data;
  },

  patch: async <T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> => {
    const response = await api.patch<T>(url, data, config);
    return response.data;
  },

  delete: async <T>(url: string, config?: AxiosRequestConfig): Promise<T> => {
    const response = await api.delete<T>(url, config);
    return response.data;
  },
};
```

### Repository Pattern

```typescript
// File: Clients/src/application/repository/user.repository.ts

import { networkService } from "../../infrastructure/api/networkServices";
import { User } from "../../domain/types/User";

export const userRepository = {
  getAllUsers: async (): Promise<User[]> => {
    return networkService.get<User[]>("/users");
  },

  getUserById: async (id: number): Promise<User> => {
    return networkService.get<User>(`/users/${id}`);
  },

  updateUser: async (id: number, data: Partial<User>): Promise<User> => {
    return networkService.patch<User>(`/users/${id}`, data);
  },

  deleteUser: async (id: number): Promise<void> => {
    return networkService.delete<void>(`/users/${id}`);
  },
};
```

## Custom Hooks

### useAuth Hook

```typescript
// File: Clients/src/application/hooks/useAuth.ts

import { useSelector } from "react-redux";
import { jwtDecode } from "jwt-decode";

interface TokenPayload {
  id: number;
  email: string;
  roleName: string;
  organizationId: number;
  tenantId: string;
}

export const useAuth = () => {
  const authToken = useSelector((state: RootState) => state.auth.authToken);

  const tokenData = useMemo(() => {
    if (!authToken) return null;
    try {
      return jwtDecode<TokenPayload>(authToken);
    } catch {
      return null;
    }
  }, [authToken]);

  return {
    isAuthenticated: !!authToken,
    token: authToken,
    userId: tokenData?.id,
    email: tokenData?.email,
    roleName: tokenData?.roleName,
    organizationId: tokenData?.organizationId,
    tenantId: tokenData?.tenantId,
  };
};
```

### useUsers Hook

```typescript
// File: Clients/src/application/hooks/useUsers.tsx

import { useState, useEffect, useCallback } from "react";
import { userRepository } from "../repository/user.repository";
import { User } from "../../domain/types/User";

export const useUsers = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      const data = await userRepository.getAllUsers();
      setUsers(data);
      setError(null);
    } catch (err) {
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  return {
    users,
    loading,
    error,
    refreshUsers: fetchUsers,
  };
};
```

## Tech Stack

| Category | Technology | Version |
|----------|------------|---------|
| Framework | React | 18.3.1 |
| Language | TypeScript | 5.x |
| Build Tool | Vite | 7.3.0 |
| Routing | React Router | 7.11.0 |
| State (Client) | Redux Toolkit | 2.11.2 |
| State (Server) | React Query | 5.90.15 |
| UI Components | MUI | 7.3.6 |
| Styling | Emotion | 11.13.3 |
| HTTP Client | Axios | 1.13.2 |
| Forms | React Hook Form | - |
| Charts | Recharts, Plotly | - |
| Rich Text | Tiptap, Slate, Plate | - |
| File Upload | Uppy | 4.2.x |

## Development

### Starting Development Server

```bash
cd Clients
npm install
npm run dev
```

### Building for Production

```bash
npm run build
```

### Linting

```bash
npm run lint
```

## Key Files

| File | Purpose |
|------|---------|
| `src/main.tsx` | Application entry point |
| `src/App.tsx` | Root component |
| `src/application/config/routes.tsx` | Route definitions |
| `src/application/config/queryClient.ts` | React Query config |
| `src/application/redux/store.ts` | Redux store |
| `src/infrastructure/api/customAxios.ts` | Axios instance |
| `src/presentation/themes/light.ts` | MUI theme |

## Related Documentation

- [Components](./components.md)
- [Styling](./styling.md)
- [Architecture Overview](../architecture/overview.md)
