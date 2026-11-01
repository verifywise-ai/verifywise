import { useState } from "react";
import { Stack, Typography } from "@mui/material";
import StandardModal from "../../../components/Modals/StandardModal";
import Select from "../../../components/Inputs/Select";
import CustomizableSkeleton from "../../../components/Skeletons";
import { textStyles } from "../../../themes/typography";
import useTranslation from "../../../../application/hooks/useTranslation";
import { useLLMKeys } from "../../../../application/hooks/useLLMKeys";
import {
  useSaveVendorResearchSettings,
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
 * vendor again (off, weekly, every two weeks or monthly; off until an Admin chooses).
 *
 * The parent mounts it only while it is open, so each opening starts from what is saved. Nothing
 * is offered before the saved choice and the keys are there, and what the person changes is kept
 * apart from what is saved, so that a choice that arrives late never overwrites a change. A
 * choice that names a key which is not in the list (deleted since) shows as the default, and is
 * saved as the default; an interval that is not one of the choices shows as off, and is saved as
 * off. Closing is the parent's call, so that a failed save leaves the window open with what was
 * chosen.
 */
export default function ResearchSettingsModal({ onClose, onNotify }: ResearchSettingsModalProps) {
  const { t } = useTranslation();
  const settings = useVendorResearchSettings();
  const { keys, loading: keysLoading } = useLLMKeys();
  const save = useSaveVendorResearchSettings();
  // What the person changed on screen. A select they did not touch shows what is saved.
  const [changes, setChanges] = useState<{
    research?: KeyChoice;
    analysis?: KeyChoice;
    scan?: ScanChoice;
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

  const keyOptions = keys.map((key) => ({
    _id: key.id,
    // The provider and the model are data, not text to translate.
    name: `${key.name} · ${key.model}`,
    noTranslate: true,
  }));

  const ready = saved !== undefined && !keysLoading;

  const handleSubmit = async () => {
    if (!ready) return;
    try {
      await save.mutateAsync({
        researchKeyId: toKeyId(research),
        analysisKeyId: toKeyId(analysis),
        scanIntervalDays: toScanDays(scan),
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
    if (saved === undefined && settings.isError) {
      return (
        <InlineError
          message="Could not load the research settings."
          onRetry={() => void settings.refetch()}
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
              "Anthropic keys search with Claude's own web search, billed by Anthropic at about $10 per 1,000 searches (about 20 to 30 a run); the search results also count as input tokens of the research model. Other keys search the news of the last 3 months through the GDELT Project at no charge.",
            )}
          </Typography>
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
