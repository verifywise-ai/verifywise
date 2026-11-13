/**
 * @fileoverview Vulnerabilities tab panel — LLM-specific vulnerability findings (OWASP Top 10 for LLM).
 *
 * @module pages/AIDetection/ScanDetails/VulnerabilitiesTab
 */

import { Box, Typography } from "@mui/material";
import { useNavigate } from "react-router";
import {
  AlertCircle,
  Brain,
  CircleSlash,
  Cpu,
  Eye,
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
import { CustomizableButton } from "../../../components/button/customizable-button";
import { Finding, VulnerabilityCheckStatus } from "../../../../domain/ai-detection/types";
import { palette } from "../../../themes/palette";
import { VULNERABILITY_SETTINGS_PATH, vulnerabilityChecksRan } from "../components/governanceScore";
import { isFindingSuppressed, VULN_TYPE_LABELS } from "./scanDetailsConfig";
import { VulnerabilityFindingRow } from "./VulnerabilityFindingRow";

interface VulnerabilitiesTabProps {
  vulnerabilityFindings: Finding[];
  showSuppressed: boolean;
  scanId: number;
  repositoryOwner: string;
  repositoryName: string;
  vulnerabilityCheckStatus?: VulnerabilityCheckStatus | null;
  onStatusMessage?: (variant: "success" | "error", body: string) => void;
}

/** Why checks didn't run, and whether the settings link helps */
function notCheckedCopy(status: VulnerabilityCheckStatus | null | undefined): {
  headline: string;
  detail: string;
  showSettingsLink: boolean;
} {
  switch (status) {
    case "failed":
      return {
        headline: "Vulnerability checks didn't run for this scan",
        detail: "The LLM analysis couldn't run. Check the LLM key in Settings, then scan again.",
        showSettingsLink: true,
      };
    case "incremental":
      return {
        headline: "Vulnerability checks didn't run for this scan",
        detail:
          "Incremental scans skip vulnerability checks. Run a full scan to check this repository.",
        showSettingsLink: false,
      };
    case "off":
      return {
        headline: "Vulnerability checks didn't run for this scan",
        detail:
          "Vulnerability detection is off, or AI detection has no LLM key. Turn it on in Settings, then scan again.",
        showSettingsLink: true,
      };
    default:
      return {
        headline: "No vulnerability check recorded for this scan",
        detail: "This scan doesn't record whether vulnerability checks ran. Scan again to check.",
        showSettingsLink: true,
      };
  }
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
  vulnerabilityCheckStatus,
  onStatusMessage,
}: VulnerabilitiesTabProps) {
  const navigate = useNavigate();
  const checked = vulnerabilityChecksRan(vulnerabilityCheckStatus, vulnerabilityFindings.length);
  const notChecked = notCheckedCopy(vulnerabilityCheckStatus);

  return (
    <Box sx={{ mt: "8px" }}>
      <Typography sx={{ fontSize: "13px", color: palette.text.tertiary, mb: "16px" }}>
        LLM-specific vulnerability findings detected through code analysis. These identify insecure
        patterns in how AI/LLM components are used.
      </Typography>

      {/* Not checked: neutral state, no zero tiles that would read as "clean" */}
      {!checked && (
        <Box
          sx={{
            backgroundColor: palette.background.accent,
            border: `1px solid ${palette.border.dark}`,
            borderRadius: "4px",
            p: "16px",
            mb: vulnerabilityFindings.length > 0 ? "16px" : 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            textAlign: "center",
            gap: "8px",
          }}
        >
          <CircleSlash size={32} color={palette.text.tertiary} strokeWidth={1.5} />
          <Typography sx={{ fontSize: "13px", fontWeight: 500, color: palette.text.primary }}>
            {notChecked.headline}
          </Typography>
          <Typography sx={{ fontSize: "13px", color: palette.text.tertiary }}>
            {notChecked.detail}
          </Typography>
          {notChecked.showSettingsLink && (
            <CustomizableButton
              text="Open vulnerability settings"
              variant="outlined"
              onClick={() => navigate(VULNERABILITY_SETTINGS_PATH)}
            />
          )}
        </Box>
      )}

      {/* Vulnerability Summary Cards */}
      {(checked || vulnerabilityFindings.length > 0) && (
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
      )}

      {/* Vulnerability Findings List */}
      {vulnerabilityFindings.length === 0 ? (
        checked && (
          <Box
            sx={{
              backgroundColor: palette.status.success.bg,
              border: `1px solid ${palette.status.success.border}`,
              borderRadius: "4px",
              p: "32px",
              textAlign: "center",
            }}
          >
            <Box sx={{ display: "flex", justifyContent: "center", mb: "16px" }}>
              <ShieldCheck size={48} color={palette.status.success.text} />
            </Box>
            <Typography
              sx={{
                fontSize: "13px",
                fontWeight: 500,
                color: palette.status.success.text,
              }}
            >
              No LLM vulnerabilities detected
            </Typography>
          </Box>
        )
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
