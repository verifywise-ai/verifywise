import { QueryTypes } from "sequelize";
import { sequelize } from "../../database/db";
import { getEligibleReviewerIdsQuery } from "../../utils/intakeForm.utils";
import type {
  IDecisionRecord,
  ISubmissionRouting,
} from "../../domain.layer/interfaces/i.intakeSubmission";

export const OVERSIGHT_WEEKS: readonly number[] = [4, 8, 12];

export type NeedsAttentionKind =
  | "second_review_open"
  | "second_review_missed"
  | "prohibited_pending"
  | "pending_old"
  | "lane_empty";

export interface IIntakeOversight {
  weeks: number;
  totals: {
    submissions: number;
    senior: number;
    standard: number;
    closeCalls: number;
    notRouted: number;
    routingOff: number;
  };
  medianDecisionHours: { all: number | null; senior: number | null; standard: number | null };
  redlines: { prohibited: number; highRisk: number };
  secondReviews: { completed: number; missed: number; open: number };
  /** Stacked bars: close calls are counted in closeCall, not again in senior. */
  byWeek: Array<{
    weekStart: string;
    senior: number;
    closeCall: number;
    standard: number;
    notRouted: number;
    routingOff: number;
  }>;
  reviewers: Array<{
    userId: number;
    name: string;
    decisions: number;
    bandChanged: number;
    medianDecisionHours: number | null;
    check: boolean;
  }>;
  bandKept: { kept: number; decided: number; seniorKept: number; seniorDecided: number };
  suggestions: { accepted: number; suggested: number };
  needsAttention: Array<{
    kind: NeedsAttentionKind;
    submissionId: number | null;
    formId: number;
    title: string;
    at: string;
  }>;
}

/** One submission in the period, with the JSON paths the figures need already pulled out. */
export interface IOversightRow {
  id: number;
  form_id: number;
  form_name: string | null;
  routing_on: boolean;
  status: string;
  created_at: Date | string;
  /** False for older rows pulled in only because they still need attention. Defaults to true. */
  in_window?: boolean;
  reviewed_at: Date | string | null;
  reviewed_by: number | null;
  week_start: string;
  routing: ISubmissionRouting | null;
  decision_record: IDecisionRecord | null;
  level: string | null;
  tier: string | null;
  override_tier: string | null;
  suggested_total: number;
  suggested_accepted: number;
}

export interface IEmptyLaneForm {
  id: number;
  name: string;
  at: Date | string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
const SECOND_REVIEW_OPEN_DAYS = 3;
const PENDING_OLD_DAYS = 7;
const MAX_NEEDS_ATTENTION = 20;
const CHECK_MIN_DECISIONS = 10;

const ms = (value: Date | string): number => new Date(value).getTime();
const iso = (value: Date | string): string => new Date(value).toISOString();

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const value = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return Math.round(value * 10) / 10;
}

/** Monday 00:00 UTC of the week containing `at`. */
function utcWeekStart(at: Date): number {
  const day = (at.getUTCDay() + 6) % 7;
  return Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate() - day);
}

const dateKey = (timestamp: number): string => new Date(timestamp).toISOString().slice(0, 10);

/** A superseded row with a review date was rejected and later resubmitted. */
const isDecided = (row: IOversightRow): boolean =>
  row.status === "approved" ||
  row.status === "rejected" ||
  (row.status === "superseded" && row.reviewed_at !== null);

/**
 * Whether a decision changed the score band, or null when that can't be told
 * (legacy assessments have no computed band in the decision record, and some
 * have no tier at all).
 */
function bandChangeOf(row: IOversightRow): boolean | null {
  const record = row.decision_record;
  if (record && record.computedBand !== null) return record.bandChanged;
  if (row.tier === null) return null;
  return (row.override_tier ?? row.tier) !== row.tier;
}

const levelOf = (row: IOversightRow): string | null => row.decision_record?.level ?? row.level;

const decisionLane = (row: IOversightRow): "senior" | "standard" | null =>
  row.decision_record?.lane ?? row.routing?.lane ?? null;

