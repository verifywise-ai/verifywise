import { useCallback, useMemo, useState } from "react";

interface UseBulkSelectionOptions<T> {
  rows: T[];
  getId: (row: T) => number;
}

interface UseBulkSelectionReturn {
  selectedIds: number[];
  isSelected: (id: number) => boolean;
  toggle: (id: number) => void;
  toggleAll: () => void;
  /**
   * Add every id in the supplied list to the selection (union with existing).
   * Useful for "Select all across pages" toolbar actions where the caller
   * supplies the full filtered set, separate from the per-page rows passed
   * to the hook for `toggleAll` semantics.
   */
  setAll: (ids: number[]) => void;
  clear: () => void;
  allSelected: boolean;
  someSelected: boolean;
  count: number;
}

export function useBulkSelection<T>(options: UseBulkSelectionOptions<T>): UseBulkSelectionReturn {
  const { rows, getId } = options;
  const [selected, setSelected] = useState<Set<number>>(() => new Set());

  const visibleIds = useMemo(() => rows.map(getId), [rows, getId]);

  const selectedIds = useMemo(() => Array.from(selected), [selected]);

  const isSelected = useCallback((id: number) => selected.has(id), [selected]);

  const toggle = useCallback((id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const { allSelected, someSelected } = useMemo(() => {
    if (visibleIds.length === 0) {
      return { allSelected: false, someSelected: false };
    }
    let selectedCount = 0;
    for (const id of visibleIds) {
      if (selected.has(id)) selectedCount++;
    }
    return {
      allSelected: selectedCount === visibleIds.length,
      someSelected: selectedCount > 0,
    };
  }, [visibleIds, selected]);

  const toggleAll = useCallback(() => {
    setSelected((prev) => {
      const next = new Set(prev);
      const everyVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => next.has(id));
      if (everyVisibleSelected) {
        for (const id of visibleIds) next.delete(id);
      } else {
        for (const id of visibleIds) next.add(id);
      }
      return next;
    });
  }, [visibleIds]);

  const setAll = useCallback((ids: number[]) => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.add(id);
      return next;
    });
  }, []);

  const clear = useCallback(() => setSelected(new Set()), []);

  return {
    selectedIds,
    isSelected,
    toggle,
    toggleAll,
    setAll,
    clear,
    allSelected,
    someSelected,
    count: selected.size,
  };
}
