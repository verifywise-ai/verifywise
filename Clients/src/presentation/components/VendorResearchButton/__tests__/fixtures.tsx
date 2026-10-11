/** Fixtures shared by the tests of the research button. */

import type { ReactNode } from "react";
import { useVendorResearchConfig } from "../../../../application/hooks/useVendorResearch";
import type { VendorResearchConfig } from "../../../../domain/interfaces/i.vendorResearch";

/** Settings that let research run. */
export const SET_UP: VendorResearchConfig = {
  searchConfigured: true,
  hasLlmKey: true,
  autoRunEnabled: true,
};

/**
 * Renders its children once the research settings are in the cache, the way a page looks that
 * has loaded them already. The button then starts out knowing the settings, instead of being
 * rebuilt inside its tooltip when they arrive.
 */
export function AfterSettings({ children }: { children: ReactNode }) {
  const settings = useVendorResearchConfig();
  return settings.data ? <>{children}</> : null;
}
