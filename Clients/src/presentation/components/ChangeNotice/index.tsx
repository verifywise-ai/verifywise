import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useNoticeDismiss, useNoticeView } from "../../../application/hooks/useChangeNotice";
import type { ChangeNoticeEntry } from "../../../domain/types/changeNotice.types";
import { isClassicUi, setUiStyle } from "../../themes/uiStyle";
import { useUserGuideSidebarContext } from "../UserGuide/UserGuideSidebarContext";
import ChangeNoticeCard from "./ChangeNoticeCard";
import ShowMeHighlight, { findTarget } from "./ShowMeHighlight";
import UndoStrip from "./UndoStrip";
import { GLOBAL_NOTICE } from "./notices";
import { noticesSuppressed } from "./noticeStorage";
import { resolveNotice } from "./resolveNotice";
import { failView, mayRequestView } from "./viewDecision";

const UNDO_MS = 6000;
const TARGET_RECHECK_MS = [400, 1200];

const targetExists = (testId?: string) => findTarget(testId) !== null;

/**
 * Tells the user what changed on the current page. The global new look card
 * goes first; a page entry is only asked about once the global one is not showing.
 * Mounted once, in the Dashboard container.
 */
export default function ChangeNotice() {
  const hidden = isClassicUi() || noticesSuppressed();
  const { pathname } = useLocation();
  const queryClient = useQueryClient();
  const { open: openGuide } = useUserGuideSidebarContext();
  const dismiss = useNoticeDismiss();

  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(new Set());
  const [undoId, setUndoId] = useState<string | null>(null);
  const [showMeActive, setShowMeActive] = useState(false);
  const [canShowMe, setCanShowMe] = useState(false);
  // Path where the global card was dismissed: its page entry waits for a later visit.
  const [pageDeferredAt, setPageDeferredAt] = useState<string | null>(null);
  // Latest dismiss request per notice id, so an Undo is sent after it settles.
  const pendingDismiss = useRef(new Map<string, Promise<unknown>>());
  const undoTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const globalId = hidden ? null : (GLOBAL_NOTICE?.id ?? null);
  const globalEnabled =
    globalId !== null &&
    (mayRequestView(globalId) ||
      queryClient.getQueryData(["change-notice", globalId]) !== undefined);
  const globalView = useNoticeView(globalId, globalEnabled);
  const globalShowing =
    globalId !== null && globalView.data?.show === true && !dismissed.has(globalId);
  const globalSettled =
    globalId === null || !globalEnabled || globalView.data !== undefined || globalView.isError;

  const pageEntry = useMemo(() => resolveNotice(pathname), [pathname]);
  const pageDeferred = pageDeferredAt === pathname;
  const pageId =
    !hidden && pageEntry && globalSettled && !globalShowing && !pageDeferred ? pageEntry.id : null;
  const pageEnabled =
    pageId !== null &&
    (mayRequestView(pageId) || queryClient.getQueryData(["change-notice", pageId]) !== undefined);
  const pageView = useNoticeView(pageId, pageEnabled);

  // A failed view must not burn its marker: free it so a later page load asks again.
  const globalFailed = globalView.isError;
  const pageFailed = pageView.isError;
  useEffect(() => {
    if (globalFailed && globalId) failView(globalId);
  }, [globalFailed, globalId]);
  useEffect(() => {
    if (pageFailed && pageId) failView(pageId);
  }, [pageFailed, pageId]);

  let active: ChangeNoticeEntry | null = null;
  if (globalShowing) {
    active = GLOBAL_NOTICE;
  } else if (pageEntry && pageView.data?.show === true && !dismissed.has(pageEntry.id)) {
    active = pageEntry;
  }
  const activeId = active?.id ?? null;
  const showMeTestId = active?.showMeTestId;

  // Route change: drop the highlight and the Undo strip of the previous page.
  useEffect(() => {
    setShowMeActive(false);
    setUndoId(null);
    setPageDeferredAt(null);
  }, [pathname]);

  useEffect(() => () => clearTimeout(undoTimer.current), []);

  // Show me needs its target in the DOM; the sidebar may mount after the card.
  useEffect(() => {
    setCanShowMe(targetExists(showMeTestId));
    if (!showMeTestId) return undefined;
    const timers = TARGET_RECHECK_MS.map((ms) =>
      setTimeout(() => setCanShowMe(targetExists(showMeTestId)), ms),
    );
    return () => timers.forEach(clearTimeout);
  }, [activeId, showMeTestId]);

  const markDismissed = useCallback((id: string, value: boolean) => {
    setDismissed((previous) => {
      const next = new Set(previous);
      if (value) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const handleDismiss = useCallback(
    (withUndo: boolean) => {
      if (!active) return;
      const id = active.id;
      markDismissed(id, true);
      queryClient.setQueryData(["change-notice", id], { show: false });
      if (id === GLOBAL_NOTICE?.id) setPageDeferredAt(pathname);
      setShowMeActive(false);
      // A failed dismiss keeps the card hidden for this session: the user chose to close it.
      pendingDismiss.current.set(
        id,
        dismiss.mutateAsync({ id, dismissed: true }).catch(() => undefined),
      );
      clearTimeout(undoTimer.current);
      if (withUndo) {
        setUndoId(id);
        undoTimer.current = setTimeout(() => setUndoId(null), UNDO_MS);
      }
    },
    [active, dismiss, markDismissed, pathname, queryClient],
  );

  const handleUndo = useCallback(() => {
    if (!undoId) return;
    clearTimeout(undoTimer.current);
    markDismissed(undoId, false);
    queryClient.setQueryData(["change-notice", undoId], { show: true });
    const id = undoId;
    // Chained after the dismiss for this id, so the server sees them in the order they were made.
    const settled = pendingDismiss.current.get(id) ?? Promise.resolve();
    pendingDismiss.current.set(
      id,
      settled.then(() => dismiss.mutateAsync({ id, dismissed: false })).catch(() => undefined),
    );
    setUndoId(null);
  }, [undoId, dismiss, markDismissed, queryClient]);

  const handleShowMe = useCallback(() => {
    if (showMeActive) {
      setShowMeActive(false);
    } else if (targetExists(showMeTestId)) {
      setShowMeActive(true);
    } else {
      setCanShowMe(false);
    }
  }, [showMeActive, showMeTestId]);

  const handleSwitchBack = useCallback(async () => {
    if (!active) return;
    const id = active.id;
    setPageDeferredAt(pathname);
    queryClient.setQueryData(["change-notice", id], { show: false });
    try {
      await dismiss.mutateAsync({ id, dismissed: true });
    } catch {
      // The choice to switch back still stands if recording the dismissal fails.
    }
    if (!setUiStyle("classic")) {
      // Storage is blocked, so the look did not change: bring the card back.
      setPageDeferredAt(null);
      queryClient.setQueryData(["change-notice", id], { show: true });
      void dismiss.mutateAsync({ id, dismissed: false }).catch(() => undefined);
    }
  }, [active, dismiss, pathname, queryClient]);

  if (hidden) return null;
  if (!active)
    return undoId ? <UndoStrip onUndo={handleUndo} global={undoId === GLOBAL_NOTICE?.id} /> : null;

  return (
    <>
      <ChangeNoticeCard
        entry={active}
        onDismiss={() => handleDismiss(true)}
        onKeep={() => handleDismiss(false)}
        onSwitchBack={handleSwitchBack}
        onShowMe={handleShowMe}
        showMeActive={showMeActive}
        canShowMe={canShowMe}
        onOpenGuide={() => active?.guidePath && openGuide(active.guidePath)}
      />
      {showMeActive && showMeTestId && <ShowMeHighlight testId={showMeTestId} />}
    </>
  );
}
