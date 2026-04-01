# Frontend Patterns

This guide documents the React patterns, state management, and best practices used in the VerifyWise frontend (Clients).

## Project Structure

```
Clients/src/
├── application/                # Business logic layer
│   ├── hooks/                  # Custom React hooks
│   ├── repository/             # API client functions
│   ├── contexts/               # React contexts
│   ├── redux/                  # Redux store and slices
│   ├── config/                 # App configuration
│   └── utils/                  # Utility functions
├── domain/                     # Domain layer (no dependencies)
│   ├── types/                  # Type definitions
│   └── interfaces/             # Interface definitions
├── presentation/               # UI layer
│   ├── components/             # Reusable components
│   ├── pages/                  # Page components
│   ├── themes/                 # MUI theme configuration
│   └── contexts/               # Presentation contexts
├── infrastructure/             # External integrations
│   ├── api/                    # API service setup
│   └── exceptions/             # Error handling
└── App.tsx                     # Application root
```

## Component Pattern

### Folder Structure

Each component lives in its own folder with an `index.tsx` entry point:

```
components/
├── Button/
│   ├── index.tsx           # Main component
│   ├── styles.ts           # Styled components or sx styles
│   ├── types.ts            # Component types (optional)
│   └── Button.test.tsx     # Tests (optional)
├── Modal/
│   ├── index.tsx
│   └── styles.ts
└── Table/
    ├── index.tsx
    ├── TableHeader.tsx     # Sub-components
    ├── TableRow.tsx
    └── styles.ts
```

### Component Structure

```typescript
// components/TaskCard/index.tsx
import React, { useState, useCallback } from "react";
import { Box, Typography, Chip } from "@mui/material";
import type { ITask } from "../../domain/interfaces/i.task";
import { cardContainerStyle, titleStyle, chipStyle } from "./styles";

interface TaskCardProps {
  task: ITask;
  onEdit?: (task: ITask) => void;
  onDelete?: (id: number) => void;
  isEditable?: boolean;
}

const TaskCard: React.FC<TaskCardProps> = ({
  task,
  onEdit,
  onDelete,
  isEditable = false,
}) => {
  const [isHovered, setIsHovered] = useState(false);

  const handleEdit = useCallback(() => {
    onEdit?.(task);
  }, [onEdit, task]);

  const handleDelete = useCallback(() => {
    onDelete?.(task.id);
  }, [onDelete, task.id]);

  return (
    <Box
      sx={cardContainerStyle(isHovered)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <Typography sx={titleStyle}>{task.title}</Typography>
      <Chip label={task.status} sx={chipStyle(task.status)} size="small" />
      {isEditable && (
        <Box>
          <IconButton onClick={handleEdit}>
            <EditIcon />
          </IconButton>
          <IconButton onClick={handleDelete}>
            <DeleteIcon />
          </IconButton>
        </Box>
      )}
    </Box>
  );
};

export default TaskCard;
```

### Component Guidelines

1. **Use functional components** with `React.FC<Props>`
2. **Define props interface** above the component
3. **Use default exports** for main components
4. **Memoize callbacks** with `useCallback`
5. **Memoize computed values** with `useMemo`
6. **Keep components focused** - single responsibility

## Styling Patterns

### MUI sx Prop (Preferred)

```typescript
// styles.ts
import { SxProps, Theme } from "@mui/material";

export const cardContainerStyle = (isHovered: boolean): SxProps<Theme> => ({
  padding: 2,
  borderRadius: "4px",
  border: "1px solid #d0d5dd",
  backgroundColor: isHovered ? "#f9fafb" : "#ffffff",
  transition: "background-color 0.2s ease",
  cursor: "pointer",
});

export const titleStyle: SxProps<Theme> = {
  fontSize: "14px",
  fontWeight: 500,
  color: "#1c2130",
  marginBottom: 1,
};

export const chipStyle = (status: string): SxProps<Theme> => ({
  backgroundColor: status === "Completed" ? "#10B981" : "#F59E0B",
  color: "#ffffff",
  fontSize: "12px",
});
```

### Styled Components (Alternative)

```typescript
// styles.ts
import { styled } from "@mui/material/styles";
import { Box, Typography } from "@mui/material";

export const CardContainer = styled(Box, {
  shouldForwardProp: (prop) => prop !== "isHovered",
})<{ isHovered?: boolean }>(({ theme, isHovered }) => ({
  padding: theme.spacing(2),
  borderRadius: "4px",
  border: "1px solid #d0d5dd",
  backgroundColor: isHovered ? "#f9fafb" : "#ffffff",
  transition: "background-color 0.2s ease",
}));

export const Title = styled(Typography)({
  fontSize: "14px",
  fontWeight: 500,
  color: "#1c2130",
});
```

