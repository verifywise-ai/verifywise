import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from "react";
import type { ComponentVisible } from "../../interfaces/ComponentVisible";

interface VisibilityContextValue {
  componentsVisible: ComponentVisible;
  changeComponentVisibility: (component: keyof ComponentVisible, value: boolean) => void;
}

export const VisibilityContext = createContext<VisibilityContextValue>({
  componentsVisible: { home: false, sidebar: false, projectFrameworks: false, compliance: false },
  changeComponentVisibility: () => {},
});

export const VisibilityProvider = ({ children }: { children: ReactNode }) => {
  const [componentsVisible, setComponentsVisible] = useState<ComponentVisible>({
    home: false,
    sidebar: false,
    projectFrameworks: false,
    compliance: false,
  });

  const changeComponentVisibility = useCallback(
    (component: keyof ComponentVisible, value: boolean) => {
      setComponentsVisible((prev) => ({
        ...prev,
        [component]: value,
      }));
    },
    [],
  );

  const value = useMemo(
    () => ({ componentsVisible, changeComponentVisibility }),
    [componentsVisible, changeComponentVisibility],
  );

  return <VisibilityContext.Provider value={value}>{children}</VisibilityContext.Provider>;
};

export const useVisibility = () => {
  const context = useContext(VisibilityContext);
  if (!context) {
    throw new Error("useVisibility must be used within a VisibilityProvider");
  }
  return context;
};
