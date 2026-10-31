import { useEffect, useMemo, useRef, useState } from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Stack,
  Typography,
} from "@mui/material";
import { useSearchParams } from "react-router";
import { CheckCircle2, ChevronDown, Info, Settings2, X } from "lucide-react";
import Chip from "../../../components/Chip";
import Select from "../../../components/Inputs/Select";
import CustomizableSkeleton from "../../../components/Skeletons";
import { CustomizableButton } from "../../../components/button/customizable-button";
import AddNewRisk from "../../../components/Modals/NewRisk";
import { textStyles } from "../../../themes/typography";
import {
  sectionSx,
  summaryDescriptionSx,
  summaryHeaderSx,
  summaryTitleSx,
} from "../../RiskInheritanceGraph/DismissalAnalytics/styles";
import { alertTextSx, infoAlertSx, successAlertSx } from "../../RiskInheritanceGraph/reportStyles";
import useTranslation from "../../../../application/hooks/useTranslation";
import { useAuth } from "../../../../application/hooks/useAuth";
import useUsers from "../../../../application/hooks/useUsers";
import { useHasPermission } from "../../../../application/hooks/useMyPermissions";
import { useIsAdmin } from "../../../../application/hooks/useIsAdmin";
import {
  useAcceptFinding,
  useDismissFinding,
  useFollowedResearchVendor,
  useVendorResearchConfig,
  useVendorRiskFindings,
} from "../../../../application/hooks/useVendorResearch";
import { readVendorResearchError } from "../../../../application/repository/vendorResearch.repository";
import type { ResearchAlert } from "../../../../application/utils/vendorResearchAlerts";
import {
  defaultActionOwner,
  toAcceptBody,
} from "../../../../application/utils/vendorResearchPreview";
import type {
  VendorRiskFormDetails,
  VendorRiskPreview,
} from "../../../../domain/interfaces/i.vendor";
import type { VendorRiskFinding } from "../../../../domain/interfaces/i.vendorResearch";
import { fill } from "../../../../i18n/fill";
import DismissFindingModal, { type DismissalBody } from "./DismissFindingModal";
import FindingRow, { type RowAction } from "./FindingRow";
import InlineError from "./InlineError";
import { parseVendorId } from "./parseVendorId";
import ResearchSettingsModal from "./ResearchSettingsModal";
import RunSummary from "./RunSummary";
import { controlHeightSx, iconControlSx } from "./styles";

/** The URL parameter a notification link uses to open the section on one vendor. */
const VENDOR_PARAM = "findingsVendorId";
/** The most the server sends in one answer. Normally that is everything pending. */
const FINDINGS_LIMIT = 200;
/** The value of the filter option that stands for every vendor. */
const ALL_VENDORS = "all";

interface VendorResearchFindingsProps {
  /** The vendor's assignee is the owner a preview starts on, when that user is in the organization. */
  vendors: Array<{ id?: number; vendor_name: string; assignee?: number | null }>;
  /** Opens the vendor risk that accepting a finding created. */
  onOpenRisk: (vendorRiskId: number) => void;
  /** Hands a toast to the page. */
  onNotify: (alert: ResearchAlert) => void;
}

