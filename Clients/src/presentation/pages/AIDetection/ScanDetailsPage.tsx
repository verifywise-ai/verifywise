/**
 * @fileoverview AI Detection Scan Details Page
 *
 * Page for viewing detailed scan results and findings.
 * Includes separate tabs for Libraries and Security findings.
 *
 * @module pages/AIDetection/ScanDetailsPage
 */

import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Box, Typography, Collapse, IconButton, Tooltip, Popover } from "@mui/material";
import { TabContext } from "@mui/lab";
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  FileCode,
  CheckCircle2,
  ShieldCheck,
  ShieldAlert,
  ShieldOff,
  Info,
  Package,
  AlertCircle,
  AlertTriangle,
  Eye,
  Unplug,
  Timer,
  Link2,
  Plug,
  Brain,
  Lock,
  ThumbsUp,
  Flag,
  MoreHorizontal,
  Download,
  Scale,
  FileText,
  Cpu,
  FileSearch,
  RefreshCw,
  Plus,
  Sparkles,
} from "lucide-react";
import { CustomizableButton } from "../../components/button/customizable-button";
import Alert from "../../components/Alert";
import Chip from "../../components/Chip";
import { StatCard } from "../../components/Cards/StatCard";
import TabBar from "../../components/TabBar";
import { VWLink } from "../../components/Link";
import { PageHeaderExtended } from "../../components/Layout/PageHeaderExtended";
// AI provider icons - lightweight local components (no external dependencies)
import { PROVIDER_ICONS } from "../../components/ProviderIcons";
// ML framework logos - for providers without lobehub icons
import scikitLearnLogo from "../../assets/ml-logos/scikit.png";
import numpyLogo from "../../assets/ml-logos/numpy.svg";
import pandasLogo from "../../assets/ml-logos/pandas.png";
import matplotlibLogo from "../../assets/ml-logos/matplotlib.png";
import mxnetLogo from "../../assets/ml-logos/mxnet.svg";
import scipyLogo from "../../assets/ml-logos/scipy.svg";
import daskLogo from "../../assets/ml-logos/dask.svg";
import qdrantLogo from "../../assets/ml-logos/qdrant.svg";
import chromaLogo from "../../assets/ml-logos/chroma.png";
import pineconeLogo from "../../assets/ml-logos/pinecone.png";
import weaviateLogo from "../../assets/ml-logos/weaviate.png";
import {
  getScan,
  getScanFindings,
  getScanSecurityFindings,
  getScanSecuritySummary,
  updateFindingGovernanceStatus,
  exportAIBOM,
  getComplianceMapping,
  recalculateRiskScore,
} from "../../../application/repository/aiDetection.repository";
import VWTooltip from "../../components/VWTooltip";
import { RiskScoreCard } from "./components/RiskScoreCard";
import {
  ScanResponse,
  Finding,
  ConfidenceLevel,
  RiskLevel,
  SecurityFinding,
  SecuritySeverity,
  SecuritySummary,
  GovernanceStatus,
  ComplianceMappingResponse,
  ComplianceCategory,
} from "../../../domain/ai-detection/types";
import {
  SuggestedRisk,
  DIMENSION_LABELS,
  DimensionKey,
} from "../../../domain/ai-detection/riskScoringTypes";
import type { RiskFormValues, MitigationFormValues } from "../../../domain/types/riskForm.types";
import { formatDistanceToNow } from "date-fns";
import AIDepGraphModal from "../../components/AIDepGraphModal";
import AddNewRiskForm from "../../components/AddNewRiskForm";
import StandardModal from "../../components/Modals/StandardModal";
import useUsers from "../../../application/hooks/useUsers";
import {
  riskCategoryItems,
  aiLifecyclePhase,
} from "../../components/AddNewRiskForm/projectRiskValue";
import { palette } from "../../themes/palette";

type TabValue =
  | "libraries"
  | "security"
  | "api-calls"
  | "secrets"
  | "models"
  | "rag"
  | "agents"
  | "compliance"
  | "vulnerabilities";


// ============================================================================
// Configuration
// ============================================================================

const CONFIDENCE_CHIP_VARIANT: Record<ConfidenceLevel, "high" | "medium" | "low"> = {
  high: "high",
  medium: "medium",
  low: "low",
};

const SEVERITY_CHIP_VARIANT: Record<SecuritySeverity, "critical" | "high" | "medium" | "low"> = {
  critical: "critical",
  high: "high",
  medium: "medium",
  low: "low",
};

const SEVERITY_BORDER_COLORS: Record<SecuritySeverity, string> = {
  critical: palette.risk.critical.border,
  high: palette.risk.high.border,
  medium: palette.risk.medium.border,
  low: palette.status.info.border,
};

const CONFIDENCE_TOOLTIPS: Record<ConfidenceLevel, string> = {
  high: "The scanner is very confident this is an actual AI/ML library being used (e.g., direct import of tensorflow, pytorch, openai, etc.)",
  medium: "The scanner found patterns that likely indicate AI/ML usage but with less certainty",
  low: "The scanner found patterns that might indicate AI/ML usage but could be false positives",
};

const RISK_LEVEL_CONFIG: Record<RiskLevel, { label: string; color: string; bgColor: string; tooltip: string }> = {
  high: {
    label: "High risk",
    color: palette.status.error.text,
    bgColor: palette.status.error.bg,
    tooltip: "Data sent to external cloud APIs. Risk of data leakage, vendor lock-in, and compliance violations.",
  },
  medium: {
    label: "Medium risk",
    color: palette.status.warning.text,
    bgColor: palette.status.warning.bg,
    tooltip: "Framework that can connect to cloud APIs depending on configuration. Review usage to assess actual risk.",
  },
  low: {
    label: "Low risk",
    color: palette.status.success.text,
    bgColor: palette.status.success.bg,
    tooltip: "Local processing only. Data stays on your infrastructure with minimal external exposure.",
  },
};

// License risk configuration for inline badge display
const LICENSE_RISK_CONFIG: Record<string, { label: string; color: string; bgColor: string; tooltip: string }> = {
  high: {
    label: "Restrictive",
    color: palette.risk.high.text,
    bgColor: palette.risk.high.bg,
    tooltip: "Restrictive license (GPL, AGPL, CC-NC). May require code disclosure or prohibit commercial use.",
  },
  medium: {
    label: "Moderate",
    color: palette.risk.medium.text,
    bgColor: palette.risk.medium.bg,
    tooltip: "Moderate restrictions (LGPL, MPL, CC-BY-SA). Some obligations but generally allows commercial use.",
  },
  low: {
    label: "Permissive",
    color: palette.risk.low.text,
    bgColor: palette.risk.low.bg,
    tooltip: "Permissive license (MIT, Apache, BSD). Minimal restrictions, allows commercial use.",
  },
  unknown: {
    label: "Unknown",
    color: palette.status.default.text,
    bgColor: palette.status.default.bg,
    tooltip: "License could not be determined. Verify manually before commercial use.",
  },
};

const SEVERITY_TOOLTIPS: Record<SecuritySeverity, string> = {
  critical: "Critical severity: Immediate action required. This finding indicates a severe security vulnerability that could lead to remote code execution or complete system compromise.",
  high: "High severity: Urgent attention needed. This finding indicates a significant security risk that should be addressed promptly.",
  medium: "Medium severity: Should be addressed. This finding indicates a moderate security concern that requires attention.",
  low: "Low severity: Consider addressing. This finding indicates a minor security concern or informational issue.",
};

const GOVERNANCE_STATUS_CONFIG: Record<GovernanceStatus, { label: string; color: string; icon: React.ElementType }> = {
  reviewed: { label: "Reviewed", color: palette.status.info.text, icon: Eye },
  approved: { label: "Approved", color: palette.status.success.text, icon: ThumbsUp },
  flagged: { label: "Flagged", color: palette.status.error.text, icon: Flag },
};

const COMPLIANCE_CATEGORY_CONFIG: Record<ComplianceCategory, { label: string; color: string; bgColor: string; description: string }> = {
  transparency: { label: "Transparency", color: palette.accent.blue.text, bgColor: palette.accent.blue.bg, description: "Requirements for making AI systems understandable to users and deployers" },
  documentation: { label: "Documentation", color: palette.accent.indigo.text, bgColor: palette.accent.indigo.bg, description: "Requirements for maintaining technical records of AI components" },
  risk_management: { label: "Risk management", color: palette.status.error.text, bgColor: palette.status.error.bg, description: "Requirements for identifying and mitigating AI-related risks" },
  data_governance: { label: "Data governance", color: palette.accent.teal.text, bgColor: palette.accent.teal.bg, description: "Requirements for managing data used by AI systems" },
  human_oversight: { label: "Human oversight", color: palette.accent.amber.text, bgColor: palette.accent.amber.bg, description: "Requirements for human control over AI decisions" },
  security: { label: "Security", color: palette.accent.pink.text, bgColor: palette.accent.pink.bg, description: "Requirements for protecting AI systems from attacks" },
  monitoring: { label: "Monitoring", color: palette.accent.purple.text, bgColor: palette.accent.purple.bg, description: "Requirements for ongoing observation of AI performance" },
  accountability: { label: "Accountability", color: palette.accent.teal.text, bgColor: palette.accent.teal.bg, description: "Requirements for quality management and responsibility" },
};

const PRIORITY_CONFIG: Record<string, { label: string; color: string; bgColor: string; description: string }> = {
  high: { label: "High", color: palette.risk.high.text, bgColor: palette.risk.high.bg, description: "Address immediately - critical for compliance" },
  medium: { label: "Medium", color: palette.risk.medium.text, bgColor: palette.risk.medium.bg, description: "Address soon - important for compliance" },
  low: { label: "Low", color: palette.risk.low.text, bgColor: palette.risk.low.bg, description: "Address when possible - recommended for compliance" },
};

// EU AI Act article descriptions for tooltips
const ARTICLE_DESCRIPTIONS: Record<string, string> = {
  "Article 9": "Risk Management System - Requires identifying and mitigating risks throughout the AI lifecycle",
  "Article 9(2)": "Risk Management - Specifically covers third-party and dependency risks",
  "Article 10": "Data Governance - Requires quality datasets and proper data management",
  "Article 10(3)": "Data Governance - Covers data processing and preparation requirements",
  "Article 11": "Technical Documentation - Requires comprehensive documentation before market placement",
  "Article 11(1)": "Technical Documentation - Covers minimum content standards",
  "Article 13": "Transparency - AI systems must be transparent enough for users to interpret outputs",
  "Article 13(3)": "Transparency - Requires clear information about AI model capabilities",
  "Article 14": "Human Oversight - AI systems must allow effective human supervision",
  "Article 14(4)": "Human Oversight - Covers autonomy controls and intervention capabilities",
  "Article 15": "Security - AI systems must achieve appropriate accuracy, robustness, and cybersecurity",
  "Article 15(5)": "Security - Covers AI-specific vulnerabilities like data poisoning and adversarial attacks",
  "Article 17": "Quality Management - Requires documented quality management systems",
  "Article 50": "Transparency Obligations - Users must know when interacting with AI; synthetic content must be marked",
  "Article 72": "Post-Market Monitoring - Requires ongoing monitoring of AI systems after deployment",
};

// ============================================================================
// Provider Icon Mapping
// ============================================================================

// Icon components from local SVG files (SVGR)
const PROVIDER_ICON_COMPONENTS: Record<string, React.ComponentType<React.SVGProps<SVGSVGElement>>> = {
  // Cloud AI Providers
  "AI21 Labs": PROVIDER_ICONS.Ai21,
  "Anthropic": PROVIDER_ICONS.Anthropic,
  "Anyscale": PROVIDER_ICONS.Anyscale,
  "AssemblyAI": PROVIDER_ICONS.AssemblyAI,
  "AWS": PROVIDER_ICONS.Aws,
  "Baseten": PROVIDER_ICONS.Baseten,
  "Cerebras": PROVIDER_ICONS.Cerebras,
  "Cohere": PROVIDER_ICONS.Cohere,
  "DeepSeek": PROVIDER_ICONS.DeepSeek,
  "ElevenLabs": PROVIDER_ICONS.ElevenLabs,
  "Fireworks AI": PROVIDER_ICONS.Fireworks,
  "Google": PROVIDER_ICONS.Google,
  "Groq": PROVIDER_ICONS.Groq,
  "HuggingFace": PROVIDER_ICONS.HuggingFace,
  "Jina AI": PROVIDER_ICONS.Jina,
  "LangFuse": PROVIDER_ICONS.Langfuse,
  "LangSmith": PROVIDER_ICONS.LangSmith,
  "Lepton AI": PROVIDER_ICONS.LeptonAI,
  "Meta": PROVIDER_ICONS.Meta,
  "Microsoft": PROVIDER_ICONS.Microsoft,
  "Mistral": PROVIDER_ICONS.Mistral,
  "Nvidia": PROVIDER_ICONS.Nvidia,
  "Ollama": PROVIDER_ICONS.Ollama,
  "OpenAI": PROVIDER_ICONS.OpenAI,
  "OpenRouter": PROVIDER_ICONS.OpenRouter,
  "Perplexity": PROVIDER_ICONS.Perplexity,
  "Replicate": PROVIDER_ICONS.Replicate,
  "SambaNova": PROVIDER_ICONS.SambaNova,
  "Stability AI": PROVIDER_ICONS.Stability,
  "Together AI": PROVIDER_ICONS.Together,
  "Vercel": PROVIDER_ICONS.Vercel,
  "Voyage AI": PROVIDER_ICONS.Voyage,
  // AI/ML Frameworks
  "CrewAI": PROVIDER_ICONS.CrewAI,
  "LangChain": PROVIDER_ICONS.LangChain,
  "LlamaIndex": PROVIDER_ICONS.LlamaIndex,
  "Phidata": PROVIDER_ICONS.Phidata,
  "Pydantic AI": PROVIDER_ICONS.PydanticAI,
  // Local ML
  "vLLM": PROVIDER_ICONS.Vllm,
};

// SVG/PNG logo mappings for providers without lobehub icons
const PROVIDER_SVG_LOGOS: Record<string, string> = {
  // Local ML libraries
  "scikit-learn": scikitLearnLogo,
  "NumPy": numpyLogo,
  "Pandas": pandasLogo,
  "Matplotlib": matplotlibLogo,
  "MXNet": mxnetLogo,
  "SciPy": scipyLogo,
  "Dask": daskLogo,
  // Vector databases
  "Chroma": chromaLogo,
  "Pinecone": pineconeLogo,
  "Qdrant": qdrantLogo,
  "Weaviate": weaviateLogo,
};

function getProviderIcon(provider?: string, size: number = 16): React.ReactNode {
  if (!provider) return <Package size={size} color={palette.text.tertiary} strokeWidth={1.5} />;

  // Check for SVGR icon component first
  const IconComponent = PROVIDER_ICON_COMPONENTS[provider];
  if (IconComponent) return <IconComponent width={size} height={size} />;

  // Check for SVG/PNG logo
  const svgLogo = PROVIDER_SVG_LOGOS[provider];
  if (svgLogo) {
    return <img src={svgLogo} alt={provider} width={size} height={size} style={{ objectFit: "contain" }} />;
  }

  return <Package size={size} color={palette.text.tertiary} strokeWidth={1.5} />;
}