### Theme Integration

```typescript
// Use theme values
const style: SxProps<Theme> = {
  color: "primary.main",           // Theme color
  backgroundColor: "background.paper",
  padding: (theme) => theme.spacing(2),
  [theme.breakpoints.down("md")]: {
    padding: 1,
  },
};
```

## State Management

### Redux (Global State)

Use Redux for:
- Authentication state
- User preferences
- UI state (sidebar, theme)

```typescript
// redux/slices/authSlice.ts
import { createSlice, PayloadAction } from "@reduxjs/toolkit";

interface AuthState {
  isAuthenticated: boolean;
  user: IUser | null;
  token: string | null;
}

const initialState: AuthState = {
  isAuthenticated: false,
  user: null,
  token: null,
};

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    setCredentials: (state, action: PayloadAction<{ user: IUser; token: string }>) => {
      state.isAuthenticated = true;
      state.user = action.payload.user;
      state.token = action.payload.token;
    },
    logout: (state) => {
      state.isAuthenticated = false;
      state.user = null;
      state.token = null;
    },
  },
});

export const { setCredentials, logout } = authSlice.actions;
export default authSlice.reducer;
```

### React Query (Server State)

Use React Query for:
- API data fetching
- Caching
- Background updates
- Optimistic updates

```typescript
// hooks/useTasks.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getTasks, createTask, updateTask, deleteTask } from "../repository/task.repository";

// Query keys
export const taskKeys = {
  all: ["tasks"] as const,
  lists: () => [...taskKeys.all, "list"] as const,
  list: (filters: TaskFilters) => [...taskKeys.lists(), filters] as const,
  details: () => [...taskKeys.all, "detail"] as const,
  detail: (id: number) => [...taskKeys.details(), id] as const,
};

// Fetch tasks
export function useTasks(filters?: TaskFilters) {
  return useQuery({
    queryKey: taskKeys.list(filters || {}),
    queryFn: () => getTasks(filters),
    staleTime: 30 * 1000,  // 30 seconds
  });
}

// Fetch single task
export function useTask(id: number) {
  return useQuery({
    queryKey: taskKeys.detail(id),
    queryFn: () => getTaskById(id),
    enabled: !!id,
  });
}

// Create task mutation
export function useCreateTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createTask,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: taskKeys.lists() });
    },
  });
}

// Update task mutation with optimistic update
export function useUpdateTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<ITask> }) =>
      updateTask(id, data),
    onMutate: async ({ id, data }) => {
      await queryClient.cancelQueries({ queryKey: taskKeys.detail(id) });

      const previousTask = queryClient.getQueryData(taskKeys.detail(id));

      queryClient.setQueryData(taskKeys.detail(id), (old: ITask) => ({
        ...old,
        ...data,
      }));

      return { previousTask };
    },
    onError: (err, variables, context) => {
      if (context?.previousTask) {
        queryClient.setQueryData(
          taskKeys.detail(variables.id),
          context.previousTask
        );
      }
    },
    onSettled: (data, error, { id }) => {
      queryClient.invalidateQueries({ queryKey: taskKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: taskKeys.lists() });
    },
  });
}
```

### React Context (Feature State)

Use Context for:
- Feature-specific state (modals, wizards)
- Theme context
- User preferences within a feature

