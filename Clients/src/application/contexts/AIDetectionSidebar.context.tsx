/**
 * @fileoverview AI Detection Sidebar Context
 *
 * Provides state management for the AI Detection sidebar.
 * Follows the same pattern as EvalsSidebarContext.
 * Also handles global scan notifications.
 *
 * POLLING STRATEGY:
 * - Only polls when there's an active scan being tracked
 * - Stops polling completely when no active scan exists
 * - Uses exponential backoff when no scans found
 *
 * @module contexts/AIDetectionSidebar.context
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  ReactNode,
  FC,
} from "react";
import { getActiveScan, getScans, getScanStatus } from "../repository/aiDetection.repository";
import { getRepositoryCount } from "../repository/aiDetectionRepository.repository";
import { ScanStatus, ScansResponse } from "../../domain/ai-detection/types";

interface RecentScan {
  id: number;
  name: string; // repository_owner/repository_name
}

interface ScanNotification {
  id: number;
  repositoryName: string;
  status: "completed" | "failed" | "cancelled";
  message: string;
}

interface AIDetectionSidebarContextType {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  historyCount: number;
  setHistoryCount: (count: number) => void;
  repositoryCount: number;
  recentScans: RecentScan[];
  setRecentScans: (scans: RecentScan[]) => void;
  refreshRecentScans: () => void;
  refreshRepositoryCount: () => void;
  // Global notification state
  scanNotification: ScanNotification | null;
  clearScanNotification: () => void;
  // Method to start tracking a scan (called when user starts a scan)
  startTrackingScan: (scanId: number, name: string) => void;
}

const AIDetectionSidebarContext = createContext<AIDetectionSidebarContextType | null>(null);

const ACTIVE_STATUSES: ScanStatus[] = ["pending", "cloning", "scanning"];
const ACTIVE_SCAN_POLL_INTERVAL_MS = 2000; // Poll faster when tracking active scan

export const AIDetectionSidebarProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [activeTab, setActiveTab] = useState("scan");
  const [historyCount, setHistoryCount] = useState(0);
  const [repositoryCount, setRepositoryCount] = useState(0);
  const [recentScans, setRecentScans] = useState<RecentScan[]>([]);
  const [scanNotification, setScanNotification] = useState<ScanNotification | null>(null);

  // Track active scan for global notifications
  const [trackedScan, setTrackedScan] = useState<{ id: number; name: string } | null>(null);
  const pollingRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearScanNotification = useCallback(() => {
    setScanNotification(null);
  }, []);

  // Called when user starts a scan - enables polling for that scan
  const startTrackingScan = useCallback((scanId: number, name: string) => {
    setTrackedScan({ id: scanId, name });
  }, []);

  // Poll only when we have an active scan to track
  useEffect(() => {
    // Don't poll if no scan is being tracked
    if (!trackedScan) {
      return;
    }

    const checkScanStatus = async () => {
      try {
        const status = await getScanStatus(trackedScan.id);

        if (!ACTIVE_STATUSES.includes(status.status)) {
          // Scan finished - show notification
          let message = "";
          let notificationStatus: "completed" | "failed" | "cancelled" = "completed";

          switch (status.status) {
            case "completed":
              message = `Scan for ${trackedScan.name} completed successfully.`;
              notificationStatus = "completed";
              break;
            case "failed":
              message = `Scan for ${trackedScan.name} failed.`;
              notificationStatus = "failed";
              break;
            case "cancelled":
              message = `Scan for ${trackedScan.name} was cancelled.`;
              notificationStatus = "cancelled";
              break;
          }

          setScanNotification({
            id: trackedScan.id,
            repositoryName: trackedScan.name,
            status: notificationStatus,
            message,
          });

          // Stop tracking - scan is done
          setTrackedScan(null);
          return;
        }

        // Scan still active, continue polling
        pollingRef.current = setTimeout(checkScanStatus, ACTIVE_SCAN_POLL_INTERVAL_MS);
      } catch {
        // Scan might have been deleted, stop tracking
        setTrackedScan(null);
      }
    };

    // Start polling
    checkScanStatus();

    return () => {
      if (pollingRef.current) {
        clearTimeout(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [trackedScan]);

  // Load repository count for sidebar badge
  const refreshRepositoryCount = useCallback(async () => {
    try {
      const count = await getRepositoryCount();
      setRepositoryCount(count);
    } catch (error) {
      console.error("Failed to load repository count:", error);
    }
  }, []);

  // Load recent scans for sidebar on mount
  const refreshRecentScans = useCallback(async () => {
    try {
      const response: ScansResponse = await getScans({ page: 1, limit: 5 });
      setHistoryCount(response.pagination.total);
      setRecentScans(
        response.scans.map((s) => ({
          id: s.id,
          name: `${s.repository_owner}/${s.repository_name}`,
        })),
      );
    } catch (error) {
      console.error("Failed to load recent scans:", error);
    }
  }, []);

  useEffect(() => {
    refreshRecentScans();
    refreshRepositoryCount();
  }, [refreshRecentScans, refreshRepositoryCount]);

  // On mount, check once for any active scan (e.g., page refresh during scan)
  useEffect(() => {
    const checkForExistingActiveScan = async () => {
      try {
        const activeScan = await getActiveScan();
        if (activeScan) {
          // Resume tracking this scan
          setTrackedScan({
            id: activeScan.id,
            name: `${activeScan.repository_owner}/${activeScan.repository_name}`,
          });
        }
      } catch {
        // Ignore errors on initial check
      }
    };

    checkForExistingActiveScan();
  }, []);

  return (
    <AIDetectionSidebarContext.Provider
      value={{
        activeTab,
        setActiveTab,
        historyCount,
        setHistoryCount,
        repositoryCount,
        recentScans,
        setRecentScans,
        refreshRecentScans,
        refreshRepositoryCount,
        scanNotification,
        clearScanNotification,
        startTrackingScan,
      }}
    >
      {children}
    </AIDetectionSidebarContext.Provider>
  );
};

export const useAIDetectionSidebarContext = () => {
  const context = useContext(AIDetectionSidebarContext);
  if (!context) {
    throw new Error("useAIDetectionSidebarContext must be used within AIDetectionSidebarProvider");
  }
  return context;
};

// Safe version that returns null if not in provider
export const useAIDetectionSidebarContextSafe = () => {
  return useContext(AIDetectionSidebarContext);
};
