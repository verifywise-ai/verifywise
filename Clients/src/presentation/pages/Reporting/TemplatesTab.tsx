/* eslint-disable @typescript-eslint/no-explicit-any */
import { Box, Card, CardContent, Typography, Button, Chip, Stack } from "@mui/material";
import { useTemplates } from "../../../application/hooks/useReporting";

export default function TemplatesTab({ onUse }: { onUse: (templateId: number) => void }) {
  const { data: templates = [], isLoading } = useTemplates();
  if (isLoading) return <Typography>Loading templates…</Typography>;
  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
        gap: 2,
      }}
    >
      {templates.map((t: any) => (
        <Card key={t.id} variant="outlined">
          <CardContent>
            <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
              <Chip size="small" label={t.category} />
              {t.recommended_frequency && <Chip size="small" label={t.recommended_frequency} />}
            </Stack>
            <Typography variant="h6">{t.name}</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              {t.description}
            </Typography>
            <Button variant="contained" onClick={() => onUse(t.id)}>
              Use Template
            </Button>
          </CardContent>
        </Card>
      ))}
    </Box>
  );
}