export function aggregateOversight(input: {
  rows: IOversightRow[];
  reviewerNames: Map<number, string>;
  emptyLaneForms: IEmptyLaneForm[];
  weeks: number;
  now: Date;
}): IIntakeOversight {
  const { rows, reviewerNames, emptyLaneForms, weeks, now } = input;
  const nowMs = now.getTime();

  const firstWeek = utcWeekStart(now) - (weeks - 1) * WEEK_MS;
  const byWeek: IIntakeOversight["byWeek"] = Array.from({ length: weeks }, (_, i) => ({
    weekStart: dateKey(firstWeek + i * WEEK_MS),
    senior: 0,
    closeCall: 0,
    standard: 0,
    notRouted: 0,
    routingOff: 0,
  }));
  const weekIndex = new Map(byWeek.map((w, i) => [w.weekStart, i]));

  const totals = {
    submissions: 0,
    senior: 0,
    standard: 0,
    closeCalls: 0,
    notRouted: 0,
    routingOff: 0,
  };
  const hours = { all: [] as number[], senior: [] as number[], standard: [] as number[] };
  const redlines = { prohibited: 0, highRisk: 0 };
  const secondReviews = { completed: 0, missed: 0, open: 0 };
  const bandKept = { kept: 0, decided: 0, seniorKept: 0, seniorDecided: 0 };
  const suggestions = { accepted: 0, suggested: 0 };
  const perReviewer = new Map<
    number,
    { decisions: number; known: number; changed: number; hours: number[] }
  >();
  const attention: IIntakeOversight["needsAttention"] = [];
  const title = (row: IOversightRow) => row.form_name ?? `Form ${row.form_id}`;

  for (const row of rows) {
    const second = row.routing?.secondReview;
    if (
      second?.status === "open" &&
      nowMs - ms(second.selectedAt) > SECOND_REVIEW_OPEN_DAYS * DAY_MS
    ) {
      attention.push({
        kind: "second_review_open",
        submissionId: row.id,
        formId: row.form_id,
        title: title(row),
        at: iso(second.selectedAt),
      });
    }
    if (second?.status === "missed" && !second.resolvedAt) {
      attention.push({
        kind: "second_review_missed",
        submissionId: row.id,
        formId: row.form_id,
        title: title(row),
        at: iso(second.reviewedAt ?? second.selectedAt),
      });
    }
    if (row.status === "pending") {
      if (row.level === "Prohibited") {
        attention.push({
          kind: "prohibited_pending",
          submissionId: row.id,
          formId: row.form_id,
          title: title(row),
          at: iso(row.created_at),
        });
      } else if (nowMs - ms(row.created_at) > PENDING_OLD_DAYS * DAY_MS) {
        attention.push({
          kind: "pending_old",
          submissionId: row.id,
          formId: row.form_id,
          title: title(row),
          at: iso(row.created_at),
        });
      }
    }

    // Older rows are here only for the attention list; the period figures stay windowed
    if (row.in_window === false) continue;

    totals.submissions += 1;
    const bucket = byWeek[weekIndex.get(row.week_start) ?? -1];

    if (!row.routing_on) {
      totals.routingOff += 1;
      if (bucket) bucket.routingOff += 1;
    } else if (!row.routing) {
      totals.notRouted += 1;
      if (bucket) bucket.notRouted += 1;
    } else if (row.routing.lane === "senior") {
      totals.senior += 1;
      if (row.routing.reason === "close_call") {
        totals.closeCalls += 1;
        if (bucket) bucket.closeCall += 1;
      } else if (bucket) {
        bucket.senior += 1;
      }
    } else {
      totals.standard += 1;
      if (bucket) bucket.standard += 1;
    }

    if (second) {
      if (second.status === "open") secondReviews.open += 1;
      else {
        secondReviews.completed += 1;
        if (second.status === "missed") secondReviews.missed += 1;
      }
    }

    const level = isDecided(row) ? levelOf(row) : row.status === "pending" ? row.level : null;
    if (level === "Prohibited") redlines.prohibited += 1;
    else if (level === "High risk") redlines.highRisk += 1;

    if (!isDecided(row) || !row.reviewed_at) continue;

    const took = (ms(row.reviewed_at) - ms(row.created_at)) / HOUR_MS;
    const lane = decisionLane(row);
    hours.all.push(took);
    if (lane) hours[lane].push(took);

    const changed = bandChangeOf(row);
    if (changed !== null) {
      bandKept.decided += 1;
      if (!changed) bandKept.kept += 1;
      if (lane === "senior") {
        bandKept.seniorDecided += 1;
        if (!changed) bandKept.seniorKept += 1;
      }
    }

    if (row.reviewed_by !== null) {
      const entry = perReviewer.get(row.reviewed_by) ?? {
        decisions: 0,
        known: 0,
        changed: 0,
        hours: [],
      };
      entry.decisions += 1;
      entry.hours.push(took);
      if (changed !== null) {
        entry.known += 1;
        if (changed) entry.changed += 1;
      }
      perReviewer.set(row.reviewed_by, entry);
    }

    suggestions.suggested += row.suggested_total;
    suggestions.accepted += row.suggested_accepted;
  }

  for (const form of emptyLaneForms) {
    attention.push({
      kind: "lane_empty",
      submissionId: null,
      formId: form.id,
      title: form.name,
      at: iso(form.at),
    });
  }

  const reviewers = [...perReviewer.entries()]
    .map(([userId, e]) => ({
      userId,
      name: reviewerNames.get(userId) || `User ${userId}`,
      decisions: e.decisions,
      bandChanged: e.changed,
      medianDecisionHours: median(e.hours),
      check: e.known >= CHECK_MIN_DECISIONS && e.changed === 0,
    }))
    .sort((a, b) => b.decisions - a.decisions || a.userId - b.userId);

  // Empty lanes first (they block every submission of a form), then newest first
  attention.sort((a, b) => {
    const empty = Number(b.kind === "lane_empty") - Number(a.kind === "lane_empty");
    return empty || ms(b.at) - ms(a.at);
  });

  return {
    weeks,
    totals,
    medianDecisionHours: {
      all: median(hours.all),
      senior: median(hours.senior),
      standard: median(hours.standard),
    },
    redlines,
    secondReviews,
    byWeek,
    reviewers,
    bandKept,
    suggestions,
    needsAttention: attention.slice(0, MAX_NEEDS_ATTENTION),
  };
}

