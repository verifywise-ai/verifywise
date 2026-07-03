import {
  createContext,
  useContext,
  useState,
  useMemo,
  type ReactNode,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { UIValues } from "../../interfaces/appStates";

interface UIContextValue {
  uiValues: UIValues;
  setUiValues: Dispatch<SetStateAction<UIValues>>;
}

export const UIContext = createContext<UIContextValue>({
  uiValues: {},
  setUiValues: () => {},
});

export const UIProvider = ({ children }: { children: ReactNode }) => {
  const [uiValues, setUiValues] = useState<UIValues>({});

  const value = useMemo(() => ({ uiValues, setUiValues }), [uiValues, setUiValues]);

  return <UIContext.Provider value={value}>{children}</UIContext.Provider>;
};

export const useUI = () => {
  const context = useContext(UIContext);
  if (!context) {
    throw new Error("useUI must be used within a UIProvider");
  }
  return context;
};
