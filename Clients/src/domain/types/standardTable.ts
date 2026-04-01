export type SortDirection = "asc" | "desc" | null;

export type SortConfig = {
  key: string;
  direction: SortDirection;
};

export interface StandardColumn {
  id: string;
  label: string;
  sortable: boolean;
  align?: "left" | "center" | "right";
  width?: string;
  minWidth?: string;
}
