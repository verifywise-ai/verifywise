/**
 * Initializes browser Web Vitals reporting.
 *
 * Subscribes to LCP, CLS, INP, FCP, TTFB via the `web-vitals` package and
 * forwards each metric to the backend RUM endpoint. The backend exposes them
 * as Prometheus histograms (rum_web_vitals_seconds), labeled by metric name.
 */

import { reportRumVital } from "./rum";

export const initWebVitals = (): void => {
  if (typeof window === "undefined") return;

  void import("web-vitals")
    .then(({ onLCP, onCLS, onINP, onFCP, onTTFB }) => {
      const send = (metric: { name: string; value: number }) =>
        reportRumVital(metric.name, metric.value);

      onLCP(send);
      onCLS(send);
      onINP(send);
      onFCP(send);
      onTTFB(send);
    })
    .catch(() => {
      // web-vitals failed to load (offline, bundle issue) — skip silently.
    });
};