```typescript
// contexts/TaskWizard.context.tsx
import React, { createContext, useContext, useState, useCallback } from "react";

interface TaskWizardState {
  currentStep: number;
  taskData: Partial<ITask>;
  isOpen: boolean;
}

interface TaskWizardContextValue extends TaskWizardState {
  openWizard: () => void;
  closeWizard: () => void;
  nextStep: () => void;
  prevStep: () => void;
  setTaskData: (data: Partial<ITask>) => void;
  reset: () => void;
}

const TaskWizardContext = createContext<TaskWizardContextValue | undefined>(undefined);

export const TaskWizardProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [state, setState] = useState<TaskWizardState>({
    currentStep: 0,
    taskData: {},
    isOpen: false,
  });

  const openWizard = useCallback(() => {
    setState((prev) => ({ ...prev, isOpen: true }));
  }, []);

  const closeWizard = useCallback(() => {
    setState((prev) => ({ ...prev, isOpen: false }));
  }, []);

  const nextStep = useCallback(() => {
    setState((prev) => ({ ...prev, currentStep: prev.currentStep + 1 }));
  }, []);

  const prevStep = useCallback(() => {
    setState((prev) => ({ ...prev, currentStep: Math.max(0, prev.currentStep - 1) }));
  }, []);

  const setTaskData = useCallback((data: Partial<ITask>) => {
    setState((prev) => ({ ...prev, taskData: { ...prev.taskData, ...data } }));
  }, []);

  const reset = useCallback(() => {
    setState({ currentStep: 0, taskData: {}, isOpen: false });
  }, []);

  return (
    <TaskWizardContext.Provider
      value={{
        ...state,
        openWizard,
        closeWizard,
        nextStep,
        prevStep,
        setTaskData,
        reset,
      }}
    >
      {children}
    </TaskWizardContext.Provider>
  );
};

export function useTaskWizard() {
  const context = useContext(TaskWizardContext);
  if (!context) {
    throw new Error("useTaskWizard must be used within TaskWizardProvider");
  }
  return context;
}
```

## Custom Hooks Pattern

### Data Fetching Hook

```typescript
// hooks/useAuth.ts
import { useSelector, useDispatch } from "react-redux";
import { useCallback } from "react";
import { RootState } from "../redux/store";
import { setCredentials, logout } from "../redux/slices/authSlice";
import { loginAPI, refreshTokenAPI } from "../repository/auth.repository";

export function useAuth() {
  const dispatch = useDispatch();
  const { isAuthenticated, user, token } = useSelector(
    (state: RootState) => state.auth
  );

  const login = useCallback(
    async (email: string, password: string) => {
      const response = await loginAPI({ email, password });
      dispatch(setCredentials({ user: response.user, token: response.token }));
    },
    [dispatch]
  );

  const signOut = useCallback(() => {
    dispatch(logout());
  }, [dispatch]);

  const refreshToken = useCallback(async () => {
    const response = await refreshTokenAPI();
    dispatch(setCredentials({ user: response.user, token: response.token }));
  }, [dispatch]);

  return {
    isAuthenticated,
    user,
    token,
    login,
    logout: signOut,
    refreshToken,
  };
}
```

### UI State Hook

```typescript
// hooks/useModal.ts
import { useState, useCallback } from "react";

interface UseModalReturn<T = undefined> {
  isOpen: boolean;
  data: T | undefined;
  open: (data?: T) => void;
  close: () => void;
  toggle: () => void;
}

export function useModal<T = undefined>(
  initialOpen = false
): UseModalReturn<T> {
  const [isOpen, setIsOpen] = useState(initialOpen);
  const [data, setData] = useState<T | undefined>(undefined);

  const open = useCallback((modalData?: T) => {
    setData(modalData);
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    // Clear data after animation
    setTimeout(() => setData(undefined), 300);
  }, []);

  const toggle = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  return { isOpen, data, open, close, toggle };
}

// Usage
const { isOpen, data, open, close } = useModal<ITask>();
```

### Debounced Value Hook

```typescript
// hooks/useDebounce.ts
import { useState, useEffect } from "react";

export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]);

  return debouncedValue;
}

// Usage
const [searchQuery, setSearchQuery] = useState("");
const debouncedQuery = useDebounce(searchQuery, 300);

useEffect(() => {
  if (debouncedQuery) {
    fetchSearchResults(debouncedQuery);
  }
}, [debouncedQuery]);
```

## Repository Pattern

API calls are centralized in repository files.

```typescript
// repository/task.repository.ts
import { apiServices } from "../../infrastructure/api/apiServices";
import type { ITask, ITaskFilters } from "../../domain/interfaces/i.task";

const BASE_URL = "/tasks";

export async function getTasks(filters?: ITaskFilters): Promise<ITask[]> {
  const params = new URLSearchParams();

  if (filters?.status) params.append("status", filters.status);
  if (filters?.priority) params.append("priority", filters.priority);
  if (filters?.page) params.append("page", String(filters.page));

  const response = await apiServices.get(`${BASE_URL}?${params.toString()}`);
  return response.data.data;
}

export async function getTaskById(id: number): Promise<ITask> {
  const response = await apiServices.get(`${BASE_URL}/${id}`);
  return response.data.data;
}

export async function createTask(data: Partial<ITask>): Promise<ITask> {
  const response = await apiServices.post(BASE_URL, data);
  return response.data.data;
}

export async function updateTask(
  id: number,
  data: Partial<ITask>
): Promise<ITask> {
  const response = await apiServices.put(`${BASE_URL}/${id}`, data);
  return response.data.data;
}

export async function deleteTask(id: number): Promise<void> {
  await apiServices.delete(`${BASE_URL}/${id}`);
}
```

