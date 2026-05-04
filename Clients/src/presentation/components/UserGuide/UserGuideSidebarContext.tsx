import React, { createContext, useContext, useState, useCallback, useEffect } from "react";

const SIDEBAR_STATE_KEY = "verifywise-sidebar-open";

// Constants for sidebar dimensions
export const TAB_BAR_WIDTH = 40;
export const DEFAULT_CONTENT_WIDTH = 400;
// Additional gap beyond the sidebar width (content already has 24px padding)
export const MIN_GAP = 0;

interface UserGuideSidebarContextValue {
  isOpen: boolean;
  open: (path?: string) => void;
  close: () => void;
  toggle: () => void;
  currentPath: string | undefined;
  contentWidth: number;
  setContentWidth: (width: number) => void;
  /** Total width of the sidebar (TabBar + content when open, just TabBar when closed) */
  totalSidebarWidth: number;
  /** Required padding-right for main content to maintain minimum gap */
  requiredPaddingRight: number;
  /** Open sidebar to a specific tab */
  openTab: (tab: string) => void;
  /** Tab requested by external code — consumed and cleared by SidebarWrapper */
  requestedTab: string | undefined;
  clearRequestedTab: () => void;
}

const UserGuideSidebarContext = createContext<UserGuideSidebarContextValue | null>(null);

export const UserGuideSidebarProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isOpen, setIsOpen] = useState(() => {
    if (typeof window === "undefined") return false;
    const saved = localStorage.getItem(SIDEBAR_STATE_KEY);
    return saved === "true";
  });

  const [currentPath, setCurrentPath] = useState<string | undefined>();
  const [contentWidth, setContentWidth] = useState(DEFAULT_CONTENT_WIDTH);
  const [requestedTab, setRequestedTab] = useState<string | undefined>();

  // Calculate total sidebar width and required padding
  const totalSidebarWidth = isOpen ? TAB_BAR_WIDTH + contentWidth : TAB_BAR_WIDTH;
  const requiredPaddingRight = totalSidebarWidth + MIN_GAP;

  // Set CSS custom properties on document root for global access
  useEffect(() => {
    if (typeof document === "undefined") return;

    const root = document.documentElement;
    root.style.setProperty("--help-sidebar-width", `${totalSidebarWidth}px`);
    root.style.setProperty("--help-sidebar-padding", `${requiredPaddingRight}px`);
  }, [totalSidebarWidth, requiredPaddingRight]);

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
    if (path) {
      setRequestedTab("user-guide");
    }
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  const toggle = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  const openTab = useCallback((tab: string) => {
    setRequestedTab(tab);
    setIsOpen(true);
  }, []);

  const clearRequestedTab = useCallback(() => {
    setRequestedTab(undefined);
  }, []);

  return (
    <UserGuideSidebarContext.Provider
      value={{
        isOpen,
        open,
        close,
        toggle,
        currentPath,
        contentWidth,
        setContentWidth,
        totalSidebarWidth,
        requiredPaddingRight,
        openTab,
        requestedTab,
        clearRequestedTab,
      }}
    >
      {children}
    </UserGuideSidebarContext.Provider>
  );
};

export const useUserGuideSidebarContext = (): UserGuideSidebarContextValue => {
  const context = useContext(UserGuideSidebarContext);
  if (!context) {
    throw new Error("useUserGuideSidebarContext must be used within a UserGuideSidebarProvider");
  }
  return context;
};

export default UserGuideSidebarContext;
