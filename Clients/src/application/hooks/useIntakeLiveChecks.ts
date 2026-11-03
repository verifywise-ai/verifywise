import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getLanguage } from "../../i18n/domTranslator";
import {
  DEFAULT_RATE_LIMIT_PAUSE_SECONDS,
  postLiveChecks,
  type FormSchema,
  type PublicFormRef,
} from "../repository/intakeForm.repository";
import { HINT_KIND_ORDER, type LiveCheckHint } from "../../domain/types/intakeLiveChecks";
import { evaluateForm, sortFields } from "../utils/intakeFormLogic";
import { runRuleChecks } from "../utils/intakeLiveChecks";

/** The AI check can only run when some free-text answer has at least this many characters. */
const AI_MIN_ANSWER_CHARS = 20;
const TEXT_TYPES = ["text", "textarea"];

interface Params {
  ref: PublicFormRef;
  schema: FormSchema;
  values: Record<string, unknown>;
  enabled: boolean;
  aiAvailable: boolean;
}

interface AiResult {
  hints: LiveCheckHint[];
  /** The answers the hints were computed from, to dim hints whose answer has changed since. */
  snapshot: Record<string, unknown>;
}

interface Result {
  /** Rule hints plus the latest AI hints, most serious kind first, hidden fields dropped. */
  hints: LiveCheckHint[];
  hintsFor: (questionId: string) => LiveCheckHint[];
  /** Questions whose AI hints are out of date because the answer was edited since. */
  staleQuestionIds: Set<string>;
  /** True after a 429, until the server's reset time passes. */
  aiPaused: boolean;
  /** Runs one AI check on the current answers; does nothing while `aiCheck.blockedBy` is set. */
  checkWithAi: () => void;
  aiCheck: {
    status: AiCheckStatus;
    /** Why a check cannot run now; null when it can. */
    blockedBy: AiCheckBlock | null;
  };
}

/** The latest AI check: none yet, in flight, answered, or failed. */
export type AiCheckStatus = "idle" | "running" | "done" | "error";
/**
 * "off": no AI on this form; "paused": after a 429; "running": a check is in
 * flight; "short": no text answer is long enough; "checked": these answers were
 * already checked.
 */
export type AiCheckBlock = "off" | "paused" | "running" | "short" | "checked";

/** The client gives up on a check after this long (the server's model call stops at 15 s). */
const AI_CHECK_TIMEOUT_MS = 20_000;

/**
 * Rule hints on every change, in the browser. AI hints only when the submitter
 * asks for them (one model call on the form's key per request), so token use
 * follows deliberate checks rather than typing pauses.
 */
export function useIntakeLiveChecks({ ref, schema, values, enabled, aiAvailable }: Params): Result {
  const [ai, setAi] = useState<AiResult | null>(null);
  const [aiPaused, setAiPaused] = useState(false);
  const [aiStatus, setAiStatus] = useState<AiCheckStatus>("idle");
  /** The visible answers of the last check that got an answer, so the same answers are not sent twice. */
  const [checkedKey, setCheckedKey] = useState<string | null>(null);
  // State updates land after the render, so two clicks in one tick both see "idle".
  const runningRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const pauseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { visibleIds, hasLongAnswer, answersKey } = useMemo(() => {
    const { visibleIds: ids, effectiveAnswers } = evaluateForm(schema, values);
    const visible = sortFields(Array.isArray(schema?.fields) ? schema.fields : []).filter((f) =>
      ids.has(f.id),
    );
    const answers: Record<string, unknown> = {};
    for (const f of visible) answers[f.id] = effectiveAnswers[f.id];
    return {
      visibleIds: ids,
      hasLongAnswer: visible.some((f) => {
        const v = answers[f.id];
        return (
          TEXT_TYPES.includes(f.type) &&
          typeof v === "string" &&
          v.trim().length >= AI_MIN_ANSWER_CHARS
        );
      }),
      // Every visible answer goes to the model, so a changed select or checkbox re-arms the check too.
      answersKey: JSON.stringify(answers),
    };
  }, [schema, values]);

  const blockedBy: AiCheckBlock | null =
    !enabled || !aiAvailable
      ? "off"
      : aiPaused
        ? "paused"
        : aiStatus === "running"
          ? "running"
          : !hasLongAnswer
            ? "short"
            : checkedKey === answersKey
              ? "checked"
              : null;

  const checkWithAi = useCallback(() => {
    if (blockedBy || runningRef.current) return;
    runningRef.current = true;
    setAiStatus("running");
    const snapshot = values;
    const key = answersKey;
    const controller = new AbortController();
    abortRef.current = controller;
    const timeout = setTimeout(() => controller.abort(), AI_CHECK_TIMEOUT_MS);
    postLiveChecks(ref, snapshot, getLanguage(), controller.signal)
      .then((res) => {
        if (controller.signal.aborted) throw new Error("aborted");
        // A failed check (or a form that lost its key) leaves the hints already shown in place.
        if (res.error || !res.aiAvailable) {
          setAiStatus("error");
          return;
        }
        setAi({ hints: res.hints, snapshot });
        setCheckedKey(key);
        setAiStatus("done");
      })
      .catch((error: unknown) => {
        // Unmounted: nothing left to update.
        if (abortRef.current !== controller) return;
        setAiStatus("error");
        const e = error as { status?: number; retryAfterSeconds?: number };
        if (e?.status === 429) {
          setAiPaused(true);
          const seconds = e.retryAfterSeconds ?? DEFAULT_RATE_LIMIT_PAUSE_SECONDS;
          pauseTimerRef.current = setTimeout(() => setAiPaused(false), seconds * 1000);
        }
      })
      .finally(() => {
        clearTimeout(timeout);
        runningRef.current = false;
      });
  }, [blockedBy, values, answersKey, ref]);

  useEffect(
    () => () => {
      if (pauseTimerRef.current) clearTimeout(pauseTimerRef.current);
      const controller = abortRef.current;
      abortRef.current = null;
      controller?.abort();
    },
    [],
  );

  const hints = useMemo(() => {
    if (!enabled) return [];
    const rules = runRuleChecks(schema, values);
    const aiHints = (ai?.hints ?? []).filter((h) => visibleIds.has(h.questionId));
    // Stable sort: rule hints stay ahead of AI hints within a kind.
    return [...rules, ...aiHints].sort(
      (a, b) => HINT_KIND_ORDER.indexOf(a.kind) - HINT_KIND_ORDER.indexOf(b.kind),
    );
  }, [enabled, schema, values, ai, visibleIds]);

  const staleQuestionIds = useMemo(() => {
    const stale = new Set<string>();
    if (!enabled || !ai) return stale;
    for (const h of ai.hints) {
      for (const id of [h.questionId, h.alsoQuestionId]) {
        if (id && !Object.is(ai.snapshot[id], values[id])) stale.add(id);
      }
    }
    return stale;
  }, [enabled, ai, values]);

  const hintsFor = useCallback(
    (questionId: string) =>
      hints.filter((h) => h.questionId === questionId || h.alsoQuestionId === questionId),
    [hints],
  );

  return {
    hints,
    hintsFor,
    staleQuestionIds,
    aiPaused,
    checkWithAi,
    aiCheck: { status: aiStatus, blockedBy },
  };
}
