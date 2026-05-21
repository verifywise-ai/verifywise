import { createContext, useContext, useState } from "react";
import type { ReactNode } from "react";

interface ConfigContextValue {
  dirtyConfigs: Set<string>;
  markDirty: (name: string) => void;
  markClean: (name: string) => void;
}

const ConfigContext = createContext<ConfigContextValue>({
  dirtyConfigs: new Set(),
  markDirty: () => {},
  markClean: () => {},
});

export function ConfigProvider({ children }: { children: ReactNode }) {
  const [dirtyConfigs, setDirtyConfigs] = useState<Set<string>>(new Set());

  const markDirty = (name: string) =>
    setDirtyConfigs((prev) => new Set([...prev, name]));

  const markClean = (name: string) =>
    setDirtyConfigs((prev) => {
      const next = new Set(prev);
      next.delete(name);
      return next;
    });

  return (
    <ConfigContext.Provider value={{ dirtyConfigs, markDirty, markClean }}>
      {children}
    </ConfigContext.Provider>
  );
}

export const useConfigContext = () => useContext(ConfigContext);
