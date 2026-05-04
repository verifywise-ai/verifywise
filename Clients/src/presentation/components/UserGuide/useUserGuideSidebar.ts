import { useState, useCallback, useEffect } from "react";

const SIDEBAR_STATE_KEY = "verifywise-sidebar-open";

interface UseUserGuideSidebarReturn {
  isOpen: boolean;
  open: (path?: string) => void;
  close: () => void;
  toggle: () => void;
  currentPath: string | undefined;
}

/**
 * Hook for managing User Guide sidebar state
 *
 * Features:
 * - Persists open/closed state to localStorage
 * - Supports deep linking to specific articles
 * - Handles body class for content push effect
 *
 * Usage:
 * ```tsx
 * const { isOpen, open, close, toggle, currentPath } = useUserGuideSidebar();
 *
 * // Open sidebar to specific article
 * open('getting-started/quick-start');
 *
 * // Toggle sidebar
 * <button onClick={toggle}>Help</button>
 *
 * // Render sidebar
 * <SidebarWrapper isOpen={isOpen} onClose={close} initialPath={currentPath} />
 * ```
 */
export function useUserGuideSidebar(): UseUserGuideSidebarReturn {
  const [isOpen, setIsOpen] = useState(() => {
    if (typeof window === "undefined") return false;
    const saved = localStorage.getItem(SIDEBAR_STATE_KEY);
    return saved === "true";
  });

  const [currentPath, setCurrentPath] = useState<string | undefined>();

  // Update body class for content push effect
  useEffect(() => {
    if (typeof document === "undefined") return;

    if (isOpen) {
      document.body.classList.add("sidebar-open");
    } else {
      document.body.classList.remove("sidebar-open");
    }

    return () => {
      document.body.classList.remove("sidebar-open");
    };
  }, [isOpen]);

  // Persist state to localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(SIDEBAR_STATE_KEY, String(isOpen));
  }, [isOpen]);

  const open = useCallback((path?: string) => {
    setCurrentPath(path);
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  const toggle = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  return {
    isOpen,
    open,
    close,
    toggle,
    currentPath,
  };
}

export default useUserGuideSidebar;
