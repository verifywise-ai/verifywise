import { Stack, Typography } from "@mui/material";

interface PageHeaderProps {
  title: string;
  description?: string;
  rightContent?: React.ReactNode;
  titleFontFamily?: string;
}

export function PageHeader({ title, description, rightContent, titleFontFamily }: PageHeaderProps) {
  return (
    <Stack spacing={2}>
      {/* Title + description */}
      {title && (
        <Stack direction="row" alignItems="center" spacing={1} pt={2}>
          <Typography
            variant="h5"
            fontWeight="600"
            fontSize={20}
            sx={{ fontFamily: titleFontFamily || "'Red Hat Display', 'Geist', sans-serif" }}
          >
            {title}
          </Typography>
          {rightContent}
        </Stack>
      )}

      {description && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          {description}
        </Typography>
      )}
    </Stack>
  );
}
