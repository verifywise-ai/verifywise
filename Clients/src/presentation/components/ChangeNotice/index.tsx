import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useNoticeDismiss, useNoticeView } from "../../../application/hooks/useChangeNotice";
import type { ChangeNoticeEntry } from "../../../domain/types/changeNotice.types";
import { isClassicUi, setUiStyle } from "../../themes/uiStyle";
import { useUserGuideSidebarContext } from "../UserGuide/UserGuideSidebarContext";
import ChangeNoticeCard from "./ChangeNoticeCard";
import ShowMeHighlight from "./ShowMeHighlight";
import UndoStrip from "./UndoStrip";
import { GLOBAL_NOTICE } from "./notices";
import { noticesSuppressed } from "./noticeStorage";
import { resolveNotice } from "./resolveNotice";
import { mayRequestView } from "./viewDecision";

const UNDO_MS = 6000;
const TARGET_RECHECK_MS = [400, 1200];

const targetExists = (testId?: string) =>
  !!testId && document.querySelector(`[data-testid="${testId}"]`) !== null;

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
  const pageId = !hidden && pageEntry && globalSettled && !globalShowing ? pageEntry.id : null;
  const pageEnabled =
    pageId !== null &&
    (mayRequestView(pageId) || queryClient.getQueryData(["change-notice", pageId]) !== undefined);
  const pageView = useNoticeView(pageId, pageEnabled);

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
      setShowMeActive(false);
      dismiss.mutate({ id, dismissed: true });
      clearTimeout(undoTimer.current);
      if (withUndo) {
        setUndoId(id);
        undoTimer.current = setTimeout(() => setUndoId(null), UNDO_MS);
      }
    },
    [active, dismiss, markDismissed],
  );

  const handleUndo = useCallback(() => {
    if (!undoId) return;
    clearTimeout(undoTimer.current);
    markDismissed(undoId, false);
    dismiss.mutate({ id: undoId, dismissed: false });
    setUndoId(null);
  }, [undoId, dismiss, markDismissed]);

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
    try {
      await dismiss.mutateAsync({ id: active.id, dismissed: true });
    } catch {
      // The choice to switch back still stands if recording the dismissal fails.
    }
    setUiStyle("classic");
  }, [active, dismiss]);

  if (hidden) return null;
  if (!active) return undoId ? <UndoStrip onUndo={handleUndo} /> : null;

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
