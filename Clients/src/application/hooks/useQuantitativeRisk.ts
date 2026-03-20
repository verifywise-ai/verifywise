import { useState, useEffect, useCallback } from "react";
import {
  getAllBenchmarks,
  getBenchmarkFilters,
  getOrgPortfolio,
  getProjectPortfolio,
  getPortfolioTrend,
} from "../repository/quantitativeRisk.repository";
import type {
  IRiskBenchmark,
  IBenchmarkFilters,
  IPortfolioSummary,
  IPortfolioSnapshot,
} from "../../domain/interfaces/i.quantitativeRisk";

/**
 * Hook for fetching risk benchmarks with optional filtering.
 */
export function useBenchmarks(industry?: string, aiRiskType?: string) {
  const [benchmarks, setBenchmarks] = useState<IRiskBenchmark[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchBenchmarks = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await getAllBenchmarks(industry, aiRiskType);
      setBenchmarks(data);
    } catch (error) {
      console.error("Failed to fetch benchmarks:", error);
    } finally {
      setIsLoading(false);
    }
  }, [industry, aiRiskType]);

  useEffect(() => {
    fetchBenchmarks();
  }, [fetchBenchmarks]);

  return { benchmarks, isLoading, refetch: fetchBenchmarks };
}

/**
 * Hook for fetching benchmark filter options (industries + AI risk types).
 */
export function useBenchmarkFilters() {
  const [filters, setFilters] = useState<IBenchmarkFilters>({
    industries: [],
    aiRiskTypes: [],
  });
  const [isLoading, setIsLoading] = useState(true);

  const fetchFilters = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await getBenchmarkFilters();
      setFilters(data);
    } catch (error) {
      console.error("Failed to fetch benchmark filters:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFilters();
  }, [fetchFilters]);

  return { filters, isLoading, refetch: fetchFilters };
}

/**
 * Hook for fetching org-level portfolio summary.
 */
export function useOrgPortfolio() {
  const [portfolio, setPortfolio] = useState<IPortfolioSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchPortfolio = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await getOrgPortfolio();
      setPortfolio(data);
    } catch (error) {
      console.error("Failed to fetch org portfolio:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPortfolio();
  }, [fetchPortfolio]);

  return { portfolio, isLoading, refetch: fetchPortfolio };
}

/**
 * Hook for fetching project-level portfolio summary.
 */
export function useProjectPortfolio(projectId: number | undefined) {
  const [portfolio, setPortfolio] = useState<IPortfolioSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchPortfolio = useCallback(async () => {
    if (!projectId) {
      setPortfolio(null);
      setIsLoading(false);
      return;
    }
    try {
      setIsLoading(true);
      const data = await getProjectPortfolio(projectId);
      setPortfolio(data);
    } catch (error) {
      console.error("Failed to fetch project portfolio:", error);
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchPortfolio();
  }, [fetchPortfolio]);

  return { portfolio, isLoading, refetch: fetchPortfolio };
}

/**
 * Hook for fetching portfolio trend snapshots.
 */
export function usePortfolioTrend(days = 30, projectId?: number) {
  const [snapshots, setSnapshots] = useState<IPortfolioSnapshot[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchTrend = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await getPortfolioTrend(days, projectId);
      setSnapshots(data);
    } catch (error) {
      console.error("Failed to fetch portfolio trend:", error);
    } finally {
      setIsLoading(false);
    }
  }, [days, projectId]);

  useEffect(() => {
    fetchTrend();
  }, [fetchTrend]);

  return { snapshots, isLoading, refetch: fetchTrend };
}
