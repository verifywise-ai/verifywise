import { useMemo, useState } from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Skeleton,
  Stack,
  Typography,
} from "@mui/material";
import { useSearchParams } from "react-router";
import { AlertCircle, CheckCircle2, ChevronDown, Info, X } from "lucide-react";
import Chip from "../../../components/Chip";
import Select from "../../../components/Inputs/Select";
import { CustomizableButton } from "../../../components/button/customizable-button";
import { textStyles } from "../../../themes/typography";
import {
  errorAlertSx,
  errorTextSx,
  sectionSx,
  summaryDescriptionSx,
  summaryHeaderSx,
  summaryTitleSx,
} from "../../RiskInheritanceGraph/DismissalAnalytics/styles";
import { alertTextSx, infoAlertSx, successAlertSx } from "../../RiskInheritanceGraph/reportStyles";
import useTranslation from "../../../../application/hooks/useTranslation";
import { useHasPermission } from "../../../../application/hooks/useMyPermissions";
import { useIsAdmin } from "../../../../application/hooks/useIsAdmin";
import {
  useAcceptFinding,
  useDismissFinding,
  useVendorResearchConfig,
  useVendorRiskFindings,
} from "../../../../application/hooks/useVendorResearch";
import type { ResearchAlert } from "../../../../application/utils/vendorResearchAlerts";
import type { VendorRiskFinding } from "../../../../domain/interfaces/i.vendorResearch";
import { fill } from "../../../../i18n/fill";
import DismissFindingModal, { type DismissalBody } from "./DismissFindingModal";
import FindingRow, { type RowAction } from "./FindingRow";
import RunSummary from "./RunSummary";

/** The URL parameter a notification link uses to open the section on one vendor. */
const VENDOR_PARAM = "findingsVendorId";
/** The most the server sends in one answer. Normally that is everything pending. */
const FINDINGS_LIMIT = 200;
/** The value of the filter option that stands for every vendor. */
const ALL_VENDORS = "all";

/** A vendor id from the URL: digits only, above zero. Anything else means all vendors. */
function parseVendorId(raw: string | null): number | null {
  if (raw === null || !/^[1-9]\d*$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) ? id : null;
}

interface VendorResearchFindingsProps {
  vendors: Array<{ id?: number; vendor_name: string }>;
  /** Opens the vendor risk that accepting a finding created. */
  onOpenRisk: (vendorRiskId: number) => void;
  /** Hands a toast to the page. */
  onNotify: (alert: ResearchAlert) => void;
}

/**
 * The risks the research agent suggested for the vendors, waiting to be accepted into the
 * register or dismissed, and (for one vendor) what its latest research run did.
 *
 * Collapsible like the insights beside it: open by default when something is pending or a
 * vendor came from the URL, closed to its header otherwise; the user's own toggle wins. The
 * findings are AI-written from web sources, so the header always says to verify them.
 */
