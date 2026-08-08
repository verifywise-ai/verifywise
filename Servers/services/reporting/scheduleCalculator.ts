import { parseExpression } from "cron-parser";
import type { ScheduleConfig } from "../../domain.layer/interfaces/i.reportTemplate";

// Build a 5-field cron from the schedule config, then ask cron-parser for the
// next occurrence after `from` in the configured timezone.
export function computeNextRun(cfg: ScheduleConfig, from: Date = new Date()): Date {
  const m = cfg.minute ?? 0;
  const h = cfg.hour ?? 0;
  let cron: string;
  if (cfg.frequency === "daily") cron = `${m} ${h} * * *`;
  else if (cfg.frequency === "weekly") cron = `${m} ${h} * * ${cfg.dayOfWeek ?? 1}`;
  else cron = `${m} ${h} ${cfg.dayOfMonth ?? 1} * *`; // monthly

  const it = parseExpression(cron, { currentDate: from, tz: cfg.timezone || "UTC" });
  return it.next().toDate();
}