const ROWS_SQL = `
  SELECT
    s.id,
    s.form_id,
    f.name AS form_name,
    COALESCE((f.routing->>'enabled')::boolean, false) AS routing_on,
    s.status,
    s.created_at,
    s.created_at >= :since AS in_window,
    s.reviewed_at,
    s.reviewed_by,
    to_char(date_trunc('week', s.created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS week_start,
    s.routing,
    s.decision_record,
    s.risk_assessment->>'classificationLevel' AS level,
    s.risk_assessment->>'tier' AS tier,
    s.risk_override->>'tier' AS override_tier,
    CASE WHEN s.suggested_risks->>'status' = 'complete'
          AND jsonb_typeof(s.suggested_risks->'items') = 'array'
      THEN jsonb_array_length(s.suggested_risks->'items') ELSE 0 END AS suggested_total,
    CASE WHEN s.suggested_risks->>'status' = 'complete'
          AND jsonb_typeof(s.suggested_risks->'items') = 'array'
      THEN (SELECT COUNT(*) FROM jsonb_array_elements(s.suggested_risks->'items') AS e(item)
            WHERE e.item->>'state' = 'accepted') ELSE 0 END AS suggested_accepted
  FROM intake_submissions s
  LEFT JOIN intake_forms f ON f.id = s.form_id AND f.organization_id = s.organization_id
  WHERE s.organization_id = :organizationId
    AND (
      s.created_at >= :since
      OR s.status = 'pending'
      OR s.routing->'secondReview'->>'status' = 'open'
      OR (s.routing->'secondReview'->>'status' = 'missed'
          AND s.routing->'secondReview'->>'resolvedAt' IS NULL)
    )
    AND (CAST(:formId AS INTEGER) IS NULL OR s.form_id = CAST(:formId AS INTEGER))
  ORDER BY s.created_at DESC, s.id DESC`;

const ROUTED_FORMS_SQL = `
  SELECT id, name, updated_at, routing
  FROM intake_forms
  WHERE organization_id = :organizationId
    AND status <> 'archived'
    AND routing->>'enabled' = 'true'
    AND (CAST(:formId AS INTEGER) IS NULL OR id = CAST(:formId AS INTEGER))`;

const REVIEWER_NAMES_SQL = `
  SELECT u.id, u.name, u.surname
  FROM users u
  JOIN organization_members om ON om.user_id = u.id AND om.organization_id = :organizationId
  WHERE u.id = ANY(ARRAY[:ids]::INTEGER[])`;

export async function getIntakeOversightQuery(
  organizationId: number,
  weeks: number,
  formId?: number,
  now: Date = new Date(),
): Promise<IIntakeOversight> {
  const since = new Date(utcWeekStart(now) - (weeks - 1) * WEEK_MS).toISOString();
  const base = { organizationId, formId: formId ?? null };

  const rows = (await sequelize.query(ROWS_SQL, {
    replacements: { ...base, since },
    type: QueryTypes.SELECT,
  })) as IOversightRow[];
  for (const row of rows) {
    row.suggested_total = Number(row.suggested_total);
    row.suggested_accepted = Number(row.suggested_accepted);
  }

  const routedForms = (await sequelize.query(ROUTED_FORMS_SQL, {
    replacements: base,
    type: QueryTypes.SELECT,
  })) as Array<{
    id: number;
    name: string;
    updated_at: Date | string;
    routing: { seniorReviewerIds?: number[]; standardReviewerIds?: number[] };
  }>;

  const listed = new Set<number>();
  for (const form of routedForms) {
    for (const id of form.routing.seniorReviewerIds ?? []) listed.add(id);
    for (const id of form.routing.standardReviewerIds ?? []) listed.add(id);
  }
  const eligible = new Set(
    listed.size ? await getEligibleReviewerIdsQuery(organizationId, [...listed]) : [],
  );
  const hasEligible = (ids: number[] | undefined) => (ids ?? []).some((id) => eligible.has(id));
  const emptyLaneForms = routedForms
    .filter(
      (f) =>
        !hasEligible(f.routing.seniorReviewerIds) || !hasEligible(f.routing.standardReviewerIds),
    )
    .map((f) => ({ id: f.id, name: f.name, at: f.updated_at }));

  const reviewerIds = [
    ...new Set(rows.map((r) => r.reviewed_by).filter((id): id is number => id !== null)),
  ];
  const reviewerNames = new Map<number, string>();
  if (reviewerIds.length) {
    const users = (await sequelize.query(REVIEWER_NAMES_SQL, {
      replacements: { organizationId, ids: reviewerIds },
      type: QueryTypes.SELECT,
    })) as Array<{ id: number; name: string; surname: string }>;
    for (const u of users) reviewerNames.set(u.id, `${u.name} ${u.surname}`.trim());
  }

  return aggregateOversight({ rows, reviewerNames, emptyLaneForms, weeks, now });
}