export default function VendorResearchFindings({
  vendors,
  onOpenRisk,
  onNotify,
}: VendorResearchFindingsProps) {
  const { t } = useTranslation();
  const canEdit = useHasPermission("risks.edit");
  const isAdmin = useIsAdmin();

  // The vendor starts as the URL says. The link in a notification can also arrive while this
  // page is mounted (only the URL changes), so a new vendor in the URL is followed too.
  const [searchParams] = useSearchParams();
  const urlVendorId = parseVendorId(searchParams.get(VENDOR_PARAM));
  const [seenUrlVendorId, setSeenUrlVendorId] = useState(urlVendorId);
  const [vendorId, setVendorId] = useState(urlVendorId);
  const [openChoice, setOpenChoice] = useState<boolean | null>(null);
  const [openByDefault, setOpenByDefault] = useState(urlVendorId !== null);
  const [lastAcceptedRiskId, setLastAcceptedRiskId] = useState<number | null>(null);
  const [dismissing, setDismissing] = useState<VendorRiskFinding | null>(null);
  const [busy, setBusy] = useState<Record<number, RowAction>>({});

  if (urlVendorId !== seenUrlVendorId) {
    setSeenUrlVendorId(urlVendorId);
    if (urlVendorId !== null) {
      setVendorId(urlVendorId);
      setLastAcceptedRiskId(null);
      setOpenChoice(null);
      setOpenByDefault(true);
    }
  }

  const config = useVendorResearchConfig();
  const findings = useVendorRiskFindings({
    status: "pending",
    ...(vendorId !== null ? { vendorId } : {}),
    limit: FINDINGS_LIMIT,
  });
  const accept = useAcceptFinding();
  const dismiss = useDismissFinding();

  const rows = findings.data?.rows ?? [];
  const total = findings.data?.total ?? 0;
  // Once something is pending the section stays open by default, also when the user then picks
  // a vendor that has nothing: it must not fold up under their hands.
  if (!openByDefault && total > 0) setOpenByDefault(true);
  const expanded = openChoice ?? openByDefault;

  const notConfigured =
    config.data !== undefined && (!config.data.searchConfigured || !config.data.hasLlmKey);

  const vendorOptions = useMemo(() => {
    const named = vendors
      .filter(
        (vendor): vendor is { id: number; vendor_name: string } => typeof vendor.id === "number",
      )
      .map((vendor) => ({ _id: vendor.id, name: vendor.vendor_name }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const options: Array<{ _id: string | number; name: string }> = [
      { _id: ALL_VENDORS, name: t("All vendors") },
      ...named,
    ];
    // A vendor from the URL that the page's list does not have is still the chosen one.
    if (vendorId !== null && !named.some((vendor) => vendor._id === vendorId)) {
      options.push({ _id: vendorId, name: fill(t("Vendor {id}"), { id: vendorId }) });
    }
    return options;
  }, [vendors, vendorId, t]);
  const vendorName = vendorOptions.find((option) => option._id === vendorId)?.name ?? "";

  const setRowBusy = (id: number, action: RowAction | null) =>
    setBusy((current) => {
      const next = { ...current };
      if (action === null) delete next[id];
      else next[id] = action;
      return next;
    });

  // `mutateAsync`, not `mutate`: several rows can be in flight, and the hook's observer only
  // keeps the callbacks of the latest `mutate` call. A failure needs no message here: the
  // global error toast reports it, and the row is usable again.
  const handleAccept = async (finding: VendorRiskFinding) => {
    setRowBusy(finding.id, "accept");
    try {
      const { vendorRisk } = await accept.mutateAsync({ id: finding.id, body: {} });
      setLastAcceptedRiskId(vendorRisk.id);
      onNotify({ variant: "success", body: t("Risk added to the register") });
    } catch {
      // See above.
    } finally {
      setRowBusy(finding.id, null);
    }
  };

  const handleDismiss = async (body: DismissalBody) => {
    if (dismissing === null) return;
    const { id } = dismissing;
    setRowBusy(id, "dismiss");
    try {
      await dismiss.mutateAsync({ id, body });
      setLastAcceptedRiskId(null);
      // The modal can be closed while the request is on its way, and another finding's opened:
      // only close the modal of the finding that was just dismissed.
      setDismissing((current) => (current?.id === id ? null : current));
    } catch {
      // The modal stays open with what was entered; the global error toast reports the failure.
    } finally {
      setRowBusy(id, null);
    }
  };

  const renderFindings = () => {
    if (findings.isError) {
      return (
        <Box sx={errorAlertSx} role="alert">
          <AlertCircle size={16} />
          <Typography sx={errorTextSx}>Could not load research findings.</Typography>
          <Box sx={{ ml: "auto" }}>
            <CustomizableButton size="small" variant="text" onClick={() => void findings.refetch()}>
              Retry
            </CustomizableButton>
          </Box>
        </Box>
      );
    }
    // An empty list is only called empty or not set up once the settings are known.
    if (findings.data === undefined || (rows.length === 0 && config.isPending)) {
      return (
        <Stack role="status" aria-label="Loading research findings" sx={{ gap: "12px" }}>
          <Skeleton variant="rounded" height={120} />
          <Skeleton variant="rounded" height={120} />
        </Stack>
      );
    }
    if (rows.length > 0) {
      return (
        <Stack
          component="ul"
          aria-label="Pending research findings"
          sx={{ gap: "12px", m: 0, p: 0, listStyle: "none" }}
        >
          {rows.map((finding) => (
            <FindingRow
              key={finding.id}
              finding={finding}
              canDecide={canEdit}
              busy={busy[finding.id] ?? null}
              onAccept={(row) => void handleAccept(row)}
              onDismiss={setDismissing}
            />
          ))}
        </Stack>
      );
    }
    return (
      <Stack sx={{ alignItems: "center", gap: "4px", py: "24px", textAlign: "center" }}>
        {notConfigured ? (
          <>
            <Typography sx={{ ...textStyles.body, color: "text.secondary" }}>
              Vendor research is not set up.
            </Typography>
            {isAdmin && (
              <Typography sx={{ ...textStyles.bodySmall, color: "text.tertiary" }}>
                {fill(
                  t(
                    "Set {provider} and {key} in the server environment, and add an LLM key for your organization.",
                  ),
                  { provider: "VENDOR_RESEARCH_SEARCH_PROVIDER", key: "TAVILY_API_KEY" },
                )}
              </Typography>
            )}
          </>
        ) : (
          <Typography sx={{ ...textStyles.body, color: "text.secondary" }}>
            No pending research findings.
          </Typography>
        )}
      </Stack>
    );
  };

  return (
    <>
      <Accordion
        expanded={expanded}
        onChange={(_event, open) => setOpenChoice(open)}
        sx={sectionSx}
      >
        <AccordionSummary expandIcon={<ChevronDown size={18} />}>
          <Box sx={{ ...summaryHeaderSx, alignItems: "center" }}>
            <Typography sx={summaryTitleSx}>Research findings</Typography>
            {findings.data !== undefined && (
              <Chip
                label={fill(t("Pending: {count}"), { count: total })}
                variant={total > 0 ? "warning" : "default"}
                uppercase={false}
                size="small"
              />
            )}
            <Typography sx={summaryDescriptionSx}>
              AI-suggested from web sources. Verify before accepting.
            </Typography>
          </Box>
        </AccordionSummary>
        <AccordionDetails sx={{ p: 8 }}>
          {expanded ? (
            <Stack sx={{ gap: "16px" }}>
              {lastAcceptedRiskId !== null && (
                <Box sx={successAlertSx} role="status">
                  <CheckCircle2 size={16} />
                  <Typography sx={alertTextSx}>Risk added to the register.</Typography>
                  <Stack direction="row" sx={{ ml: "auto", alignItems: "center", gap: "4px" }}>
                    <CustomizableButton
                      size="small"
                      variant="text"
                      onClick={() => onOpenRisk(lastAcceptedRiskId)}
                    >
                      Open risk
                    </CustomizableButton>
                    <CustomizableButton
                      iconOnly
                      size="small"
                      variant="text"
                      ariaLabel="Close"
                      icon={<X size={16} />}
                      onClick={() => setLastAcceptedRiskId(null)}
                    />
                  </Stack>
                </Box>
              )}

              <Select
                id="research-findings-vendor"
                label="Vendor"
                value={vendorId ?? ALL_VENDORS}
                items={vendorOptions}
                sx={{ width: "260px" }}
                onChange={(event) => {
                  const next = event.target.value;
                  setVendorId(next === ALL_VENDORS ? null : Number(next));
                  setLastAcceptedRiskId(null);
                }}
              />

              {vendorId !== null && (
                <RunSummary
                  key={vendorId}
                  vendorId={vendorId}
                  vendorName={vendorName}
                  canStart={canEdit}
                  notConfigured={notConfigured}
                  onNotify={onNotify}
                />
              )}

              {!findings.isError && total > rows.length && (
                <Box sx={{ ...infoAlertSx, mb: 0 }}>
                  <Info size={16} />
                  <Typography sx={alertTextSx}>
                    {fill(
                      t(
                        "Showing {shown} of {total} pending findings. Choose a vendor to see the rest.",
                      ),
                      { shown: rows.length, total },
                    )}
                  </Typography>
                </Box>
              )}

              {renderFindings()}
            </Stack>
          ) : null}
        </AccordionDetails>
      </Accordion>

      {dismissing !== null && (
        <DismissFindingModal
          finding={dismissing}
          isSubmitting={busy[dismissing.id] === "dismiss"}
          onClose={() => setDismissing(null)}
          onSubmit={(body) => void handleDismiss(body)}
        />
      )}
    </>
  );
}
