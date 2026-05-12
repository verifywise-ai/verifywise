import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";

export interface SmartPromptConfig {
  id: string;
  type: string;
  title: string;
  message: string;
  primaryAction?: {
    label: string;
    onClick: () => void;
  };
  secondaryAction?: {
    label: string;
    onClick: () => void;
  };
  dontAskAgainKey?: string;
  onDontAskAgain?: (key: string) => void;
  autoDismissMs?: number;
}

interface SmartPromptContextValue {
  showPrompt: (config: Omit<SmartPromptConfig, "id">) => void;
  dismissPrompt: (id: string) => void;
  activePrompt: SmartPromptConfig | null;
  hasDontAskAgain: (key: string) => boolean;
  setDontAskAgain: (key: string, value: boolean) => void;
}

const SmartPromptContext = createContext<SmartPromptContextValue | null>(null);

const DONT_ASK_AGAIN_PREFIX = "vw_smart_prompt_dont_ask_";

export const SmartPromptProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [queue, setQueue] = useState<SmartPromptConfig[]>([]);
  const [activePrompt, setActivePrompt] = useState<SmartPromptConfig | null>(null);
  const idCounter = useRef(0);

  const hasDontAskAgain = useCallback((key: string) => {
    try {
      return localStorage.getItem(`${DONT_ASK_AGAIN_PREFIX}${key}`) === "true";
    } catch {
      return false;
    }
  }, []);

  const setDontAskAgain = useCallback((key: string, value: boolean) => {
    try {
      if (value) {
        localStorage.setItem(`${DONT_ASK_AGAIN_PREFIX}${key}`, "true");
      } else {
        localStorage.removeItem(`${DONT_ASK_AGAIN_PREFIX}${key}`);
      }
    } catch {
      // ignore localStorage errors
    }
  }, []);

  const showPrompt = useCallback(
    (config: Omit<SmartPromptConfig, "id">) => {
      if (config.dontAskAgainKey && hasDontAskAgain(config.dontAskAgainKey)) {
        return;
      }

      const newPrompt: SmartPromptConfig = {
        ...config,
        id: `prompt-${Date.now()}-${++idCounter.current}`,
      };

      setQueue((prev) => {
        // dedupe by type
        if (prev.some((p) => p.type === newPrompt.type)) {
          return prev;
        }
        return [...prev, newPrompt];
      });
    },
    [hasDontAskAgain],
  );

  const dismissPrompt = useCallback((id: string) => {
    setQueue((prev) => prev.filter((p) => p.id !== id));
    setActivePrompt((prev) => (prev?.id === id ? null : prev));
  }, []);

  // Promote next prompt from queue when active is cleared
  useEffect(() => {
    if (!activePrompt && queue.length > 0) {
      const next = queue[0];
      setActivePrompt(next);
      setQueue((prev) => prev.slice(1));
    }
  }, [activePrompt, queue]);

  const value: SmartPromptContextValue = {
    showPrompt,
    dismissPrompt,
    activePrompt,
    hasDontAskAgain,
    setDontAskAgain,
  };

  return <SmartPromptContext.Provider value={value}>{children}</SmartPromptContext.Provider>;
};

export const useSmartPromptContext = () => {
  const ctx = useContext(SmartPromptContext);
  if (!ctx) {
    throw new Error("useSmartPromptContext must be used within SmartPromptProvider");
  }
  return ctx;
};
