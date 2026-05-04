import { useEffect, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { AppModule, setActiveModule } from "../redux/ui/uiSlice";
import { RootState } from "../redux/store";

const STORAGE_KEY = "verifywise_active_module";

/**
 * Hook for managing active module state
 * - Auto-detects module from URL path
 * - Persists to localStorage
 * - Syncs with Redux state
 */
export function useActiveModule() {
  const location = useLocation();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const activeModule = useSelector((state: RootState) => state.ui.appModule?.active ?? "main");

  // Detect module from URL path
  const getModuleFromPath = useCallback((pathname: string): AppModule => {
    if (pathname.startsWith("/evals")) {
      return "evals";
    }
    if (pathname.startsWith("/ai-detection")) {
      return "ai-detection";
    }
    if (pathname.startsWith("/shadow-ai")) {
      return "shadow-ai";
    }
    if (pathname.startsWith("/ai-gateway")) {
      return "ai-gateway";
    }
    if (pathname.startsWith("/super-admin")) {
      return "super-admin";
    }
    return "main";
  }, []);

  // Sync module state with URL on navigation
  useEffect(() => {
    const detectedModule = getModuleFromPath(location.pathname);
    if (detectedModule !== activeModule) {
      dispatch(setActiveModule(detectedModule));
      localStorage.setItem(STORAGE_KEY, detectedModule);
    }
  }, [location.pathname, activeModule, dispatch, getModuleFromPath]);

  // Handle module change from AppSwitcher click
  const handleModuleChange = useCallback(
    (module: AppModule) => {
      if (module === activeModule) return;

      dispatch(setActiveModule(module));
      localStorage.setItem(STORAGE_KEY, module);

      // Navigate to default route for the module
      switch (module) {
        case "evals":
          navigate("/evals");
          break;
        case "ai-detection":
          navigate("/ai-detection/scan");
          break;
        case "shadow-ai":
          navigate("/shadow-ai/insights");
          break;
        case "ai-gateway":
          navigate("/ai-gateway/dashboard");
          break;
        case "super-admin":
          navigate("/super-admin");
          break;
        case "main":
        default:
          navigate("/");
          break;
      }
    },
    [activeModule, dispatch, navigate],
  );

  // Initialize from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as AppModule | null;
    if (
      stored &&
      ["main", "evals", "ai-detection", "shadow-ai", "ai-gateway", "super-admin"].includes(stored)
    ) {
      // Only set if URL doesn't already indicate a different module
      const urlModule = getModuleFromPath(location.pathname);
      if (urlModule === "main" && stored !== "main") {
        // URL is at root but stored module is different - respect URL
        dispatch(setActiveModule(urlModule));
      }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    activeModule,
    setActiveModule: handleModuleChange,
  };
}
