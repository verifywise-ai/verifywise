import type { HomeQueueItem, HomeQueueSourceId } from "../../../domain/types/homeQueue.types";
import { getLanguage } from "../../../i18n/domTranslator";
import { fill, pluralKey } from "../../../i18n/fill";

type Translate = (key: string) => string;

export interface QueueItemText {
  title: string;
  context: string;
  action: string;
}

/**
 * Every source in one place, in filter order: `label` is the English name (a
 * dictionary key) shown in the filter, `module` the page named first in the
 * item's context line. One map, so a source cannot be half-registered.
 */
export const HOME_QUEUE_SOURCES: Record<HomeQueueSourceId, { label: string; module: string }> = {
  approvals: { label: "Approvals", module: "Approval workflows" },
  tasks: { label: "Tasks", module: "Tasks" },
  intake: { label: "Intake", module: "Intake" },
  risks: { label: "AI risks", module: "AI risks" },
  policyReviews: { label: "Policy reviews", module: "Policy manager" },
  vendorReviews: { label: "Vendor reviews", module: "Vendors" },
  incidents: { label: "Incidents", module: "Incidents" },
  mrmFindings: { label: "Model risk findings", module: "Model risk management" },
};

const DAY_MS = 24 * 60 * 60 * 1000;

const str = (value: string | number | null | undefined): string | null =>
  value === null || value === undefined || value === "" ? null : String(value);

/** "Not Started" → "Not started", "high" → "High": stored enum values in sentence case. */
const sentenceCase = (value: string): string =>
  value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();

/** `YYYY-MM-DD` as a short day and month in the active language. */
function formatDay(date: string, lang: string): string {
  const day = new Date(`${date}T00:00:00Z`);
  try {
    return new Intl.DateTimeFormat(lang, {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    }).format(day);
  } catch {
    return date;
  }
}

function waitingText(since: string, t: Translate, lang: string, now: Date): string | null {
  const start = new Date(since).getTime();
  if (Number.isNaN(start)) return null;
  const days = Math.max(0, Math.floor((now.getTime() - start) / DAY_MS));
  if (days === 0) return t("waiting since today");
  return fill(t(pluralKey(lang, days, "waiting {count} day", "waiting {count} days")), {
    count: days,
  });
}

/**
 * Title, context line and action label for one queue item, built from the
 * item's structured fields. Templates go through `t()`; the record's own
 * name and form name are user data and are not translated.
 */
export function queueItemText(
  item: HomeQueueItem,
  t: Translate,
  options: { lang?: string; now?: Date } = {},
): QueueItemText {
  const lang = options.lang ?? getLanguage();
  const now = options.now ?? new Date();
  const { meta } = item;

  const due = item.dueDate ? fill(t("due {date}"), { date: formatDay(item.dueDate, lang) }) : null;
  const reviewDue = item.dueDate
    ? fill(t("review due {date}"), { date: formatDay(item.dueDate, lang) })
    : null;
  const waiting = item.waitingSince ? waitingText(item.waitingSince, t, lang, now) : null;
  const status = (value: string | number | null | undefined) => {
    const text = str(value);
    return text ? t(sentenceCase(text)) : null;
  };

  let title: string;
  let details: (string | null)[];
  let action = "Open";

  switch (item.source) {
    case "approvals": {
      const step = str(meta.stepNumber);
      const steps = str(meta.stepCount);
      title = fill(t("Approval: {name}"), { name: item.name });
      details = [
        step && steps
          ? fill(t("step {step} of {count}"), { step, count: steps })
          : step
            ? fill(t("step {step}"), { step })
            : null,
        waiting,
      ];
      action = "Review";
      break;
    }
    case "tasks":
      title = fill(t("Task: {name}"), { name: item.name });
      details = [due ?? waiting];
      break;
    case "intake":
      title = fill(
        t(meta.kind === "second-review" ? "Second review: {name}" : "Intake review: {name}"),
        { name: item.name || t("Anonymous") },
      );
      details = [str(meta.formName), waiting];
      action = "Review";
      break;
    case "risks":
      title = fill(t("Risk: {name}"), { name: item.name });
      details = [status(meta.mitigationStatus), due];
      break;
    case "policyReviews":
      title = fill(t("Policy review: {name}"), { name: item.name });
      details = [reviewDue];
      action = "Review";
      break;
    case "vendorReviews":
      title = fill(
        t(
          meta.reviewStatus === "Reviewed" ? "Next vendor review: {name}" : "Vendor review: {name}",
        ),
        { name: item.name },
      );
      details = [reviewDue];
      action = "Review";
      break;
    case "incidents":
      title = fill(t("Incident: {name}"), { name: item.name || t("Untitled") });
      details = [status(meta.severity), status(meta.status), waiting];
      break;
    case "mrmFindings":
      title = fill(t("Finding: {name}"), { name: item.name });
      details = [status(meta.severity), due];
      break;
    default:
      title = item.name;
      details = [];
  }

  const moduleName = HOME_QUEUE_SOURCES[item.source]?.module;
  const module = moduleName ? t(moduleName) : null;
  const context = [module, ...details].filter((part): part is string => Boolean(part)).join(" · ");
  return { title, context, action: t(action) };
}
