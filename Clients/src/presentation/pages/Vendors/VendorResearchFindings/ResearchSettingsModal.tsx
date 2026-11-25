import { useState } from "react";
import { useNavigate } from "react-router";
import { Box, Stack, Typography } from "@mui/material";
import { AlertTriangle, Info } from "lucide-react";
import StandardModal from "../../../components/Modals/StandardModal";
import Select from "../../../components/Inputs/Select";
import Toggle from "../../../components/Inputs/Toggle";
import CustomizableSkeleton from "../../../components/Skeletons";
import { VWLink } from "../../../components/Link";
import { textStyles } from "../../../themes/typography";
import useTranslation from "../../../../application/hooks/useTranslation";
import { useLLMKeys } from "../../../../application/hooks/useLLMKeys";
import { SEARCH_KEY_CREATE_PATH } from "../../../../application/constants/llmKeyDeepLink";
import {
  useSaveVendorResearchSettings,
  useVendorResearchConfig,
  useVendorResearchSearchStatus,
  useVendorResearchSettings,
} from "../../../../application/hooks/useVendorResearch";
import { readVendorResearchError } from "../../../../application/repository/vendorResearch.repository";
import type { ResearchAlert } from "../../../../application/utils/vendorResearchAlerts";
import InlineError from "./InlineError";

/** The value of the option that leaves a key to the default; a key is its id. */
const DEFAULT_KEY = "default";
type KeyChoice = number | typeof DEFAULT_KEY;

const toChoice = (value: unknown): KeyChoice =>
  value === DEFAULT_KEY ? DEFAULT_KEY : Number(value);
const toKeyId = (choice: KeyChoice): number | null => (choice === DEFAULT_KEY ? null : choice);

/** The value of the option that turns the scheduled scan off; an interval is its days. */
const SCAN_OFF = "off";
type ScanChoice = number | typeof SCAN_OFF;

/** The intervals the server takes, with the words for each. */
const SCAN_INTERVALS: Array<{ days: number; name: string }> = [
  { days: 7, name: "Every week" },
  { days: 14, name: "Every 2 weeks" },
  { days: 30, name: "Every month" },
];

const toScanChoice = (value: unknown): ScanChoice =>
  value === SCAN_OFF ? SCAN_OFF : Number(value);
const toScanDays = (choice: ScanChoice): number | null => (choice === SCAN_OFF ? null : choice);

interface ResearchSettingsModalProps {
  onClose: () => void;
  /** Hands a toast to the page. */
  onNotify: (alert: ResearchAlert) => void;
}

/**
 * Where an Admin picks the LLM keys the vendor research uses: one for the research loop, which
 * makes many small calls, and one for the analysis that writes the risks, which makes one large
 * call. Each can be left to the default (the newest key for the research, the research key for
 * the analysis). Under the research key it says which search each kind of key gets and what a
 * provider's search costs. The same window sets how often the scheduled scan researches every
 * vendor again (off, weekly, every two weeks or monthly; off until an Admin chooses), and whether a
 * new vendor is researched as soon as it is added (on until an Admin turns it off). When the
 * deployment turned the automatic research off (VENDOR_RESEARCH_AUTO_RUN), that switch is shown
 * disabled with a note, and the saved choice is sent back unchanged.
 *
 * Under the research key a line says where its news comes from (the server says which, see
 * `useVendorResearchSearchStatus`). A key searched with Brave (any key but an Anthropic key, when
 * the organization has a Brave search key) gets a quiet line saying so. A key that gets its news
 * from GDELT alone gets a line saying that GDELT can refuse a server, so that a run then finds no
 * news; when the organization's latest runs that say something about the news all got none, the
 * line becomes a warning. It points to the Brave search key form in Settings (a link only while
 * nothing is unsaved, since leaving drops the changes), and to an Anthropic key of the list when
 * there is one. A status that could not be read shows no line.
 *
 * The parent mounts it only while it is open, so each opening starts from what is saved. Nothing
 * is offered before the saved choice and the keys are there, and what the person changes is kept
 * apart from what is saved, so that a choice that arrives late never overwrites a change. A
 * choice that names a key which is not in the list (deleted since) shows as the default, and is
 * saved as the default; a list of keys that could not be read offers nothing and saves nothing,
 * so that it never resets the saved keys; an interval that is not one of the choices shows as off, and is saved as
 * off. Closing is the parent's call, so that a failed save leaves the window open with what was
 * chosen.
 */
