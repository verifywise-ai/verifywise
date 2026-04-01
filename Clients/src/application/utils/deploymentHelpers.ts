import React from "react";
import { ENV_VARs } from "../../../env.vars";

const POLL_INTERVAL = 60 * 1000; // 60 seconds

let updateAvailable = false;
let onUpdateCallbacks: Array<() => void> = [];
let intervalId: ReturnType<typeof setInterval> | null = null;
let visibilityHandler: (() => void) | null = null;

async function checkVersion(): Promise<void> {
  if (updateAvailable) return; // already detected, stop checking

  try {
    const res = await fetch(`${ENV_VARs.URL}/api/version`, {
      cache: "no-cache",
    });
    if (!res.ok) return;

    const { version } = await res.json();
    if (version && version !== __APP_VERSION__) {
      updateAvailable = true;
      onUpdateCallbacks.forEach((cb) => cb());
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    }
  } catch {
    // Network error — silently ignore, will retry next interval
  }
}

export class DeploymentManager {
  static onUpdate(callback: () => void): () => void {
    onUpdateCallbacks.push(callback);
    // If update was already detected before this listener registered, fire immediately
    if (updateAvailable) callback();
    return () => {
      onUpdateCallbacks = onUpdateCallbacks.filter((cb) => cb !== callback);
    };
  }

  /** Reset module state — only for use in tests */
  static _resetForTesting(): void {
    DeploymentManager.stopPolling();
    updateAvailable = false;
    onUpdateCallbacks = [];
  }

  static startPolling(): void {
    if (intervalId) return;
    checkVersion();
    intervalId = setInterval(checkVersion, POLL_INTERVAL);

    // Only add one listener; track it so stopPolling can remove it
    if (!visibilityHandler) {
      visibilityHandler = () => {
        if (!document.hidden) checkVersion();
      };
      document.addEventListener("visibilitychange", visibilityHandler);
    }
  }

  static stopPolling(): void {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
    if (visibilityHandler) {
      document.removeEventListener("visibilitychange", visibilityHandler);
      visibilityHandler = null;
    }
  }
}

/**
 * Wraps a dynamic import so that a ChunkLoadError (stale deployment) triggers
 * a single page reload instead of crashing the app.
 *
 * After a new deployment the old hashed JS chunks are removed from the server.
 * If a user still has the old app loaded and navigates to a lazy-loaded route,
 * the import fails. This wrapper catches that failure, marks sessionStorage so
 * we don't reload in a loop, and reloads the page to fetch the new entry point.
 */
const CHUNK_RELOAD_KEY = "chunk_reload_attempted";

export function lazyWithRetry<T extends React.ComponentType<any>>(
  importFn: () => Promise<{ default: T }>
): React.LazyExoticComponent<T> {
  return React.lazy(() =>
    importFn().catch((error: Error) => {
      const isChunkError =
        error.name === "ChunkLoadError" ||
        error.message?.includes("Failed to fetch dynamically imported module") ||
        error.message?.includes("Loading chunk") ||
        error.message?.includes("Importing a module script failed");

      if (isChunkError && !sessionStorage.getItem(CHUNK_RELOAD_KEY)) {
        sessionStorage.setItem(CHUNK_RELOAD_KEY, "1");
        window.location.reload();
        // Return a never-resolving promise so React doesn't try to render
        // the failed import while the page is reloading
        return new Promise<never>(() => {});
      }

      // Either not a chunk error or we already tried reloading — re-throw
      throw error;
    })
  );
}

/**
 * Clear the chunk reload flag on successful app startup.
 * Call this once in App.tsx so a future chunk error can trigger a reload again.
 */
export function clearChunkReloadFlag(): void {
  sessionStorage.removeItem(CHUNK_RELOAD_KEY);
}

/**
 * Session recovery utilities
 */
export class SessionManager {
  static async recoverAuthenticationState(): Promise<boolean> {
    try {
      const persistedState = localStorage.getItem("persist:root");
      if (!persistedState) return false;

      const state = JSON.parse(persistedState);
      const authState = state.auth ? JSON.parse(state.auth) : null;

      if (authState?.authToken) {
        const response = await fetch("/api/users/me", {
          headers: {
            Authorization: `Bearer ${authState.authToken}`,
            "Content-Type": "application/json",
          },
        });

        if (!response.ok) {
          this.clearAuthState();
          return false;
        }

        return true;
      }

      return false;
    } catch (error) {
      console.error("Error recovering authentication state:", error);
      return false;
    }
  }

  static clearAuthState(): void {
    try {
      const persistedState = localStorage.getItem("persist:root");
      if (persistedState) {
        const state = JSON.parse(persistedState);
        if (state.auth) {
          const authState = JSON.parse(state.auth);
          authState.authToken = "";
          authState.user = "";
          state.auth = JSON.stringify(authState);
          localStorage.setItem("persist:root", JSON.stringify(state));
        }
      }
    } catch (error) {
      console.error("Error clearing auth state:", error);
    }
  }
}