// ============================================================================
// File Path Item Component (with click-to-show code preview)
// ============================================================================

interface FilePathItemProps {
  path: string;
  lineNumber: number | null;
  matchedText: string;
  fileUrl: string | null;
}

function FilePathItem({ path, lineNumber, matchedText, fileUrl }: FilePathItemProps) {
  const hasContent = !!matchedText;

  const codePreviewContent = hasContent ? matchedText : null;

  const filePathRow = (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1,
        py: 0.5,
        px: 1,
        fontFamily: "monospace",
        fontSize: 13,
        cursor: fileUrl ? "pointer" : "default",
        "&:hover": {
          backgroundColor: palette.background.hover,
        },
        borderRadius: "4px",
      }}
    >
      {fileUrl ? (
        <a
          href={fileUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          style={{
            fontFamily: "monospace",
            color: palette.text.primary,
            wordBreak: "break-all",
            textDecoration: "none",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.textDecoration = "underline")}
          onMouseLeave={(e) => (e.currentTarget.style.textDecoration = "none")}
        >
          {path}
          {lineNumber && (
            <span style={{ color: palette.text.tertiary, marginLeft: "4px" }}>
              :{lineNumber}
            </span>
          )}
        </a>
      ) : (
        <span style={{ fontFamily: "monospace", color: palette.text.primary, wordBreak: "break-all" }}>
          {path}
          {lineNumber && (
            <span style={{ color: palette.text.tertiary, marginLeft: "4px" }}>
              :{lineNumber}
            </span>
          )}
        </span>
      )}
    </Box>
  );

  if (hasContent && codePreviewContent) {
    return (
      <VWTooltip
        content={codePreviewContent}
        placement="bottom-start"
      >
        {filePathRow}
      </VWTooltip>
    );
  }

  return filePathRow;
}

// ============================================================================
// Finding Row Component (for Library findings)
// ============================================================================

interface FindingRowProps {
  finding: Finding;
  repositoryOwner: string;
  repositoryName: string;
  scanId: number;
  onGovernanceChange?: (findingId: number, status: GovernanceStatus | null) => void;
  onStatusMessage?: (variant: "success" | "error", body: string) => void;
}

function FindingRow({ finding, repositoryOwner, repositoryName, scanId, onGovernanceChange, onStatusMessage }: FindingRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [governanceAnchor, setGovernanceAnchor] = useState<HTMLElement | null>(null);
  const [localStatus, setLocalStatus] = useState<GovernanceStatus | null>(finding.governance_status || null);
  const [isUpdating, setIsUpdating] = useState(false);

  const getFileUrl = (filePath: string, lineNumber: number | null): string | null => {
    if (!repositoryOwner || !repositoryName) return null;
    const baseUrl = `https://github.com/${repositoryOwner}/${repositoryName}/blob/HEAD/${filePath}`;
    return lineNumber ? `${baseUrl}#L${lineNumber}` : baseUrl;
  };

  const handleGovernanceClick = (event: React.MouseEvent<HTMLElement>) => {
    event.stopPropagation();
    setGovernanceAnchor(event.currentTarget);
  };

  const handleGovernanceClose = () => {
    setGovernanceAnchor(null);
  };

  const handleStatusChange = async (newStatus: GovernanceStatus | null) => {
    handleGovernanceClose();
    if (newStatus === localStatus) return;

    setIsUpdating(true);
    try {
      await updateFindingGovernanceStatus(scanId, finding.id, newStatus);
      setLocalStatus(newStatus);
      onGovernanceChange?.(finding.id, newStatus);
      const statusLabel = newStatus ? GOVERNANCE_STATUS_CONFIG[newStatus].label : "unreviewed";
      onStatusMessage?.("success", `Status updated to ${statusLabel}`);
    } catch {
      // Revert to original status on failure
      setLocalStatus(finding.governance_status || null);
      onStatusMessage?.("error", "Failed to update governance status");
    } finally {
      setIsUpdating(false);
    }
  };

  const StatusIcon = localStatus ? GOVERNANCE_STATUS_CONFIG[localStatus].icon : MoreHorizontal;
  const statusColor = localStatus ? GOVERNANCE_STATUS_CONFIG[localStatus].color : palette.text.tertiary;

  return (
    <Box
      sx={{
        border: `1px solid ${palette.border.light}`,
        borderRadius: "4px",
        mb: "8px",
        backgroundColor: palette.background.main,
      }}
    >
      {/* Header */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          p: "8px",
          cursor: "pointer",
          "&:hover": {
            backgroundColor: palette.background.accent,
          },
        }}
        onClick={() => setExpanded(!expanded)}
      >
        <IconButton size="small" sx={{ mr: 1 }}>
          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </IconButton>

        <Box sx={{ display: "flex", alignItems: "center", flex: 1 }}>
          <Box sx={{ display: "flex", alignItems: "center", mr: "8px" }}>
            {getProviderIcon(finding.provider, 32)}
          </Box>
          <Box>
            <Typography sx={{ fontSize: "13px", fontWeight: 500 }}>
              {finding.name}
            </Typography>
            {finding.description && (
              <Typography sx={{ fontSize: "13px", color: palette.text.tertiary, mt: 0.5 }}>
                {finding.description}
              </Typography>
            )}
          </Box>
        </Box>

        <Box sx={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {/* Risk Level Badge */}
          {finding.risk_level && (
            <Tooltip title={RISK_LEVEL_CONFIG[finding.risk_level].tooltip} arrow placement="top">
              <Box
                sx={{
                  px: "8px",
                  py: "2px",
                  borderRadius: "4px",
                  backgroundColor: RISK_LEVEL_CONFIG[finding.risk_level].bgColor,
                  border: `1px solid ${RISK_LEVEL_CONFIG[finding.risk_level].color}20`,
                }}
              >
                <Typography
                  sx={{
                    fontSize: "12px",
                    fontWeight: 500,
                    color: RISK_LEVEL_CONFIG[finding.risk_level].color,
                  }}
                >
                  {RISK_LEVEL_CONFIG[finding.risk_level].label}
                </Typography>
              </Box>
            </Tooltip>
          )}
          {/* License Badge */}
          {finding.license_id && finding.license_risk && (
            <Tooltip
              title={
                <Box>
                  <Typography sx={{ fontWeight: 600, fontSize: 12 }}>{finding.license_name || finding.license_id}</Typography>
                  <Typography sx={{ fontSize: 11, mt: 0.5 }}>
                    {LICENSE_RISK_CONFIG[finding.license_risk]?.tooltip || "License information available"}
                  </Typography>
                </Box>
              }
              arrow
              placement="top"
            >
              <Box
                sx={{
                  px: "8px",
                  py: "2px",
                  borderRadius: "4px",
                  backgroundColor: LICENSE_RISK_CONFIG[finding.license_risk]?.bgColor || palette.status.default.bg,
                  border: `1px solid ${LICENSE_RISK_CONFIG[finding.license_risk]?.color || palette.text.tertiary}20`,
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                <Scale size={12} color={LICENSE_RISK_CONFIG[finding.license_risk]?.color || palette.text.tertiary} />
                <Typography
                  sx={{
                    fontSize: "12px",
                    fontWeight: 500,
                    color: LICENSE_RISK_CONFIG[finding.license_risk]?.color || palette.text.tertiary,
                  }}
                >
                  {finding.license_id}
                </Typography>
              </Box>
            </Tooltip>
          )}
          <Box sx={{ minWidth: 120, display: "flex", justifyContent: "center" }}>
            <Tooltip title={CONFIDENCE_TOOLTIPS[finding.confidence]} arrow placement="top">
              <span>
                <Chip
                  label={`${finding.confidence.charAt(0).toUpperCase() + finding.confidence.slice(1)} confidence`}
                  variant={CONFIDENCE_CHIP_VARIANT[finding.confidence]}
                  size="small"
                />
              </span>
            </Tooltip>
          </Box>
          {finding.finding_status && finding.finding_status !== "active" && (
            <Chip
              label={finding.finding_status === "carried_forward" ? "Carried forward" : "Fixed"}
              size="small"
              variant={finding.finding_status === "fixed" ? "success" : "info"}
            />
          )}
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, minWidth: 85, justifyContent: "flex-end" }}>
            <FileCode size={14} color={palette.text.tertiary} />
            <Typography sx={{ fontSize: "13px", color: palette.text.tertiary }}>
              {finding.file_count} {finding.file_count === 1 ? "file" : "files"}
            </Typography>
          </Box>
          {/* Governance Status Button */}
          <Tooltip title={localStatus ? `Status: ${GOVERNANCE_STATUS_CONFIG[localStatus].label}` : "Set status"} arrow placement="top">
            <IconButton
              size="small"
              onClick={handleGovernanceClick}
              disabled={isUpdating}
              sx={{
                border: `1px solid ${palette.border.light}`,
                borderRadius: "4px",
                p: "4px",
                "&:hover": { backgroundColor: palette.background.hover },
              }}
            >
              <StatusIcon size={16} color={statusColor} />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {/* Governance Status Popover */}
      <Popover
        open={Boolean(governanceAnchor)}
        anchorEl={governanceAnchor}
        onClose={handleGovernanceClose}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
        slotProps={{
          paper: {
            sx: {
              mt: 0.5,
              borderRadius: "4px",
              boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
              border: `1px solid ${palette.border.light}`,
            },
          },
        }}
      >
        <Box sx={{ p: 1, minWidth: 140 }}>
          {(Object.entries(GOVERNANCE_STATUS_CONFIG) as [GovernanceStatus, typeof GOVERNANCE_STATUS_CONFIG[GovernanceStatus]][]).map(
            ([status, config]) => (
              <Box
                key={status}
                onClick={() => handleStatusChange(status)}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                  p: "6px 8px",
                  borderRadius: "4px",
                  cursor: "pointer",
                  backgroundColor: localStatus === status ? palette.background.hover : "transparent",
                  "&:hover": { backgroundColor: palette.background.hover },
                }}
              >
                <config.icon size={14} color={config.color} />
                <Typography sx={{ fontSize: "13px" }}>{config.label}</Typography>
              </Box>
            )
          )}
          {localStatus && (
            <>
              <Box sx={{ borderTop: `1px solid ${palette.border.light}`, my: 0.5 }} />
              <Box
                onClick={() => handleStatusChange(null)}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                  p: "6px 8px",
                  borderRadius: "4px",
                  cursor: "pointer",
                  "&:hover": { backgroundColor: palette.background.hover },
                }}
              >
                <MoreHorizontal size={14} color={palette.text.tertiary} />
                <Typography sx={{ fontSize: "13px", color: palette.text.tertiary }}>Clear status</Typography>
              </Box>
            </>
          )}
        </Box>
      </Popover>

      {/* Expanded Content */}
      <Collapse in={expanded}>
        <Box sx={{ p: "8px", borderTop: `1px solid ${palette.border.light}` }}>
          <Typography sx={{ fontSize: "13px", fontWeight: 500, mb: 1 }}>
            Found in:
          </Typography>
          <Box
            sx={{
              maxHeight: 200,
              overflow: "auto",
              backgroundColor: palette.background.accent,
              borderRadius: "4px",
              p: 1,
            }}
          >
            {finding.file_paths.slice(0, 20).map((fp, idx) => (
              <FilePathItem
                key={idx}
                path={fp.path}
                lineNumber={fp.line_number}
                matchedText={fp.matched_text}
                fileUrl={getFileUrl(fp.path, fp.line_number)}
              />
            ))}
            {finding.file_paths.length > 20 && (
              <Typography
                sx={{ fontSize: "13px", color: palette.text.tertiary, fontStyle: "italic", mt: 1, px: 1 }}
              >
                And {finding.file_paths.length - 20} more files...
              </Typography>
            )}
          </Box>
        </Box>
      </Collapse>
    </Box>
  );
}

// ============================================================================
// Security Finding Row Component
// ============================================================================

interface SecurityFindingRowProps {
  finding: SecurityFinding;
  repositoryOwner: string;
  repositoryName: string;
}

function SecurityFindingRow({ finding, repositoryOwner, repositoryName }: SecurityFindingRowProps) {
  const [expanded, setExpanded] = useState(false);
  const borderColor = SEVERITY_BORDER_COLORS[finding.severity];

  const getFileUrl = (filePath: string, lineNumber: number | null): string | null => {
    if (!repositoryOwner || !repositoryName) return null;
    const baseUrl = `https://github.com/${repositoryOwner}/${repositoryName}/blob/HEAD/${filePath}`;
    return lineNumber ? `${baseUrl}#L${lineNumber}` : baseUrl;
  };

  return (
    <Box
      sx={{
        border: `1px solid ${borderColor}`,
        borderRadius: "4px",
        mb: "8px",
        backgroundColor: palette.background.main,
      }}
    >
      {/* Header */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          p: "8px",
          cursor: "pointer",
          "&:hover": {
            backgroundColor: palette.background.accent,
          },
        }}
        onClick={() => setExpanded(!expanded)}
      >
        <IconButton size="small" sx={{ mr: 1 }}>
          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </IconButton>

        <Box sx={{ flex: 1 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Typography sx={{ fontSize: "13px", fontWeight: 500 }}>
              {finding.name}
            </Typography>
            <Typography sx={{ fontSize: "13px", color: palette.text.tertiary }}>
              in {finding.module_name}
            </Typography>
          </Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 2, mt: 0.5 }}>
            <Typography sx={{ fontSize: "13px", color: palette.text.tertiary }}>
              {finding.cwe_id}
            </Typography>
            <Typography sx={{ fontSize: "13px", color: palette.text.tertiary }}>
              {finding.owasp_ml_id}
            </Typography>
          </Box>
        </Box>

        <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
          <Box sx={{ minWidth: 75, display: "flex", justifyContent: "center" }}>
            <Tooltip title={SEVERITY_TOOLTIPS[finding.severity]} arrow placement="top">
              <span>
                <Chip
                  label={finding.severity.charAt(0).toUpperCase() + finding.severity.slice(1)}
                  variant={SEVERITY_CHIP_VARIANT[finding.severity]}
                  size="small"
                />
              </span>
            </Tooltip>
          </Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, minWidth: 85, justifyContent: "flex-end" }}>
            <FileCode size={14} color={palette.text.tertiary} />
            <Typography sx={{ fontSize: "13px", color: palette.text.tertiary }}>
              {finding.file_count} {finding.file_count === 1 ? "file" : "files"}
            </Typography>
          </Box>
        </Box>
      </Box>

      {/* Expanded Content */}
      <Collapse in={expanded}>
        <Box sx={{ p: "8px", borderTop: `1px solid ${palette.border.light}` }}>
          {/* Description */}
          {finding.description && (
            <Typography sx={{ fontSize: "13px", color: palette.text.secondary, mb: 1 }}>
              {finding.description}
            </Typography>
          )}

          {/* Security Details */}
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: "repeat(2, 1fr)",
              gap: "8px",
              mb: "8px",
            }}
          >
            <Box>
              <Typography
                sx={{ fontSize: "13px", fontWeight: 500, color: palette.text.secondary }}
              >
                CWE
              </Typography>
              <VWLink
                url={`https://cwe.mitre.org/data/definitions/${finding.cwe_id.replace("CWE-", "")}.html`}
                openInNewTab
              >
                {finding.cwe_id}: {finding.cwe_name}
              </VWLink>
            </Box>
            <Box>
              <Typography
                sx={{ fontSize: "13px", fontWeight: 500, color: palette.text.secondary }}
              >
                OWASP ML
              </Typography>
              <VWLink
                url="https://owasp.org/www-project-machine-learning-security-top-10/"
                openInNewTab
              >
                {finding.owasp_ml_id}: {finding.owasp_ml_name}
              </VWLink>
            </Box>
            <Box>
              <Typography
                sx={{ fontSize: "13px", fontWeight: 500, color: palette.text.secondary }}
              >
                Threat type
              </Typography>
              <Typography sx={{ fontSize: "13px", color: palette.text.tertiary }}>
                {finding.threat_type}
              </Typography>
            </Box>
            <Box>
              <Typography
                sx={{ fontSize: "13px", fontWeight: 500, color: palette.text.secondary }}
              >
                Operator
              </Typography>
              <Typography sx={{ fontSize: "13px", color: palette.text.tertiary }}>
                {finding.operator_name}
              </Typography>
            </Box>
          </Box>

          <Typography sx={{ fontSize: "13px", fontWeight: 500, mb: 1 }}>
            Found in:
          </Typography>
          <Box
            sx={{
              maxHeight: 200,
              overflow: "auto",
              backgroundColor: palette.background.accent,
              borderRadius: "4px",
              p: 1,
            }}
          >
            {finding.file_paths.slice(0, 20).map((fp, idx) => (
              <FilePathItem
                key={idx}
                path={fp.path}
                lineNumber={fp.line_number}
                matchedText={fp.matched_text}
                fileUrl={getFileUrl(fp.path, fp.line_number)}
              />
            ))}
            {finding.file_paths.length > 20 && (
              <Typography
                sx={{ fontSize: "13px", color: palette.text.tertiary, fontStyle: "italic", mt: 1, px: 1 }}
              >
                And {finding.file_paths.length - 20} more files...
              </Typography>
            )}
          </Box>
        </Box>
      </Collapse>
    </Box>
  );
}