export default function ResearchSettingsModal({ onClose, onNotify }: ResearchSettingsModalProps) {
  const { t } = useTranslation();
  const settings = useVendorResearchSettings();
  const {
    keys,
    loading: keysLoading,
    isError: keysFailed,
    isFetching: keysFetching,
    unread: keysUnread,
    refetch: refetchKeys,
  } = useLLMKeys();
  const config = useVendorResearchConfig();
  const searchStatus = useVendorResearchSearchStatus();
  const navigate = useNavigate();
  const save = useSaveVendorResearchSettings();
  // What the person changed on screen. A select they did not touch shows what is saved.
  const [changes, setChanges] = useState<{
    research?: KeyChoice;
    analysis?: KeyChoice;
    scan?: ScanChoice;
    autoResearch?: boolean;
  }>({});

  const saved = settings.data;
  const shown = (changed: KeyChoice | undefined, savedId: number | null | undefined): KeyChoice => {
    const wanted = changed ?? savedId ?? DEFAULT_KEY;
    return typeof wanted === "number" && keys.some((key) => key.id === wanted)
      ? wanted
      : DEFAULT_KEY;
  };
  const research = shown(changes.research, saved?.researchKeyId);
  const analysis = shown(changes.analysis, saved?.analysisKeyId);
  const wantedScan = changes.scan ?? saved?.scanIntervalDays ?? SCAN_OFF;
  const scan: ScanChoice = SCAN_INTERVALS.some((interval) => interval.days === wantedScan)
    ? wantedScan
    : SCAN_OFF;
  const autoResearch = changes.autoResearch ?? saved?.autoResearchOnCreate ?? true;
  // Until the config is read the switch is offered: the server applies the deployment's switch.
  const autoRunAllowed = config.data?.autoRunAllowed ?? true;

  // The search of the research key on screen; undefined until the server has said.
  const engines = searchStatus.data?.engines;
  const researchEngine = research === DEFAULT_KEY ? engines?.default : engines?.byKey[research];
  const hasAnthropicKey = keys.some((key) => engines?.byKey[key.id] === "anthropic");
  const noRecentNews = searchStatus.data?.recentRunsFoundNoNews === true;
  const braveConfigured = searchStatus.data?.braveConfigured === true;
  // Leaving for the search key form would drop what was changed here, so the link is offered only
  // while nothing is unsaved.
  const unsaved = Object.keys(changes).length > 0;

  const keyOptions = keys.map((key) => ({
    _id: key.id,
    // The provider and the model are data, not text to translate.
    name: `${key.name} · ${key.model}`,
    noTranslate: true,
  }));

  // A list of keys that could not be read is not a list without the saved keys: it would show
  // them as the default, and saving would write the default over them. Nothing is offered until
  // a list has been read, also while one that failed is asked for again.
  const ready = saved !== undefined && !keysLoading && !keysFailed && !keysUnread;

  const handleSubmit = async () => {
    if (!ready) return;
    try {
      await save.mutateAsync({
        researchKeyId: toKeyId(research),
        analysisKeyId: toKeyId(analysis),
        scanIntervalDays: toScanDays(scan),
        autoResearchOnCreate: autoResearch,
      });
    } catch (error) {
      // The window stays open with what was chosen. The global error toast reports every failure
      // but a 404, which it skips on purpose, so nothing else says why nothing was saved.
      if (readVendorResearchError(error).status === 404) {
        onNotify({
          variant: "warning",
          body: t("One of the chosen LLM keys no longer exists. Choose the keys again."),
        });
      }
      return;
    }
    onNotify({ variant: "success", body: t("Research settings saved.") });
    onClose();
  };

  const renderBody = () => {
    // The keys are part of the settings: without them the window says it could not load them,
    // and Retry reads again whichever of the two failed.
    const settingsFailed = saved === undefined && settings.isError;
    if (settingsFailed || (keysFailed && !keysFetching)) {
      return (
        <InlineError
          message="Could not load the research settings."
          onRetry={() => {
            if (settingsFailed) void settings.refetch();
            if (keysFailed) void refetchKeys();
          }}
        />
      );
    }
    if (!ready) {
      return (
        <Stack role="status" aria-label="Loading research settings" sx={{ gap: "16px" }}>
          <CustomizableSkeleton variant="rounded" width="100%" height={56} />
          <CustomizableSkeleton variant="rounded" width="100%" height={56} />
          <CustomizableSkeleton variant="rounded" width="100%" height={56} />
        </Stack>
      );
    }
    return (
      <Stack sx={{ gap: "16px" }}>
        <Stack sx={{ gap: "8px" }}>
          <Select
            id="research-settings-research-key"
            label="Research key"
            value={research}
            items={[{ _id: DEFAULT_KEY, name: t("Newest key (default)") }, ...keyOptions]}
            onChange={(event) =>
              setChanges((current) => ({ ...current, research: toChoice(event.target.value) }))
            }
          />
          {/* The search a run gets depends on the kind of key it researches with. */}
          <Typography sx={{ ...textStyles.bodySmall, color: "text.tertiary" }}>
            {t(
              "Anthropic keys search with Claude's own web search, billed by Anthropic at about $10 per 1,000 searches (about 20 to 30 a run); the search results also count as input tokens of the research model. Other keys search the news with Brave when the organization has a Brave search key, and otherwise the news of the last 3 months through the GDELT Project at no charge.",
            )}
          </Typography>
          {researchEngine === "brave" && (
            <Stack
              role="status"
              data-testid="research-settings-news-notice"
              direction="row"
              sx={{ alignItems: "flex-start", gap: "6px", color: "text.secondary" }}
            >
              <Box component="span" sx={{ display: "inline-flex", mt: "2px", flexShrink: 0 }}>
                <Info size={14} strokeWidth={1.5} aria-hidden="true" />
              </Box>
              <Typography sx={{ ...textStyles.bodySmall, color: "inherit" }}>
                {t("News is searched with Brave.")}
              </Typography>
            </Stack>
          )}
          {researchEngine === "gdelt" && (
            <Stack
              role="status"
              data-testid="research-settings-news-notice"
              direction="row"
              sx={{
                alignItems: "flex-start",
                gap: "6px",
                color: noRecentNews ? "status.warning.text" : "text.secondary",
              }}
            >
              <Box component="span" sx={{ display: "inline-flex", mt: "2px", flexShrink: 0 }}>
                {noRecentNews ? (
                  <AlertTriangle size={14} strokeWidth={1.5} aria-hidden="true" />
                ) : (
                  <Info size={14} strokeWidth={1.5} aria-hidden="true" />
                )}
              </Box>
              <Typography sx={{ ...textStyles.bodySmall, color: "inherit" }}>
                {noRecentNews && `${t("Recent research runs got no news.")} `}
                {t("This key gets news only from GDELT, which sometimes refuses requests.")}
                {/* A Brave key the status already counts and a GDELT key still on screen: the
                    status is older than the key, so only the Anthropic key is offered. */}
                {braveConfigured ? (
                  hasAnthropicKey && <> {t("Choose an Anthropic key for more reliable news.")}</>
                ) : (
                  <>
                    {" "}
                    {unsaved ? (
                      t("Save, then add a Brave search key for more reliable news.")
                    ) : (
                      <VWLink
                        onClick={() => navigate(SEARCH_KEY_CREATE_PATH)}
                        sx={{ fontSize: "inherit", verticalAlign: "baseline" }}
                        testId="research-settings-add-search-key"
                      >
                        {t("Add a Brave search key for more reliable news")}
                      </VWLink>
                    )}
                    {hasAnthropicKey && <> {t("Or choose an Anthropic key.")}</>}
                  </>
                )}
              </Typography>
            </Stack>
          )}
        </Stack>
        <Select
          id="research-settings-analysis-key"
          label="Analysis key"
          value={analysis}
          items={[
            { _id: DEFAULT_KEY, name: t("Same as the research key (default)") },
            ...keyOptions,
          ]}
          onChange={(event) =>
            setChanges((current) => ({ ...current, analysis: toChoice(event.target.value) }))
          }
        />
        <Stack sx={{ gap: "8px" }}>
          <Select
            id="research-settings-scan"
            label="Scheduled scan"
            value={scan}
            items={[
              { _id: SCAN_OFF, name: t("Off") },
              ...SCAN_INTERVALS.map((interval) => ({ _id: interval.days, name: t(interval.name) })),
            ]}
            onChange={(event) =>
              setChanges((current) => ({ ...current, scan: toScanChoice(event.target.value) }))
            }
          />
          <Typography sx={{ ...textStyles.bodySmall, color: "text.tertiary" }}>
            {t(
              "A scheduled scan researches every vendor again on this schedule and tells its assignee when it finds something. It analyses only sources it has not seen before, and it uses the keys above.",
            )}
          </Typography>
        </Stack>
        <Stack sx={{ gap: "8px" }}>
          <Stack
            direction="row"
            sx={{ alignItems: "center", justifyContent: "space-between", gap: "16px" }}
          >
            <Typography sx={{ ...textStyles.formLabel, color: "text.primary" }}>
              {t("Research new vendors automatically")}
            </Typography>
            <Toggle
              ariaLabel={t("Research new vendors automatically")}
              checked={autoResearch}
              disabled={!autoRunAllowed}
              onChange={(event) =>
                setChanges((current) => ({ ...current, autoResearch: event.target.checked }))
              }
            />
          </Stack>
          <Typography sx={{ ...textStyles.bodySmall, color: "text.tertiary" }}>
            {autoRunAllowed
              ? t("Starts a research run when a vendor is added. Each run uses the keys above.")
              : t("Automatic research is turned off for this deployment.")}
          </Typography>
        </Stack>
      </Stack>
    );
  };

  return (
    <StandardModal
      isOpen
      onClose={onClose}
      title="Research settings"
      description="Choose which LLM key runs the vendor research. The research key makes many small calls, so a fast, inexpensive model is enough. The analysis key writes the risks from what the research found, once per run, so a stronger model can help."
      onSubmit={() => void handleSubmit()}
      submitButtonText="Save"
      isSubmitting={save.isPending}
      isSubmitDisabled={!ready}
      maxWidth="560px"
    >
      {renderBody()}
    </StandardModal>
  );
}
