import { CronExpressionParser } from "cron-parser";
import type {
  ReportFrequency,
  ScheduleConfig,
} from "../../domain.layer/interfaces/i.reportTemplate";
import logger from "../../utils/logger/fileLogger";

const FREQUENCIES: ReportFrequency[] = ["daily", "weekly", "monthly", "quarterly"];

// The four months of a quarterly schedule, sorted, e.g. anchor 11 -> 2,5,8,11.
function quarterlyMonths(anchorMonth: number): string {
  const months = [0, 3, 6, 9].map((offset) => ((anchorMonth - 1 + offset) % 12) + 1);
  return months.sort((a, b) => a - b).join(",");
}

// Build a 5-field cron from the schedule config, then ask cron-parser for the
// next occurrence after `from` in the configured timezone. An unknown stored
// frequency falls back to monthly (new input is rejected by validateScheduleConfig).
export function computeNextRun(cfg: ScheduleConfig, from: Date = new Date()): Date {
  const m = cfg.minute ?? 0;
  const h = cfg.hour ?? 0;
  const dom = cfg.dayOfMonth ?? 1;
  let cron: string;
  if (cfg.frequency === "daily") cron = `${m} ${h} * * *`;
  else if (cfg.frequency === "weekly") cron = `${m} ${h} * * ${cfg.dayOfWeek ?? 1}`;
  else if (cfg.frequency === "quarterly")
    cron = `${m} ${h} ${dom} ${quarterlyMonths(cfg.anchorMonth ?? 1)} *`;
  else {
    if (cfg.frequency !== "monthly") {
      logger.warn(`computeNextRun: unknown frequency "${String(cfg.frequency)}", using monthly`);
    }
    cron = `${m} ${h} ${dom} * *`;
  }

  const it = CronExpressionParser.parse(cron, { currentDate: from, tz: cfg.timezone || "UTC" });
  return it.next().toDate();
}

// Returns human-readable problems with a schedule config; empty means valid.
export function validateScheduleConfig(cfg: unknown): string[] {
  if (typeof cfg !== "object" || cfg === null || Array.isArray(cfg)) {
    return ["schedule config must be an object"];
  }
  const c = cfg as Record<string, unknown>;
  if (!FREQUENCIES.includes(c.frequency as ReportFrequency)) {
    return [`frequency must be one of: ${FREQUENCIES.join(", ")}`];
  }
  const errors: string[] = [];
  if (c.frequency === "quarterly") {
    const a = c.anchorMonth;
    if (typeof a !== "number" || !Number.isInteger(a) || a < 1 || a > 12) {
      errors.push("anchorMonth must be an integer from 1 to 12 for quarterly schedules");
    }
    const d = c.dayOfMonth;
    if (d !== undefined && (typeof d !== "number" || !Number.isInteger(d) || d < 1 || d > 28)) {
      errors.push("dayOfMonth must be an integer from 1 to 28 for quarterly schedules");
    }
  }
  return errors;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

// Subtract whole months from a UTC date, clamping to the end of the target month.
function subMonthsClamped(d: Date, months: number): Date {
  const total = d.getUTCFullYear() * 12 + d.getUTCMonth() - months;
  const year = Math.floor(total / 12);
  const month = total - year * 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(d.getUTCDate(), lastDay)));
}

// The period a scheduled run covers: ends the day before `runDate` (UTC date)
// and spans one interval of `frequency`.
export function rollingPeriod(
  frequency: ReportFrequency,
  runDate: Date,
): { periodStart: string; periodEnd: string } {
  const run = new Date(
    Date.UTC(runDate.getUTCFullYear(), runDate.getUTCMonth(), runDate.getUTCDate()),
  );
  const end = new Date(run.getTime() - 86_400_000);
  let start: Date;
  if (frequency === "daily") start = end;
  else if (frequency === "weekly") start = new Date(end.getTime() - 6 * 86_400_000);
  else {
    const back = subMonthsClamped(end, frequency === "quarterly" ? 3 : 1);
    start = new Date(back.getTime() + 86_400_000);
  }
  return { periodStart: iso(start), periodEnd: iso(end) };
}
