import { useEffect, useCallback } from "react";
import { useLocation, useNavigate } from "react-router";
import { useDispatch, useSelector } from "react-redux";
import { AppModule, setActiveModule } from "../redux/ui/uiSlice";
import { RootState } from "../redux/store";
import { storageService } from "../../infrastructure/storage";
import { getAppModuleFromPath, isGlobalPath } from "../utils/appModule";

const STORAGE_KEY = "verifywise_active_module";

const KNOWN_MODULES: AppModule[] = [
  "main",
  "evals",
  "ai-detection",
  "shadow-ai",
  "ai-gateway",
  "ai-trust-index",
  "super-admin",
];

/**
 * Hook for managing active module state
 * - Auto-detects module from URL path
 * - Keeps the current module on organization-wide pages (Settings, Event tracker)
 * - Persists to localStorage
 * - Syncs with Redux state
 */
export function useActiveModule() {
  const location = useLocation();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const activeModule = useSelector((state: RootState) => state.ui.appModule?.active ?? "main");

  // Detect module from URL path
  const getModuleFromPath = useCallback(
    (pathname: string): AppModule => getAppModuleFromPath(pathname),
    [],
  );

  // Sync module state with URL on navigation. Global pages belong to no module,
  // so the module the user came from (or, after a reload, the stored one) stays.
  // Super admin is the exception: these pages render in the organization layout.
  useEffect(() => {
    if (isGlobalPath(location.pathname)) {
      if (activeModule === "super-admin") dispatch(setActiveModule("main"));
      return;
    }
    const detectedModule = getModuleFromPath(location.pathname);
    if (detectedModule !== activeModule) {
      dispatch(setActiveModule(detectedModule));
      storageService.setRaw(STORAGE_KEY, detectedModule, { raw: true });
    }
  }, [location.pathname, activeModule, dispatch, getModuleFromPath]);

  // Handle module change from AppSwitcher click
  const handleModuleChange = useCallback(
    (module: AppModule) => {
      // On a global page the module's own pages are not showing, so clicking the
      // current module still navigates back to it.
      if (module === activeModule && !isGlobalPath(location.pathname)) return;

      dispatch(setActiveModule(module));
      storageService.setRaw(STORAGE_KEY, module, { raw: true });

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
        case "ai-trust-index":
          navigate("/ai-trust-index/browse");
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
    [activeModule, dispatch, navigate, location.pathname],
  );

  // Initialize from localStorage on mount
  useEffect(() => {
    const stored = storageService.getRaw<AppModule | null>(STORAGE_KEY, null, { raw: true });
    if (!stored || !KNOWN_MODULES.includes(stored)) return;

    // A reload on a global page restores the module the user was in. Only while the
    // module is still the initial default: a later remount must not pick up a value
    // another tab wrote. Super admin is excluded: these pages use the organization layout.
    if (isGlobalPath(location.pathname)) {
      if (activeModule === "main" && stored !== "super-admin" && stored !== "main") {
        dispatch(setActiveModule(stored));
      }
      return;
    }

    // Only set if URL doesn't already indicate a different module
    const urlModule = getModuleFromPath(location.pathname);
    if (urlModule === "main" && stored !== "main") {
      // URL is at root but stored module is different - respect URL
      dispatch(setActiveModule(urlModule));
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    activeModule,
    setActiveModule: handleModuleChange,
  };
}
