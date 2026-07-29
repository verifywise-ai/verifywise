/**
 * @fileoverview Vulnerabilities tab panel — LLM-specific vulnerability findings (OWASP Top 10 for LLM).
 *
 * @module pages/AIDetection/ScanDetails/VulnerabilitiesTab
 */

import { Box, Typography } from "@mui/material";
import {
  AlertCircle,
  Brain,
  Cpu,
  Eye,
  Info,
  Link2,
  Lock,
  Plug,
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
  Timer,
  Unplug,
} from "lucide-react";
import { StatCard } from "../../../components/Cards/StatCard";
import { Finding } from "../../../../domain/ai-detection/types";
import { palette } from "../../../themes/palette";
import { isFindingSuppressed, VULN_TYPE_LABELS } from "./scanDetailsConfig";
import { VulnerabilityFindingRow } from "./VulnerabilityFindingRow";

interface VulnerabilitiesTabProps {
  vulnerabilityFindings: Finding[];
  showSuppressed: boolean;
  scanId: number;
  repositoryOwner: string;
  repositoryName: string;
  onStatusMessage?: (variant: "success" | "error", body: string) => void;
}

const VULN_STAT_CARDS = [
  {
    type: "prompt_injection",
    icon: AlertCircle,
    tooltip: "LLM01 — Untrusted input injected into system prompts",
  },
  {
    type: "jailbreak_risk",
    icon: Unplug,
    tooltip: "LLM02 — LLM output flowing to dangerous sinks",
  },
  {
    type: "training_data_poisoning",
    icon: ShieldOff,
    tooltip: "LLM03 — Unsafe model loading or untrusted training data",
  },
  {
    type: "model_dos",
    icon: Timer,
    tooltip: "LLM04 — Missing token limits or input validation",
  },
  {
    type: "supply_chain",
    icon: Link2,
    tooltip: "LLM05 — Risky AI package versions or untrusted model sources",
  },
  {
    type: "pii_exposure",
    icon: Eye,
    tooltip: "LLM06 — PII passed to or from LLM calls without redaction",
  },
  {
    type: "insecure_plugin",
    icon: Plug,
    tooltip: "LLM07 — Plugins accepting raw input without validation",
  },
  {
    type: "excessive_agency",
    icon: Cpu,
    tooltip: "LLM08 — Agents with overly broad tool access",
  },
  {
    type: "overreliance",
    icon: Brain,
    tooltip: "LLM09 — LLM output used for decisions without validation",
  },
  {
    type: "model_theft",
    icon: Lock,
    tooltip: "LLM10 — Model weights exposed without access controls",
  },
] as const;

export function VulnerabilitiesTab({
  vulnerabilityFindings,
  showSuppressed,
  scanId,
  repositoryOwner,
  repositoryName,
  onStatusMessage,
}: VulnerabilitiesTabProps) {
  return (
    <Box sx={{ mt: "8px" }}>
      <Typography sx={{ fontSize: "13px", color: palette.text.tertiary, mb: 2 }}>
        LLM-specific vulnerability findings detected through code analysis. These identify insecure
        patterns in how AI/LLM components are used.
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
        {VULN_STAT_CARDS.map(({ type, icon, tooltip }) => {
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
            sx={{
              fontSize: "13px",
              fontWeight: 500,
              color: palette.status.success.text,
              mb: 1,
            }}
          >
            No LLM vulnerabilities detected
          </Typography>
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
              Enable vulnerability scanning in settings for deep LLM analysis.
            </Typography>
          </Box>
        </Box>
      ) : (
        <Box>
          {vulnerabilityFindings
            .filter((f) => showSuppressed || !isFindingSuppressed(f))
            .map((finding) => (
              <VulnerabilityFindingRow
                key={finding.id}
                finding={finding}
                repositoryOwner={repositoryOwner}
                repositoryName={repositoryName}
                scanId={scanId}
                onStatusMessage={onStatusMessage}
              />
            ))}
        </Box>
      )}
    </Box>
  );
}