// ============================================================================
// Suggested Risk Helpers
// ============================================================================

const DIMENSION_CHIP_COLORS: Record<DimensionKey, { text: string; bg: string }> = {
  data_sovereignty: { text: palette.accent.indigo.text, bg: palette.accent.indigo.bg },
  transparency: { text: palette.accent.blue.text, bg: palette.accent.blue.bg },
  security: { text: palette.accent.pink.text, bg: palette.accent.pink.bg },
  autonomy: { text: palette.accent.purple.text, bg: palette.accent.purple.bg },
  supply_chain: { text: palette.accent.orange.text, bg: palette.accent.orange.bg },
};

function mapCategoryNamesToIds(names: string[]): number[] {
  return names
    .map((name) => riskCategoryItems.find((item) => item.name === name)?._id)
    .filter((id): id is number => id !== undefined);
}

function mapPhaseNameToId(name: string): number {
  return aiLifecyclePhase.find((item) => item.name === name)?._id ?? 0;
}

function getRiskLevelLabel(likelihood: number, severity: number): { text: string; color: string } {
  const score = likelihood * severity;
  if (score >= 20) return { text: "Very high risk", color: palette.risk.critical.text };
  if (score >= 12) return { text: "High risk", color: palette.risk.high.text };
  if (score >= 6) return { text: "Medium risk", color: palette.risk.medium.text };
  if (score >= 3) return { text: "Low risk", color: palette.risk.low.text };
  return { text: "Very low risk", color: palette.status.success.text };
}

function mapSuggestionToRiskForm(s: SuggestedRisk): RiskFormValues {
  return {
    riskName: s.risk_name,
    actionOwner: 0,
    aiLifecyclePhase: mapPhaseNameToId(s.ai_lifecycle_phase),
    riskDescription: s.risk_description,
    riskCategory: mapCategoryNamesToIds(s.risk_category),
    potentialImpact: s.impact,
    assessmentMapping: 0,
    controlsMapping: 0,
    likelihood: s.likelihood,
    riskSeverity: s.severity,
    riskLevel: 0,
    reviewNotes: s.finding_refs.length > 0
      ? `Suggested by AI scan analysis. Related findings: ${s.finding_refs.join(", ")}`
      : "Suggested by AI scan analysis.",
    applicableProjects: [],
    applicableFrameworks: [],
  };
}

function mapSuggestionToMitigationForm(s: SuggestedRisk): Partial<MitigationFormValues> {
  return {
    mitigationPlan: s.mitigation_plan,
  };
}

// ============================================================================
// Vulnerability Finding Row Component
// ============================================================================

const VULN_TYPE_LABELS: Record<string, { label: string; owaspId: string }> = {
  prompt_injection: { label: "Prompt injection", owaspId: "LLM01" },
  jailbreak_risk: { label: "Insecure output handling", owaspId: "LLM02" },
  training_data_poisoning: { label: "Training data poisoning", owaspId: "LLM03" },
  model_dos: { label: "Model denial of service", owaspId: "LLM04" },
  supply_chain: { label: "Supply chain vulnerabilities", owaspId: "LLM05" },
  pii_exposure: { label: "Sensitive information disclosure", owaspId: "LLM06" },
  insecure_plugin: { label: "Insecure plugin design", owaspId: "LLM07" },
  excessive_agency: { label: "Excessive agency", owaspId: "LLM08" },
  overreliance: { label: "Overreliance", owaspId: "LLM09" },
  model_theft: { label: "Model theft", owaspId: "LLM10" },
};

interface VulnerabilityFindingRowProps {
  finding: Finding;
  repositoryOwner: string;
  repositoryName: string;
  scanId: number;
  onGovernanceChange?: (findingId: number, status: GovernanceStatus | null) => void;
  onStatusMessage?: (variant: "success" | "error", body: string) => void;
}

function VulnerabilityFindingRow({ finding, repositoryOwner, repositoryName, scanId, onGovernanceChange, onStatusMessage }: VulnerabilityFindingRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [governanceAnchor, setGovernanceAnchor] = useState<HTMLElement | null>(null);
  const [localStatus, setLocalStatus] = useState<GovernanceStatus | null>(finding.governance_status || null);
  const [isUpdating, setIsUpdating] = useState(false);
  const vulnMeta = VULN_TYPE_LABELS[finding.finding_type] || { label: finding.finding_type, owaspId: "" };

  const getFileUrl = (filePath: string, lineNumber: number | null): string | null => {
    if (!repositoryOwner || !repositoryName) return null;
    const baseUrl = `https://github.com/${repositoryOwner}/${repositoryName}/blob/HEAD/${filePath}`;
    return lineNumber ? `${baseUrl}#L${lineNumber}` : baseUrl;
  };

  const handleGovernanceClick = (event: React.MouseEvent<HTMLElement>) => {
    event.stopPropagation();
    setGovernanceAnchor(event.currentTarget);
  };

  const handleGovernanceClose = () => {
    setGovernanceAnchor(null);
  };

  const handleStatusChange = async (newStatus: GovernanceStatus | null) => {
    handleGovernanceClose();
    if (newStatus === localStatus) return;

    setIsUpdating(true);
    try {
      await updateFindingGovernanceStatus(scanId, finding.id, newStatus);
      setLocalStatus(newStatus);
      onGovernanceChange?.(finding.id, newStatus);
      const statusLabel = newStatus ? GOVERNANCE_STATUS_CONFIG[newStatus].label : "unreviewed";
      onStatusMessage?.("success", `Status updated to ${statusLabel}`);
    } catch {
      setLocalStatus(finding.governance_status || null);
      onStatusMessage?.("error", "Failed to update governance status");
    } finally {
      setIsUpdating(false);
    }
  };

  const StatusIcon = localStatus ? GOVERNANCE_STATUS_CONFIG[localStatus].icon : MoreHorizontal;
  const statusColor = localStatus ? GOVERNANCE_STATUS_CONFIG[localStatus].color : palette.text.tertiary;

  return (
    <Box
      sx={{
        border: `1px solid ${palette.border.light}`,
        borderRadius: "4px",
        mb: "8px",
        backgroundColor: palette.background.main,
      }}
    >
      {/* Header */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          p: "8px",
          cursor: "pointer",
          "&:hover": {
            backgroundColor: palette.background.accent,
          },
        }}
        onClick={() => setExpanded(!expanded)}
      >
        <IconButton size="small" sx={{ mr: 1 }}>
          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </IconButton>

        <Box sx={{ display: "flex", alignItems: "center", flex: 1 }}>
          <Box>
            <Typography sx={{ fontSize: "13px", fontWeight: 500 }}>
              {finding.description || finding.name}
            </Typography>
            {finding.data_flow_summary && (
              <Typography sx={{ fontSize: "13px", color: palette.text.tertiary, mt: 0.5 }}>
                {finding.data_flow_summary}
              </Typography>
            )}
          </Box>
        </Box>

        <Box sx={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {/* Risk Level Badge */}
          {finding.risk_level && (
            <Tooltip title={RISK_LEVEL_CONFIG[finding.risk_level]?.tooltip || ""} arrow placement="top">
              <Box
                sx={{
                  px: "8px",
                  py: "2px",
                  borderRadius: "4px",
                  backgroundColor: RISK_LEVEL_CONFIG[finding.risk_level]?.bgColor,
                  border: `1px solid ${RISK_LEVEL_CONFIG[finding.risk_level]?.color}20`,
                }}
              >
                <Typography
                  sx={{
                    fontSize: "12px",
                    fontWeight: 500,
                    color: RISK_LEVEL_CONFIG[finding.risk_level]?.color,
                  }}
                >
                  {RISK_LEVEL_CONFIG[finding.risk_level]?.label}
                </Typography>
              </Box>
            </Tooltip>
          )}
          {/* OWASP Badge */}
          {vulnMeta.owaspId && (
            <Box
              sx={{
                px: "8px",
                py: "2px",
                borderRadius: "4px",
                backgroundColor: palette.accent.indigo.bg,
                border: `1px solid ${palette.accent.indigo.text}20`,
                display: "flex",
                alignItems: "center",
                gap: "4px",
              }}
            >
              <Typography
                sx={{
                  fontSize: "12px",
                  fontWeight: 500,
                  color: palette.accent.indigo.text,
                }}
              >
                {vulnMeta.owaspId}
              </Typography>
            </Box>
          )}
          {/* Cross-reference badge */}
          {!!(finding.vulnerability_details?.related_finding_types &&
           (finding.vulnerability_details.related_finding_types as string[]).length > 0) && (
            <Tooltip
              title={`Also detected in: ${(finding.vulnerability_details.related_finding_types as string[]).map((t: string) => {
                const labels: Record<string, string> = {
                  library: "Libraries",
                  agent: "Agents",
                  model_ref: "Models",
                  api_call: "API calls",
                  secret: "Secrets",
                  rag_component: "RAG",
                  dependency: "Dependencies",
                };
                return labels[t] || t;
              }).join(", ")} tab`}
              arrow
              placement="top"
            >
              <Box
                sx={{
                  px: "6px",
                  py: "2px",
                  borderRadius: "4px",
                  backgroundColor: palette.accent.teal.bg,
                  border: `1px solid ${palette.accent.teal.text}20`,
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                <Link2 size={10} color={palette.accent.teal.text} />
                <Typography sx={{ fontSize: "11px", color: palette.accent.teal.text }}>
                  Cross-ref
                </Typography>
              </Box>
            </Tooltip>
          )}
          <Box sx={{ minWidth: 120, display: "flex", justifyContent: "center" }}>
            <Chip
              label={vulnMeta.label}
              variant="default"
              size="small"
            />
          </Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, minWidth: 85, justifyContent: "flex-end" }}>
            <FileCode size={14} color={palette.text.tertiary} />
            <Typography sx={{ fontSize: "13px", color: palette.text.tertiary }}>
              {finding.file_count || finding.file_paths?.length || 0} {(finding.file_count || finding.file_paths?.length || 0) === 1 ? "file" : "files"}
            </Typography>
          </Box>
          {/* Governance Status Button */}
          <Tooltip title={localStatus ? `Status: ${GOVERNANCE_STATUS_CONFIG[localStatus].label}` : "Set status"} arrow placement="top">
            <IconButton
              size="small"
              onClick={handleGovernanceClick}
              disabled={isUpdating}
              sx={{
                border: `1px solid ${palette.border.light}`,
                borderRadius: "4px",
                p: "4px",
                "&:hover": { backgroundColor: palette.background.hover },
              }}
            >
              <StatusIcon size={16} color={statusColor} />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {/* Governance Status Popover */}
      <Popover
        open={Boolean(governanceAnchor)}
        anchorEl={governanceAnchor}
        onClose={handleGovernanceClose}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
        slotProps={{
          paper: {
            sx: {
              mt: 0.5,
              borderRadius: "4px",
              boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
              border: `1px solid ${palette.border.light}`,
            },
          },
        }}
      >
        <Box sx={{ p: 1, minWidth: 140 }}>
          {(Object.entries(GOVERNANCE_STATUS_CONFIG) as [GovernanceStatus, typeof GOVERNANCE_STATUS_CONFIG[GovernanceStatus]][]).map(
            ([status, config]) => (
              <Box
                key={status}
                onClick={() => handleStatusChange(status)}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                  p: "6px 8px",
                  borderRadius: "4px",
                  cursor: "pointer",
                  backgroundColor: localStatus === status ? palette.background.hover : "transparent",
                  "&:hover": { backgroundColor: palette.background.hover },
                }}
              >
                <config.icon size={14} color={config.color} />
                <Typography sx={{ fontSize: "13px" }}>{config.label}</Typography>
              </Box>
            )
          )}
          {localStatus && (
            <>
              <Box sx={{ borderTop: `1px solid ${palette.border.light}`, my: 0.5 }} />
              <Box
                onClick={() => handleStatusChange(null)}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                  p: "6px 8px",
                  borderRadius: "4px",
                  cursor: "pointer",
                  "&:hover": { backgroundColor: palette.background.hover },
                }}
              >
                <MoreHorizontal size={14} color={palette.text.tertiary} />
                <Typography sx={{ fontSize: "13px", color: palette.text.tertiary }}>Clear status</Typography>
              </Box>
            </>
          )}
        </Box>
      </Popover>

      {/* Expanded Content */}
      <Collapse in={expanded}>
        <Box sx={{ p: "8px", borderTop: `1px solid ${palette.border.light}` }}>
          {/* Mitigation */}
          {finding.mitigation && (
            <Box sx={{ mb: "8px" }}>
              <Typography sx={{ fontSize: "13px", fontWeight: 500, mb: "4px" }}>
                Recommended mitigation
              </Typography>
              <Typography sx={{ fontSize: "13px", color: palette.text.secondary }}>
                {finding.mitigation}
              </Typography>
            </Box>
          )}

          {/* File paths */}
          <Typography sx={{ fontSize: "13px", fontWeight: 500, mb: 1 }}>
            Found in:
          </Typography>
          <Box
            sx={{
              maxHeight: 200,
              overflow: "auto",
              backgroundColor: palette.background.accent,
              borderRadius: "4px",
              p: 1,
            }}
          >
            {finding.file_paths?.slice(0, 20).map((fp, idx) => (
              <FilePathItem
                key={idx}
                path={fp.path}
                lineNumber={fp.line_number}
                matchedText={fp.matched_text}
                fileUrl={getFileUrl(fp.path, fp.line_number)}
              />
            ))}
            {(finding.file_paths?.length || 0) > 20 && (
              <Typography
                sx={{ fontSize: "13px", color: palette.text.tertiary, fontStyle: "italic", mt: 1, px: 1 }}
              >
                And {(finding.file_paths?.length || 0) - 20} more files...
              </Typography>
            )}
          </Box>
        </Box>
      </Collapse>
    </Box>
  );
}

