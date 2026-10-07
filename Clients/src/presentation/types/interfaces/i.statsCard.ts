export interface StatsCardProps {
  title: string;
  completed: number | null | undefined;
  /**
   * null or undefined while the caller is still loading (a skeleton shows);
   * 0 once loaded with nothing to count (the "no regulation connected" state).
   */
  total: number | null | undefined;
}