/**
 * The risks the research agent suggested for the vendors, waiting to be added to the register
 * or dismissed, and (for one vendor) what its latest research run did.
 *
 * A finding is added through the vendor risk form: Preview opens the form on the finding, and
 * saving there accepts it with what is on screen, in one request. Closing the form changes
 * nothing, and the finding stays pending.
 *
 * Collapsible like the insights beside it: open by default when something is pending, a vendor
 * came from the URL, or a run was followed from the vendors table, closed to its header
 * otherwise; the user's own toggle wins. The findings are AI-written from web sources, so the
 * header always says to verify them.
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
  // page is mounted (only the URL changes), so a new vendor in the URL is followed too. With no
  // vendor in the URL, the vendor of a run just started on the vendors table is the one: that
  // table cannot show the run finish, so the button left the vendor here. The URL wins.
  const [searchParams] = useSearchParams();
  const urlVendorId = parseVendorId(searchParams.get(VENDOR_PARAM));
  const followedVendorId = useFollowedResearchVendor();
  const initialVendorId = urlVendorId ?? followedVendorId;
  const [seenUrlVendorId, setSeenUrlVendorId] = useState(urlVendorId);
  const [vendorId, setVendorId] = useState(initialVendorId);
  const [openChoice, setOpenChoice] = useState<boolean | null>(null);
  const [openByDefault, setOpenByDefault] = useState(initialVendorId !== null);
  const [lastAcceptedRiskId, setLastAcceptedRiskId] = useState<number | null>(null);
  const [dismissing, setDismissing] = useState<VendorRiskFinding | null>(null);
  // The window where an Admin picks the LLM keys. It reads nothing until it is open.
  const [settingsOpen, setSettingsOpen] = useState(false);
  // The finding the vendor risk form is open on. Nothing is written until the person saves there.
  const [previewing, setPreviewing] = useState<VendorRiskFinding | null>(null);
  const [busy, setBusy] = useState<Record<number, RowAction>>({});
  // A decision has been answered (it worked, or it was refused) and the section waits for the
  // list to show what became of the finding. `around` are the rows next to it, nearest first.
  const [answered, setAnswered] = useState<{ id: number; around: number[] } | null>(null);
  // The rows on screen, by finding, and the heading of the section: the places focus is sent to.
  const rowElements = useRef(new Map<number, HTMLLIElement>());
  const headingElement = useRef<HTMLElement | null>(null);

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
  const { userId } = useAuth();
  const { users } = useUsers();

  const rows = findings.data?.rows ?? [];
  const total = findings.data?.total ?? 0;
  // Once something is pending the section stays open by default, also when the user then picks
  // a vendor that has nothing: it must not fold up under their hands.
  if (!openByDefault && total > 0) setOpenByDefault(true);
  const expanded = openChoice ?? openByDefault;

  const notConfigured = config.data !== undefined && !config.data.hasLlmKey;
  // Only an Admin chooses the keys (the server refuses everyone else), and there is nothing to
  // choose from until the organization has one.
  const canChooseKeys = isAdmin && config.data?.hasLlmKey === true;

  const vendorOptions = useMemo(() => {
    const named = vendors
      .filter(
        (vendor): vendor is { id: number; vendor_name: string } => typeof vendor.id === "number",
      )
      // A vendor's name is the user's own text: a vendor called "Other" must not be translated.
      .map((vendor) => ({ _id: vendor.id, name: vendor.vendor_name, noTranslate: true }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const options: Array<{ _id: string | number; name: string; noTranslate?: boolean }> = [
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

  /** The rows next to a finding, nearest first: the ones after it, then the ones before it. */
  const rowsAround = (id: number): number[] => {
    const index = rows.findIndex((row) => row.id === id);
    if (index === -1) return [];
    return [...rows.slice(index + 1), ...rows.slice(0, index).reverse()].map((row) => row.id);
  };

  /**
   * A 404 says the finding is gone (another user deleted its vendor, say). The global error
   * toast skips a 404 on purpose, so nothing else tells the user why their click did nothing.
   */
  const noteIfGone = (error: unknown) => {
    if (readVendorResearchError(error).status === 404) {
      onNotify({ variant: "warning", body: t("This finding no longer exists.") });
    }
  };

  // `mutateAsync`, not `mutate`: several rows can be in flight, and the hook's observer only
  // keeps the callbacks of the latest `mutate` call. A failure is thrown on, so that the form
  // stays open with what the person entered; it needs no message here, because the global error
  // toast reports it, except a 404, which that toast skips (see `noteIfGone`).
  const handlePreviewSave = async (
    finding: VendorRiskFinding,
    details: VendorRiskFormDetails,
  ): Promise<number> => {
    // The notice is about an earlier accept: it goes when the next decision starts, not only
    // when that one succeeds, so a refused request does not leave the old notice standing.
    setLastAcceptedRiskId(null);
    setRowBusy(finding.id, "accept");
    const around = rowsAround(finding.id);
    try {
      const { vendorRisk } = await accept.mutateAsync({
        id: finding.id,
        body: toAcceptBody(details),
      });
      setLastAcceptedRiskId(vendorRisk.id);
      onNotify({ variant: "success", body: t("Risk added to the register") });
      return vendorRisk.id;
    } catch (error) {
      noteIfGone(error);
      throw error;
    } finally {
      setRowBusy(finding.id, null);
      setAnswered({ id: finding.id, around });
    }
  };
  // The form keeps the callback it was opened with, which would not see the rows that came in
  // since: it calls through here.
  const savePreview = useRef(handlePreviewSave);
  savePreview.current = handlePreviewSave;

  /** The finding as the vendor risk form opens on it. */
  const previewOf = (finding: VendorRiskFinding): VendorRiskPreview => ({
    key: finding.id,
    title: t("Review suggested risk"),
    description: t(
      "Suggested by the research agent from web sources. Check the details, change what is not right, then save to add this risk to the vendor risk register.",
    ),
    values: {
      vendor_id: finding.vendor_id,
      risk_description: finding.risk_description,
      impact_description: finding.impact_description,
      action_plan: finding.action_plan,
      likelihood: finding.likelihood,
      risk_severity: finding.risk_severity,
      action_owner: defaultActionOwner(
        vendors.find((vendor) => vendor.id === finding.vendor_id)?.assignee,
        users,
        userId,
      ),
    },
    onSave: (details) => savePreview.current(finding, details),
  });

  const handleDismiss = async (body: DismissalBody) => {
    if (dismissing === null) return;
    const { id } = dismissing;
    const around = rowsAround(id);
    setLastAcceptedRiskId(null);
    setRowBusy(id, "dismiss");
    try {
      await dismiss.mutateAsync({ id, body });
      // The modal can be closed while the request is on its way, and another finding's opened:
      // only close the modal of the finding that was just dismissed.
      setDismissing((current) => (current?.id === id ? null : current));
      // Nothing on screen says it worked but the row going: this is for those who do not see it.
      onNotify({ variant: "success", body: t("Finding dismissed.") });
    } catch (error) {
      // The modal stays open with what was entered, unless the finding has left the list
      // (see below). The global error toast reports the failure, except a 404.
      noteIfGone(error);
    } finally {
      setRowBusy(id, null);
      setAnswered({ id, around });
    }
  };

  // Once the list has been read again after a decision, the section settles. The answer arrives
  // after the refresh the decision started (the mutation waits for it), so the list rendered
  // here is the one that shows what became of the finding.
  useEffect(() => {
    if (answered === null || findings.isFetching) return;
    // A modal about a finding that has left the pending list (decided here or elsewhere, or
    // deleted) has nothing left to decide, so it closes. This is about the modal, not about the
    // decision that was answered: two answers can land in one flush, and then only the last one
    // is kept in `answered`, which may be about another finding. A modal whose finding is still
    // listed keeps what the user entered (a 409 for "another decision is in progress" leaves the
    // finding where it was, and a retry can succeed), and one whose own request is on its way is
    // left to that answer. This runs again once the modal has closed, because it gives focus
    // back to the button it was opened from as it goes, and that is the row that is gone.
    if (
      dismissing !== null &&
      busy[dismissing.id] === undefined &&
      !rows.some((row) => row.id === dismissing.id)
    ) {
      setDismissing(null);
      return;
    }
    // The same for the vendor risk form: a finding that someone else decided, or that was
    // deleted, cannot be saved any more.
    if (
      previewing !== null &&
      busy[previewing.id] === undefined &&
      !rows.some((row) => row.id === previewing.id)
    ) {
      setPreviewing(null);
      return;
    }
    const { id, around } = answered;
    // Still pending: nothing more to settle.
    if (rows.some((row) => row.id === id)) {
      setAnswered(null);
      return;
    }
    setAnswered(null);
    // Keyboard focus was on the decided row, or on the modal that was about it, and has fallen to
    // the page: send it to the first button of the row that took the place, so that the next Tab
    // does not start from the top of the page. If the user has moved on, it stays where they put it.
    if (document.activeElement !== null && document.activeElement !== document.body) return;
    const target = around
      .map((rowId) =>
        rowElements.current.get(rowId)?.querySelector<HTMLElement>("button:not(:disabled)"),
      )
      .find((button): button is HTMLElement => button != null);
    (target ?? headingElement.current)?.focus();
  }, [answered, findings.isFetching, rows, dismissing, previewing, busy]);

  const renderFindings = () => {
    if (findings.isError) {
      return (
        <InlineError
          message="Could not load research findings."
          onRetry={() => void findings.refetch()}
        />
      );
    }
    // An empty list is only called empty or not set up once the settings are known.
    if (findings.data === undefined || (rows.length === 0 && config.isPending)) {
      return (
        <Stack role="status" aria-label="Loading research findings">
          <CustomizableSkeleton variant="rounded" width="100%" height={120} />
          <CustomizableSkeleton variant="rounded" width="100%" height={120} />
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
              onPreview={setPreviewing}
              onDismiss={setDismissing}
              rowRef={(element) => {
                if (element) rowElements.current.set(finding.id, element);
                else rowElements.current.delete(finding.id);
              }}
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
                {t("Add an LLM key under Settings → API Keys, in the LLM Keys section.")}
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
            {/* Focus goes here when the last pending finding has been decided. */}
            <Typography ref={headingElement} tabIndex={-1} sx={summaryTitleSx}>
              Research findings
            </Typography>
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
                      sx={controlHeightSx}
                      onClick={() => onOpenRisk(lastAcceptedRiskId)}
                    >
                      Open risk
                    </CustomizableButton>
                    <CustomizableButton
                      iconOnly
                      size="small"
                      variant="text"
                      sx={iconControlSx}
                      ariaLabel="Close"
                      icon={<X size={16} />}
                      onClick={() => setLastAcceptedRiskId(null)}
                    />
                  </Stack>
                </Box>
              )}

              <Stack
                direction="row"
                sx={{
                  alignItems: "flex-end",
                  justifyContent: "space-between",
                  gap: "12px",
                  flexWrap: "wrap",
                }}
              >
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
                {canChooseKeys && (
                  <CustomizableButton
                    variant="outlined"
                    startIcon={<Settings2 size={16} />}
                    onClick={() => setSettingsOpen(true)}
                    sx={controlHeightSx}
                  >
                    Research settings
                  </CustomizableButton>
                )}
              </Stack>

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

      {settingsOpen && canChooseKeys && (
        <ResearchSettingsModal onClose={() => setSettingsOpen(false)} onNotify={onNotify} />
      )}

      {dismissing !== null && (
        <DismissFindingModal
          finding={dismissing}
          isSubmitting={busy[dismissing.id] === "dismiss"}
          onClose={() => setDismissing(null)}
          onSubmit={(body) => void handleDismiss(body)}
        />
      )}

      {/* Always mounted, like the page's own: a message it shows after it has closed (custom
          field values that did not save) has to outlive the form. */}
      <AddNewRisk
        isOpen={previewing !== null}
        setIsOpen={() => setPreviewing(null)}
        vendors={vendors}
        preview={previewing !== null ? previewOf(previewing) : null}
      />
    </>
  );
}