## Error Boundary Pattern

Wrap feature sections with error boundaries.

```typescript
// components/ErrorBoundary/index.tsx
import React, { Component, ReactNode } from "react";
import { Box, Typography, Button } from "@mui/material";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Error caught by boundary:", error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    this.props.onReset?.();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <Box sx={{ padding: 4, textAlign: "center" }}>
          <Typography variant="h6" color="error">
            Something went wrong
          </Typography>
          <Typography variant="body2" sx={{ mt: 1, mb: 2 }}>
            {this.state.error?.message}
          </Typography>
          <Button variant="contained" onClick={this.handleReset}>
            Try Again
          </Button>
        </Box>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;

// Usage
<ErrorBoundary onReset={() => refetch()}>
  <TaskList />
</ErrorBoundary>
```

## Modal Pattern

Standard modal implementation with ref-based submit.

```typescript
// components/StandardModal/index.tsx
import React, { forwardRef, useImperativeHandle, useRef } from "react";
import { Dialog, DialogTitle, DialogContent, DialogActions, Button } from "@mui/material";

interface StandardModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  onSubmit?: () => void | Promise<void>;
  submitLabel?: string;
  cancelLabel?: string;
  isSubmitting?: boolean;
}

export interface StandardModalRef {
  submit: () => void;
}

const StandardModal = forwardRef<StandardModalRef, StandardModalProps>(
  (
    {
      open,
      onClose,
      title,
      children,
      onSubmit,
      submitLabel = "Save",
      cancelLabel = "Cancel",
      isSubmitting = false,
    },
    ref
  ) => {
    const submitRef = useRef<(() => void) | null>(null);

    useImperativeHandle(ref, () => ({
      submit: () => {
        submitRef.current?.();
      },
    }));

    const handleSubmit = async () => {
      await onSubmit?.();
    };

    return (
      <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
        <DialogTitle>{title}</DialogTitle>
        <DialogContent>{children}</DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={isSubmitting}>
            {cancelLabel}
          </Button>
          <Button
            variant="contained"
            onClick={handleSubmit}
            disabled={isSubmitting}
          >
            {isSubmitting ? "Saving..." : submitLabel}
          </Button>
        </DialogActions>
      </Dialog>
    );
  }
);

export default StandardModal;

// Hook for modal state
export function useStandardModal() {
  const [open, setOpen] = useState(false);
  const modalRef = useRef<StandardModalRef>(null);

  const handleOpen = () => setOpen(true);
  const handleClose = () => setOpen(false);

  return {
    open,
    modalRef,
    handleOpen,
    handleClose,
  };
}
```

## Form Pattern

Using controlled components with validation.

