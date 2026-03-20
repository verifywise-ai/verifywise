/**
 * @fileoverview AI Detection Scan Page
 *
 * Page for initiating repository scans.
 * Features URL input, scan progress, and results summary.
 *
 * @module pages/AIDetection/ScanPage
 */

import { useState, useCallback, useRef, useEffect, Suspense } from "react";
import {
  Box,
  Typography,
  LinearProgress,
  CircularProgress,
  InputAdornment,
  Skeleton,
} from "@mui/material";
import {
  Search,
  Github,
  AlertCircle,
  CheckCircle2,
  XCircle,
  FileSearch,
  FolderGit2,
  Cpu,
  Library,
  Webhook,
  ShieldAlert,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import Field from "../../components/Inputs/Field";
import Alert from "../../components/Alert";
import { CustomizableButton } from "../../components/button/customizable-button";
import { PageHeaderExtended } from "../../components/Layout/PageHeaderExtended";
import { StatCard } from "../../components/Cards/StatCard";
import AIDetectionOnboarding from "../../components/Modals/AIDetectionOnboarding";
import {
  startScan,
  pollScanStatus,
  getScan,
  cancelScan,
  getActiveScan,
  getAIDetectionStats,
} from "../../../application/repository/aiDetection.repository";
import {
  ScanStatusResponse,
  ScanResponse,
  AIDetectionStats,
} from "../../../domain/ai-detection/types";
import { useAIDetectionSidebarContext } from "../../../application/contexts/AIDetectionSidebar.context";
import { palette } from "../../themes/palette";

type ScanState = "idle" | "scanning" | "completed" | "failed";

export default function ScanPage() {
  const navigate = useNavigate();
  const { refreshRecentScans } = useAIDetectionSidebarContext();
  const [showOnboarding, setShowOnboarding] = useState(true);
  const [repositoryUrl, setRepositoryUrl] = useState("");
  const [scanState, setScanState] = useState<ScanState>("idle");
  const [progress, setProgress] = useState<ScanStatusResponse | null>(null);
  const [result, setResult] = useState<ScanResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isCheckingActive, setIsCheckingActive] = useState(true);
  const [stats, setStats] = useState<AIDetectionStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const abortControllerRef = useRef<AbortController | null>(null);
  const currentScanIdRef = useRef<number | null>(null);

  // Toast alert state
  const [alert, setAlert] = useState<{ variant: "success" | "error"; body: string } | null>(null);
  const showAlert = (variant: "success" | "error", body: string) => {
    setAlert({ variant, body });
    setTimeout(() => setAlert(null), 3000);
  };

  // Fetch stats on mount
  useEffect(() => {
    const fetchStats = async () => {
      try {
        const data = await getAIDetectionStats();
        setStats(data);
      } catch (err) {
        console.error("Failed to load stats:", err);
      } finally {
        setStatsLoading(false);
      }
    };
    fetchStats();
  }, []);

  // Check for active scans on mount and resume polling if found
  useEffect(() => {
    const checkForActiveScan = async () => {
      try {
        const activeScan = await getActiveScan();
        if (activeScan) {
          // Set the repository URL from active scan
          setRepositoryUrl(
            `https://github.com/${activeScan.repository_owner}/${activeScan.repository_name}`
          );
          currentScanIdRef.current = activeScan.id;
          setScanState("scanning");

          // Create abort controller for polling
          abortControllerRef.current = new AbortController();

          // Resume polling
          const finalStatus = await pollScanStatus(
            activeScan.id,
            (status) => setProgress(status),
            1000,
            abortControllerRef.current.signal
          );

          if (finalStatus.status === "completed") {
            const scanResult = await getScan(
              activeScan.id,
              abortControllerRef.current.signal
            );
            setResult(scanResult);
            setScanState("completed");
            refreshRecentScans();
            showAlert("success", `Scan completed for ${activeScan.repository_owner}/${activeScan.repository_name}`);
          } else if (finalStatus.status === "failed") {
            setScanState("failed");
            setError(finalStatus.error_message || "Scan failed");
            showAlert("error", `Scan failed for ${activeScan.repository_owner}/${activeScan.repository_name}`);
          } else if (finalStatus.status === "cancelled") {
            setScanState("idle");
          }
        }
      } catch (err) {
        // Ignore errors from checking - user may have navigated away
        if (err instanceof Error && err.name !== "AbortError") {
          console.error("Error checking for active scan:", err);
        }
      } finally {
        setIsCheckingActive(false);
      }
    };

    checkForActiveScan();

    return () => {
      // Cleanup on unmount
      abortControllerRef.current?.abort();
    };
  }, [refreshRecentScans]);

  /**
   * Normalizes a repository input to a full GitHub URL.
   * Accepts formats: "owner/repo" or full GitHub URL
   */
  const normalizeRepositoryUrl = (input: string): string => {
    const trimmed = input.trim();

    // If it's already a full URL, return as-is
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
      return trimmed;
    }

    // Check if it matches the "owner/repo" pattern
    const ownerRepoPattern = /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/;
    if (ownerRepoPattern.test(trimmed)) {
      return `https://github.com/${trimmed}`;
    }

    // Return as-is for other cases (will be validated by backend)
    return trimmed;
  };

  const handleStartScan = useCallback(async () => {
    if (!repositoryUrl.trim()) {
      setError("Please enter a repository URL");
      return;
    }

    setError(null);
    setScanState("scanning");
    setProgress(null);
    setResult(null);

    // Abort any existing operation before starting new one
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();

    // Normalize the URL (convert owner/repo to full GitHub URL)
    const normalizedUrl = normalizeRepositoryUrl(repositoryUrl);

    try {
      // Start the scan
      const scan = await startScan(
        normalizedUrl,
        abortControllerRef.current.signal
      );

      // Store scan ID for cancellation
      currentScanIdRef.current = scan.id!;

      // Poll for status
      const finalStatus = await pollScanStatus(
        scan.id!,
        (status) => setProgress(status),
        1000,
        abortControllerRef.current.signal
      );

      if (finalStatus.status === "completed") {
        // Get full scan details
        const scanResult = await getScan(
          scan.id!,
          abortControllerRef.current.signal
        );
        setResult(scanResult);
        setScanState("completed");
        refreshRecentScans();
        showAlert("success", "Scan completed successfully");
      } else if (finalStatus.status === "failed") {
        setScanState("failed");
        setError(finalStatus.error_message || "Scan failed");
        showAlert("error", finalStatus.error_message || "Scan failed");
      } else if (finalStatus.status === "cancelled") {
        setScanState("idle");
        showAlert("success", "Scan cancelled");
      }
    } catch (err) {
      if (err instanceof Error && err.message.includes("aborted")) {
        setScanState("idle");
        return;
      }
      setScanState("failed");
      const errorMsg = err instanceof Error ? err.message : "An error occurred";
      setError(errorMsg);
      showAlert("error", errorMsg);
    }
  }, [repositoryUrl, refreshRecentScans]);

  const handleCancel = useCallback(async () => {
    // Abort local HTTP requests
    abortControllerRef.current?.abort();

    // Call backend to cancel the scan
    if (currentScanIdRef.current) {
      try {
        await cancelScan(currentScanIdRef.current);
      } catch {
        // Scan may have already completed or failed
      }
    }

    // Reset state
    currentScanIdRef.current = null;
    setScanState("idle");
    setProgress(null);
    showAlert("success", "Scan cancelled");
  }, []);

  const handleReset = useCallback(() => {
    setScanState("idle");
    setProgress(null);
    setResult(null);
    setError(null);
    setRepositoryUrl("");
  }, []);

  return (
    <PageHeaderExtended
      title="Scan repository"
      description="Enter a public GitHub repository URL to detect AI/ML libraries and frameworks."
      helpArticlePath="ai-detection/scanning"
      alert={
        alert ? (
          <Suspense fallback={null}>
            <Alert
              variant={alert.variant}
              body={alert.body}
              isToast={true}
              onClick={() => setAlert(null)}
            />
          </Suspense>
        ) : undefined
      }
    >

      {/* Statistics Cards - 6 cards in 3x2 grid (only show if there are scans) */}
      {!isCheckingActive && scanState === "idle" && !statsLoading && stats && stats.total_scans > 0 && (
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 1,
            mb: 2,
          }}
        >
          <StatCard
            title="Total scans"
            value={stats.total_scans}
            Icon={FileSearch}
            subtitle={`${stats.completed_scans} completed`}
            tooltip="Total number of repository scans performed, including completed, failed, and cancelled scans."
          />
          <StatCard
            title="Repositories"
            value={stats.unique_repositories}
            Icon={FolderGit2}
            subtitle="Unique repos scanned"
            tooltip="Number of unique repositories that have been scanned. Multiple scans of the same repo count as one."
          />
          <StatCard
            title="Total findings"
            value={stats.total_findings}
            Icon={Cpu}
            subtitle="All detections"
            tooltip="Combined count of all AI/ML detections across completed scans, including libraries, API calls, and secrets."
          />
          <StatCard
            title="Libraries"
            value={stats.findings_by_type.library}
            Icon={Library}
            subtitle="AI/ML imports"
            tooltip="AI/ML library imports and framework dependencies detected in source code (e.g., TensorFlow, PyTorch, OpenAI SDK)."
          />
          <StatCard
            title="API calls"
            value={stats.findings_by_type.api_call}
            Icon={Webhook}
            subtitle="Provider integrations"
            tooltip="Direct API calls to AI providers detected in code, including REST endpoints and SDK method invocations."
          />
          <StatCard
            title="Security issues"
            value={stats.security_findings}
            Icon={ShieldAlert}
            subtitle="Vulnerabilities found"
            tooltip="Security concerns including hardcoded API keys/secrets and model file vulnerabilities that could pose risks."
          />
        </Box>
      )}

      {/* Skeleton loading state for stats */}
      {!isCheckingActive && scanState === "idle" && statsLoading && (
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 1,
            mb: 2,
          }}
        >
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton
              key={i}
              variant="rectangular"
              height={90}
              sx={{ borderRadius: "4px" }}
            />
          ))}
        </Box>
      )}

      {/* Loading state while checking for active scans */}
      {isCheckingActive && (
        <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
          <CircularProgress size={24} />
        </Box>
      )}

      {/* Scan Form */}
      {!isCheckingActive && scanState === "idle" && (
        <Box
          sx={{
            backgroundColor: palette.background.main,
            border: `1px solid ${palette.border.dark}`,
            borderRadius: "4px",
            p: 2,
          }}
        >
          <Box sx={{ display: "flex", alignItems: "flex-start", gap: 2 }}>
            <Box sx={{ flex: 1 }}>
              <Typography sx={{ fontSize: "13px", fontWeight: 600, mb: 0.5 }}>
                Repository URL
              </Typography>
              <Typography sx={{ fontSize: "13px", color: palette.text.tertiary, mb: "4px" }}>
                Configure a GitHub token in Settings to scan private repositories.
                Try these examples:
              </Typography>
              <Box component="ul" sx={{ m: 0, pl: "20px", mb: "8px", display: "flex", flexDirection: "column", gap: "4px" }}>
                {([
                  {
                    repo: "Shubhamsaboo/awesome-llm-apps",
                    description: "Curated LLM apps — detects AI libraries, API calls, and provider dependencies",
                  },
                  {
                    repo: "langchain-ai/chat-langchain",
                    description: "LangChain chatbot — reveals RAG components, agent patterns, and model references",
                  },
                  {
                    repo: "verifywise-ai/llm-security-tester",
                    description: "Intentionally vulnerable — triggers prompt injection, PII exposure, excessive agency, and jailbreak findings",
                  },
                ] as const).map(({ repo, description }) => (
                  <Box component="li" key={repo} sx={{ fontSize: "13px", color: palette.text.tertiary }}>
                    <span
                      onClick={() => setRepositoryUrl(repo)}
                      style={{
                        color: palette.brand.primary,
                        cursor: "pointer",
                        textDecoration: "underline",
                        fontWeight: 500,
                      }}
                    >
                      {repo}
                    </span>
                    {" — "}
                    {description}
                  </Box>
                ))}
              </Box>
              <Field
                id="repository-url"
                placeholder="e.g., https://github.com/owner/repo or owner/repo"
                value={repositoryUrl}
                onChange={(e) => setRepositoryUrl(e.target.value)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <Github size={16} color={palette.text.tertiary} />
                    </InputAdornment>
                  ),
                }}
                sx={{ mb: 0 }}
              />
            </Box>
            <Box sx={{ alignSelf: "flex-end" }}>
              <CustomizableButton
                text="Scan"
                onClick={handleStartScan}
                isDisabled={!repositoryUrl.trim()}
                startIcon={<Search size={16} />}
                sx={{ height: 34 }}
              />
            </Box>
          </Box>

          {error && (
            <Box
              sx={{
                mt: 2,
                p: 2,
                backgroundColor: palette.status.error.bg,
                border: `1px solid ${palette.status.error.border}`,
                borderRadius: "4px",
                display: "flex",
                alignItems: "center",
                gap: 1,
              }}
            >
              <AlertCircle size={16} color={palette.status.error.text} />
              <Typography sx={{ fontSize: "13px", color: palette.status.error.text }}>
                {error}
              </Typography>
            </Box>
          )}
        </Box>
      )}

      {/* Scanning Progress */}
      {scanState === "scanning" && progress && (
        <Box
          sx={{
            backgroundColor: palette.background.main,
            border: `1px solid ${palette.border.dark}`,
            borderRadius: "4px",
            p: "8px",
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 2 }}>
            <Typography sx={{ fontWeight: 500, fontSize: "13px" }}>
              {progress.status === "cloning"
                ? "Cloning repository..."
                : `Scanning files... (${progress.files_scanned}${
                    progress.total_files ? `/${progress.total_files}` : ""
                  })`}
            </Typography>
            <CircularProgress size={16} sx={{ color: palette.brand.primary }} />
          </Box>

          <LinearProgress
            variant="determinate"
            value={progress.progress}
            sx={{
              height: 8,
              borderRadius: 4,
              backgroundColor: palette.border.light,
              "& .MuiLinearProgress-bar": {
                backgroundColor: palette.brand.primary,
                borderRadius: 4,
              },
            }}
          />

          <Box sx={{ display: "flex", justifyContent: "space-between", mt: 1 }}>
            <Typography sx={{ fontSize: "12px", color: palette.text.tertiary }}>
              {progress.current_file || "Processing..."}
            </Typography>
            <Typography sx={{ fontSize: "12px", color: palette.text.tertiary }}>
              {progress.progress}%
            </Typography>
          </Box>

          {progress.findings_count > 0 && (
            <Typography sx={{ fontSize: "13px", mt: 2, color: palette.brand.primary }}>
              Found {progress.findings_count} AI/ML {progress.findings_count === 1 ? "library" : "libraries"} so far
            </Typography>
          )}

          <Box sx={{ mt: 3, textAlign: "right" }}>
            <CustomizableButton
              text="Cancel"
              onClick={handleCancel}
              variant="outlined"
              sx={{ height: 34 }}
            />
          </Box>
        </Box>
      )}

      {/* Scan Complete */}
      {scanState === "completed" && result && (
        <Box
          sx={{
            backgroundColor: palette.background.main,
            border: `1px solid ${palette.border.dark}`,
            borderRadius: "4px",
            p: "8px",
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 3 }}>
            <CheckCircle2 size={24} color={palette.status.success.text} />
            <Box>
              <Typography sx={{ fontSize: "13px", fontWeight: 500 }}>
                Scan completed
              </Typography>
              <Typography sx={{ fontSize: "13px", color: palette.text.tertiary }}>
                {result.scan.repository_owner}/{result.scan.repository_name}
              </Typography>
            </Box>
          </Box>

          {/* Summary */}
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 2,
              mb: 3,
            }}
          >
            <Box
              sx={{
                p: 2,
                backgroundColor: palette.background.accent,
                borderRadius: "4px",
                textAlign: "center",
              }}
            >
              <Typography sx={{ fontSize: "20px", fontWeight: 600, color: palette.text.primary }}>
                {result.summary.total}
              </Typography>
              <Typography sx={{ fontSize: "13px", color: palette.text.tertiary }}>
                Total findings
              </Typography>
            </Box>
            <Box
              sx={{
                p: 2,
                backgroundColor: palette.background.accent,
                borderRadius: "4px",
                textAlign: "center",
              }}
            >
              <Typography sx={{ fontSize: "20px", fontWeight: 600, color: palette.status.error.text }}>
                {result.summary.by_confidence.high}
              </Typography>
              <Typography sx={{ fontSize: "13px", color: palette.text.tertiary }}>
                High confidence
              </Typography>
            </Box>
            <Box
              sx={{
                p: 2,
                backgroundColor: palette.background.accent,
                borderRadius: "4px",
                textAlign: "center",
              }}
            >
              <Typography sx={{ fontSize: "20px", fontWeight: 600, color: palette.text.primary }}>
                {result.scan.files_scanned}
              </Typography>
              <Typography sx={{ fontSize: "13px", color: palette.text.tertiary }}>
                Files scanned
              </Typography>
            </Box>
          </Box>

          {/* Actions */}
          <Box sx={{ display: "flex", gap: 2, justifyContent: "flex-end", mt: 2 }}>
            <CustomizableButton
              text="Scan another"
              onClick={handleReset}
              variant="outlined"
              sx={{ height: 34 }}
            />
            <CustomizableButton
              text="View details"
              onClick={() => navigate(`/ai-detection/scans/${result.scan.id}`)}
              sx={{ height: 34 }}
            />
          </Box>
        </Box>
      )}

      {/* Scan Failed */}
      {scanState === "failed" && (
        <Box
          sx={{
            backgroundColor: palette.background.main,
            border: `1px solid ${palette.status.error.border}`,
            borderRadius: "4px",
            p: 3,
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 2 }}>
            <XCircle size={24} color={palette.status.error.text} />
            <Box>
              <Typography sx={{ fontSize: "13px", fontWeight: 500, color: palette.status.error.text }}>
                Scan failed
              </Typography>
              <Typography sx={{ fontSize: "13px", color: palette.text.tertiary }}>
                {error || "An error occurred during the scan"}
              </Typography>
            </Box>
          </Box>

          <Box sx={{ textAlign: "right" }}>
            <CustomizableButton
              text="Try again"
              onClick={handleReset}
              sx={{ height: 34 }}
            />
          </Box>
        </Box>
      )}
      <AIDetectionOnboarding
        isOpen={showOnboarding}
        onClose={() => setShowOnboarding(false)}
      />
    </PageHeaderExtended>
  );
}
