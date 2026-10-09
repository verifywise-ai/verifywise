import { Stack } from "@mui/material";
import StatusBadge from "../../StatusBadge";
import { useCategoryStyles } from "./styles";

export function CategoryChip({ categories }: { categories: string[] }) {
  if (!categories || categories.length === 0) return null;

  return (
    <Stack direction="row" sx={useCategoryStyles().stackStyle}>
      {categories.slice(0, 2).map((category) => (
        <StatusBadge key={category} label={category} size="small" variant="info" />
      ))}
      {categories.length > 2 && <StatusBadge label={`+${categories.length - 2}`} size="small" />}
    </Stack>
  );
}
