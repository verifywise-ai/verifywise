import { useEffect, useState } from "react";
import { checkOrganizationExists } from "../repository/organization.repository";

// Cache for organization exists check
let organizationCheckCache: {
  exists: boolean | null;
  timestamp: number;
} | null = null;

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Helper function to determine if multi-tenant mode should be enabled
const shouldEnableMultiTenant = (organizationExists: boolean | null): boolean => {
  return (
    !organizationExists ||
    window.location.hostname === "app.verifywise.ai" ||
    window.location.hostname === "test.verifywise.ai"
  );
};

export const useIsMultiTenant = () => {
  const [isMultiTenant, setIsMultiTenant] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchOrganizationCount = async () => {
      const now = Date.now();
      setLoading(true);
      setError(null);

      // Check cache first
      if (
        organizationCheckCache &&
        organizationCheckCache.exists !== null &&
        now - organizationCheckCache.timestamp < CACHE_DURATION
      ) {
        // Use cached value
        setIsMultiTenant(shouldEnableMultiTenant(organizationCheckCache.exists));
        setLoading(false);
        return;
      }

      try {
        const exists = await checkOrganizationExists();

        // Update cache
        organizationCheckCache = {
          exists,
          timestamp: now,
        };

        setIsMultiTenant(shouldEnableMultiTenant(exists));
      } catch (error) {
        console.error("Failed to check organization existence:", error);

        // Default to multi-tenant on error for safety
        // Pass null to shouldEnableMultiTenant to trigger safe fallback behavior
        setError("Failed to determine multi-tenant mode. Using safe default.");
        setIsMultiTenant(shouldEnableMultiTenant(null));
      } finally {
        setLoading(false);
      }
    };
    fetchOrganizationCount();
  }, []);

  return { isMultiTenant, loading, error };
};
