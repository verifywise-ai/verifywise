import { Stack } from "@mui/material";
import Chip from "../../Chip";
import { useCategoryStyles } from "./styles";

export function CategoryChip({ categories }: { categories: string[] }) {
  if (!categories || categories.length === 0) return null;

  return (
    <Stack direction="row" sx={useCategoryStyles().stackStyle}>
      {categories.slice(0, 2).map((category) => (
        <Chip key={category} label={category} size="small" variant="info" />
      ))}
      {categories.length > 2 && <Chip label={`+${categories.length - 2}`} size="small" />}
    </Stack>
  );
}