```typescript
// components/TaskForm/index.tsx
import React, { useState, useCallback } from "react";
import { TextField, Select, MenuItem, FormControl, FormHelperText } from "@mui/material";

interface TaskFormProps {
  initialData?: Partial<ITask>;
  onSubmit: (data: ITask) => void;
  onCancel: () => void;
}

interface FormErrors {
  title?: string;
  description?: string;
  dueDate?: string;
}

const TaskForm: React.FC<TaskFormProps> = ({
  initialData,
  onSubmit,
  onCancel,
}) => {
  const [formData, setFormData] = useState<Partial<ITask>>({
    title: "",
    description: "",
    priority: "Medium",
    status: "Open",
    ...initialData,
  });

  const [errors, setErrors] = useState<FormErrors>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const validate = useCallback((data: Partial<ITask>): FormErrors => {
    const newErrors: FormErrors = {};

    if (!data.title?.trim()) {
      newErrors.title = "Title is required";
    } else if (data.title.length > 255) {
      newErrors.title = "Title must be 255 characters or less";
    }

    if (data.description && data.description.length > 5000) {
      newErrors.description = "Description must be 5000 characters or less";
    }

    return newErrors;
  }, []);

  const handleChange = useCallback(
    (field: keyof ITask) =>
      (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const value = e.target.value;
        setFormData((prev) => ({ ...prev, [field]: value }));

        // Validate on change if field was touched
        if (touched[field]) {
          const newErrors = validate({ ...formData, [field]: value });
          setErrors((prev) => ({ ...prev, [field]: newErrors[field as keyof FormErrors] }));
        }
      },
    [formData, touched, validate]
  );

  const handleBlur = useCallback(
    (field: keyof ITask) => () => {
      setTouched((prev) => ({ ...prev, [field]: true }));
      const newErrors = validate(formData);
      setErrors((prev) => ({ ...prev, [field]: newErrors[field as keyof FormErrors] }));
    },
    [formData, validate]
  );

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();

      const validationErrors = validate(formData);
      setErrors(validationErrors);

      if (Object.keys(validationErrors).length === 0) {
        onSubmit(formData as ITask);
      }
    },
    [formData, validate, onSubmit]
  );

  return (
    <form onSubmit={handleSubmit}>
      <TextField
        label="Title"
        value={formData.title || ""}
        onChange={handleChange("title")}
        onBlur={handleBlur("title")}
        error={!!errors.title}
        helperText={errors.title}
        fullWidth
        required
        sx={{ mb: 2 }}
      />

      <TextField
        label="Description"
        value={formData.description || ""}
        onChange={handleChange("description")}
        onBlur={handleBlur("description")}
        error={!!errors.description}
        helperText={errors.description}
        multiline
        rows={4}
        fullWidth
        sx={{ mb: 2 }}
      />

      <FormControl fullWidth sx={{ mb: 2 }}>
        <Select
          value={formData.priority || "Medium"}
          onChange={(e) =>
            setFormData((prev) => ({ ...prev, priority: e.target.value }))
          }
        >
          <MenuItem value="Low">Low</MenuItem>
          <MenuItem value="Medium">Medium</MenuItem>
          <MenuItem value="High">High</MenuItem>
        </Select>
      </FormControl>
    </form>
  );
};

export default TaskForm;
```

## Loading States

### Skeleton Loading

```typescript
import { Skeleton, Box } from "@mui/material";

const TaskCardSkeleton: React.FC = () => (
  <Box sx={{ p: 2, border: "1px solid #d0d5dd", borderRadius: "4px" }}>
    <Skeleton variant="text" width="60%" height={24} />
    <Skeleton variant="text" width="40%" height={20} sx={{ mt: 1 }} />
    <Skeleton variant="rectangular" width={80} height={24} sx={{ mt: 2 }} />
  </Box>
);

// Usage
{isLoading ? (
  <TaskCardSkeleton />
) : (
  <TaskCard task={task} />
)}
```

### Loading Spinner

```typescript
import { CircularProgress, Box } from "@mui/material";

const LoadingSpinner: React.FC<{ fullPage?: boolean }> = ({ fullPage }) => (
  <Box
    sx={{
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      height: fullPage ? "100vh" : "200px",
    }}
  >
    <CircularProgress color="primary" />
  </Box>
);
```

## Performance Optimization

### Memoization

```typescript
// Memoize expensive computations
const sortedTasks = useMemo(() => {
  return [...tasks].sort((a, b) => {
    if (sortBy === "dueDate") {
      return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
    }
    return a.title.localeCompare(b.title);
  });
}, [tasks, sortBy]);

// Memoize callbacks
const handleTaskClick = useCallback((taskId: number) => {
  navigate(`/tasks/${taskId}`);
}, [navigate]);

// Memoize components
const MemoizedTaskCard = React.memo(TaskCard);
```

### Lazy Loading

```typescript
// Lazy load pages
const TasksPage = React.lazy(() => import("./pages/Tasks"));
const SettingsPage = React.lazy(() => import("./pages/Settings"));

// Usage with Suspense
<Suspense fallback={<LoadingSpinner fullPage />}>
  <Routes>
    <Route path="/tasks" element={<TasksPage />} />
    <Route path="/settings" element={<SettingsPage />} />
  </Routes>
</Suspense>
```

## Adding a New Frontend Route

File: `Clients/src/application/config/routes.tsx`

```tsx
import MyNewPage from "../../presentation/pages/MyNewPage";

export const createRoutes = (triggerSidebar: boolean, _triggerSidebarReload: () => void) => [
  <Route
    key="dashboard"
    path="/"
    element={<ProtectedRoute Component={Dashboard} reloadTrigger={triggerSidebar} />}
  >
    {/* Add your new route inside dashboard */}
    <Route path="/my-new-page" element={<MyNewPage />} />
  </Route>,
];
```

## Related Documentation

- [Code Style](./code-style.md) - Naming and TypeScript conventions
- [Design Tokens](./design-tokens.md) - Colors, spacing, typography
- [Components](../frontend/components.md) - Shared component library
- [Styling](../frontend/styling.md) - Theme and design system
