import { useState, useEffect } from "react";
import { TIMING } from "../constants";

/**
 * Hook to debounce a search query string.
 * Returns the debounced value and a setter for the immediate value.
 */
export function useDebouncedSearch(initialValue = "") {
  const [searchQuery, setSearchQuery] = useState(initialValue);
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState(initialValue);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearchQuery(searchQuery), TIMING.SEARCH_DEBOUNCE);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  return {
    searchQuery,
    setSearchQuery,
    debouncedSearchQuery,
  };
}
