import { lazy, ComponentType } from "react";
import CircularProgress from "@mui/material/CircularProgress";
import Box from "@mui/material/Box";

export const LazyFallback = () => (
  <Box
    sx={{
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      height: "100%",
    }}
  >
    <CircularProgress size={32} />
  </Box>
);

/**
 * Wraps React.lazy() with retry logic for chunk load failures.
 * Retries up to 3 times with exponential backoff (1.5s, 3s, 6s).
 */
export function lazyRoute<T extends ComponentType<unknown>>(
  factory: () => Promise<{ default: T }>
) {
  return lazy(() => retryImport(factory));
}

function retryImport<T extends ComponentType<unknown>>(
  factory: () => Promise<{ default: T }>,
  retries = 3,
  delay = 1500
): Promise<{ default: T }> {
  return factory().catch((err) => {
    if (retries <= 0) throw err;
    return new Promise<{ default: T }>((resolve) =>
      setTimeout(
        () => resolve(retryImport(factory, retries - 1, delay * 2)),
        delay
      )
    );
  });
}
