import { ReactNode, useState } from "react";
import { Box, Stack, Typography } from "@mui/material";
import dayjs, { Dayjs } from "dayjs";
import StatusBadge from "../StatusBadge";
import { CustomizableButton } from "../button/customizable-button";
import StandardModal from "../Modals/StandardModal";
import DatePicker from "../Inputs/Datepicker";
import Alert from "../Alert";
import useFormattedDate from "../../../application/hooks/useFormattedDate";
import { LIFECYCLE_STAGE_LABELS, LifecycleStage } from "../../../domain/enums/lifecycleStage.enum";
import { border } from "../../themes/palette";
import { lifecycleLabelSx, lifecycleValueSx } from "./lifecyclePanelStyles";

const STAGE_VARIANT = {
  [LifecycleStage.IN_REVIEW]: "warning",
  [LifecycleStage.PLANNED]: "info",
  [LifecycleStage.LIVE]: "success",
  [LifecycleStage.RETIRED]: "default",
} as const;

/** A React Query mutation, as far as the panel needs it. */
interface MutationLike<TArg> {
  mutateAsync: (arg: TArg) => Promise<unknown>;
  isPending: boolean;
}

/** Entity-specific sentences, written out at the call site so they translate. */
export interface LifecyclePanelCopy {
  staleMessage: string;
  goLiveDescription: string;
  retireTitle: string;
  retireDescription: string;
}

export interface LifecyclePanelProps {
  testId: string;
  stage: LifecycleStage;
  goLiveDate?: string | null;
  lastConfirmedAt?: string | null;
  retiredAt?: string | null;
  canManage: boolean;
  isStale: boolean;
  copy: LifecyclePanelCopy;
  goLive: MutationLike<string>;
  retire: MutationLike<void>;
  confirm: MutationLike<void>;
  /** Called after a successful change. */
  onChanged?: () => void;
  /** Extra read-only fields after the dates (e.g. a use case's department). */
  extraFields?: ReactNode;
  /** Disables the actions while the caller saves something else. */
  isBusy?: boolean;
  /** Why a planned entry can't go live yet; disables "Mark as live" and is shown beside it. */
  goLiveBlockedReason?: string;
}

/**
 * Lifecycle strip for any inventory entry (#5187 use cases, #5193 AI apps):
 * stage, dates, the stale warning, and mark as live / confirm still live /
 * retire for people who may change it.
 */
