import { useMemo, useState, type ReactNode } from "react";
import { Box, Stack, Typography } from "@mui/material";
import { Link as RouterLink } from "react-router";
import { CircleCheck } from "lucide-react";
import type { HomeQueueSourceId } from "../../../domain/types/homeQueue.types";
import { useHomeQueue } from "../../../application/hooks/useHomeQueue";
import { useAuth } from "../../../application/hooks/useAuth";
import { useTranslation } from "../../../application/hooks/useTranslation";
import { getTimeBasedGreeting } from "../../../application/utils/greetings";
import { fill } from "../../../i18n/fill";
import Select from "../../components/Inputs/Select";
import ListStateWrapper from "../../components/ListStateWrapper";
import { EmptyState } from "../../components/EmptyState";
import { border, brand, radiusPx, text } from "../../themes/palette";
import QueueItemRow from "./QueueItemRow";
import CountsStrip from "./CountsStrip";
import { HOME_QUEUE_SOURCE_LABELS } from "./queueItemText";

const ALL = "all";
const SOURCE_ORDER = Object.keys(HOME_QUEUE_SOURCE_LABELS) as HomeQueueSourceId[];

const noteSx = { fontSize: "13px", color: text.secondary, padding: "10px 16px" };

/**
 * Home's Today tab: what needs the signed-in user now, then the counts strip.
 * A source that failed says so instead of looking empty, and "Nothing needs
 * you" is only said when every source answered.
 */
const TodayTab = () => {
  const { t } = useTranslation();
  const { userToken } = useAuth();
  const { data, isLoading, isError } = useHomeQueue();
  const [filter, setFilter] = useState<string>(ALL);

  const firstName = userToken?.name?.trim().split(/\s+/)[0] ?? "";
  const greeting = useMemo(() => getTimeBasedGreeting(firstName).greetingText, [firstName]);

  const sources = data?.sources ?? {};
  const visibleSources = SOURCE_ORDER.filter((id) => sources[id]);
  // A refetch can drop the selected source (e.g. it is no longer visible to
  // the user): go back to All instead of filtering on a missing option.
  if (filter !== ALL && data && !sources[filter as HomeQueueSourceId]) {
    setFilter(ALL);
  }
  const inScope = (id: HomeQueueSourceId) => filter === ALL || filter === id;

  const items = (data?.items ?? []).filter((item) => inScope(item.source));
  const unavailable = visibleSources.filter(
    (id) => sources[id]?.status === "unavailable" && inScope(id),
  );

  const filterItems = [
    { _id: ALL, name: t("All") },
    ...visibleSources.map((id) => ({ _id: id, name: t(HOME_QUEUE_SOURCE_LABELS[id]) })),
  ];

  let emptyState: ReactNode = null;
  if (unavailable.length === 0) {
    emptyState =
      filter === ALL ? (
        <EmptyState
          message={t("Nothing needs you right now.")}
          imageAlt={t("Nothing needs you right now.")}
          icon={CircleCheck}
          showBorder={false}
        >
          <Typography sx={{ fontSize: "13px", textAlign: "center", color: text.secondary }}>
            <Typography
              component={RouterLink}
              to="/home?tab=get-started"
              sx={{ fontSize: "13px", color: brand.primary }}
            >
              {t("Get started")}
            </Typography>
          </Typography>
        </EmptyState>
      ) : (
        <Typography sx={noteSx}>{t("Nothing from this source needs you right now.")}</Typography>
      );
  }

  const isLoaded = !isLoading && !isError && Boolean(data);

  return (
    <Stack sx={{ gap: "20px" }} data-testid="home-today-tab">
      <Stack sx={{ gap: "4px" }}>
        <Typography component="h2" sx={{ fontSize: "20px", fontWeight: 600, color: text.primary }}>
          {firstName
            ? fill(t("{greeting}, {name}"), { greeting: t(greeting), name: firstName })
            : t(greeting)}
        </Typography>
        <Typography sx={{ fontSize: "13px", color: text.secondary }}>
          {t("Everything that needs you today, in one list.")}
        </Typography>
      </Stack>

      <Box
        component="section"
        aria-labelledby="home-queue-heading"
        sx={{ border: `1px solid ${border.dark}`, borderRadius: radiusPx.sm }}
      >
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          flexWrap="wrap"
          sx={{ gap: "8px", padding: "12px 16px", borderBottom: `1px solid ${border.dark}` }}
        >
          <Typography
            id="home-queue-heading"
            component="h3"
            sx={{ fontSize: "14px", fontWeight: 600, color: text.primary }}
          >
            {t("Needs your attention")}
            {isLoaded && (
              <Box
                component="span"
                sx={{ marginLeft: "8px", fontWeight: 500, color: text.secondary }}
              >
                {items.length}
              </Box>
            )}
          </Typography>
          {isLoaded && visibleSources.length > 0 && (
            <Stack direction="row" alignItems="center" sx={{ gap: "8px" }}>
              <Typography sx={{ fontSize: "13px", color: text.secondary }}>{t("Show")}</Typography>
              <Select
                id="home-queue-filter"
                ariaLabel={t("Filter by source")}
                value={filter}
                items={filterItems}
                onChange={(event) => setFilter(String(event.target.value))}
                sx={{ minWidth: "180px" }}
                dataTestId="home-queue-filter"
              />
            </Stack>
          )}
        </Stack>

        <ListStateWrapper
          items={items}
          isLoading={isLoading}
          errorMessage={isError ? t("Try again in a moment.") : null}
          errorTitle={t("Home couldn't be loaded")}
          loadingLabel={t("Loading your queue")}
          loadingHeight={240}
          emptyState={emptyState}
        >
          <Box>
            {items.map((item) => (
              <QueueItemRow key={item.id} item={item} />
            ))}
          </Box>
        </ListStateWrapper>

        {isLoaded && (
          <Box sx={{ borderTop: `1px solid ${border.light}` }}>
            {unavailable.map((id) => (
              <Typography key={id} sx={noteSx} data-testid={`home-queue-unavailable-${id}`}>
                {fill(t("{source} couldn't be loaded."), {
                  source: t(HOME_QUEUE_SOURCE_LABELS[id]),
                })}
              </Typography>
            ))}
            <Typography sx={noteSx}>{t("Agent approvals aren't shown here yet.")}</Typography>
          </Box>
        )}
      </Box>

      {isLoaded && data && <CountsStrip counts={data.counts} />}
    </Stack>
  );
};

export default TodayTab;
