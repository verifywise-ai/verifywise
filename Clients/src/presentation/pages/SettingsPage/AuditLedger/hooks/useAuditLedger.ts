import { useState, useEffect, useCallback } from "react";
import {
  getAuditLedger,
  verifyAuditLedger,
  type AuditLedgerEntry,
  type VerifyResult,
} from "../../../../../application/repository/auditLedger.repository";

interface Filters {
  entity_type: string;
  entry_type: string;
  searchUser: string;
}

export function useAuditLedger() {
  const [entries, setEntries] = useState<AuditLedgerEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [filters, setFilters] = useState<Filters>({
    entity_type: "",
    entry_type: "",
    searchUser: "",
  });

  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

  const fetchEntries = useCallback(async () => {
    setIsLoading(true);
    try {
      const params: Record<string, string | number> = {
        limit: rowsPerPage,
        offset: page * rowsPerPage,
      };
      if (filters.entity_type) params.entity_type = filters.entity_type;
      if (filters.entry_type) params.entry_type = filters.entry_type;

      const data = await getAuditLedger(params);
      setEntries(data.entries);
      setTotal(data.total);
    } catch (error) {
      console.error("Failed to fetch audit ledger:", error);
      setEntries([]);
      setTotal(0);
    } finally {
      setIsLoading(false);
    }
  }, [page, rowsPerPage, filters.entity_type, filters.entry_type]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  // Reset page when filters change
  const updateFilters = useCallback((newFilters: Partial<Filters>) => {
    setFilters((prev) => ({ ...prev, ...newFilters }));
    setPage(0);
  }, []);

  const handleChangePage = useCallback(
    (_event: React.MouseEvent<HTMLButtonElement> | null, newPage: number) => {
      setPage(newPage);
    },
    []
  );

  const handleChangeRowsPerPage = useCallback(
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setRowsPerPage(parseInt(event.target.value, 10));
      setPage(0);
    },
    []
  );

  const verify = useCallback(async () => {
    setIsVerifying(true);
    try {
      const result = await verifyAuditLedger();
      setVerifyResult(result);
    } catch (error) {
      console.error("Failed to verify audit ledger:", error);
      // Don't report "compromised" on network errors — leave as unverified
      setVerifyResult(null);
    } finally {
      setIsVerifying(false);
    }
  }, []);

  // Client-side user name filter
  const filteredEntries = filters.searchUser
    ? entries.filter((e) => {
        const fullName = `${e.user_name ?? ""} ${e.user_surname ?? ""}`.toLowerCase();
        return fullName.includes(filters.searchUser.toLowerCase());
      })
    : entries;

  return {
    entries: filteredEntries,
    total,
    isLoading,
    filters,
    updateFilters,
    page,
    rowsPerPage,
    handleChangePage,
    handleChangeRowsPerPage,
    verify,
    verifyResult,
    isVerifying,
  };
}