const LifecyclePanel = ({
  testId,
  stage,
  goLiveDate: savedGoLiveDate,
  lastConfirmedAt,
  retiredAt,
  canManage,
  isStale,
  copy,
  goLive,
  goLiveBlockedReason,
  retire,
  confirm,
  onChanged,
  extraFields,
  isBusy = false,
}: LifecyclePanelProps) => {
  const formatDate = useFormattedDate();
  const [modal, setModal] = useState<"go-live" | "retire" | null>(null);
  const [goLiveDate, setGoLiveDate] = useState<Dayjs | null>(dayjs());
  const [error, setError] = useState<string | null>(null);
  const busy = isBusy || goLive.isPending || retire.isPending || confirm.isPending;

  const run = async (action: () => Promise<unknown>) => {
    setError(null);
    try {
      await action();
      setModal(null);
      onChanged?.();
    } catch (err) {
      setError((err as { message?: string })?.message || "The change could not be saved.");
    }
  };

  const goLiveDateError =
    goLiveDate && goLiveDate.isAfter(dayjs(), "day")
      ? "The go-live date can't be later than today"
      : "";

  return (
    <Box
      data-testid={testId}
      sx={{
        border: `1px solid ${border.dark}`,
        borderRadius: "4px",
        p: "16px",
        mb: "24px",
        backgroundColor: "background.main",
      }}
    >
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        flexWrap="wrap"
        sx={{ gap: "16px" }}
      >
        <Stack direction="row" alignItems="center" flexWrap="wrap" sx={{ gap: "24px" }}>
          <Stack sx={{ gap: "4px" }}>
            <Typography sx={lifecycleLabelSx}>Lifecycle</Typography>
            <StatusBadge
              label={LIFECYCLE_STAGE_LABELS[stage]}
              variant={STAGE_VARIANT[stage]}
              size="small"
              uppercase={false}
            />
          </Stack>
          {savedGoLiveDate && (
            <Stack sx={{ gap: "4px" }}>
              <Typography sx={lifecycleLabelSx}>Go-live date</Typography>
              <Typography sx={lifecycleValueSx}>{formatDate(savedGoLiveDate)}</Typography>
            </Stack>
          )}
          {stage === LifecycleStage.LIVE && (
            <Stack sx={{ gap: "4px" }}>
              <Typography sx={lifecycleLabelSx}>Last confirmed live</Typography>
              <Typography sx={lifecycleValueSx}>
                {lastConfirmedAt ? formatDate(lastConfirmedAt) : "Not yet"}
              </Typography>
            </Stack>
          )}
          {stage === LifecycleStage.RETIRED && retiredAt && (
            <Stack sx={{ gap: "4px" }}>
              <Typography sx={lifecycleLabelSx}>Retired on</Typography>
              <Typography sx={lifecycleValueSx}>{formatDate(retiredAt)}</Typography>
            </Stack>
          )}
          {extraFields}
        </Stack>

        {canManage && (
          <Stack direction="row" sx={{ gap: "8px" }}>
            {stage === LifecycleStage.PLANNED && (
              <CustomizableButton
                variant="contained"
                text="Mark as live"
                testId="lifecycle-go-live-btn"
                isDisabled={busy || !!goLiveBlockedReason}
                onClick={() => {
                  setGoLiveDate(dayjs());
                  setError(null);
                  setModal("go-live");
                }}
              />
            )}
            {stage === LifecycleStage.LIVE && (
              <CustomizableButton
                variant="contained"
                text="Confirm still live"
                testId="lifecycle-confirm-btn"
                isDisabled={busy}
                onClick={() => run(() => confirm.mutateAsync())}
              />
            )}
            {(stage === LifecycleStage.PLANNED || stage === LifecycleStage.LIVE) && (
              <CustomizableButton
                variant="outlined"
                text="Retire"
                testId="lifecycle-retire-btn"
                isDisabled={busy}
                onClick={() => {
                  setError(null);
                  setModal("retire");
                }}
              />
            )}
          </Stack>
        )}
      </Stack>

      {canManage && goLiveBlockedReason && stage === LifecycleStage.PLANNED && (
        <Box sx={{ mt: "16px" }}>
          <Alert
            variant="info"
            body={goLiveBlockedReason}
            isToast={false}
            sx={{ position: "static" }}
          />
        </Box>
      )}
      {isStale && stage === LifecycleStage.LIVE && (
        <Box sx={{ mt: "16px" }}>
          <Alert
            variant="warning"
            body={copy.staleMessage}
            isToast={false}
            sx={{ position: "static" }}
          />
        </Box>
      )}
      {error && !modal && (
        <Box sx={{ mt: "16px" }}>
          <Alert variant="error" body={error} isToast={false} sx={{ position: "static" }} />
        </Box>
      )}

      <StandardModal
        isOpen={modal === "go-live"}
        onClose={() => setModal(null)}
        title="Mark as live"
        description={copy.goLiveDescription}
        submitButtonText="Mark as live"
        isSubmitting={goLive.isPending}
        isSubmitDisabled={!goLiveDate || !!goLiveDateError}
        onSubmit={() => {
          // The user's local calendar date, never a UTC conversion.
          if (goLiveDate) void run(() => goLive.mutateAsync(goLiveDate.format("YYYY-MM-DD")));
        }}
      >
        <Stack sx={{ gap: "16px" }}>
          <DatePicker
            label="Go-live date"
            isRequired
            date={goLiveDate}
            handleDateChange={(value) => setGoLiveDate(value)}
            error={goLiveDateError}
          />
          {error && (
            <Alert variant="error" body={error} isToast={false} sx={{ position: "static" }} />
          )}
        </Stack>
      </StandardModal>

      <StandardModal
        isOpen={modal === "retire"}
        onClose={() => setModal(null)}
        title={copy.retireTitle}
        description={copy.retireDescription}
        submitButtonText="Retire"
        isSubmitting={retire.isPending}
        onSubmit={() => run(() => retire.mutateAsync())}
      >
        {error ? (
          <Alert variant="error" body={error} isToast={false} sx={{ position: "static" }} />
        ) : null}
      </StandardModal>
    </Box>
  );
};

export default LifecyclePanel;
