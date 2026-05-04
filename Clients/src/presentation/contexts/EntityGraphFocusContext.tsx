/**
 * EntityGraphFocusContext - Context for passing focus entity to Entity Graph
 *
 * Used by EntityGraphModal to tell the Entity Graph which entity to center on.
 */

import React, { createContext, useContext, useState, useCallback, useMemo, ReactNode } from "react";

interface FocusEntity {
  id: string;
  type: string;
  label?: string;
}

interface EntityGraphFocusContextType {
  focusEntity: FocusEntity | null;
  setFocusEntity: (entity: FocusEntity | null) => void;
  clearFocus: () => void;
}

const EntityGraphFocusContext = createContext<EntityGraphFocusContextType | undefined>(undefined);

export const EntityGraphFocusProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [focusEntity, setFocusEntity] = useState<FocusEntity | null>(null);

  const clearFocus = useCallback(() => setFocusEntity(null), []);

  // Memoize context value to prevent unnecessary re-renders
  const contextValue = useMemo(
    () => ({ focusEntity, setFocusEntity, clearFocus }),
    [focusEntity, clearFocus],
  );

  return (
    <EntityGraphFocusContext.Provider value={contextValue}>
      {children}
    </EntityGraphFocusContext.Provider>
  );
};

export const useEntityGraphFocus = (): EntityGraphFocusContextType => {
  const context = useContext(EntityGraphFocusContext);
  if (!context) {
    // Return a default implementation when not wrapped in provider
    return {
      focusEntity: null,
      setFocusEntity: () => {},
      clearFocus: () => {},
    };
  }
  return context;
};

export default EntityGraphFocusContext;