// ============================================================================
// Paginated Findings Hook
// ============================================================================

function usePaginatedFindings<T = Finding>(initialPage = 1) {
  const [findings, setFindings] = useState<T[]>([]);
  const [page, setPage] = useState(initialPage);
  const [totalPages, setTotalPages] = useState(1);
  return { findings, setFindings, page, setPage, totalPages, setTotalPages };
}

// ============================================================================
// Main Component
// ============================================================================

export default function ScanDetailsPage() {
  const navigate = useNavigate();
  const { scanId: scanIdParam, tab } = useParams<{ scanId: string; tab?: string }>();
  const scanId = parseInt(scanIdParam || "0", 10);
  const initialTab: TabValue = (tab as TabValue) || "libraries";
  const [scan, setScan] = useState<ScanResponse | null>(null);

  // Paginated findings state (grouped by tab)
  const libraryState = usePaginatedFindings();
  const apiCallState = usePaginatedFindings();
  const secretState = usePaginatedFindings();
  const modelState = usePaginatedFindings();
  const ragState = usePaginatedFindings();
  const agentState = usePaginatedFindings();
  const securityState = usePaginatedFindings<SecurityFinding>();

  const [securitySummary, setSecuritySummary] = useState<SecuritySummary | null>(
    null
  );
  const [vulnerabilityFindings, setVulnerabilityFindings] = useState<Finding[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(initialTab);

  // Handle tab change with URL navigation
  const handleTabChange = (_: React.SyntheticEvent, newValue: string) => {
    setActiveTab(newValue as TabValue);
    navigate(`/ai-detection/scans/${scanId}/${newValue}`, { replace: true });
  };

  // Sync activeTab when initialTab changes (URL navigation)
  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);
  const [confidenceFilter, setConfidenceFilter] =
    useState<ConfidenceLevel | null>(null);
  const [severityFilter, setSeverityFilter] = useState<SecuritySeverity | null>(
    null
  );
  const [isExporting, setIsExporting] = useState(false);
  const [showDepGraph, setShowDepGraph] = useState(false);
  const [complianceData, setComplianceData] = useState<ComplianceMappingResponse | null>(null);
  const [complianceLoading, setComplianceLoading] = useState(false);
  const [expandedChecklist, setExpandedChecklist] = useState<Set<string>>(new Set());
  const [isRecalculating, setIsRecalculating] = useState(false);

  // Suggested risk modal state
  const [isSuggestedRiskModalOpen, setIsSuggestedRiskModalOpen] = useState(false);
  const [selectedSuggestedRisk, setSelectedSuggestedRisk] = useState<RiskFormValues | null>(null);
  const [selectedSuggestedMitigation, setSelectedSuggestedMitigation] = useState<Partial<MitigationFormValues> | null>(null);
  const suggestedRiskSubmitRef = useRef<(() => void) | null>(null);
  const { users, loading: usersLoading } = useUsers();
  const [dismissedSuggestions, setDismissedSuggestions] = useState<Set<number>>(new Set());
  const [removingSuggestions, setRemovingSuggestions] = useState<Set<number>>(new Set());
  const [ignoreMenuAnchor, setIgnoreMenuAnchor] = useState<{ el: HTMLElement; index: number } | null>(null);
  const [showSuggestedRisks, setShowSuggestedRisks] = useState(false);
  const addedSuggestionIndexRef = useRef<number | null>(null);

  // Toast alert state
  const [alert, setAlert] = useState<{ variant: "success" | "error"; body: string } | null>(null);
  const showAlert = (variant: "success" | "error", body: string) => {
    setAlert({ variant, body });
    setTimeout(() => setAlert(null), 3000);
  };

  // Suggested risk handlers
  const smoothRemoveSuggestion = useCallback((index: number) => {
    setRemovingSuggestions((prev) => new Set(prev).add(index));
    setTimeout(() => {
      setDismissedSuggestions((prev) => new Set(prev).add(index));
      setRemovingSuggestions((prev) => {
        const next = new Set(prev);
        next.delete(index);
        return next;
      });
    }, 300);
  }, []);

  const handleAddSuggestedRisk = (suggestion: SuggestedRisk, index: number) => {
    addedSuggestionIndexRef.current = index;
    setSelectedSuggestedRisk(mapSuggestionToRiskForm(suggestion));
    setSelectedSuggestedMitigation(mapSuggestionToMitigationForm(suggestion));
    setIsSuggestedRiskModalOpen(true);
  };

  const handleSuggestedRiskModalClose = () => {
    setIsSuggestedRiskModalOpen(false);
    setSelectedSuggestedRisk(null);
    setSelectedSuggestedMitigation(null);
    addedSuggestionIndexRef.current = null;
  };

  const handleSuggestedRiskSubmit = () => {
    if (suggestedRiskSubmitRef.current) {
      suggestedRiskSubmitRef.current();
    }
  };

  const handleSuggestedRiskSuccess = () => {
    showAlert("success", "Risk added to risk register");
    const idx = addedSuggestionIndexRef.current;
    handleSuggestedRiskModalClose();
    if (idx !== null) {
      smoothRemoveSuggestion(idx);
    }
  };

  const handleSuggestedRiskError = (message: string) => {
    showAlert("error", message || "Failed to add risk");
  };

  const handleIgnoreSuggestion = (_reason: string) => {
    if (ignoreMenuAnchor) {
      smoothRemoveSuggestion(ignoreMenuAnchor.index);
      setIgnoreMenuAnchor(null);
    }
  };

  // Initial load - only loads scan data
  useEffect(() => {
    const loadInitialData = async () => {
      setIsLoading(true);
      try {
        const [
          scanResponse,
          findingsResponse,
          apiCallFindingsResponse,
          secretFindingsResponse,
          modelFindingsResponse,
          ragFindingsResponse,
          agentFindingsResponse,
          securityFindingsResponse,
          summaryResponse,
          vulnFindingsResponses,
        ] = await Promise.all([
          getScan(scanId),
          getScanFindings(scanId, { page: 1, limit: 50, finding_type: "library" }),
          getScanFindings(scanId, { page: 1, limit: 50, finding_type: "api_call" }),
          getScanFindings(scanId, { page: 1, limit: 50, finding_type: "secret" }),
          getScanFindings(scanId, { page: 1, limit: 50, finding_type: "model_ref" }),
          getScanFindings(scanId, { page: 1, limit: 50, finding_type: "rag_component" }),
          getScanFindings(scanId, { page: 1, limit: 50, finding_type: "agent" }),
          getScanSecurityFindings(scanId, { page: 1, limit: 50 }),
          getScanSecuritySummary(scanId),
          Promise.all([
            getScanFindings(scanId, { page: 1, limit: 50, finding_type: "prompt_injection" }),
            getScanFindings(scanId, { page: 1, limit: 50, finding_type: "jailbreak_risk" }),
            getScanFindings(scanId, { page: 1, limit: 50, finding_type: "training_data_poisoning" }),
            getScanFindings(scanId, { page: 1, limit: 50, finding_type: "model_dos" }),
            getScanFindings(scanId, { page: 1, limit: 50, finding_type: "supply_chain" }),
            getScanFindings(scanId, { page: 1, limit: 50, finding_type: "pii_exposure" }),
            getScanFindings(scanId, { page: 1, limit: 50, finding_type: "insecure_plugin" }),
            getScanFindings(scanId, { page: 1, limit: 50, finding_type: "excessive_agency" }),
            getScanFindings(scanId, { page: 1, limit: 50, finding_type: "overreliance" }),
            getScanFindings(scanId, { page: 1, limit: 50, finding_type: "model_theft" }),
          ]),
        ]);
        setScan(scanResponse);
        libraryState.setFindings(findingsResponse.findings);
        libraryState.setTotalPages(findingsResponse.pagination.total_pages);
        apiCallState.setFindings(apiCallFindingsResponse.findings);
        apiCallState.setTotalPages(apiCallFindingsResponse.pagination.total_pages);
        secretState.setFindings(secretFindingsResponse.findings);
        secretState.setTotalPages(secretFindingsResponse.pagination.total_pages);
        modelState.setFindings(modelFindingsResponse.findings);
        modelState.setTotalPages(modelFindingsResponse.pagination.total_pages);
        ragState.setFindings(ragFindingsResponse.findings);
        ragState.setTotalPages(ragFindingsResponse.pagination.total_pages);
        agentState.setFindings(agentFindingsResponse.findings);
        agentState.setTotalPages(agentFindingsResponse.pagination.total_pages);
        securityState.setFindings(securityFindingsResponse.findings);
        securityState.setTotalPages(securityFindingsResponse.pagination.total_pages);
        setSecuritySummary(summaryResponse);
        // Combine all vulnerability findings
        setVulnerabilityFindings(
          vulnFindingsResponses.flatMap((r) => r.findings)
        );
      } catch {
        // Error loading scan - component will show empty state
      } finally {
        setIsLoading(false);
      }
    };

    loadInitialData();
  }, [scanId]);

  // Reload library findings when page or filter changes
  useEffect(() => {
    if (!scan) return;

    const loadLibraryFindings = async () => {
      try {
        const findingsResponse = await getScanFindings(scanId, {
          page: libraryState.page,
          limit: 50,
          confidence: confidenceFilter || undefined,
          finding_type: "library",
        });
        libraryState.setFindings(findingsResponse.findings);
        libraryState.setTotalPages(findingsResponse.pagination.total_pages);
      } catch {
        // Error loading findings - UI shows empty state
      }
    };

    loadLibraryFindings();
  }, [scanId, libraryState.page, confidenceFilter, scan]);

  // Reload API call findings when page changes
  useEffect(() => {
    if (!scan) return;

    const loadApiCallFindings = async () => {
      try {
        const findingsResponse = await getScanFindings(scanId, {
          page: apiCallState.page,
          limit: 50,
          finding_type: "api_call",
        });
        apiCallState.setFindings(findingsResponse.findings);
        apiCallState.setTotalPages(findingsResponse.pagination.total_pages);
      } catch {
        // Error loading findings - UI shows empty state
      }
    };

    loadApiCallFindings();
  }, [scanId, apiCallState.page, scan]);

  // Reload secret findings when page changes
  useEffect(() => {
    if (!scan) return;

    const loadSecretFindings = async () => {
      try {
        const findingsResponse = await getScanFindings(scanId, {
          page: secretState.page,
          limit: 50,
          finding_type: "secret",
        });
        secretState.setFindings(findingsResponse.findings);
        secretState.setTotalPages(findingsResponse.pagination.total_pages);
      } catch {
        // Error loading findings - UI shows empty state
      }
    };

    loadSecretFindings();
  }, [scanId, secretState.page, scan]);

  // Reload model findings when page changes
  useEffect(() => {
    if (!scan) return;

    const loadModelFindings = async () => {
      try {
        const findingsResponse = await getScanFindings(scanId, {
          page: modelState.page,
          limit: 50,
          finding_type: "model_ref",
        });
        modelState.setFindings(findingsResponse.findings);
        modelState.setTotalPages(findingsResponse.pagination.total_pages);
      } catch {
        // Error loading findings - UI shows empty state
      }
    };

    loadModelFindings();
  }, [scanId, modelState.page, scan]);

  // Reload RAG findings when page changes
  useEffect(() => {
    if (!scan) return;

    const loadRagFindings = async () => {
      try {
        const findingsResponse = await getScanFindings(scanId, {
          page: ragState.page,
          limit: 50,
          finding_type: "rag_component",
        });
        ragState.setFindings(findingsResponse.findings);
        ragState.setTotalPages(findingsResponse.pagination.total_pages);
      } catch {
        // Error loading findings - UI shows empty state
      }
    };

    loadRagFindings();
  }, [scanId, ragState.page, scan]);

  // Reload agent findings when page changes
  useEffect(() => {
    if (!scan) return;

    const loadAgentFindings = async () => {
      try {
        const findingsResponse = await getScanFindings(scanId, {
          page: agentState.page,
          limit: 50,
          finding_type: "agent",
        });
        agentState.setFindings(findingsResponse.findings);
        agentState.setTotalPages(findingsResponse.pagination.total_pages);
      } catch {
        // Error loading findings - UI shows empty state
      }
    };

    loadAgentFindings();
  }, [scanId, agentState.page, scan]);

  // Reload security findings when page or filter changes
  useEffect(() => {
    if (!scan) return;

    const loadSecurityFindings = async () => {
      try {
        const [findingsResponse, summaryResponse] = await Promise.all([
          getScanSecurityFindings(scanId, {
            page: securityState.page,
            limit: 50,
            severity: severityFilter || undefined,
          }),
          getScanSecuritySummary(scanId),
        ]);
        securityState.setFindings(findingsResponse.findings);
        securityState.setTotalPages(findingsResponse.pagination.total_pages);
        setSecuritySummary(summaryResponse);
      } catch {
        // Error loading findings - UI shows empty state
      }
    };

    loadSecurityFindings();
  }, [scanId, securityState.page, severityFilter, scan]);

  // Load compliance data when tab is selected (lazy loading)
  useEffect(() => {
    if (activeTab !== "compliance" || !scan || complianceData) return;

    const loadComplianceData = async () => {
      setComplianceLoading(true);
      try {
        const data = await getComplianceMapping(scanId);
        setComplianceData(data);
      } catch {
        // Error loading compliance data - UI shows empty state
      } finally {
        setComplianceLoading(false);
      }
    };

    loadComplianceData();
  }, [activeTab, scanId, scan, complianceData]);

  const formatDuration = (ms?: number): string => {
    if (!ms) return "-";
    if (ms < 1000) return `${ms}ms`;
    const seconds = Math.round(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  // Handle AI-BOM export
  const handleExportAIBOM = async () => {
    if (!scan || isExporting) return;

    setIsExporting(true);
    try {
      const aiBomData = await exportAIBOM(scanId);

      // Create blob and download
      const blob = new Blob([JSON.stringify(aiBomData, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `ai-bom-${scan.scan.repository_owner}-${scan.scan.repository_name}-${scanId}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showAlert("success", "AI-BOM exported successfully");
    } catch {
      showAlert("error", "Failed to export AI-BOM");
    } finally {
      setIsExporting(false);
    }
  };

  if (isLoading && !scan) {
    return (
      <PageHeaderExtended title="Scan details">
        <Box sx={{ textAlign: "center" }}>
          <Typography sx={{ fontSize: "13px", color: palette.text.tertiary }}>
            Loading scan details...
          </Typography>
        </Box>
      </PageHeaderExtended>
    );
  }

  if (!scan) {
    return (
      <PageHeaderExtended title="Scan details">
        <Box sx={{ textAlign: "center" }}>
          <Typography sx={{ fontSize: "13px", color: palette.status.error.text }}>
            Failed to load scan details
          </Typography>
        </Box>
      </PageHeaderExtended>
    );
  }

  return (
    <PageHeaderExtended
      title="Scan details"
      description={`${scan.scan.repository_owner}/${scan.scan.repository_name}`}
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
      {/* Back Button */}
      <Box sx={{ display: "flex", justifyContent: "flex-start" }}>
        <CustomizableButton
          text="Back to history"
          onClick={() => navigate("/ai-detection/history")}
          variant="text"
          startIcon={<ArrowLeft size={16} />}
          sx={{ mb: 3 }}
        />
      </Box>

      {/* Header */}
      <Box sx={{ mb: 4, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 1 }}>
            {scan.scan.status === "failed" ? (
              <AlertCircle size={24} color={palette.status.error.text} />
            ) : (
              <CheckCircle2 size={24} color={palette.status.success.text} />
            )}
            <Typography sx={{ fontSize: "15px", fontWeight: 600 }}>
              {scan.scan.repository_owner}/{scan.scan.repository_name}
            </Typography>
            {scan.scan.status === "failed" && (
              <Chip label="Failed" size="small" />
            )}
            {scan.scan.scan_mode === "incremental" && (
              <Chip label="Incremental" size="small" variant="info" />
            )}
          </Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, ml: "28px" }}>
            <Typography sx={{ fontSize: "13px", color: palette.text.primary, fontWeight: 500 }}>
              {formatDuration(scan.scan.duration_ms)}
            </Typography>
            {scan.scan.scan_mode === "incremental" && scan.scan.changed_files_count != null && (
              <>
                <Typography sx={{ color: palette.border.dark, fontSize: "12px" }}>•</Typography>
                <Typography sx={{ fontSize: "13px", color: palette.text.tertiary }}>
                  {scan.scan.changed_files_count} files changed
                </Typography>
              </>
            )}
            <Typography sx={{ color: palette.border.dark, fontSize: "12px" }}>•</Typography>
            <Typography sx={{ fontSize: "13px", color: palette.text.tertiary }}>
              {scan.scan.status === "failed" ? "Failed" : "Scanned"}{" "}
              {formatDistanceToNow(new Date(scan.scan.created_at), {
                addSuffix: true,
              })}
            </Typography>
            <Typography sx={{ color: palette.border.dark, fontSize: "12px" }}>•</Typography>
            <Typography sx={{ fontSize: "13px", color: palette.text.secondary }}>
              by {scan.scan.triggered_by.name}
            </Typography>
          </Box>
        </Box>

        {/* Action Buttons */}
        {scan.scan.status === "completed" && (
          <Box sx={{ display: "flex", gap: "8px" }}>
            <Tooltip title="Recalculate risk score" arrow placement="top">
              <span>
                <CustomizableButton
                  text="Recalculate score"
                  onClick={async () => {
                    setIsRecalculating(true);
                    try {
                      const result = await recalculateRiskScore(scanId);
                      const updated = await getScan(scanId);
                      setScan(updated);
                      showAlert("success", `Risk score updated: ${result.score} (${result.grade})`);
                    } catch {
                      showAlert("error", "Failed to recalculate risk score");
                    } finally {
                      setIsRecalculating(false);
                    }
                  }}
                  variant="outlined"
                  startIcon={<RefreshCw size={16} />}
                  isDisabled={isRecalculating}
                  sx={{ height: 34 }}
                />
              </span>
            </Tooltip>
            <Tooltip title="Export AI Bill of Materials (AI-BOM)" arrow placement="top">
              <span>
                <CustomizableButton
                  text="Export AI-BOM"
                  onClick={handleExportAIBOM}
                  variant="outlined"
                  startIcon={<Download size={16} />}
                  isDisabled={isExporting}
                  sx={{ height: 34 }}
                />
              </span>
            </Tooltip>
          </Box>
        )}
      </Box>

      {/* Error Message Alert */}
      {scan.scan.status === "failed" && scan.scan.error_message && (
        <Box
          sx={{
            mb: 4,
            p: 2,
            backgroundColor: palette.status.error.bg,
            border: `1px solid ${palette.status.error.border}`,
            borderRadius: "4px",
            display: "flex",
            alignItems: "flex-start",
            gap: 2,
          }}
        >
          <AlertCircle size={20} color={palette.status.error.text} style={{ flexShrink: 0, marginTop: 2 }} />
          <Box>
            <Typography sx={{ fontSize: "14px", fontWeight: 600, color: palette.status.error.text, mb: 0.5 }}>
              Scan failed
            </Typography>
            <Typography sx={{ fontSize: "13px", color: palette.status.error.text }}>
              {scan.scan.error_message}
            </Typography>
          </Box>
        </Box>
      )}

      {/* Risk Score Card - only for completed scans */}
      {scan.scan.status === "completed" && (
        <RiskScoreCard
          score={scan.scan.risk_score ?? null}
          grade={scan.scan.risk_score_grade ?? null}
          details={scan.scan.risk_score_details ?? null}
          calculatedAt={scan.scan.risk_score_calculated_at ?? null}
          isRecalculating={isRecalculating}
        />
      )}

      {/* Suggested Risks - only when LLM suggestions exist */}
      {scan.scan.status === "completed" &&
        scan.scan.risk_score_details?.llm_suggested_risks &&
        scan.scan.risk_score_details.llm_suggested_risks.length > 0 &&
        scan.scan.risk_score_details.llm_suggested_risks.some((_, i) => !dismissedSuggestions.has(i)) && (
        <Box
          sx={{
            background: "linear-gradient(135deg, #FEFFFE 0%, #F8F9FA 100%)",
            border: `1px solid ${palette.border.light}`,
            borderRadius: "8px",
            p: "14px 16px",
          }}
        >
          <Box
            sx={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", "&:hover": { opacity: 0.8 } }}
            onClick={() => setShowSuggestedRisks(!showSuggestedRisks)}
          >
            {showSuggestedRisks ? (
              <ChevronDown size={14} strokeWidth={1.5} color={palette.text.accent} />
            ) : (
              <ChevronRight size={14} strokeWidth={1.5} color={palette.text.accent} />
            )}
            <Sparkles size={12} color={palette.accent.purple.text} strokeWidth={1.5} />
            <Typography sx={{ fontSize: 13, color: palette.text.secondary, fontWeight: 500 }}>Suggested risks</Typography>
          </Box>
          <Collapse in={showSuggestedRisks}>
            <Box sx={{ mt: "12px", display: "flex", flexDirection: "column", gap: "8px" }}>
              {scan.scan.risk_score_details.llm_suggested_risks.map((suggestion, index) => {
                if (dismissedSuggestions.has(index)) return null;

                const isRemoving = removingSuggestions.has(index);
                const riskLevel = getRiskLevelLabel(suggestion.likelihood, suggestion.severity);
                const dimColors = DIMENSION_CHIP_COLORS[suggestion.dimension] || DIMENSION_CHIP_COLORS.security;
                const dimLabel = DIMENSION_LABELS[suggestion.dimension] || suggestion.dimension;

                return (
                  <Box
                    key={index}
                    sx={{
                      border: `1px solid ${palette.border.light}`,
                      borderRadius: "4px",
                      p: "8px",
                      backgroundColor: palette.background.main,
                      "&:hover": { borderColor: palette.border.dark },
                      transition: "opacity 300ms ease, max-height 300ms ease, padding 300ms ease, margin 300ms ease",
                      opacity: isRemoving ? 0 : 1,
                      maxHeight: isRemoving ? 0 : 300,
                      overflow: "hidden",
                      ...(isRemoving && { p: 0, border: "none", mb: 0 }),
                    }}
                  >
                    <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "8px" }}>
                      <Box sx={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "8px" }}>
                        <Box sx={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                          <Typography sx={{ fontSize: "14px", fontWeight: 600, color: palette.text.primary }}>
                            {suggestion.risk_name}
                          </Typography>
                          <Chip
                            label={dimLabel}
                            backgroundColor={dimColors.bg}
                            textColor={dimColors.text}
                            uppercase={false}
                            size="small"
                          />
                          <Chip
                            label={riskLevel.text}
                            size="small"
                          />
                        </Box>
                        <Typography
                          sx={{
                            fontSize: "13px",
                            color: palette.text.secondary,
                            display: "-webkit-box",
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: "vertical",
                            overflow: "hidden",
                          }}
                        >
                          {suggestion.risk_description}
                        </Typography>
                        <Box sx={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                          {suggestion.risk_category.map((cat) => (
                            <Chip
                              key={cat}
                              label={cat}
                              variant="default"
                              uppercase={false}
                              size="small"
                            />
                          ))}
                        </Box>
                      </Box>
                      <Box sx={{ display: "flex", gap: "8px", flexShrink: 0 }}>
                        <CustomizableButton
                          text="Ignore"
                          variant="text"
                          onClick={(e: React.MouseEvent<HTMLElement>) => setIgnoreMenuAnchor({ el: e.currentTarget, index })}
                          sx={{
                            whiteSpace: "nowrap",
                            height: "34px",
                            fontSize: "13px",
                            color: palette.text.tertiary,
                          }}
                        />
                        <CustomizableButton
                          text="Add to risk register"
                          variant="outlined"
                          startIcon={<Plus size={14} strokeWidth={1.5} />}
                          onClick={() => handleAddSuggestedRisk(suggestion, index)}
                          sx={{
                            whiteSpace: "nowrap",
                            height: "34px",
                            fontSize: "13px",
                          }}
                        />
                      </Box>
                    </Box>
                  </Box>
                );
              })}
            </Box>
          </Collapse>

          {/* Ignore reason popover */}
          <Popover
            open={Boolean(ignoreMenuAnchor)}
            anchorEl={ignoreMenuAnchor?.el}
            onClose={() => setIgnoreMenuAnchor(null)}
            anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
            transformOrigin={{ vertical: "top", horizontal: "left" }}
            slotProps={{
              paper: {
                sx: {
                  mt: 0.5,
                  borderRadius: "4px",
                  boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                  border: `1px solid ${palette.border.light}`,
                },
              },
            }}
          >
            <Box sx={{ p: 1, minWidth: 200 }}>
              <Box
                onClick={() => handleIgnoreSuggestion("already_added")}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  p: "6px 8px",
                  borderRadius: "4px",
                  cursor: "pointer",
                  "&:hover": { backgroundColor: palette.background.hover },
                }}
              >
                <Typography sx={{ fontSize: "13px", color: palette.text.primary }}>
                  This has already been added before
                </Typography>
              </Box>
              <Box
                onClick={() => handleIgnoreSuggestion("not_real_risk")}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  p: "6px 8px",
                  borderRadius: "4px",
                  cursor: "pointer",
                  "&:hover": { backgroundColor: palette.background.hover },
                }}
              >
                <Typography sx={{ fontSize: "13px", color: palette.text.primary }}>
                  This is not a real risk
                </Typography>
              </Box>
            </Box>
          </Popover>
        </Box>
      )}

      {/* Suggested Risk Modal */}
      <StandardModal
        isOpen={isSuggestedRiskModalOpen && !!selectedSuggestedRisk}
        onClose={handleSuggestedRiskModalClose}
        title="Add suggested risk to register"
        description="Review and edit the AI-suggested risk before saving."
        onSubmit={handleSuggestedRiskSubmit}
        submitButtonText="Save"
        maxWidth="1039px"
      >
        <AddNewRiskForm
          closePopup={handleSuggestedRiskModalClose}
          popupStatus="new"
          onSuccess={handleSuggestedRiskSuccess}
          onError={handleSuggestedRiskError}
          initialRiskValues={selectedSuggestedRisk || undefined}
          initialMitigationValues={selectedSuggestedMitigation ? {
            mitigationStatus: 1,
            mitigationPlan: selectedSuggestedMitigation.mitigationPlan || "",
            currentRiskLevel: 0,
            implementationStrategy: "",
            deadline: "",
            doc: "",
            likelihood: selectedSuggestedRisk?.likelihood || 0,
            riskSeverity: selectedSuggestedRisk?.riskSeverity || 0,
            approver: 0,
            approvalStatus: 0,
            dateOfAssessment: "",
            recommendations: "",
          } : undefined}
          users={users}
          usersLoading={usersLoading}
          onSubmitRef={suggestedRiskSubmitRef}
        />
      </StandardModal>

      {/* Tabs */}
      <TabContext value={activeTab}>
        <TabBar
          tabs={[
            {
              label: "Libraries",
              value: "libraries",
              icon: "Library",
              count: scan.summary.by_finding_type?.library || scan.summary.total,
              tooltip: "AI/ML libraries detected in this repository",
            },
            {
              label: "API calls",
              value: "api-calls",
              icon: "Globe",
              count: scan.summary.by_finding_type?.api_call || 0,
              tooltip: "External AI API calls found in the code",
            },
            {
              label: "Models",
              value: "models",
              icon: "Box",
              count: scan.summary.by_finding_type?.model_ref || 0,
              tooltip: "References to AI models in the codebase",
            },
            {
              label: "RAG",
              value: "rag",
              icon: "Database",
              count: scan.summary.by_finding_type?.rag_component || 0,
              tooltip: "Retrieval-augmented generation components",
            },
            {
              label: "Agents",
              value: "agents",
              icon: "Bot",
              count: scan.summary.by_finding_type?.agent || 0,
              tooltip: "Autonomous AI agent implementations",
            },
            {
              label: "Secrets",
              value: "secrets",
              icon: "Key",
              count: scan.summary.by_finding_type?.secret || 0,
              tooltip: "Exposed API keys and credentials",
            },
            {
              label: "Vulnerabilities",
              value: "vulnerabilities",
              icon: "ShieldAlert",
              count: vulnerabilityFindings.length,
              tooltip: "LLM-specific vulnerabilities (prompt injection, PII exposure, excessive agency, jailbreak risk)",
            },
            {
              label: "Security",
              value: "security",
              icon: "Shield",
              count: securitySummary?.total || 0,
              tooltip: "Security vulnerabilities in AI dependencies",
            },
            {
              label: "Compliance",
              value: "compliance",
              icon: "ClipboardCheck",
              count: complianceData?.checklist?.length || 0,
              tooltip: "Regulatory compliance checks and mappings",
            },
          ]}
          activeTab={activeTab}
          onChange={handleTabChange}
        />

        {/* Libraries Tab */}
        {activeTab === "libraries" && (
          <Box sx={{ mt: "8px" }}>
            <Typography sx={{ fontSize: "13px", color: palette.text.tertiary, mb: 2 }}>
              AI and machine learning libraries detected in the repository. Click on a finding to see file locations.
            </Typography>
            {/* Summary Cards */}
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: "repeat(4, 1fr)",
                gap: "8px",
                mb: "8px",
              }}
            >
              <StatCard
                title="Total findings"
                value={scan.summary.total}
                Icon={Cpu}
                active={confidenceFilter === null}
                onClick={() => setConfidenceFilter(null)}
                tooltip="Total AI/ML detections found in this scan"
              />
              <StatCard
                title="High confidence"
                value={scan.summary.by_confidence.high}
                Icon={AlertCircle}
                highlight={!confidenceFilter}
                active={confidenceFilter === "high"}
                onClick={() => setConfidenceFilter((f) => (f === "high" ? null : "high"))}
                tooltip="Findings with high detection confidence"
              />
              <StatCard
                title="Medium confidence"
                value={scan.summary.by_confidence.medium}
                Icon={AlertTriangle}
                active={confidenceFilter === "medium"}
                onClick={() => setConfidenceFilter((f) => (f === "medium" ? null : "medium"))}
                tooltip="Findings with medium detection confidence"
              />
              <StatCard
                title="Files scanned"
                value={scan.scan.files_scanned}
                Icon={FileSearch}
                tooltip="Total number of source files analyzed"
              />
            </Box>

            {/* Findings List */}
            <Box sx={{ mb: 2 }}>
              <Typography sx={{ fontSize: "15px", fontWeight: 500, mt: "8px", mb: 2 }}>
                Detected libraries
              </Typography>

              {libraryState.findings.length === 0 ? (
                <Box
                  sx={{
                    backgroundColor: palette.background.main,
                    border: `1px solid ${palette.border.dark}`,
                    borderRadius: "4px",
                    p: 4,
                    textAlign: "center",
                  }}
                >
                  <Typography sx={{ fontSize: "13px", color: palette.text.tertiary }}>
                    {confidenceFilter
                      ? `No ${confidenceFilter} confidence findings`
                      : "No AI/ML libraries detected"}
                  </Typography>
                </Box>
              ) : (
                <Box>
                  {libraryState.findings.map((finding) => (
                    <FindingRow
                      key={finding.id}
                      finding={finding}
                      repositoryOwner={scan.scan.repository_owner}
                      repositoryName={scan.scan.repository_name}
                      scanId={scanId}
                      onStatusMessage={showAlert}
                    />
                  ))}

                  {/* Pagination */}
                  {libraryState.totalPages > 1 && (
                    <Box
                      sx={{
                        display: "flex",
                        justifyContent: "center",
                        gap: 1,
                        mt: 2,
                      }}
                    >
                      <CustomizableButton
                        text="Previous"
                        onClick={() => libraryState.setPage((p) => Math.max(1, p - 1))}
                        isDisabled={libraryState.page === 1}
                        variant="outlined"
                        sx={{ height: 34 }}
                      />
                      <Typography
                        sx={{ fontSize: "13px", lineHeight: "34px", px: 2, color: palette.text.tertiary }}
                      >
                        Page {libraryState.page} of {libraryState.totalPages}
                      </Typography>
                      <CustomizableButton
                        text="Next"
                        onClick={() =>
                          libraryState.setPage((p) => Math.min(libraryState.totalPages, p + 1))
                        }
                        isDisabled={libraryState.page === libraryState.totalPages}
                        variant="outlined"
                        sx={{ height: 34 }}
                      />
                    </Box>
                  )}
                </Box>
              )}
            </Box>

          </Box>
        )}

        {/* API Calls Tab */}
        {activeTab === "api-calls" && (
          <Box sx={{ mt: "8px" }}>
            <Typography sx={{ fontSize: "13px", color: palette.text.tertiary, mb: 2 }}>
              API calls to AI/ML services detected in the codebase. These represent active usage of AI models and services.
            </Typography>

            {/* Summary */}
            <Box
              sx={{
                backgroundColor: palette.background.main,
                border: `1px solid ${palette.border.dark}`,
                borderRadius: "4px",
                p: "16px",
                mb: "8px",
              }}
            >
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Info size={16} color={palette.text.tertiary} />
                <Typography sx={{ fontSize: "13px", fontWeight: 500 }}>
                  {scan.summary.by_finding_type?.api_call || 0} API call{(scan.summary.by_finding_type?.api_call || 0) !== 1 ? "s" : ""} detected
                </Typography>
              </Box>
              <Typography sx={{ fontSize: "13px", color: palette.text.tertiary, mt: 1 }}>
                All API call findings are marked as high confidence. These indicate direct integration with AI services.
              </Typography>
            </Box>

            {/* Findings List */}
            <Box sx={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              {apiCallState.findings.map((finding) => (
                <FindingRow
                  key={finding.id}
                  finding={finding}
                  repositoryOwner={scan.scan.repository_owner}
                  repositoryName={scan.scan.repository_name}
                  scanId={scanId}
                />
              ))}
            </Box>

            {/* Empty State */}
            {apiCallState.findings.length === 0 && (
              <Box
                sx={{
                  p: 4,
                  textAlign: "center",
                  backgroundColor: palette.background.accent,
                  borderRadius: "4px",
                  mt: "8px",
                }}
              >
                <Typography sx={{ fontSize: "13px", color: palette.text.tertiary }}>
                  No API calls detected in this repository
                </Typography>
                <Typography sx={{ fontSize: "13px", color: palette.text.accent, mt: 1 }}>
                  API calls to OpenAI, Anthropic, Google AI, and other AI services will appear here
                </Typography>
              </Box>
            )}

            {/* Pagination */}
            {apiCallState.totalPages > 1 && (
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "center",
                  gap: 2,
                  mt: "16px",
                }}
              >
                <CustomizableButton
                  text="Previous"
                  onClick={() => apiCallState.setPage((p) => Math.max(1, p - 1))}
                  isDisabled={apiCallState.page === 1}
                  variant="outlined"
                  sx={{ height: 34 }}
                />
                <Typography sx={{ lineHeight: "34px", color: palette.text.tertiary, fontSize: "13px" }}>
                  Page {apiCallState.page} of {apiCallState.totalPages}
                </Typography>
                <CustomizableButton
                  text="Next"
                  onClick={() => apiCallState.setPage((p) => Math.min(apiCallState.totalPages, p + 1))}
                  isDisabled={apiCallState.page === apiCallState.totalPages}
                  variant="outlined"
                  sx={{ height: 34 }}
                />
              </Box>
            )}
          </Box>
        )}

        {/* Models Tab */}
        {activeTab === "models" && (
          <Box sx={{ mt: "8px" }}>
            <Typography sx={{ fontSize: "13px", color: palette.text.tertiary, mb: 2 }}>
              Pre-trained AI/ML model references detected in the codebase. These include Hugging Face models, Ollama models, and other model identifiers.
            </Typography>

            {/* Summary */}
            <Box
              sx={{
                backgroundColor: palette.background.main,
                border: `1px solid ${palette.border.dark}`,
                borderRadius: "4px",
                p: "16px",
                mb: "8px",
              }}
            >
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Package size={16} color={palette.text.tertiary} />
                <Typography sx={{ fontSize: "13px", fontWeight: 500 }}>
                  {scan.summary.by_finding_type?.model_ref || 0} model reference{(scan.summary.by_finding_type?.model_ref || 0) !== 1 ? "s" : ""} detected
                </Typography>
              </Box>
              <Typography sx={{ fontSize: "13px", color: palette.text.tertiary, mt: 1 }}>
                Model references indicate usage of pre-trained models from Hugging Face Hub, Ollama, and other sources.
              </Typography>
            </Box>

            {/* Findings List */}
            <Box sx={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              {modelState.findings.map((finding) => (
                <FindingRow
                  key={finding.id}
                  finding={finding}
                  repositoryOwner={scan.scan.repository_owner}
                  repositoryName={scan.scan.repository_name}
                  scanId={scanId}
                />
              ))}
            </Box>

            {/* Empty State */}
            {modelState.findings.length === 0 && (
              <Box
                sx={{
                  p: 4,
                  textAlign: "center",
                  backgroundColor: palette.background.accent,
                  borderRadius: "4px",
                  mt: "8px",
                }}
              >
                <Typography sx={{ fontSize: "13px", color: palette.text.tertiary }}>
                  No model references detected in this repository
                </Typography>
                <Typography sx={{ fontSize: "13px", color: palette.text.accent, mt: 1 }}>
                  References to Hugging Face models, Ollama models, and other pre-trained models will appear here
                </Typography>
              </Box>
            )}

            {/* Pagination */}
            {modelState.totalPages > 1 && (
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "center",
                  gap: 2,
                  mt: "16px",
                }}
              >
                <CustomizableButton
                  text="Previous"
                  onClick={() => modelState.setPage((p) => Math.max(1, p - 1))}
                  isDisabled={modelState.page === 1}
                  variant="outlined"
                  sx={{ height: 34 }}
                />
                <Typography sx={{ lineHeight: "34px", color: palette.text.tertiary, fontSize: "13px" }}>
                  Page {modelState.page} of {modelState.totalPages}
                </Typography>
                <CustomizableButton
                  text="Next"
                  onClick={() => modelState.setPage((p) => Math.min(modelState.totalPages, p + 1))}
                  isDisabled={modelState.page === modelState.totalPages}
                  variant="outlined"
                  sx={{ height: 34 }}
                />
              </Box>
            )}
          </Box>
        )}

        {/* RAG Tab */}
        {activeTab === "rag" && (
          <Box sx={{ mt: "8px" }}>
            <Typography sx={{ fontSize: "13px", color: palette.text.tertiary, mb: 2 }}>
              RAG (Retrieval-Augmented Generation) pipeline components detected in the codebase. These include vector databases, document loaders, and embedding models.
            </Typography>

            {/* Summary */}
            <Box
              sx={{
                backgroundColor: palette.background.main,
                border: `1px solid ${palette.border.dark}`,
                borderRadius: "4px",
                p: "16px",
                mb: "8px",
              }}
            >
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Info size={16} color={palette.text.tertiary} />
                <Typography sx={{ fontSize: "13px", fontWeight: 500 }}>
                  {scan.summary.by_finding_type?.rag_component || 0} RAG component{(scan.summary.by_finding_type?.rag_component || 0) !== 1 ? "s" : ""} detected
                </Typography>
              </Box>
              <Typography sx={{ fontSize: "13px", color: palette.text.tertiary, mt: 1 }}>
                RAG components indicate usage of vector databases, document loaders, and embedding systems for retrieval-augmented generation.
              </Typography>
            </Box>

            {/* Findings List */}
            <Box sx={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              {ragState.findings.map((finding) => (
                <FindingRow
                  key={finding.id}
                  finding={finding}
                  repositoryOwner={scan.scan.repository_owner}
                  repositoryName={scan.scan.repository_name}
                  scanId={scanId}
                />
              ))}
            </Box>

            {/* Empty State */}
            {ragState.findings.length === 0 && (
              <Box
                sx={{
                  p: 4,
                  textAlign: "center",
                  backgroundColor: palette.background.accent,
                  borderRadius: "4px",
                  mt: "8px",
                }}
              >
                <Typography sx={{ fontSize: "13px", color: palette.text.tertiary }}>
                  No RAG components detected in this repository
                </Typography>
                <Typography sx={{ fontSize: "13px", color: palette.text.accent, mt: 1 }}>
                  Vector databases (Pinecone, Chroma, Qdrant), document loaders, and embedding models will appear here
                </Typography>
              </Box>
            )}

            {/* Pagination */}
            {ragState.totalPages > 1 && (
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "center",
                  gap: 2,
                  mt: "16px",
                }}
              >
                <CustomizableButton
                  text="Previous"
                  onClick={() => ragState.setPage((p) => Math.max(1, p - 1))}
                  isDisabled={ragState.page === 1}
                  variant="outlined"
                  sx={{ height: 34 }}
                />
                <Typography sx={{ lineHeight: "34px", color: palette.text.tertiary, fontSize: "13px" }}>
                  Page {ragState.page} of {ragState.totalPages}
                </Typography>
                <CustomizableButton
                  text="Next"
                  onClick={() => ragState.setPage((p) => Math.min(ragState.totalPages, p + 1))}
                  isDisabled={ragState.page === ragState.totalPages}
                  variant="outlined"
                  sx={{ height: 34 }}
                />
              </Box>
            )}
          </Box>
        )}

        {/* Agents Tab */}
        {activeTab === "agents" && (
          <Box sx={{ mt: "8px" }}>
            <Typography sx={{ fontSize: "13px", color: palette.text.tertiary, mb: 2 }}>
              AI agent frameworks and autonomous systems detected in the codebase. These include LangChain agents, CrewAI, AutoGen, and MCP servers.
            </Typography>

            {/* Warning Box - agents carry high risk */}
            {agentState.findings.length > 0 && (
              <Box
                sx={{
                  backgroundColor: palette.status.warning.bg,
                  border: `1px solid ${palette.status.warning.border}`,
                  borderRadius: "4px",
                  p: "16px",
                  mb: "16px",
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 2,
                }}
              >
                <AlertCircle size={20} color={palette.status.warning.text} style={{ flexShrink: 0, marginTop: 2 }} />
                <Box>
                  <Typography sx={{ fontSize: "14px", fontWeight: 600, color: palette.status.warning.text, mb: 0.5 }}>
                    Autonomous AI systems detected
                  </Typography>
                  <Typography sx={{ fontSize: "13px", color: palette.status.warning.text }}>
                    AI agents can take autonomous actions and interact with external systems. Review these carefully for governance and security implications.
                  </Typography>
                </Box>
              </Box>
            )}

            {/* Summary */}
            <Box
              sx={{
                backgroundColor: palette.background.main,
                border: `1px solid ${palette.border.dark}`,
                borderRadius: "4px",
                p: "16px",
                mb: "8px",
              }}
            >
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Info size={16} color={palette.text.tertiary} />
                <Typography sx={{ fontSize: "13px", fontWeight: 500 }}>
                  {scan.summary.by_finding_type?.agent || 0} agent framework{(scan.summary.by_finding_type?.agent || 0) !== 1 ? "s" : ""} detected
                </Typography>
              </Box>
              <Typography sx={{ fontSize: "13px", color: palette.text.tertiary, mt: 1 }}>
                Agent findings are marked as high risk due to their autonomous nature and ability to interact with external systems.
              </Typography>
            </Box>

            {/* Findings List */}
            <Box sx={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              {agentState.findings.map((finding) => (
                <FindingRow
                  key={finding.id}
                  finding={finding}
                  repositoryOwner={scan.scan.repository_owner}
                  repositoryName={scan.scan.repository_name}
                  scanId={scanId}
                />
              ))}
            </Box>

            {/* Empty State */}
            {agentState.findings.length === 0 && (
              <Box
                sx={{
                  p: 4,
                  textAlign: "center",
                  backgroundColor: palette.background.accent,
                  borderRadius: "4px",
                  mt: "8px",
                }}
              >
                <Typography sx={{ fontSize: "13px", color: palette.text.tertiary }}>
                  No AI agents detected in this repository
                </Typography>
                <Typography sx={{ fontSize: "13px", color: palette.text.accent, mt: 1 }}>
                  LangChain agents, CrewAI, AutoGen, MCP servers, and other autonomous AI systems will appear here
                </Typography>
              </Box>
            )}

            {/* Pagination */}
            {agentState.totalPages > 1 && (
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "center",
                  gap: 2,
                  mt: "16px",
                }}
              >
                <CustomizableButton
                  text="Previous"
                  onClick={() => agentState.setPage((p) => Math.max(1, p - 1))}
                  isDisabled={agentState.page === 1}
                  variant="outlined"
                  sx={{ height: 34 }}
                />
                <Typography sx={{ lineHeight: "34px", color: palette.text.tertiary, fontSize: "13px" }}>
                  Page {agentState.page} of {agentState.totalPages}
                </Typography>
                <CustomizableButton
                  text="Next"
                  onClick={() => agentState.setPage((p) => Math.min(agentState.totalPages, p + 1))}
                  isDisabled={agentState.page === agentState.totalPages}
                  variant="outlined"
                  sx={{ height: 34 }}
                />
              </Box>
            )}
          </Box>
        )}

        {/* Secrets Tab */}
        {activeTab === "secrets" && (
          <Box sx={{ mt: "8px" }}>
            <Typography sx={{ fontSize: "13px", color: palette.text.tertiary, mb: 2 }}>
              Hardcoded API keys and secrets detected in the codebase. These should be moved to environment variables or a secrets manager.
            </Typography>

            {/* Warning Box - only show when secrets are found */}
            {secretState.findings.length > 0 && (
              <Box
                sx={{
                  backgroundColor: palette.status.error.bg,
                  border: `1px solid ${palette.status.error.border}`,
                  borderRadius: "4px",
                  p: "16px",
                  mb: "16px",
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 2,
                }}
              >
                <AlertCircle size={20} color={palette.status.error.text} style={{ flexShrink: 0, marginTop: 2 }} />
                <Box>
                  <Typography sx={{ fontSize: "14px", fontWeight: 600, color: palette.status.error.text, mb: 0.5 }}>
                    Security risk detected
                  </Typography>
                  <Typography sx={{ fontSize: "13px", color: palette.status.error.text }}>
                    Hardcoded secrets in source code can be exposed if the repository is made public or accessed by unauthorized users.
                    Rotate any exposed credentials immediately.
                  </Typography>
                </Box>
              </Box>
            )}

            {/* Findings List */}
            <Box sx={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              {secretState.findings.map((finding) => (
                <FindingRow
                  key={finding.id}
                  finding={finding}
                  repositoryOwner={scan.scan.repository_owner}
                  repositoryName={scan.scan.repository_name}
                  scanId={scanId}
                />
              ))}
            </Box>

            {/* Empty State - only show when no secrets found */}
            {secretState.findings.length === 0 && (
              <Box
                sx={{
                  p: "16px",
                  textAlign: "center",
                  backgroundColor: palette.status.success.bg,
                  border: `1px solid ${palette.status.success.border}`,
                  borderRadius: "4px",
                  mt: "8px",
                }}
              >
                <Box sx={{ display: "flex", justifyContent: "center", mb: 2 }}>
                  <ShieldCheck size={48} color={palette.status.success.text} />
                </Box>
                <Typography sx={{ fontSize: "14px", fontWeight: 500, color: palette.status.success.text, mb: 1 }}>
                  No hardcoded secrets detected
                </Typography>
                <Typography sx={{ fontSize: "13px", color: palette.text.tertiary }}>
                  No API keys, tokens, or other secrets were found in the scanned code.
                </Typography>
              </Box>
            )}

            {/* Pagination */}
            {secretState.totalPages > 1 && (
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "center",
                  gap: 2,
                  mt: "16px",
                }}
              >
                <CustomizableButton
                  text="Previous"
                  onClick={() => secretState.setPage((p) => Math.max(1, p - 1))}
                  isDisabled={secretState.page === 1}
                  variant="outlined"
                  sx={{ height: 34 }}
                />
                <Typography sx={{ lineHeight: "34px", color: palette.text.tertiary, fontSize: "13px" }}>
                  Page {secretState.page} of {secretState.totalPages}
                </Typography>
                <CustomizableButton
                  text="Next"
                  onClick={() => secretState.setPage((p) => Math.min(secretState.totalPages, p + 1))}
                  isDisabled={secretState.page === secretState.totalPages}
                  variant="outlined"
                  sx={{ height: 34 }}
                />
              </Box>
            )}
          </Box>
        )}

        {/* Security Tab */}
        {activeTab === "security" && (
          <Box sx={{ mt: "8px" }}>
            <Typography sx={{ fontSize: "13px", color: palette.text.tertiary, mb: 2 }}>
              Security vulnerabilities found in model files. Serialized models can contain malicious code that executes when loaded.
            </Typography>
            {/* Security Summary Cards - only show when there are findings */}
            {(securitySummary?.total || 0) > 0 && (
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: "repeat(5, 1fr)",
                gap: "8px",
                mb: "8px",
              }}
            >
              <Box
                sx={{
                  backgroundColor: palette.background.main,
                  border: `1px solid ${palette.border.dark}`,
                  borderRadius: "4px",
                  p: 2,
                  textAlign: "center",
                }}
              >
                <Typography sx={{ fontSize: "20px", fontWeight: 600 }}>
                  {securitySummary?.total || 0}
                </Typography>
                <Typography sx={{ fontSize: "13px", color: palette.text.tertiary }}>
                  Total findings
                </Typography>
              </Box>
              <Box
                sx={{
                  backgroundColor: palette.status.error.bg,
                  border: `1px solid ${palette.status.error.border}`,
                  borderRadius: "4px",
                  p: 2,
                  textAlign: "center",
                  cursor: "pointer",
                }}
                onClick={() =>
                  setSeverityFilter((f) => (f === "critical" ? null : "critical"))
                }
              >
                <Typography
                  sx={{
                    fontSize: "20px",
                    fontWeight: 600,
                    color:
                      severityFilter === "critical" ? palette.status.error.text : palette.text.primary,
                  }}
                >
                  {securitySummary?.by_severity.critical || 0}
                </Typography>
                <Typography sx={{ fontSize: "13px", color: palette.text.tertiary }}>
                  Critical
                </Typography>
              </Box>
              <Box
                sx={{
                  backgroundColor: palette.risk.high.bg,
                  border: `1px solid ${palette.risk.high.border}`,
                  borderRadius: "4px",
                  p: 2,
                  textAlign: "center",
                  cursor: "pointer",
                }}
                onClick={() =>
                  setSeverityFilter((f) => (f === "high" ? null : "high"))
                }
              >
                <Typography
                  sx={{
                    fontSize: "20px",
                    fontWeight: 600,
                    color:
                      severityFilter === "high" ? palette.risk.high.text : palette.text.primary,
                  }}
                >
                  {securitySummary?.by_severity.high || 0}
                </Typography>
                <Typography sx={{ fontSize: "13px", color: palette.text.tertiary }}>
                  High
                </Typography>
              </Box>
              <Box
                sx={{
                  backgroundColor: palette.status.warning.bg,
                  border: `1px solid ${palette.status.warning.border}`,
                  borderRadius: "4px",
                  p: 2,
                  textAlign: "center",
                  cursor: "pointer",
                }}
                onClick={() =>
                  setSeverityFilter((f) => (f === "medium" ? null : "medium"))
                }
              >
                <Typography
                  sx={{
                    fontSize: "20px",
                    fontWeight: 600,
                    color:
                      severityFilter === "medium" ? palette.status.warning.text : palette.text.primary,
                  }}
                >
                  {securitySummary?.by_severity.medium || 0}
                </Typography>
                <Typography sx={{ fontSize: "13px", color: palette.text.tertiary }}>
                  Medium
                </Typography>
              </Box>
              <Box
                sx={{
                  backgroundColor: palette.status.info.bg,
                  border: `1px solid ${palette.status.info.border}`,
                  borderRadius: "4px",
                  p: 2,
                  textAlign: "center",
                  cursor: "pointer",
                }}
                onClick={() =>
                  setSeverityFilter((f) => (f === "low" ? null : "low"))
                }
              >
                <Typography
                  sx={{
                    fontSize: "20px",
                    fontWeight: 600,
                    color:
                      severityFilter === "low" ? palette.status.info.text : palette.text.primary,
                  }}
                >
                  {securitySummary?.by_severity.low || 0}
                </Typography>
                <Typography sx={{ fontSize: "13px", color: palette.text.tertiary }}>
                  Low
                </Typography>
              </Box>
            </Box>
            )}

            {/* Security Findings List */}
            <Box sx={{ mb: 2 }}>
              <Typography sx={{ fontSize: "15px", fontWeight: 500, mt: "8px", mb: 2 }}>
                Security findings
              </Typography>

              {securityState.findings.length === 0 ? (
                <Box
                  sx={{
                    backgroundColor: palette.status.success.bg,
                    border: `1px solid ${palette.status.success.border}`,
                    borderRadius: "4px",
                    p: 4,
                    textAlign: "center",
                  }}
                >
                  <Box
                    sx={{
                      display: "flex",
                      justifyContent: "center",
                      mb: 2,
                    }}
                  >
                    <ShieldCheck size={48} color={palette.status.success.text} />
                  </Box>
                  <Typography
                    sx={{ fontSize: "13px", fontWeight: 500, color: palette.status.success.text, mb: 1 }}
                  >
                    {severityFilter
                      ? `No ${severityFilter} severity findings`
                      : "No security issues detected"}
                  </Typography>
                  {!severityFilter && (
                    <Box
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 0.5,
                        mt: 1,
                      }}
                    >
                      <Info size={14} color={palette.text.tertiary} />
                      <Typography sx={{ fontSize: "13px", color: palette.text.tertiary }}>
                        Note: This scan checks for known malicious patterns only.
                        A clean result does not guarantee the model is safe.
                      </Typography>
                    </Box>
                  )}
                </Box>
              ) : (
                <Box>
                  {securityState.findings.map((finding) => (
                    <SecurityFindingRow
                      key={finding.id}
                      finding={finding}
                      repositoryOwner={scan.scan.repository_owner}
                      repositoryName={scan.scan.repository_name}
                    />
                  ))}

                  {/* Pagination */}
                  {securityState.totalPages > 1 && (
                    <Box
                      sx={{
                        display: "flex",
                        justifyContent: "center",
                        gap: 1,
                        mt: 2,
                      }}
                    >
                      <CustomizableButton
                        text="Previous"
                        onClick={() =>
                          securityState.setPage((p) => Math.max(1, p - 1))
                        }
                        isDisabled={securityState.page === 1}
                        variant="outlined"
                        sx={{ height: 34 }}
                      />
                      <Typography
                        sx={{ fontSize: "13px", lineHeight: "34px", px: 2, color: palette.text.tertiary }}
                      >
                        Page {securityState.page} of {securityState.totalPages}
                      </Typography>
                      <CustomizableButton
                        text="Next"
                        onClick={() =>
                          securityState.setPage((p) =>
                            Math.min(securityState.totalPages, p + 1)
                          )
                        }
                        isDisabled={securityState.page === securityState.totalPages}
                        variant="outlined"
                        sx={{ height: 34 }}
                      />
                    </Box>
                  )}
                </Box>
              )}
            </Box>

            {/* Model files scanned info */}
            {securitySummary && (
              <Box sx={{ mt: 4 }}>
                <Typography sx={{ fontSize: "13px", color: palette.text.tertiary }}>
                  {securitySummary.model_files_scanned} model{" "}
                  {securitySummary.model_files_scanned === 1 ? "file" : "files"}{" "}
                  scanned
                </Typography>
              </Box>
            )}
          </Box>
        )}

        {/* Compliance Tab */}
        {activeTab === "compliance" && (
          <Box sx={{ mt: "8px" }}>
            <Typography sx={{ fontSize: "13px", color: palette.text.tertiary, mb: 2 }}>
              EU AI Act compliance mapping based on detected AI components. Review these requirements to ensure your AI system meets regulatory obligations.
            </Typography>

            {complianceLoading ? (
              <Box sx={{ textAlign: "center", py: 4 }}>
                <Typography sx={{ fontSize: "13px", color: palette.text.tertiary }}>
                  Loading compliance data...
                </Typography>
              </Box>
            ) : !complianceData ? (
              <Box sx={{ textAlign: "center", py: 4 }}>
                <Typography sx={{ fontSize: "13px", color: palette.text.tertiary }}>
                  Unable to load compliance data
                </Typography>
              </Box>
            ) : (
              <>
                {/* Summary Cards */}
                <Box
                  sx={{
                    display: "grid",
                    gridTemplateColumns: "repeat(4, 1fr)",
                    gap: "8px",
                    mb: "16px",
                  }}
                >
                  <Box
                    sx={{
                      backgroundColor: palette.background.main,
                      border: `1px solid ${palette.border.dark}`,
                      borderRadius: "4px",
                      p: 2,
                      textAlign: "center",
                    }}
                  >
                    <Typography sx={{ fontSize: "20px", fontWeight: 600 }}>
                      {complianceData.summary.totalRequirements}
                    </Typography>
                    <Typography sx={{ fontSize: "13px", color: palette.text.tertiary }}>
                      Total requirements
                    </Typography>
                  </Box>
                  <Box
                    sx={{
                      backgroundColor: palette.status.error.bg,
                      border: `1px solid ${palette.status.error.border}`,
                      borderRadius: "4px",
                      p: 2,
                      textAlign: "center",
                    }}
                  >
                    <Typography sx={{ fontSize: "20px", fontWeight: 600, color: palette.status.error.text }}>
                      {complianceData.summary.byPriority.high}
                    </Typography>
                    <Typography sx={{ fontSize: "13px", color: palette.text.tertiary }}>
                      High priority
                    </Typography>
                  </Box>
                  <Box
                    sx={{
                      backgroundColor: palette.status.warning.bg,
                      border: `1px solid ${palette.status.warning.border}`,
                      borderRadius: "4px",
                      p: 2,
                      textAlign: "center",
                    }}
                  >
                    <Typography sx={{ fontSize: "20px", fontWeight: 600, color: palette.status.warning.text }}>
                      {complianceData.summary.byPriority.medium}
                    </Typography>
                    <Typography sx={{ fontSize: "13px", color: palette.text.tertiary }}>
                      Medium priority
                    </Typography>
                  </Box>
                  <Tooltip
                    title="Percentage of EU AI Act requirements triggered by detected AI components"
                    arrow
                  >
                    <Box
                      sx={{
                        backgroundColor: palette.background.accent,
                        border: `1px solid ${palette.border.dark}`,
                        borderRadius: "4px",
                        p: 2,
                        textAlign: "center",
                        cursor: "help",
                      }}
                    >
                      <Typography sx={{ fontSize: "20px", fontWeight: 600, color: palette.text.secondary }}>
                        {Math.round(complianceData.summary.coveragePercentage)}%
                      </Typography>
                      <Typography sx={{ fontSize: "13px", color: palette.text.tertiary }}>
                        Requirements scope
                      </Typography>
                    </Box>
                  </Tooltip>
                </Box>

                {/* Category breakdown */}
                <Box sx={{ mb: "16px" }}>
                  <Typography sx={{ fontSize: "15px", fontWeight: 500, mb: 2 }}>
                    Requirements by category
                  </Typography>
                  <Box sx={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                    {Object.entries(complianceData.summary.byCategory).map(([category, count]) => {
                      const config = COMPLIANCE_CATEGORY_CONFIG[category as ComplianceCategory];
                      if (!config || count === 0) return null;
                      return (
                        <Chip
                          key={category}
                          label={`${config.label} (${count})`}
                          backgroundColor={config.bgColor}
                          textColor={config.color}
                          uppercase={false}
                          size="small"
                        />
                      );
                    })}
                  </Box>
                </Box>

                {/* Compliance Checklist */}
                <Box>
                  <Typography sx={{ fontSize: "15px", fontWeight: 500, mb: 2 }}>
                    Compliance checklist
                  </Typography>

                  {complianceData.checklist.length === 0 ? (
                    <Box
                      sx={{
                        backgroundColor: palette.status.success.bg,
                        border: `1px solid ${palette.status.success.border}`,
                        borderRadius: "4px",
                        p: 4,
                        textAlign: "center",
                      }}
                    >
                      <Box sx={{ display: "flex", justifyContent: "center", mb: 2 }}>
                        <CheckCircle2 size={48} color={palette.status.success.text} />
                      </Box>
                      <Typography sx={{ fontSize: "13px", fontWeight: 500, color: palette.status.success.text, mb: 1 }}>
                        No specific compliance actions needed
                      </Typography>
                      <Typography sx={{ fontSize: "13px", color: palette.text.tertiary }}>
                        Based on the scan results, no additional compliance requirements were identified.
                      </Typography>
                    </Box>
                  ) : (
                    <Box sx={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      {complianceData.checklist.map((item) => {
                        const priorityConfig = PRIORITY_CONFIG[item.priority];
                        const categoryConfig = COMPLIANCE_CATEGORY_CONFIG[item.category];
                        const isExpanded = expandedChecklist.has(item.id);

                        return (
                          <Box
                            key={item.id}
                            sx={{
                              border: `1px solid ${palette.border.light}`,
                              borderRadius: "4px",
                              backgroundColor: palette.background.main,
                            }}
                          >
                            {/* Checklist item header */}
                            <Box
                              sx={{
                                display: "flex",
                                alignItems: "flex-start",
                                p: "12px",
                                cursor: "pointer",
                                "&:hover": { backgroundColor: palette.background.accent },
                              }}
                              onClick={() => {
                                const newSet = new Set(expandedChecklist);
                                if (isExpanded) {
                                  newSet.delete(item.id);
                                } else {
                                  newSet.add(item.id);
                                }
                                setExpandedChecklist(newSet);
                              }}
                            >
                              <IconButton size="small" sx={{ mr: 1, mt: "-4px" }}>
                                {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                              </IconButton>

                              <Box sx={{ flex: 1 }}>
                                <Typography sx={{ fontSize: "14px", fontWeight: 500, mb: "4px" }}>
                                  {item.text}
                                </Typography>
                                <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
                                  {/* Article reference with tooltip */}
                                  <Tooltip
                                    title={ARTICLE_DESCRIPTIONS[item.articleRef] || `EU AI Act ${item.articleRef}`}
                                    arrow
                                    placement="top"
                                  >
                                    <Box
                                      sx={{
                                        px: "6px",
                                        py: "2px",
                                        borderRadius: "4px",
                                        backgroundColor: palette.status.default.bg,
                                        display: "flex",
                                        alignItems: "center",
                                        gap: "4px",
                                        cursor: "help",
                                      }}
                                    >
                                      <FileText size={12} color={palette.text.tertiary} />
                                      <Typography sx={{ fontSize: "12px", color: palette.text.tertiary }}>
                                        {item.articleRef}
                                      </Typography>
                                    </Box>
                                  </Tooltip>
                                  {/* Category badge with tooltip */}
                                  {categoryConfig && (
                                    <Tooltip title={categoryConfig.description} arrow placement="top">
                                      <Box
                                        sx={{
                                          px: "6px",
                                          py: "2px",
                                          borderRadius: "4px",
                                          backgroundColor: categoryConfig.bgColor,
                                          cursor: "help",
                                        }}
                                      >
                                        <Typography sx={{ fontSize: "12px", color: categoryConfig.color }}>
                                          {categoryConfig.label}
                                        </Typography>
                                      </Box>
                                    </Tooltip>
                                  )}
                                </Box>
                              </Box>

                              {/* Priority badge with tooltip */}
                              {priorityConfig && (
                                <Tooltip title={priorityConfig.description} arrow placement="top">
                                  <Box
                                    sx={{
                                      px: "8px",
                                      py: "2px",
                                      borderRadius: "4px",
                                      backgroundColor: priorityConfig.bgColor,
                                      border: `1px solid ${priorityConfig.color}20`,
                                      cursor: "help",
                                    }}
                                  >
                                    <Typography sx={{ fontSize: "12px", fontWeight: 500, color: priorityConfig.color }}>
                                      {priorityConfig.label}
                                    </Typography>
                                  </Box>
                                </Tooltip>
                              )}
                            </Box>

                            {/* Expanded content - actionable guidance */}
                            <Collapse in={isExpanded}>
                              <Box sx={{ px: "12px", pb: "12px", borderTop: `1px solid ${palette.border.light}`, pt: "12px" }}>
                                {(() => {
                                  // Group findings by type to show relevant documentation needs per type
                                  const findingsByType = item.relatedFindings.reduce(
                                    (acc, f) => {
                                      if (!acc[f.type]) acc[f.type] = [];
                                      acc[f.type].push(f);
                                      return acc;
                                    },
                                    {} as Record<string, typeof item.relatedFindings>
                                  );

                                  // Get unique documentation needs and risks per finding type
                                  const getInfoForType = (type: string) => {
                                    const findings = findingsByType[type] || [];
                                    const mappings = findings
                                      .map((f) => complianceData.mappings.find((m) => m.findingId === f.id))
                                      .filter(Boolean);
                                    return {
                                      documentationNeeds: [...new Set(mappings.flatMap((m) => m?.documentationNeeds || []))],
                                      riskFactors: [...new Set(mappings.flatMap((m) => m?.riskFactors || []))],
                                    };
                                  };

                                  const FINDING_TYPE_LABELS: Record<string, string> = {
                                    library: "AI/ML libraries",
                                    dependency: "Dependencies",
                                    api_call: "API calls",
                                    model_ref: "Model references",
                                    rag_component: "RAG components",
                                    agent: "AI agents",
                                    secret: "Secrets/credentials",
                                  };

                                  return (
                                    <Box sx={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                                      {/* Show findings grouped by type with their specific documentation needs */}
                                      {Object.entries(findingsByType).map(([type, findings]) => {
                                        const { documentationNeeds, riskFactors } = getInfoForType(type);
                                        const typeLabel = FINDING_TYPE_LABELS[type] || type;

                                        return (
                                          <Box key={type} sx={{ backgroundColor: palette.background.accent, borderRadius: "6px", p: "12px" }}>
                                            {/* Type header with count */}
                                            <Typography sx={{ fontSize: "13px", fontWeight: 600, color: palette.text.secondary, mb: "8px" }}>
                                              {typeLabel} ({findings.length})
                                            </Typography>

                                            {/* Component chips */}
                                            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, mb: documentationNeeds.length > 0 || riskFactors.length > 0 ? "12px" : 0 }}>
                                              {findings.slice(0, 10).map((finding) => (
                                                <Box
                                                  key={finding.id}
                                                  sx={{
                                                    px: "8px",
                                                    py: "4px",
                                                    borderRadius: "4px",
                                                    backgroundColor: palette.background.main,
                                                    border: `1px solid ${palette.border.light}`,
                                                    display: "flex",
                                                    alignItems: "center",
                                                    gap: "6px",
                                                  }}
                                                >
                                                  {getProviderIcon(finding.name, 14)}
                                                  <Typography sx={{ fontSize: "13px", color: palette.text.secondary }}>
                                                    {finding.name}
                                                  </Typography>
                                                </Box>
                                              ))}
                                              {findings.length > 10 && (
                                                <Typography sx={{ fontSize: "13px", color: palette.text.tertiary, alignSelf: "center" }}>
                                                  +{findings.length - 10} more
                                                </Typography>
                                              )}
                                            </Box>

                                            {/* Documentation needs for this type */}
                                            {documentationNeeds.length > 0 && (
                                              <Box sx={{ mt: "8px" }}>
                                                <Typography sx={{ fontSize: "13px", fontWeight: 500, color: palette.text.tertiary, mb: "4px" }}>
                                                  For each {typeLabel.toLowerCase()}, document:
                                                </Typography>
                                                <Box component="ul" sx={{ m: 0, pl: "16px" }}>
                                                  {documentationNeeds.map((need, idx) => (
                                                    <Typography component="li" key={idx} sx={{ fontSize: "13px", color: palette.text.tertiary }}>
                                                      {need}
                                                    </Typography>
                                                  ))}
                                                </Box>
                                              </Box>
                                            )}

                                            {/* Risk factors for this type */}
                                            {riskFactors.length > 0 && (
                                              <Box sx={{ mt: "8px" }}>
                                                <Typography sx={{ fontSize: "13px", fontWeight: 500, color: palette.status.warning.text, mb: "4px" }}>
                                                  Risks to consider:
                                                </Typography>
                                                <Box component="ul" sx={{ m: 0, pl: "16px" }}>
                                                  {riskFactors.map((risk, idx) => (
                                                    <Typography component="li" key={idx} sx={{ fontSize: "13px", color: palette.text.tertiary }}>
                                                      {risk}
                                                    </Typography>
                                                  ))}
                                                </Box>
                                              </Box>
                                            )}
                                          </Box>
                                        );
                                      })}

                                      {/* Fallback if no findings */}
                                      {item.relatedFindings.length === 0 && (
                                        <Typography sx={{ fontSize: "13px", color: palette.text.tertiary }}>
                                          This requirement applies to AI components detected in the scan. Review your implementation to ensure compliance.
                                        </Typography>
                                      )}
                                    </Box>
                                  );
                                })()}
                              </Box>
                            </Collapse>
                          </Box>
                        );
                      })}
                    </Box>
                  )}
                </Box>

                {/* Generated timestamp */}
                <Box sx={{ mt: 3, display: "flex", alignItems: "center", gap: 1 }}>
                  <Info size={14} color={palette.text.tertiary} />
                  <Typography sx={{ fontSize: "13px", color: palette.text.tertiary }}>
                    Compliance mapping generated {formatDistanceToNow(new Date(complianceData.generatedAt), { addSuffix: true })}
                  </Typography>
                </Box>
              </>
            )}
          </Box>
        )}
        {/* Vulnerabilities Tab */}
        {activeTab === "vulnerabilities" && (
          <Box sx={{ mt: "8px" }}>
            <Typography sx={{ fontSize: "13px", color: palette.text.tertiary, mb: 2 }}>
              LLM-specific vulnerability findings detected through code analysis.
              These identify insecure patterns in how AI/LLM components are used.
            </Typography>

            {/* Vulnerability Summary Cards */}
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))",
                gap: "8px",
                mb: "8px",
              }}
            >
              <StatCard
                title="Total"
                value={vulnerabilityFindings.length}
                Icon={ShieldAlert}
                tooltip="Total LLM vulnerability findings across all OWASP Top 10 for LLM types"
              />
              {([
                { type: "prompt_injection", icon: AlertCircle, tooltip: "LLM01 — Untrusted input injected into system prompts" },
                { type: "jailbreak_risk", icon: Unplug, tooltip: "LLM02 — LLM output flowing to dangerous sinks" },
                { type: "training_data_poisoning", icon: ShieldOff, tooltip: "LLM03 — Unsafe model loading or untrusted training data" },
                { type: "model_dos", icon: Timer, tooltip: "LLM04 — Missing token limits or input validation" },
                { type: "supply_chain", icon: Link2, tooltip: "LLM05 — Risky AI package versions or untrusted model sources" },
                { type: "pii_exposure", icon: Eye, tooltip: "LLM06 — PII passed to or from LLM calls without redaction" },
                { type: "insecure_plugin", icon: Plug, tooltip: "LLM07 — Plugins accepting raw input without validation" },
                { type: "excessive_agency", icon: Cpu, tooltip: "LLM08 — Agents with overly broad tool access" },
                { type: "overreliance", icon: Brain, tooltip: "LLM09 — LLM output used for decisions without validation" },
                { type: "model_theft", icon: Lock, tooltip: "LLM10 — Model weights exposed without access controls" },
              ] as const).map(({ type, icon, tooltip }) => {
                const count = vulnerabilityFindings.filter((f) => f.finding_type === type).length;
                return (
                  <StatCard
                    key={type}
                    title={VULN_TYPE_LABELS[type]?.label || type}
                    value={count}
                    Icon={icon}
                    highlight={count > 0}
                    tooltip={tooltip}
                  />
                );
              })}
            </Box>

            {/* Vulnerability Findings List */}
            {vulnerabilityFindings.length === 0 ? (
              <Box
                sx={{
                  backgroundColor: palette.status.success.bg,
                  border: `1px solid ${palette.status.success.border}`,
                  borderRadius: "4px",
                  p: 4,
                  textAlign: "center",
                }}
              >
                <Box sx={{ display: "flex", justifyContent: "center", mb: 2 }}>
                  <ShieldCheck size={48} color={palette.status.success.text} />
                </Box>
                <Typography
                  sx={{ fontSize: "13px", fontWeight: 500, color: palette.status.success.text, mb: 1 }}
                >
                  No LLM vulnerabilities detected
                </Typography>
                <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 0.5, mt: 1 }}>
                  <Info size={14} color={palette.text.tertiary} />
                  <Typography sx={{ fontSize: "13px", color: palette.text.tertiary }}>
                    Enable vulnerability scanning in settings for deep LLM analysis.
                  </Typography>
                </Box>
              </Box>
            ) : (
              <Box>
                {vulnerabilityFindings.map((finding) => (
                  <VulnerabilityFindingRow
                    key={finding.id}
                    finding={finding}
                    repositoryOwner={scan.scan.repository_owner}
                    repositoryName={scan.scan.repository_name}
                    scanId={scanId}
                    onStatusMessage={showAlert}
                  />
                ))}
              </Box>
            )}
          </Box>
        )}

      </TabContext>

      {/* AI Dependency Graph Modal */}
      <AIDepGraphModal
        open={showDepGraph}
        onClose={() => setShowDepGraph(false)}
        scanId={scanId}
        repositoryName={`${scan.scan.repository_owner}/${scan.scan.repository_name}`}
        repositoryUrl={scan.scan.repository_url}
      />
    </PageHeaderExtended>
  );
}
